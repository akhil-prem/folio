import json
import re
from datetime import datetime

from .proxy import BROWSER, cached, fetch

ORIGIN = 'https://ipogyani.com'
PUSH = re.compile(r'self\.__next_f\.push\(\[\d+,("(?:\\.|[^"\\])*")\]\)')


def extract_balanced(source, start):
    if start >= len(source):
        return None
    opener = source[start]
    if opener not in '{[':
        return None
    closer = '}' if opener == '{' else ']'
    depth = 0
    in_str = False
    esc = False
    for index in range(start, len(source)):
        char = source[index]
        if in_str:
            if esc:
                esc = False
                continue
            if char == '\\':
                esc = True
                continue
            if char == '"':
                in_str = False
            continue
        if char == '"':
            in_str = True
            continue
        if char == opener:
            depth += 1
        elif char == closer:
            depth -= 1
            if depth == 0:
                return source[start:index + 1]
    return None


def decode_flight_chunks(html):
    chunks = []
    for match in PUSH.finditer(html):
        raw = match.group(1)
        try:
            chunks.append(json.loads(raw))
        except json.JSONDecodeError:
            chunks.append(raw)
    return ''.join(chunks)


def decode_layers(value, times=4):
    current = value
    for _ in range(times):
        nxt = current.replace('\\"', '"').replace('\\n', '\n').replace('\\u0026', '&')
        if nxt == current:
            break
        current = nxt
    return current


def flight_source(html):
    decoded = decode_flight_chunks(html)
    return decode_layers(decoded) if decoded else decode_layers(html)


def extract_json_value(source, key):
    marker = f'"{key}":'
    from_index = 0
    while from_index < len(source):
        hit = source.find(marker, from_index)
        if hit < 0:
            return None
        cursor = hit + len(marker)
        while cursor < len(source) and source[cursor] in ' \n':
            cursor += 1
        raw = extract_balanced(source, cursor)
        if raw:
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                from_index = hit + len(marker)
                continue
        from_index = hit + len(marker)
    return None


def extract_ipo_detail(html):
    source = flight_source(html)
    ipo = extract_json_value(source, 'ipo')
    if isinstance(ipo, dict) and 'name' in ipo:
        return ipo
    return None


def extract_listed_rows(html):
    source = flight_source(html)
    marker = '"rows":'
    from_index = 0
    while from_index < len(source):
        hit = source.find(marker, from_index)
        if hit < 0:
            return []
        cursor = hit + len(marker)
        while cursor < len(source) and source[cursor] in ' \n':
            cursor += 1
        raw = extract_balanced(source, cursor)
        from_index = hit + len(marker)
        if not raw:
            continue
        try:
            rows = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(rows, list):
            continue
        listed = [
            row for row in rows
            if isinstance(row, dict) and 'name' in row and 'slug' in row and 'listingGainPct' in row
        ]
        if listed:
            return listed
    return []


def _upstream(path):
    response = fetch(
        f'{ORIGIN}{path}',
        headers={**BROWSER, 'Referer': f'{ORIGIN}/', 'Accept': 'application/json, text/html, */*'},
        timeout=20,
    )
    return response.status_code, response.text, response.headers.get('content-type', '')


def live_ipos():
    def load():
        status, body, _ = _upstream('/api/ipos')
        if status >= 400:
            raise ValueError('Live IPO list unavailable')
        return json.loads(body)

    return cached('ipos', 45, load)


def listed_ipos(year=None):
    year = int(year or datetime.now().year)

    def load():
        status, body, _ = _upstream(f'/listed-ipo/{year}')
        if status >= 400:
            raise ValueError('Listed IPO archive unavailable')
        return {'year': year, 'rows': extract_listed_rows(body)}

    return cached(f'listed-{year}', 5 * 60, load)


def ipo_detail(slug, year=None):
    slug = (slug or '').strip()
    if not slug:
        raise ValueError('Missing slug')
    key = f'detail-{year or "live"}-{slug}'

    def load():
        candidates = []
        if year:
            candidates.append(f'/listed-ipo/{year}/{slug}')
        candidates.append(f'/ipo/{slug}')
        if not slug.endswith('-ipo'):
            candidates.append(f'/ipo/{slug}-ipo')
        for candidate in candidates:
            status, body, _ = _upstream(candidate)
            if status >= 400:
                continue
            ipo = extract_ipo_detail(body)
            if ipo and ipo.get('name'):
                return {'ipo': ipo, 'path': candidate}
        raise LookupError('IPO details unavailable')

    return cached(key, 2 * 60, load)


def ipo_subscription(ipo_id):
    ipo_id = (ipo_id or '').strip()
    if not ipo_id:
        raise ValueError('Missing id')

    def load():
        status, body, _ = _upstream(f'/api/public/ipo-subscription/{ipo_id}')
        if status >= 400:
            raise ValueError('IPO subscription unavailable')
        return json.loads(body)

    return cached(f'sub-{ipo_id}', 30, load)

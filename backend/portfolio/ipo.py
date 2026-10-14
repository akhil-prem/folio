import json
import re
import time
from threading import Lock

import requests
from rest_framework.response import Response

ORIGIN = "https://ipogyani.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "en-IN,en;q=0.9",
    "Referer": f"{ORIGIN}/",
}

_cache: dict[str, tuple[float, int, dict | list | str]] = {}
_lock = Lock()
CHUNK_RE = re.compile(r'self\.__next_f\.push\(\[\d+,("(?:\\.|[^"\\])*")\]\)')


def _cached(key: str, ttl: float):
    hit = _cache.get(key)
    if not hit:
        return None
    at, status, payload = hit
    if time.time() - at > ttl:
        _cache.pop(key, None)
        return None
    return status, payload


def _remember(key: str, status: int, payload):
    with _lock:
        _cache[key] = (time.time(), status, payload)


def upstream(path: str) -> tuple[int, str]:
    response = requests.get(f"{ORIGIN}{path}", headers=HEADERS, timeout=20)
    return response.status_code, response.text


def extract_balanced(source: str, start_index: int) -> str | None:
    if start_index >= len(source):
        return None
    opener = source[start_index]
    if opener not in "{[":
        return None
    closer = "}" if opener == "{" else "]"
    depth = 0
    in_str = False
    esc = False
    for index in range(start_index, len(source)):
        char = source[index]
        if in_str:
            if esc:
                esc = False
                continue
            if char == "\\":
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
                return source[start_index : index + 1]
    return None


def decode_flight_chunks(html: str) -> str:
    chunks: list[str] = []
    for match in CHUNK_RE.finditer(html):
        raw = match.group(1)
        try:
            chunks.append(json.loads(raw))
        except json.JSONDecodeError:
            chunks.append(raw)
    return "".join(chunks)


def decode_layers(value: str, times: int = 4) -> str:
    current = value
    for _ in range(times):
        nxt = current.replace('\\"', '"').replace("\\n", "\n").replace("\\u0026", "&")
        if nxt == current:
            break
        current = nxt
    return current


def flight_source(html: str) -> str:
    decoded = decode_flight_chunks(html)
    return decode_layers(decoded) if decoded else decode_layers(html)


def extract_json_value(source: str, key: str):
    marker = f'"{key}":'
    from_index = 0
    while from_index < len(source):
        hit = source.find(marker, from_index)
        if hit < 0:
            return None
        cursor = hit + len(marker)
        while cursor < len(source) and source[cursor] in " \n":
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


def extract_ipo_detail(html: str):
    source = flight_source(html)
    ipo = extract_json_value(source, "ipo")
    if isinstance(ipo, dict) and ipo.get("name"):
        return ipo
    return None


def extract_listed_rows(html: str) -> list:
    source = flight_source(html)
    marker = '"rows":'
    from_index = 0
    while from_index < len(source):
        hit = source.find(marker, from_index)
        if hit < 0:
            return []
        cursor = hit + len(marker)
        while cursor < len(source) and source[cursor] in " \n":
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
            if isinstance(row, dict) and "name" in row and "slug" in row and "listingGainPct" in row
        ]
        if listed:
            return listed
    return []


def live_ipos():
    hit = _cached("ipos", 45)
    if hit:
        status, payload = hit
        return Response(payload, status=status)
    try:
        status, body = upstream("/api/ipos")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {"error": "Live IPO list unavailable"}
            status = 502
        _remember("ipos", status, payload)
        return Response(payload, status=status)
    except requests.RequestException as exc:
        return Response({"error": str(exc)}, status=502)


def listed_ipos(year: int):
    key = f"listed-{year}"
    hit = _cached(key, 5 * 60)
    if hit:
        status, payload = hit
        return Response(payload, status=status)
    try:
        status, body = upstream(f"/listed-ipo/{year}")
        if status >= 400:
            return Response({"error": "Listed IPO archive unavailable"}, status=status)
        payload = {"year": year, "rows": extract_listed_rows(body)}
        _remember(key, 200, payload)
        return Response(payload)
    except requests.RequestException as exc:
        return Response({"error": str(exc)}, status=502)


def ipo_detail(slug: str, year: str | None):
    key = f"detail-{year or 'live'}-{slug}"
    hit = _cached(key, 2 * 60)
    if hit:
        status, payload = hit
        return Response(payload, status=status)
    candidates = []
    if year:
        candidates.append(f"/listed-ipo/{year}/{slug}")
    candidates.append(f"/ipo/{slug}")
    if not slug.endswith("-ipo"):
        candidates.append(f"/ipo/{slug}-ipo")
    try:
        for candidate in candidates:
            status, body = upstream(candidate)
            if status >= 400:
                continue
            ipo = extract_ipo_detail(body)
            if ipo and ipo.get("name"):
                payload = {"ipo": ipo, "path": candidate}
                _remember(key, 200, payload)
                return Response(payload)
        return Response({"error": "IPO details unavailable"}, status=404)
    except requests.RequestException as exc:
        return Response({"error": str(exc)}, status=502)


def ipo_subscription(ipo_id: str):
    key = f"sub-{ipo_id}"
    hit = _cached(key, 30)
    if hit:
        status, payload = hit
        return Response(payload, status=status)
    try:
        status, body = upstream(f"/api/public/ipo-subscription/{ipo_id}")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {"error": "Subscription data unavailable"}
            status = 502
        _remember(key, status, payload)
        return Response(payload, status=status)
    except requests.RequestException as exc:
        return Response({"error": str(exc)}, status=502)

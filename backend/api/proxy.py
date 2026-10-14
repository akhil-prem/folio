import time

import requests

BROWSER = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
    ),
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-IN,en;q=0.9',
}

_CACHE = {}
_nse_session = None
_nse_ready_at = 0


def cached(key, ttl_seconds, builder):
    hit = _CACHE.get(key)
    now = time.time()
    if hit and now - hit['at'] < ttl_seconds:
        return hit['value']
    value = builder()
    _CACHE[key] = {'at': now, 'value': value}
    return value


def fetch(url, headers=None, params=None, timeout=20):
    merged = {**BROWSER, **(headers or {})}
    response = requests.get(url, headers=merged, params=params, timeout=timeout)
    return response


def _nse_client():
    global _nse_session, _nse_ready_at
    now = time.time()
    if _nse_session is not None and now - _nse_ready_at < 300:
        return _nse_session
    session = requests.Session()
    session.headers.update({
        **BROWSER,
        'Referer': 'https://www.nseindia.com/',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
    })
    session.get('https://www.nseindia.com/', timeout=20)
    _nse_session = session
    _nse_ready_at = now
    return session


def nse_get(url, params=None, timeout=20):
    try:
        return _nse_client().get(url, params=params, timeout=timeout)
    except requests.RequestException:
        global _nse_session, _nse_ready_at
        _nse_session = None
        _nse_ready_at = 0
        return _nse_client().get(url, params=params, timeout=timeout)

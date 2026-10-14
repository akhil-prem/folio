from threading import Lock
import time

import requests
from django.http import HttpResponse
from rest_framework.response import Response

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-IN,en;q=0.9",
}

_cache: dict[str, tuple[float, int, str, str]] = {}
_lock = Lock()
_nse_session: requests.Session | None = None
_nse_ready_at = 0.0


def _cached(key: str, ttl: float):
    hit = _cache.get(key)
    if not hit:
        return None
    at, status, body, content_type = hit
    if time.time() - at > ttl:
        _cache.pop(key, None)
        return None
    return status, body, content_type


def _remember(key: str, status: int, body: str, content_type: str):
    _cache[key] = (time.time(), status, body, content_type)


def _response(status: int, body: str, content_type: str):
    if "json" in content_type:
        return HttpResponse(body, status=status, content_type="application/json; charset=utf-8")
    return HttpResponse(body, status=status, content_type=content_type or "text/plain; charset=utf-8")


def proxy_json(url: str, *, headers=None, ttl=30, key=None, timeout=20):
    cache_key = key or url
    hit = _cached(cache_key, ttl)
    if hit:
        return _response(*hit)
    try:
        remote = requests.get(url, headers={**BROWSER_HEADERS, **(headers or {})}, timeout=timeout)
        body = remote.text
        content_type = remote.headers.get("content-type", "application/json")
        _remember(cache_key, remote.status_code, body, content_type)
        return _response(remote.status_code, body, content_type)
    except requests.RequestException as exc:
        return Response({"error": str(exc)}, status=502)


def nse_session() -> requests.Session:
    global _nse_session, _nse_ready_at
    now = time.time()
    if _nse_session and now - _nse_ready_at < 300:
        return _nse_session
    session = requests.Session()
    session.headers.update({
        **BROWSER_HEADERS,
        "Referer": "https://www.nseindia.com/",
        "Accept": "application/json, text/plain, */*",
    })
    try:
        session.get("https://www.nseindia.com/", timeout=15)
        session.get("https://www.nseindia.com/market-data/live-equity-market", timeout=15)
    except requests.RequestException:
        pass
    _nse_session = session
    _nse_ready_at = now
    return session


def nse_get(url: str, *, ttl=30, key=None, accept="application/json"):
    cache_key = key or url
    hit = _cached(cache_key, ttl)
    if hit:
        return _response(*hit)
    session = nse_session()
    try:
        remote = session.get(url, headers={"Accept": accept}, timeout=20)
        if remote.status_code in {401, 403}:
            global _nse_ready_at
            _nse_ready_at = 0
            session = nse_session()
            remote = session.get(url, headers={"Accept": accept}, timeout=20)
        body = remote.text
        content_type = remote.headers.get("content-type", accept)
        _remember(cache_key, remote.status_code, body, content_type)
        return _response(remote.status_code, body, content_type)
    except requests.RequestException as exc:
        return Response({"error": str(exc)}, status=502)

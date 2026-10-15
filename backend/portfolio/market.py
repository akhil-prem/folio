from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timedelta, timezone
from threading import Lock
from urllib.parse import quote
import json
import re
import time
import xml.etree.ElementTree as ET

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
        if remote.status_code < 400:
            _remember(cache_key, remote.status_code, body, content_type)
        return _response(remote.status_code, body, content_type)
    except requests.RequestException as exc:
        return Response({"error": str(exc)}, status=502)


IST = timezone(timedelta(hours=5, minutes=30))

# Moneycontrol's public price feed spells this path segment "inidices".
_MONEYCONTROL = "https://priceapi.moneycontrol.com/pricefeed/notapplicable/inidicesindia/"

_SECTORS = (
    ("Bank Nifty", "NIFTYBANK", "^NSEBANK", "BNK"),
    ("Nifty IT", "NIFTYIT", "^CNXIT", "IT"),
    ("Nifty Pharma", "NIFTYPHARMA", "^CNXPHARMA", "PHR"),
    ("Nifty Auto", "NIFTYAUTO", "^CNXAUTO", "AUT"),
    ("Nifty FMCG", "NIFTYFMCG", "^CNXFMCG", "FMC"),
    ("Nifty Metal", "NIFTYMETAL", "^CNXMETAL", "MTL"),
    ("Nifty Realty", "NIFTYREALTY", "^CNXREALTY", "RLT"),
    ("Nifty Energy", "NIFTYENERGY", "^CNXENERGY", "NRG"),
    ("Nifty PSU Bank", "NIFTYPSUBANK", "^CNXPSUBANK", "PSU"),
    ("Nifty Fin Svc", "NIFTYFINANCIALSERVICES", "^CNXFIN", "FIN"),
    ("Nifty Infra", "NIFTYINFRA", "^CNXINFRA", "INF"),
    ("Nifty Media", "NIFTYMEDIA", "^CNXMEDIA", "MDA"),
)

_NSE_INDEX_ALIASES = {
    "NIFTY50": "nse",
    "NIFTYBANK": "bank",
    "NIFTYIT": "it",
    "NIFTYPHARMA": "pharma",
    "NIFTYAUTO": "auto",
    "NIFTYFMCG": "fmcg",
    "NIFTYMETAL": "metal",
    "NIFTYREALTY": "realty",
    "NIFTYENERGY": "energy",
    "NIFTYPSUBANK": "psu",
    "NIFTYFINANCIALSERVICES": "fin",
    "NIFTYFINSERVICE": "fin",
    "NIFTYINFRASTRUCTURE": "infra",
    "NIFTYINFRA": "infra",
    "NIFTYMEDIA": "media",
    "INDIAVIX": "vix",
}


def _num(value):
    if value is None or value is False:
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _round(value, digits=2):
    number = _num(value)
    if number is None:
        return None
    return round(number, digits)


def _quote(price, change_abs, change_pct, market_time=None, live_window=20 * 60):
    price = _num(price)
    if price is None:
        return None
    change_abs = _num(change_abs)
    change_pct = _num(change_pct)
    if change_abs is None:
        change_abs = 0.0
    if change_pct is None:
        base = price - change_abs
        change_pct = (change_abs / base) * 100 if base else 0.0
    fresh = False
    if isinstance(market_time, (int, float)):
        fresh = time.time() - float(market_time) < live_window
        market_time = datetime.fromtimestamp(market_time, tz=timezone.utc).isoformat()
    return {
        "price": round(price, 2),
        "change": round(change_pct, 2),
        "changeAbs": round(change_abs, 2),
        "isLive": fresh,
        "marketTime": market_time,
    }


def _get_json(url, headers=None, timeout=12):
    try:
        remote = requests.get(url, headers={**BROWSER_HEADERS, **(headers or {})}, timeout=timeout)
    except requests.RequestException:
        return None
    if remote.status_code != 200:
        return None
    try:
        return remote.json()
    except ValueError:
        return None


def _yahoo_quote(symbol):
    payload = _get_json(
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{quote(symbol, safe='')}?interval=1d&range=1d"
    )
    try:
        meta = payload["chart"]["result"][0]["meta"]
    except (TypeError, KeyError, IndexError):
        return None
    price = _num(meta.get("regularMarketPrice"))
    previous = _num(meta.get("chartPreviousClose") or meta.get("previousClose"))
    if price is None or not previous:
        return None
    change_abs = _num(meta.get("fulldayChange"))
    if change_abs is None:
        change_abs = price - previous
    change_pct = _num(meta.get("regularMarketChangePercent") or meta.get("fulldayChangePercent"))
    return _quote(price, change_abs, change_pct, meta.get("regularMarketTime"))


def _moneycontrol_index(code):
    payload = _get_json(_MONEYCONTROL + quote(code, safe=""))
    data = (payload or {}).get("data") or {}
    if str((payload or {}).get("code")) != "200" or not data:
        return None
    updated = data.get("lastupd_epoch") or data.get("lastupd")
    market_time = _num(updated)
    if market_time is None and isinstance(updated, str):
        try:
            parsed = datetime.strptime(updated, "%Y-%m-%d %H:%M:%S").replace(tzinfo=IST)
            market_time = parsed.timestamp()
        except ValueError:
            market_time = None
    return _quote(data.get("pricecurrent"), data.get("CHANGE") or data.get("pricechange"), data.get("PERCCHANGE") or data.get("pricepercentchange"), market_time)


def _nse_index_map():
    try:
        remote = nse_session().get("https://www.nseindia.com/api/allIndices", timeout=12)
        if remote.status_code in {401, 403}:
            global _nse_ready_at
            _nse_ready_at = 0
            remote = nse_session().get("https://www.nseindia.com/api/allIndices", timeout=12)
        rows = remote.json().get("data") or []
    except (requests.RequestException, ValueError, AttributeError):
        return {}
    found = {}
    for row in rows:
        key = _NSE_INDEX_ALIASES.get(re.sub(r"[^A-Z0-9]", "", str(row.get("index") or row.get("indexSymbol") or "").upper()))
        if not key or key in found:
            continue
        quote_row = _quote(row.get("last"), row.get("variation"), row.get("percentChange"))
        if quote_row:
            found[key] = quote_row
    return found


def _headlines():
    try:
        remote = requests.get(
            "https://news.google.com/rss/search?q=Nifty+OR+Sensex+when:1d&hl=en-IN&gl=IN&ceid=IN:en",
            headers=BROWSER_HEADERS,
            timeout=8,
        )
        if remote.status_code != 200:
            return []
        root = ET.fromstring(remote.content)
    except (requests.RequestException, ET.ParseError):
        return []
    items = []
    for node in root.findall("./channel/item"):
        title = (node.findtext("title") or "").strip()
        link = (node.findtext("link") or "").strip()
        source = (node.findtext("source") or "").strip()
        suffix = f" - {source}"
        if source and title.endswith(suffix):
            title = title[: -len(suffix)].strip()
        published = (node.findtext("pubDate") or "").strip()
        if not title or not link or not published:
            continue
        items.append({
            "title": title,
            "link": link,
            "source": source or "News",
            "pubDate": published,
        })
        if len(items) == 6:
            break
    return items


def _gift_nifty():
    payload = _get_json(
        "https://www.nseix.com/api/derivatives-watch?inst_type1=IDX&type=live",
        headers={"Referer": "https://www.nseix.com/"},
    )
    rows = [
        row for row in ((payload or {}).get("data") or [])
        if row.get("INSTRUMENTTYPE") == "FUTIDX" and str(row.get("SYMBOL") or "").upper() == "NIFTY" and _num(row.get("LASTPRICE"))
    ]
    if not rows:
        return None
    row = max(rows, key=lambda item: _num(item.get("VOLUME")) or 0)
    market_time = None
    stamp = row.get("TIMESTMP")
    if isinstance(stamp, str):
        try:
            market_time = datetime.strptime(stamp, "%d-%b-%Y %H:%M:%S").replace(tzinfo=IST).timestamp()
        except ValueError:
            market_time = None
    return _quote(row.get("LASTPRICE"), row.get("CHANGE"), row.get("PERCHANGE"), market_time)


def _first(*quotes):
    for item in quotes:
        if item and item.get("price") is not None:
            return item
    return None


def _cash_session_open():
    now = datetime.now(IST)
    if now.weekday() >= 5:
        return False
    minutes = now.hour * 60 + now.minute
    return 9 * 60 + 15 <= minutes <= 15 * 60 + 30


def _session_quote(*candidates):
    chosen = _first(*candidates)
    if not chosen:
        return None
    live = bool(chosen.get("isLive")) or _cash_session_open()
    if live == chosen.get("isLive"):
        return chosen
    return {**chosen, "isLive": live}


_SECTOR_ROW = {
    "NIFTYBANK": "bank",
    "NIFTYIT": "it",
    "NIFTYPHARMA": "pharma",
    "NIFTYAUTO": "auto",
    "NIFTYFMCG": "fmcg",
    "NIFTYMETAL": "metal",
    "NIFTYREALTY": "realty",
    "NIFTYENERGY": "energy",
    "NIFTYPSUBANK": "psu",
    "NIFTYFINANCIALSERVICES": "fin",
    "NIFTYINFRA": "infra",
    "NIFTYMEDIA": "media",
}


def market_overview():
    hit = _cached("market-overview-built", 20)
    if hit and hit[0] == 200:
        return json.loads(hit[1])

    jobs = {
        "yahoo-nse": lambda: _yahoo_quote("^NSEI"),
        "yahoo-bse": lambda: _yahoo_quote("^BSESN"),
        "yahoo-vix": lambda: _yahoo_quote("^INDIAVIX"),
        "yahoo-usdinr": lambda: _yahoo_quote("INR=X"),
        "yahoo-gold": lambda: _yahoo_quote("GC=F"),
        "yahoo-crude": lambda: _yahoo_quote("CL=F"),
        "yahoo-silver": lambda: _yahoo_quote("SI=F"),
        "mc-nse": lambda: _moneycontrol_index("in;NSX"),
        "mc-bse": lambda: _moneycontrol_index("in;SEN"),
        "nse": _nse_index_map,
        "gift": _gift_nifty,
        "news": _headlines,
    }
    for _name, nse_key, symbol, _icon in _SECTORS:
        jobs[f"yahoo-{nse_key}"] = (lambda symbol=symbol: _yahoo_quote(symbol))

    results = {}
    pool = ThreadPoolExecutor(max_workers=8)
    try:
        futures = {pool.submit(fn): key for key, fn in jobs.items()}
        done, _pending = wait(futures, timeout=12)
        for future in done:
            try:
                results[futures[future]] = future.result()
            except Exception:
                results[futures[future]] = None
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    nse_rows = results.get("nse") or {}
    nifty = _session_quote(nse_rows.get("nse"), results.get("yahoo-nse"), results.get("mc-nse"))
    sensex = _session_quote(results.get("yahoo-bse"), results.get("mc-bse"))
    if not nifty or not sensex:
        raise RuntimeError("Live index quotes are unavailable from this server")

    sectors = []
    for name, nse_key, symbol, icon in _SECTORS:
        quote_row = _first(nse_rows.get(_SECTOR_ROW[nse_key]), results.get(f"yahoo-{nse_key}"))
        if not quote_row:
            continue
        sectors.append({
            "name": name,
            "ticker": symbol,
            "icon": icon,
            "price": quote_row["price"],
            "change": quote_row["change"],
            "changeAbs": quote_row["changeAbs"],
        })

    extras = []
    vix = _first(nse_rows.get("vix"), results.get("yahoo-vix"))
    if vix:
        extras.append({"name": "India VIX", "unit": "", "price": vix["price"], "change": vix["change"], "marketTime": vix.get("marketTime")})
    for name, unit, key in (
        ("USD/INR", "", "yahoo-usdinr"),
        ("Gold", "USD/oz", "yahoo-gold"),
        ("Crude Oil", "USD/bbl", "yahoo-crude"),
        ("Silver", "USD/oz", "yahoo-silver"),
    ):
        item = results.get(key)
        if item:
            extras.append({"name": name, "unit": unit, "price": item["price"], "change": item["change"], "marketTime": item.get("marketTime")})

    indices = {"nse": nifty, "bse": sensex}
    gift = results.get("gift")
    if gift and gift.get("price") is not None:
        indices["giftnifty"] = gift

    payload = {
        "success": True,
        "indices": indices,
        "sectors": sectors,
        "extras": extras,
        "news": results.get("news") or [],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _remember("market-overview-built", 200, json.dumps(payload), "application/json")
    return payload


def _nse_equity(symbol):
    url = f"https://www.nseindia.com/api/quote-equity?symbol={quote(symbol, safe='')}"
    try:
        remote = nse_session().get(url, timeout=12)
        if remote.status_code in {401, 403}:
            global _nse_ready_at
            _nse_ready_at = 0
            remote = nse_session().get(url, timeout=12)
        if remote.status_code == 404:
            return None
        data = remote.json()
    except (requests.RequestException, ValueError):
        return None
    price = (data.get("priceInfo") or {}).get("lastPrice")
    if _num(price) is None:
        return None
    trade = {}
    try:
        trade_remote = nse_session().get(url + "&section=trade_info", timeout=12)
        trade = (trade_remote.json().get("tradeInfo") or {}) if trade_remote.status_code == 200 else {}
    except (requests.RequestException, ValueError):
        trade = {}
    info = data.get("info") or {}
    meta = data.get("metadata") or {}
    industry = data.get("industryInfo") or {}
    mcap = _num(trade.get("totalMarketCap"))
    if mcap is not None and mcap > 10_000_000:
        mcap = mcap / 10_000_000
    return {
        "success": True,
        "sector": industry.get("sector") or industry.get("basicIndustry") or meta.get("industry") or "",
        "stock": {
            "symbol": symbol,
            "name": info.get("companyName") or meta.get("companyName") or symbol,
        },
        "fundamentals": {
            "cmp": _round(price),
            "pe": _round(meta.get("pdSymbolPe"), 2),
            "mcap": _round(mcap, 2),
            "universe": "",
        },
    }


def _yahoo_equity(symbol):
    payload = _get_json(
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{quote(symbol + '.NS', safe='')}?interval=1d&range=1d"
    )
    try:
        meta = payload["chart"]["result"][0]["meta"]
    except (TypeError, KeyError, IndexError):
        return None
    price = _round(meta.get("regularMarketPrice"))
    if price is None:
        return None
    return {
        "success": True,
        "sector": "",
        "stock": {
            "symbol": symbol,
            "name": meta.get("longName") or meta.get("shortName") or symbol,
        },
        "fundamentals": {"cmp": price, "pe": None, "mcap": None, "universe": ""},
    }


def stock_quote(symbol):
    symbol = re.sub(r"[^A-Z0-9.&-]", "", (symbol or "").strip().upper())
    if not symbol:
        raise LookupError("Stock not found")
    hit = _cached(f"stock-built-{symbol}", 45)
    if hit and hit[0] == 200:
        return json.loads(hit[1])
    payload = _nse_equity(symbol) or _yahoo_equity(symbol)
    if not payload:
        raise LookupError("Stock not found")
    _remember(f"stock-built-{symbol}", 200, json.dumps(payload), "application/json")
    return payload

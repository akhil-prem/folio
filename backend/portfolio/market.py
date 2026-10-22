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
        session.get("https://www.nseindia.com/", timeout=4)
        session.get("https://www.nseindia.com/market-data/live-equity-market", timeout=4)
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
        remote = session.get(url, headers={"Accept": accept}, timeout=6)
        if remote.status_code in {401, 403}:
            global _nse_ready_at
            _nse_ready_at = 0
            session = nse_session()
            remote = session.get(url, headers={"Accept": accept}, timeout=6)
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


def _parse_mcap_cr(value):
    """Parse values like '₹8,91,135Cr' or '891135.5' into ₹ Cr."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return _round(value, 2) if value > 0 else None
    text = str(value).lower().replace(",", "").replace(" ", "").replace("₹", "").replace("rs.", "").replace("rs", "")
    match = re.search(r"([\d.]+)(cr|crore)?", text)
    if not match:
        return None
    amount = _num(match.group(1))
    if amount is None or amount <= 0:
        return None
    # Raw rupees sometimes arrive without Cr suffix (e.g. 8911350000000)
    if not match.group(2) and amount > 10_000_000:
        amount = amount / 10_000_000
    return _round(amount, 2)


def _groww_equity_fundamentals(symbol):
    """Return mcap (₹ Cr) and pe from Groww company fundamentals."""
    try:
        search_id = resolve_stock_search_id(symbol)
        if not search_id:
            return None, None
        company = _groww_get_json(
            f"https://groww.in/v1/api/stocks_data/v1/company/search_id/{quote(search_id, safe='')}",
            ttl=30 * 60,
            key=f"stock-company-{search_id}",
            timeout=8,
        )
    except Exception:
        return None, None
    mcap = None
    pe = None
    for row in company.get("fundamentals") or []:
        if not isinstance(row, dict):
            continue
        name = (row.get("name") or "").lower()
        value = row.get("value")
        if mcap is None and "market cap" in name:
            mcap = _parse_mcap_cr(value)
        if pe is None and ("p/e" in name or name.startswith("pe")):
            pe = _round(_as_float(str(value).replace("%", "").strip()), 2)
    return mcap, pe


def _enrich_quote_fundamentals(symbol, payload):
    fundamentals = payload.setdefault("fundamentals", {})
    if fundamentals.get("mcap") is not None and fundamentals.get("pe") is not None:
        return payload
    mcap, pe = _groww_equity_fundamentals(symbol)
    if fundamentals.get("mcap") is None and mcap is not None:
        fundamentals["mcap"] = mcap
    if fundamentals.get("pe") is None and pe is not None:
        fundamentals["pe"] = pe
    return payload


def stock_quote(symbol):
    symbol = re.sub(r"[^A-Z0-9.&-]", "", (symbol or "").strip().upper())
    if not symbol:
        raise LookupError("Stock not found")
    hit = _cached(f"stock-built-{symbol}", 45)
    if hit and hit[0] == 200:
        cached = json.loads(hit[1])
        # Older cache entries often lack mcap when NSE was blocked — refresh fundamentals.
        if (cached.get("fundamentals") or {}).get("mcap") is not None:
            return cached
    # Yahoo answers from Render. NSE often blocks datacenter IPs and burns the worker on retries.
    payload = _yahoo_equity(symbol) or _nse_equity(symbol)
    if not payload:
        raise LookupError("Stock not found")
    payload = _enrich_quote_fundamentals(symbol, payload)
    _remember(f"stock-built-{symbol}", 200, json.dumps(payload), "application/json")
    return payload


def _normalize_symbol(symbol: str) -> str:
    return re.sub(r"[^A-Z0-9.&-]", "", (symbol or "").strip().upper())


def resolve_stock_search_id(symbol: str, search_id: str = "") -> str:
    search_id = (search_id or "").strip()
    if search_id:
        return search_id
    symbol = _normalize_symbol(symbol)
    if not symbol:
        return ""
    payload = _groww_get_json(
        "https://groww.in/v1/api/search/v1/entity"
        f"?app=false&entity_type=Stocks&page=0&q={quote(symbol, safe='')}&size=12&web=true",
        ttl=60,
        key=f"stock-search-id-{symbol.lower()}",
    )
    fallback = ""
    for row in payload.get("content") or []:
        entity = (row.get("entity_type") or "").lower()
        if entity and entity not in {"stocks", "stock"}:
            continue
        sid = (row.get("search_id") or row.get("id") or "").strip()
        nse = (row.get("nse_scrip_code") or "").strip().upper()
        title = (row.get("title") or row.get("company_short_name") or "").strip().upper()
        if not sid:
            continue
        if nse == symbol or title == symbol:
            return sid
        if not fallback:
            fallback = sid
    return fallback


def _groww_live_price(symbol: str):
    symbol = _normalize_symbol(symbol)
    if not symbol:
        return {}
    try:
        return _groww_get_json(
            f"https://groww.in/v1/api/stocks_data/v1/tr_live_prices/exchange/NSE/segment/CASH/{quote(symbol, safe='')}/latest",
            ttl=30,
            key=f"stock-live-{symbol}",
            timeout=15,
        )
    except Exception:
        return {}


def _parse_shareholding(raw):
    if not isinstance(raw, dict) or not raw:
        return []
    # Prefer newest quarter key (Groww uses "Jun '26" style)
    quarter = next(iter(raw.keys()))
    block = raw.get(quarter) or {}
    promoters = block.get("promoters") or {}
    promoter_pct = 0.0
    for part in promoters.values():
        if isinstance(part, dict):
            promoter_pct += _as_float(part.get("percent")) or 0.0
    dii = block.get("otherDomesticInstitutions") or {}
    dii_pct = 0.0
    for part in dii.values():
        if isinstance(part, dict):
            dii_pct += _as_float(part.get("percent")) or 0.0
    rows = [
        ("Promoters", promoter_pct),
        ("FII", _as_float((block.get("foreignInstitutions") or {}).get("percent")) or 0.0),
        ("Mutual funds", _as_float((block.get("mutualFunds") or {}).get("percent")) or 0.0),
        ("DII / Insurance", dii_pct),
        ("Retail & others", _as_float((block.get("retailAndOthers") or {}).get("percent")) or 0.0),
    ]
    return [{"name": name, "value": round(value, 2)} for name, value in rows if value > 0.01]


def _parse_financials(raw):
    consolidated = (raw or {}).get("CONSOLIDATED") if isinstance(raw, dict) else None
    if not isinstance(consolidated, list):
        return {"quarters": [], "rows": []}
    quarters = []
    rows = []
    for item in consolidated[:6]:
        title = (item.get("title") or "").strip()
        quarterly = item.get("quarterly") or {}
        if not title or not isinstance(quarterly, dict) or not quarterly:
            continue
        if not quarters:
            quarters = list(quarterly.keys())[-4:]
        rows.append(
            {
                "title": title,
                "values": [_as_float(quarterly.get(q)) for q in quarters],
            }
        )
    return {"quarters": quarters, "rows": rows}


def stock_detail(symbol: str, search_id: str = ""):
    symbol = _normalize_symbol(symbol)
    search_id = (search_id or "").strip()
    if not symbol and not search_id:
        raise LookupError("Stock not found")
    resolved_id = resolve_stock_search_id(symbol, search_id)
    if not resolved_id:
        raise LookupError("Stock not found")
    company = _groww_get_json(
        f"https://groww.in/v1/api/stocks_data/v1/company/search_id/{quote(resolved_id, safe='')}",
        ttl=30 * 60,
        key=f"stock-company-{resolved_id}",
        timeout=30,
    )
    header = company.get("header") or {}
    details = company.get("details") or {}
    live = _groww_live_price(header.get("nseScriptCode") or symbol)
    price_data = ((company.get("priceData") or {}).get("nse") or {})
    fundamentals = [
        {"name": row.get("name") or "", "value": row.get("value") or ""}
        for row in (company.get("fundamentals") or [])
        if isinstance(row, dict) and (row.get("name") or row.get("value"))
    ]
    funds = []
    for row in company.get("fundsInvested") or []:
        if not isinstance(row, dict):
            continue
        name = (row.get("name") or "").strip()
        if not name:
            continue
        funds.append(
            {
                "name": name,
                "searchId": row.get("searchId") or "",
                "aumPercent": _as_float(row.get("investedAumPercent")),
                "return3y": _as_float(row.get("return3y")),
            }
        )
    ltp = _as_float(live.get("ltp"))
    change = _as_float(live.get("dayChange"))
    change_pct = _as_float(live.get("dayChangePerc"))
    return {
        "symbol": header.get("nseScriptCode") or symbol,
        "searchId": header.get("searchId") or resolved_id,
        "name": header.get("displayName") or details.get("fullName") or symbol,
        "shortName": header.get("shortName") or symbol,
        "isin": header.get("isin") or "",
        "industry": header.get("industryName") or "",
        "logoUrl": header.get("logoUrl") or "",
        "exchange": "NSE",
        "ltp": ltp,
        "change": change,
        "changePct": change_pct,
        "open": _as_float(live.get("open")),
        "high": _as_float(live.get("high")),
        "low": _as_float(live.get("low")),
        "prevClose": _as_float(live.get("close")),
        "volume": _as_float(live.get("volume")),
        "yearHigh": _as_float(live.get("yearHighPrice") or price_data.get("yearHighPrice")),
        "yearLow": _as_float(live.get("yearLowPrice") or price_data.get("yearLowPrice")),
        "upperCircuit": _as_float(live.get("highPriceRange")),
        "lowerCircuit": _as_float(live.get("lowPriceRange")),
        "ceo": details.get("ceo") or details.get("managingDirector") or "",
        "foundedYear": details.get("foundedYear") or "",
        "summary": details.get("businessSummary") or "",
        "fundamentals": fundamentals,
        "shareholding": _parse_shareholding(company.get("shareHoldingPattern") or company.get("shareholdingPatternV2")),
        "financials": _parse_financials(company.get("financialStatementV2") or company.get("financialStatement")),
        "fundsInvested": funds[:8],
    }


def stock_price_history(symbol: str):
    symbol = _normalize_symbol(symbol)
    if not symbol:
        raise LookupError("Stock not found")
    payload = _get_json(
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{quote(symbol + '.NS', safe='')}?interval=1d&range=max"
    )
    try:
        result = payload["chart"]["result"][0]
        timestamps = result.get("timestamp") or []
        closes = (((result.get("indicators") or {}).get("quote") or [{}])[0].get("close") or [])
    except (TypeError, KeyError, IndexError):
        raise LookupError("Price history unavailable")
    points = []
    for ts, close in zip(timestamps, closes):
        if ts is None or close is None:
            continue
        points.append({"t": int(ts) * 1000, "nav": round(float(close), 4)})
    if not points:
        raise LookupError("Price history unavailable")
    return {
        "symbol": symbol,
        "points": [{"t": row["t"], "price": row["nav"]} for row in _downsample_nav(points)],
    }


_GROWW_MF_HEADERS = {
    "Referer": "https://groww.in/",
    "Accept": "application/json",
}


def _groww_get_json(url: str, *, ttl: int, key: str, timeout: int = 25):
    hit = _cached(key, ttl)
    if hit and hit[0] == 200:
        try:
            return json.loads(hit[1])
        except json.JSONDecodeError:
            pass
    remote = requests.get(url, headers={**BROWSER_HEADERS, **_GROWW_MF_HEADERS}, timeout=timeout)
    remote.raise_for_status()
    body = remote.text
    _remember(key, 200, body, "application/json")
    return json.loads(body)


def _suggestion_symbol(row: dict) -> str:
    for key in ("nse_scrip_code", "symbol", "company_short_name"):
        value = re.sub(r"[^A-Z0-9.&-]", "", str(row.get(key) or "").strip().upper())
        if value and not re.search(r"-(RE|PP|W\d+)$", value) and len(value) <= 20:
            return value
    return ""


def _rank_suggestions(query: str, rows: list[dict]) -> list[dict]:
    needle = query.strip().lower()

    def score(row):
        symbol = row["symbol"].lower()
        name = row["name"].lower()
        if symbol == needle:
            return 0
        if symbol.startswith(needle):
            return 1
        if name.startswith(needle):
            return 2
        if needle in name:
            return 3
        if needle in symbol:
            return 4
        return 5

    return sorted(rows, key=lambda row: (score(row), row["symbol"]))[:12]


def _groww_stock_suggestions(query: str) -> list[dict]:
    try:
        payload = _groww_get_json(
            "https://groww.in/v1/api/search/v1/entity"
            f"?app=false&entity_type=Stocks&page=0&q={quote(query, safe='')}&size=12&web=true",
            ttl=10 * 60,
            key=f"groww-suggest-{query.lower()}",
            timeout=5,
        )
    except Exception:
        return []
    rows = []
    seen = set()
    for item in payload.get("content") or []:
        if not isinstance(item, dict):
            continue
        entity = (item.get("entity_type") or "").lower()
        if entity and entity not in {"stocks", "stock"}:
            continue
        symbol = _suggestion_symbol(item)
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        rows.append(
            {
                "symbol": symbol,
                "name": (item.get("title") or item.get("company_short_name") or symbol).strip(),
                "sector": "",
                "industry": "",
                "mcap": None,
                "searchId": (item.get("search_id") or item.get("id") or "").strip(),
            }
        )
    return rows


def _yahoo_stock_suggestions(query: str) -> list[dict]:
    payload = _get_json(
        "https://query2.finance.yahoo.com/v1/finance/search"
        f"?q={quote(query, safe='')}&quotesCount=12&newsCount=0&listsCount=0",
        timeout=5,
    )
    rows = []
    seen = set()
    for item in ((payload or {}).get("quotes") or []):
        if not isinstance(item, dict):
            continue
        if item.get("quoteType") and item.get("quoteType") != "EQUITY":
            continue
        if item.get("exchange") and item.get("exchange") not in {"NSI", "BSE"}:
            continue
        symbol = re.sub(r"\.(NS|BO)$", "", str(item.get("symbol") or ""), flags=re.I).upper()
        symbol = re.sub(r"[^A-Z0-9.&-]", "", symbol)
        if not symbol or symbol in seen or re.search(r"-(RE|PP|W\d+)$", symbol):
            continue
        seen.add(symbol)
        rows.append(
            {
                "symbol": symbol,
                "name": (item.get("longname") or item.get("shortname") or symbol).strip(),
                "sector": item.get("sectorDisp") or item.get("sector") or "",
                "industry": item.get("industryDisp") or item.get("industry") or "",
                "mcap": None,
                "searchId": "",
            }
        )
    return rows


def stock_suggestions(query: str) -> list[dict]:
    """One cached lookup for the add-stock box. Groww first, Yahoo if Groww is slow or empty."""
    query = (query or "").strip()
    if len(query) < 2:
        return []
    key = f"stock-suggest-{query.lower()}"
    hit = _cached(key, 10 * 60)
    if hit and hit[0] == 200:
        try:
            return json.loads(hit[1])
        except json.JSONDecodeError:
            pass
    rows = _rank_suggestions(query, _groww_stock_suggestions(query) or _yahoo_stock_suggestions(query))
    _remember(key, 200, json.dumps(rows), "application/json")
    if not rows:
        # Don't pin a transient empty result for the full 10 minutes.
        _cache[key] = (time.time() - (10 * 60 - 20), 200, json.dumps(rows), "application/json")
    return rows


def mf_search(query: str, size: int = 12):
    query = (query or "").strip()
    if len(query) < 2:
        return []
    size = max(1, min(int(size or 12), 20))
    payload = _groww_get_json(
        "https://groww.in/v1/api/search/v1/entity"
        f"?app=false&page=0&q={quote(query, safe='')}&size={size}&web=true",
        ttl=10 * 60,
        key=f"mf-search-{query.lower()}-{size}",
        timeout=8,
    )
    results = []
    for row in payload.get("content") or []:
        if (row.get("entity_type") or "").lower() != "scheme":
            continue
        search_id = (row.get("search_id") or row.get("id") or "").strip()
        if not search_id:
            continue
        title = (row.get("title") or "").strip()
        plan = "Direct" if "direct" in search_id else "Regular" if "regular" in search_id else ""
        growth = "Growth" if "growth" in search_id else "IDCW" if "idcw" in search_id or "dividend" in search_id else ""
        plan_label = " ".join(part for part in (plan, growth) if part)
        results.append(
            {
                "searchId": search_id,
                "schemeCode": str(row.get("scheme_code") or ""),
                "name": title,
                "plan": plan_label,
                "label": f"{title} - {plan_label}" if plan_label else title,
            }
        )
    results.sort(key=lambda item: (0 if "direct" in item["searchId"] and "growth" in item["searchId"] else 1, item["label"]))
    return results


def _as_float(value):
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _map_fund_category(category: str, is_index: bool = False) -> str:
    if is_index:
        return "Index"
    text = (category or "").strip().lower()
    if "hybrid" in text or "balanced" in text:
        return "Hybrid"
    if "debt" in text or "liquid" in text or "money market" in text or "gilt" in text:
        return "Debt"
    if "equity" in text or "elss" in text:
        return "Equity"
    if "index" in text or "etf" in text:
        return "Index"
    return "Other"


def _parse_holdings(raw):
    holdings = []
    for row in raw or []:
        if not isinstance(row, (list, tuple)) or len(row) < 9:
            continue
        assets = _as_float(row[8])
        name = (row[2] or "").strip()
        if not name or assets is None:
            continue
        holdings.append(
            {
                "name": name,
                "sector": (row[4] or "").strip() or "—",
                "instrument": (row[5] or row[3] or "").strip() or "—",
                "assets": round(assets, 2),
                "searchId": (row[11] if len(row) > 11 else "") or "",
            }
        )
    holdings.sort(key=lambda item: item["assets"], reverse=True)
    return holdings


def _downsample_nav(points, max_points=720):
    if len(points) <= max_points:
        return points
    step = max(1, len(points) // max_points)
    sampled = points[::step]
    if sampled[-1] != points[-1]:
        sampled.append(points[-1])
    return sampled


def mf_nav_history(scheme_code: str):
    scheme_code = str(scheme_code or "").strip()
    if not scheme_code:
        raise LookupError("Scheme not found")
    payload = _groww_get_json(
        f"https://groww.in/v1/api/data/mf/web/v1/scheme/{quote(scheme_code, safe='')}/graph",
        ttl=6 * 60 * 60,
        key=f"mf-nav-{scheme_code}",
        timeout=30,
    )
    folio = payload.get("folio") or {}
    points = []
    for row in folio.get("data") or []:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            continue
        ts = _as_float(row[0])
        nav = _as_float(row[1])
        if ts is None or nav is None:
            continue
        points.append({"t": int(ts), "nav": round(nav, 4)})
    return {
        "schemeCode": scheme_code,
        "name": folio.get("name") or "",
        "points": _downsample_nav(points),
    }


def mf_scheme(search_id: str):
    search_id = (search_id or "").strip()
    if not search_id:
        raise LookupError("Scheme not found")
    payload = _groww_get_json(
        f"https://groww.in/v1/api/data/mf/web/v1/scheme/search/{quote(search_id, safe='')}",
        ttl=30 * 60,
        key=f"mf-scheme-{search_id}",
        timeout=30,
    )
    stats = (payload.get("return_stats") or [{}])[0] or {}
    category = payload.get("category") or ""
    managers = []
    for row in payload.get("fund_manager_details") or []:
        name = (row.get("person_name") or "").strip()
        if not name:
            continue
        managers.append(
            {
                "name": name,
                "education": (row.get("education") or "").strip(),
                "experience": (row.get("experience") or "").strip(),
                "since": (row.get("date_from") or "")[:10],
            }
        )
    pros = []
    cons = []
    for row in payload.get("analysis") or []:
        text = (row.get("analysis_desc") or "").strip()
        if not text:
            continue
        kind = (row.get("analysis_type") or "").upper()
        if kind == "CONS":
            cons.append(text)
        else:
            pros.append(text)
    return {
        "searchId": payload.get("search_id") or search_id,
        "schemeCode": str(payload.get("scheme_code") or ""),
        "name": payload.get("scheme_name") or payload.get("fund_name") or search_id,
        "fundName": payload.get("fund_name") or "",
        "amc": payload.get("amc") or payload.get("fund_house") or "",
        "fundHouse": payload.get("fund_house") or "",
        "category": _map_fund_category(category, bool(payload.get("is_index_fund"))),
        "categoryLabel": category,
        "subCategory": payload.get("sub_category") or "",
        "nav": _as_float(payload.get("nav")),
        "navDate": payload.get("nav_date") or "",
        "aum": _as_float(payload.get("aum")),
        "expenseRatio": _as_float(payload.get("expense_ratio")),
        "rating": payload.get("groww_rating"),
        "minSip": _as_float(payload.get("min_sip_investment")),
        "minLumpsum": _as_float(payload.get("min_investment_amount")),
        "benchmark": payload.get("benchmark_name") or payload.get("benchmark") or "",
        "launchDate": payload.get("launch_date") or "",
        "exitLoad": payload.get("exit_load") or "",
        "description": payload.get("description") or "",
        "risk": ((payload.get("category_info") or {}).get("tags") or [None])[0]
        if isinstance((payload.get("category_info") or {}).get("tags"), list)
        else "",
        "returns": {
            "1d": _as_float(stats.get("return1d")),
            "1w": _as_float(stats.get("return1w")),
            "1m": _as_float(stats.get("return1m")),
            "3m": _as_float(stats.get("return3m")),
            "6m": _as_float(stats.get("return6m")),
            "1y": _as_float(stats.get("return1y")),
            "3y": _as_float(stats.get("return3y")),
            "5y": _as_float(stats.get("return5y")),
            "all": _as_float(stats.get("return_since_created") or stats.get("returnSinceCreated")),
        },
        "holdings": _parse_holdings(payload.get("holdings")),
        "managers": managers,
        "pros": pros[:6],
        "cons": cons[:6],
        "logoUrl": payload.get("logo_url") or "",
        "planType": payload.get("plan_type") or "",
        "schemeType": payload.get("scheme_type") or "",
    }

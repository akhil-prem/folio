from urllib.parse import quote

from .proxy import cached, fetch, nse_get


def market_overview():
    def load():
        response = fetch('https://downstox.com/api/india-markets/overview')
        response.raise_for_status()
        return response.json()

    return cached('market-overview', 30, load)


def stock_quote(symbol):
    symbol = quote((symbol or '').strip().upper(), safe='')
    if not symbol:
        raise ValueError('Missing symbol')

    def load():
        response = fetch(f'https://downstox.com/api/stocks/{symbol}')
        if response.status_code == 404:
            raise LookupError('Stock not found')
        response.raise_for_status()
        return response.json()

    return cached(f'stock-{symbol}', 60, load)


def nse_movers(index='gainers'):
    index = index if index in {'gainers', 'loosers'} else 'gainers'

    def load():
        response = nse_get(
            'https://www.nseindia.com/api/live-analysis-variations',
            params={'index': index},
        )
        response.raise_for_status()
        return response.json()

    return cached(f'nse-movers-{index}', 30, load)


def nse_equities_csv():
    def load():
        response = nse_get('https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv')
        if response.status_code >= 400:
            response = nse_get('https://archives.nseindia.com/content/equities/EQUITY_L.csv')
        response.raise_for_status()
        return response.text

    return cached('nse-equities', 12 * 60 * 60, load)


def yahoo_search(query):
    query = (query or '').strip()
    if len(query) < 2:
        return {'quotes': []}

    def load():
        response = fetch(
            'https://query1.finance.yahoo.com/v1/finance/search',
            params={
                'q': query,
                'quotesCount': 20,
                'newsCount': 0,
                'listsCount': 0,
                'enableFuzzyQuery': 'false',
                'quotesQueryId': 'tss_match_phrase_query',
                'region': 'IN',
                'lang': 'en-IN',
            },
            headers={'Origin': 'https://finance.yahoo.com', 'Referer': 'https://finance.yahoo.com/'},
        )
        response.raise_for_status()
        return response.json()

    return cached(f'yahoo-{query.lower()}', 30, load)


def groww_search(query):
    query = (query or '').strip()
    if len(query) < 2:
        return {'content': []}

    def load():
        response = fetch(
            'https://groww.in/v1/api/search/v1/entity',
            params={
                'app': 'web',
                'entity_type': 'Stocks',
                'page': 0,
                'size': 12,
                'query': query,
            },
            headers={'Referer': 'https://groww.in/', 'Origin': 'https://groww.in'},
        )
        response.raise_for_status()
        return response.json()

    return cached(f'groww-search-{query.lower()}', 30, load)


def groww_company(search_id):
    search_id = (search_id or '').strip()
    if not search_id:
        raise ValueError('Missing id')

    def load():
        response = fetch(
            f'https://groww.in/v1/api/stocks_data/v1/company/search_id/{quote(search_id, safe="")}',
            headers={'Referer': 'https://groww.in/', 'Origin': 'https://groww.in'},
        )
        response.raise_for_status()
        return response.json()

    return cached(f'groww-company-{search_id}', 10 * 60, load)

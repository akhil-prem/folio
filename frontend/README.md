# Folio frontend

## Run locally

Start the Django API first (`backend/README.md`), then:

```bash
npm install
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8000`.

First login (created by the backend migrate):

- Email: `admin@folio.app`
- Password: `folio123`

## Live market data

Overview keeps a compact Market Pulse. Open **Live market** in the sidebar for the full page: NIFTY / Sensex / GIFT Nifty, Nifty sector indices, NSE top gainers and losers among Nifty and F&O names, portfolio stock CMPs, a symbol lookup, and headlines.

The Django backend proxies the free, no-key [Downstox public API](https://downstox.com/api-docs) plus NSE’s public live-analysis feed, Yahoo / Groww search, and IPO pages. The UI refreshes once per minute. Data is informational and should not be used as trading advice.

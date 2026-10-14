# Folio backend

Django REST API for Folio. SQLite is used locally. Members and holdings are empty until you add them in the app.

## Run locally

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py bootstrap
python manage.py runserver
```

The API listens on `http://127.0.0.1:8000`. Vite proxies `/api` to that origin.

First login:

- Email: `admin@folio.app`
- Password: `folio123`

Override with `FOLIO_BOOTSTRAP_EMAIL` and `FOLIO_BOOTSTRAP_PASSWORD` if needed.

## Endpoints

Authenticated with `Authorization: Token …` except login.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login/` | Sign in |
| POST | `/api/auth/logout/` | Sign out |
| GET/PATCH | `/api/auth/me/` | Profile |
| POST | `/api/auth/password/` | Change password |
| GET/POST/DELETE | `/api/members/` | Portfolio members |
| GET/POST/PATCH/DELETE | `/api/holdings/` | Holdings |
| GET | `/api/market-overview` | Downstox market pulse |
| GET | `/api/nse-movers` | NSE gainers / losers |
| GET | `/api/nse-equities` | NSE equity CSV |
| GET | `/api/stock-search` | Yahoo Finance search |
| GET | `/api/groww-search` | Groww search |
| GET | `/api/groww-company` | Groww company profile |
| GET | `/api/stocks/:symbol` | Downstox quote |
| GET | `/api/ipos` | Live / upcoming IPOs |
| GET | `/api/ipos-listed` | Recently listed IPOs |
| GET | `/api/ipo-detail` | IPO analysis |

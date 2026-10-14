# Folio

Indian-stock family portfolio app. The React UI talks only to the Django API. Members and holdings start empty.

## Run

Terminal 1 — API:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Terminal 2 — UI:

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Sign in with `admin@folio.app` / `folio123`.

import os

# Render's default sync worker handles one request at a time. A SIP save then
# waits behind any in-flight Groww or market call. Threads let writes proceed.
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
workers = 1
threads = 4 if os.environ.get("DATABASE_URL") else 1
timeout = 60
graceful_timeout = 30
accesslog = "-"
errorlog = "-"

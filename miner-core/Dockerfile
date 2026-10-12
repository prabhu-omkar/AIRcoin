# ── AIRcoin Miner Daemon & PoUW Controller Dockerfile ──
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY miner-core/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy contracts-schema dependencies needed for calibration & species catalogue
COPY contracts-schema /contracts-schema

COPY miner-core .

# Create directory for durable SQLite DB and queues
RUN mkdir -p /app/var

EXPOSE 8090

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -f http://127.0.0.1:8090/api/health || exit 1

CMD ["python", "-m", "minerd", "daemon", "--vision-source", "mock", "--gps-source", "none"]

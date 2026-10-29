
FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY zoneguard ./zoneguard
COPY static ./static
COPY models ./models
COPY README.md .

RUN mkdir -p data/uploads

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.getenv('PORT', '8080') + '/api/health', timeout=3)"]

CMD ["sh", "-c", "exec uvicorn zoneguard.main:app --host 0.0.0.0 --port ${PORT:-8080}"]

FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create data directory for SQLite + config
RUN mkdir -p data

# Expose ports: proxy=8080, API=8081, WS=8765
EXPOSE 8080 8081 8765

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8081/api/stats')" || exit 1

CMD ["python", "server.py"]

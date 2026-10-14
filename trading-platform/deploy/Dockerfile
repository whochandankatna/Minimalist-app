# Paper-trading lab image. Build from the trading-platform/ directory:
#   docker build -f deploy/Dockerfile -t tradelab:$(git rev-parse --short HEAD) .
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TZ=Asia/Kolkata
RUN useradd --create-home --uid 10001 app
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
COPY config ./config
# Editable install keeps config/ resolvable relative to src/ (see settings.CONFIG_DIR).
RUN pip install --no-cache-dir -e . && mkdir -p /data && chown -R app /app /data
USER app
ENV TRADELAB_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK --interval=60s --timeout=10s CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz').status==200 else 1)"
CMD ["tradelab", "serve", "--host", "0.0.0.0", "--port", "8000"]

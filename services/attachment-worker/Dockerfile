FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl default-jre-headless clamav clamav-daemon ffmpeg file libmagic1 libreoffice-headless poppler-utils procps \
    libcairo2 libpango-1.0-0 libgdk-pixbuf-2.0-0 shared-mime-info fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

ARG TIKA_VERSION=3.3.1
RUN mkdir -p /opt/tika \
    && cd /opt/tika \
    && curl -fsSLO "https://dlcdn.apache.org/tika/${TIKA_VERSION}/tika-app-${TIKA_VERSION}.jar" \
    && curl -fsSLO "https://dlcdn.apache.org/tika/${TIKA_VERSION}/tika-app-${TIKA_VERSION}.jar.sha512" \
    && sha512sum -c "tika-app-${TIKA_VERSION}.jar.sha512" \
    && ln -s "tika-app-${TIKA_VERSION}.jar" tika-app.jar

WORKDIR /app
COPY services/attachment-worker/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt
COPY services/attachment-worker/worker.py ./worker.py
COPY services/attachment-worker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p /var/run/clamav && chown clamav:clamav /var/run/clamav

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD pgrep -f "python worker.py" >/dev/null || exit 1
ENTRYPOINT ["/app/entrypoint.sh"]

FROM node:26-bookworm-slim AS studio
ARG APP_VERSION=0.1.0
ENV VITE_APP_VERSION=$APP_VERSION
WORKDIR /studio
COPY apps/studio/package*.json ./
RUN npm ci
COPY apps/studio/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ARG APP_VERSION=0.1.0
ARG VCS_REF=unknown
ARG SOURCE_URL=https://github.com/dziksu/synkinema
LABEL org.opencontainers.image.title="Synkinema" \
      org.opencontainers.image.description="Local video editing for people and agents" \
      org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.source=$SOURCE_URL \
      org.opencontainers.image.licenses="MIT"
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SYNKINEMA_DATA=/data SYNKINEMA_STUDIO=/app/studio
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 studio
WORKDIR /app
COPY pyproject.toml requirements.txt requirements.lock ./
COPY apps/server ./apps/server
COPY scripts/stamp_version.py ./scripts/stamp_version.py
RUN python scripts/stamp_version.py "$APP_VERSION" \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir --no-build-isolation --no-deps .
COPY --from=studio /studio/dist ./studio
COPY LICENSE THIRD_PARTY_NOTICES.md ./
RUN mkdir /data && chown studio:studio /data
USER studio
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s CMD curl --fail http://127.0.0.1:8080/api/health || exit 1
CMD ["synkinema", "serve", "--host", "0.0.0.0", "--port", "8080"]

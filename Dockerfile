FROM node:24-bookworm-slim AS studio
ARG APP_VERSION=1.3.1
ENV VITE_APP_VERSION=$APP_VERSION
WORKDIR /studio
COPY apps/studio/package*.json ./
RUN npm ci
COPY apps/studio/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ARG APP_VERSION=1.3.1
ARG VCS_REF=unknown
ARG SOURCE_URL=https://github.com/dziksu/synkinema
LABEL org.opencontainers.image.title="Synkinema" \
      org.opencontainers.image.description="Local video editing for people and agents" \
      org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.source=$SOURCE_URL \
      org.opencontainers.image.licenses="MIT"
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SYNKINEMA_DATA=/data \
    SYNKINEMA_API_ORIGIN=http://127.0.0.1:8081 HOST=0.0.0.0 PORT=8080 NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core curl libstdc++6 libatomic1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 studio
WORKDIR /app
COPY pyproject.toml requirements.txt requirements.lock ./
COPY apps/server ./apps/server
COPY scripts/stamp_version.py ./scripts/stamp_version.py
RUN python scripts/stamp_version.py "$APP_VERSION" \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir --no-build-isolation --no-deps .
COPY --from=studio /usr/local/bin/node /usr/local/bin/node
COPY --from=studio /usr/local/LICENSE /usr/local/share/licenses/node/LICENSE
COPY --from=studio /studio/.output ./studio
COPY scripts/serve_container.py ./scripts/serve_container.py
COPY LICENSE THIRD_PARTY_NOTICES.md ./
RUN mkdir /data && chown studio:studio /data
USER studio
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s CMD curl --fail http://127.0.0.1:8080/api/health || exit 1
CMD ["python", "scripts/serve_container.py"]

# syntax=docker/dockerfile:1.12

FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS frontend
WORKDIR /src/frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM golang:1.25-alpine@sha256:56961d79ea8129efddcc0b8643fd8a5416b4e6228cfd477e3fd61deb2672c587 AS backend
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/clipboard ./cmd/clipboard

FROM alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S clipboard \
    && adduser -S -G clipboard -h /app clipboard
WORKDIR /app
COPY --from=backend /out/clipboard /app/clipboard
COPY --from=frontend /src/frontend/dist /app/web

ENV LISTEN_ADDR=0.0.0.0:8080 \
    WEB_DIR=/app/web
EXPOSE 8080
USER clipboard
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["/app/clipboard"]

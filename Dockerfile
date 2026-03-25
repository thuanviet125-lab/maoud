# ─────────────────────────────────────────────────────────────
#  1 container = ws-proxy (Node) + xmrig-proxy (binary)
#  Northflank expose port 8080 → WSS public
#  xmrig-proxy chạy internal :3333
# ─────────────────────────────────────────────────────────────

FROM node:20-alpine AS base

# ── Cài supervisord + wget ──────────────────────────────────
RUN apk add --no-cache supervisor wget tar

WORKDIR /app

# ── Tải xmrig-proxy static binary (Linux x64) ──────────────
ENV XMRIG_PROXY_VERSION=6.24.0
RUN wget -q "https://github.com/xmrig/xmrig-proxy/releases/download/v${XMRIG_PROXY_VERSION}/xmrig-proxy-${XMRIG_PROXY_VERSION}-linux-static-x64.tar.gz" \
    -O /tmp/xmrig-proxy.tar.gz \
    && tar -xzf /tmp/xmrig-proxy.tar.gz -C /tmp \
    && mv /tmp/xmrig-proxy-${XMRIG_PROXY_VERSION}/xmrig-proxy /usr/local/bin/xmrig-proxy \
    && chmod +x /usr/local/bin/xmrig-proxy \
    && rm -rf /tmp/xmrig-proxy*

# ── Cài Node dependencies ───────────────────────────────────
COPY package.json ./
RUN npm ci --omit=dev

# ── Copy source ─────────────────────────────────────────────
COPY proxy.js        ./
COPY config.json     ./config.json
COPY supervisord.conf /etc/supervisord.conf

EXPOSE 8080

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]

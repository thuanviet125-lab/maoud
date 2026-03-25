FROM alpine:3.19

ENV WSTUNNEL_VERSION=10.5.2

RUN wget -q "https://github.com/erebe/wstunnel/releases/download/v${WSTUNNEL_VERSION}/wstunnel_${WSTUNNEL_VERSION}_linux_amd64.tar.gz" \
    -O /tmp/wst.tar.gz \
    && tar -xzf /tmp/wst.tar.gz -C /usr/local/bin wstunnel \
    && chmod +x /usr/local/bin/wstunnel \
    && rm /tmp/wst.tar.gz

ENV XMRIG_PROXY_VERSION=6.24.0
RUN wget -q "https://github.com/xmrig/xmrig-proxy/releases/download/v${XMRIG_PROXY_VERSION}/xmrig-proxy-${XMRIG_PROXY_VERSION}-linux-static-x64.tar.gz" \
    -O /tmp/xp.tar.gz \
    && tar -xzf /tmp/xp.tar.gz -C /tmp \
    && mv /tmp/xmrig-proxy-${XMRIG_PROXY_VERSION}/xmrig-proxy /usr/local/bin/ \
    && chmod +x /usr/local/bin/xmrig-proxy \
    && rm -rf /tmp/xp*

RUN apk add --no-cache supervisor
COPY config.json       /app/config.json
COPY supervisord.conf  /etc/supervisord.conf

EXPOSE 8080
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]

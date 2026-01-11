FROM caddy:2-builder AS builder

RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# ---------- build stage ----------
ARG NGINX_VERSION=1.28.2
ARG NCHAN_VERSION=1.3.8
ARG NJS_VERSION=0.9.6

FROM alpine:3.23 AS builder

ARG NGINX_VERSION
ARG NCHAN_VERSION
ARG NJS_VERSION

RUN apk add --no-cache \
    build-base \
    ca-certificates \
    git \
    linux-headers \
    openssl-dev \
    pcre2-dev \
    zlib-dev \
    wget

WORKDIR /build

RUN wget -qO- https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz | tar zxvf - && \
    wget -qO- https://github.com/nginx/njs/archive/refs/tags/${NJS_VERSION}.tar.gz | tar zxvf - && \
    git clone --depth 1 --branch v${NCHAN_VERSION} https://github.com/slact/nchan.git /nchan && \
    cd /build/nginx-${NGINX_VERSION} && \
    NJS_LIBXSLT=NO ./configure \
        --with-compat \
        --with-http_ssl_module \
        --add-dynamic-module=/nchan \
        --add-dynamic-module=/build/njs-${NJS_VERSION}/nginx && \
    make modules && \
    cp objs/ngx_nchan_module.so /build/ && \
    cp objs/ngx_http_js_module.so /build/ && \
    rm -rf /build/nginx-${NGINX_VERSION} /build/njs-${NJS_VERSION} /nchan

# ---------- runtime stage ----------
FROM nginx:${NGINX_VERSION}-alpine

ARG NGINX_VERSION

LABEL org.opencontainers.image.source="https://github.com/tailuge/scoreboard" \
      org.opencontainers.image.description="Billiards Network Nchan Server"

RUN apk add --no-cache ca-certificates && \
    update-ca-certificates && \
    mkdir -p /etc/nginx/modules /var/cache/nginx /var/log/nginx \
             /tmp/client_temp /tmp/proxy_temp_path /tmp/fastcgi_temp \
             /tmp/uwsgi_temp /tmp/scgi_temp

COPY --from=builder /build/ngx_nchan_module.so /etc/nginx/modules/
COPY --from=builder /build/ngx_http_js_module.so /etc/nginx/modules/

COPY nginx.conf /etc/nginx/nginx.conf
COPY nchan.conf /etc/nginx/conf.d/default.conf
COPY nchan_meta.js /etc/nginx/nchan_meta.js
COPY html/ /usr/share/nginx/html/

RUN chown -R nginx:nginx /etc/nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx /tmp

USER nginx

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/basic_status || exit 1

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]

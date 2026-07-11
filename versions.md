# Billiards Network Nchan Server Upgrade Guide

This document outlines the recommended version updates for the Nginx, NJS, and Alpine Linux containerized setup, explains the drivers for each upgrade (including security patches), and documents potential compatibility concerns and deployment guidelines for Render.com.

---

## 1. What to Upgrade & How

The Docker build is defined in `docker/Dockerfile`. To upgrade, modify the build-argument defaults at the top of the file:

```dockerfile
# ---------- build stage ----------
ARG NGINX_VERSION=1.30.3
ARG NCHAN_VERSION=1.3.8
ARG NJS_VERSION=1.0.0

FROM alpine:3.24 AS builder
```

### Upgraded Versions at a Glance

| Component | Configured Version | Recommended Version | Release Date | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Alpine Linux** | `3.23` | **`3.24.1`** (or `3.24`) | June 13, 2026 | Out-of-date |
| **Nginx** | `1.28.2` | **`1.30.3`** (Stable) | June 17, 2026 | Out-of-date |
| **NJS (Nginx JavaScript)** | `0.9.6` | **`1.0.0`** (Stable) | June 23, 2026 | Out-of-date |
| **Nchan** | `1.3.8` | **`1.3.8`** | Feb 14, 2026 | **Up-to-date** |

---

## 2. Drivers for Updates

### A. NJS (Nginx JavaScript) Upgrade to 1.0.0
1. **Critical Security Fix (CVE-2026-8711):**
   * **Vulnerability:** NJS versions `0.9.4` through `0.9.8` suffer from a heap buffer overflow in the `js_fetch_proxy` function. This can lead to denial of service or arbitrary code execution in environments that handle untrusted proxy requests.
   * **Remediation:** Upgrading to version `0.9.9` or higher (including `1.0.0`) fully resolves this issue.
2. **Architecture Transition (QuickJS):**
   * **Milestone:** In NJS 1.0.0, the native custom NJS engine is deprecated in favor of **QuickJS** (ES2023 compliance). QuickJS is now the recommended default engine, and it will eventually become the sole engine. Transitioning early ensures the scripts align with modern ECMA-compliant performance and behavior.
3. **Hardening & Stability:**
   * Bound on string-producing buffer growth ensures catchable `RangeError` is thrown instead of exhausting worker/container memory (OOM).

### B. Nginx Upgrade to 1.30.3
1. **Critical Security Fixes:**
   * **CVE-2026-42055:** Resolves a buffer overflow vulnerability in `ngx_http_proxy_v2_module` and `ngx_http_grpc_module`.
   * **CVE-2026-48142:** Resolves a buffer overread vulnerability in `ngx_http_charset_module`.
   * **CVE-2026-9256:** Fixes a buffer overflow vulnerability in `ngx_http_rewrite_module`.
2. **Improved HTTP/2 & Back-end Keep-Alives:**
   * Introduces support for HTTP/2 back-end connectivity and HTTP forward proxies (useful for outbound fetches made in NJS scripts like IP Geolocation APIs).

### C. Alpine Linux Builder Upgrade to 3.24
* Consolidates newer security patches in OS packages, provides upgraded toolchains (`gcc`, `make`, `openssl-dev`, `pcre2-dev`), and minimizes base image scanning alerts in production container registries.

---

## 3. Compatibility Concerns & Pitfalls

When upgrading to Nginx 1.30.3 and NJS 1.0.0, carefully monitor the following areas to prevent production failures:

### A. QuickJS Engine Exception Alignment
* **Change:** NJS 1.0.0 aligns error reporting between engines. For example, API misuse now throws standard `TypeError` instead of generic custom exceptions, and out-of-bounds parameters throw standard `RangeError`.
* **Testing:** Audit error handlers in `docker/api.njs` and `docker/nchan_meta.js`. If you have `try/catch` statements that rely on specific exception text pattern-matching, refactor them to verify broad exception properties or prototype types.

### B. Fetch API Target and Header Hardening
* **Change:** In NJS 1.0.0, the `ngx.fetch` client has been hardened to reject unsafe request targets, HTTP methods, and malformed header values *before* request serialization.
* **Testing:** Our script `nchan_meta.js` uses `ngx.fetch` to query `https://api.country.is/` for geo-location. Ensure that the target URL format remains perfectly clean and matches valid absolute URL standards (e.g., proper scheme, host, and path structure, without unescaped characters).

### C. QuickJS Sandbox Strictness
* **Pitfall:** QuickJS complies strictly with ECMAScript standards. While standard built-ins (e.g., `Object.assign`) will execute identically, verify that none of your scripts use non-standard, legacy, or undocumented global functions.

---

## 4. Render.com Deployment Best Practices

The Billiards Network Nchan Server is designed to deploy on **Render.com**. Keep the following deployment guidelines in mind:

2. **Subrequest Timing & API Latency:**
   * Our NJS geo-location logic performs an external request to `https://api.country.is/`. Render instances on the free/individual tier can experience transient network delays. If the API lookup times out or stalls, it could block client publish requests.
   * Ensure that the `timeout: 2000` parameter on `ngx.fetch` remains active to prevent slow geolocation lookups from cascading into system-wide publish timeouts.
3. **Container Resource Limits:**
   * Render instances operate under set RAM limits (e.g., 512MB for Starter tier). Ensure Nginx memory dictionaries (`ngx.shared.ip_cache`, `ngx.shared.system_stats`, etc.) inside `docker/nginx.conf` have reasonably bounded size limits (e.g., `10m` or `20m` memory allocations) so they do not cause Container Out-Of-Memory (OOM) restarts.

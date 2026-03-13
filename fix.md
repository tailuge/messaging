# IP Country Cache Diagnostic Report

## Observed Issue
The NJS `ip_cache` is not working in both local Docker and Render.com environments. Logs indicate that `njs.shared` is `undefined` (reported as `false` in the debug log), despite the `js_shared_dict_zone` being defined in the Nginx configuration.

### Log Evidence
```
js: njs version: 0.9.5, shared exists: false, keys: engine, version, version_number, memoryStats
js: cache is not available (njs.shared exists: false, ip_cache exists: false)
```

---

## Postulated Causes and Solutions

### 1. Namespace Mismatch (`njs.shared` vs `ngx.shared`)
**Cause:** While modern NJS documentation points to `njs.shared`, many Nginx JavaScript implementations and older versions (or specific builds) expose shared dictionaries through the `ngx.shared` object to maintain consistency with other Nginx modules (like OpenResty). If the build environment or the way NJS is integrated into the Nginx binary differs, the `shared` property might be attached to `ngx` instead of `njs`.
**Solution:** Implement a robust fallback mechanism that checks both `njs.shared` and `ngx.shared`.
```javascript
const cache = (njs && njs.shared && njs.shared.ip_cache) ||
              (ngx && ngx.shared && ngx.shared.ip_cache);
```

### 2. Timeout Unit Mismatch (Seconds vs Milliseconds)
**Cause:** The current implementation uses `86400000` for the cache timeout. In NJS `shared_dict.set(key, value, options)`, the `timeout` in the options object is expected to be in **milliseconds** (since version 0.8.0). However, if the environment interprets this as **seconds** (following standard Nginx time conventions for integers), `86400000` seconds is approximately 2.7 years, which might exceed internal limits of the NJS engine or the underlying memory allocator, leading to silent failures or rejection of the `set` operation.
**Solution:** Normalize the timeout value and ensure it's within a safe range. Explicitly use a smaller, safer value if the environment's behavior is ambiguous.
```javascript
// Ensure 24 hours in milliseconds
const timeout = 24 * 60 * 60 * 1000;
cache.set(ip, country, { timeout: timeout });
```

### 3. Initialization Failure due to Directive Order or Memory Constraints
**Cause:** On platforms like Render.com or in Alpine-based Docker containers, shared memory allocation can be sensitive to Nginx directive ordering and available system resources. If `js_shared_dict_zone` fails to initialize (e.g., due to memory constraints or if the NJS module is loaded in a way that doesn't properly register the zone before the script is imported), the `shared` object will not be populated. Additionally, the `type=string` parameter is only supported in NJS 0.8.0+, and while the version is 0.9.5, an underlying mismatch in how the module was compiled might cause it to fail.
**Solution:**
- Move `js_shared_dict_zone` to the top of the `http` block.
- Increase the zone size slightly to ensure it meets minimum alignment requirements for some systems (e.g., 128k).
- Add a check to `nchan_meta.js` to log the available keys of the `ngx` global to further diagnose where the shared dict might be hiding.

---

## Recommended Fixes
1. Update `nchan_meta.js` with the fallback and improved logging.
2. Adjust `nginx.conf` to optimize the placement and size of the shared dictionary zone.
3. Standardize the timeout value.

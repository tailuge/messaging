## 2025-05-14 - [HIGH] Fix metadata tampering vulnerability
**Vulnerability:** Client-provided `_meta` field in the JSON payload was being merged with server-generated metadata using `Object.assign(meta, payload._meta)`. This allowed clients to overwrite server-side truth, such as timestamps (`ts`), and potentially leak data across requests if the `meta` object was reused.
**Learning:** Using `Object.assign` with untrusted input as the second argument is dangerous. In NJS (Nginx JavaScript), as in standard JS, the first argument is mutated.
**Prevention:** Explicitly delete untrusted properties before assigning trusted ones. Preferred pattern: `delete payload._meta; payload._meta = meta;`.

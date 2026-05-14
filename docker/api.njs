function json(r, status, obj) {
    r.headersOut['Content-Type'] = 'application/json';
    r.return(status, JSON.stringify(obj));
}

async function hello(r) {
    const upstashUrl = process.env.UPSTASH_URL || "not set";
    // Keeping text/plain for this specific endpoint as requested previously
    r.headersOut['Content-Type'] = 'text/plain';
    r.return(200, `hello world\nUPSTASH_URL: ${upstashUrl}\n`);
}

async function usage(r) {
    const match = r.uri.match(/^\/api\/usage\/(.+)$/);
    if (!match) {
        return json(r, 400, { error: "Missing key" });
    }

    const key = decodeURIComponent(match[1]);

    return json(r, 200, { 
        status: "success", 
        message: "usage recorded (noop)",
        key: key,
        ts: Date.now()
    });
}

async function router(r) {
    try {
        if (r.uri === '/api/hello' && r.method === 'GET') {
            return await hello(r);
        }
        
        if (r.uri.startsWith('/api/usage/') && r.method === 'PUT') {
            return await usage(r);
        }

        return json(r, 404, { error: "Not Found", uri: r.uri, method: r.method });
    } catch (e) {
        return json(r, 500, { error: "Internal Server Error", message: e.message });
    }
}

export default { router };

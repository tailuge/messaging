function hello(r) {
    const upstashUrl = process.env.UPSTASH_URL || "not set";
    r.headersOut['Content-Type'] = 'text/plain';
    r.return(200, `hello world\nUPSTASH_URL: ${upstashUrl}\n`);
}

function usage(r) {
    // Extract key from /api/usage/${key}
    const parts = r.uri.split('/');
    const key = parts[3]; 

    r.headersOut['Content-Type'] = 'application/json';
    r.return(200, JSON.stringify({ 
        status: "success", 
        message: "usage recorded (noop)",
        key: key,
        ts: Date.now()
    }));
}

function router(r) {
    if (r.uri === '/api/hello' && r.method === 'GET') {
        return hello(r);
    }
    
    if (r.uri.startsWith('/api/usage/') && r.method === 'PUT') {
        return usage(r);
    }

    r.headersOut['Content-Type'] = 'application/json';
    r.return(404, JSON.stringify({ error: "Not Found", uri: r.uri, method: r.method }));
}

export default { router };

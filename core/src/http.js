export const readBody = async (request, limit = 1024 * 1024) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > limit) throw Object.assign(new Error('Request body too large'), { status: 413 });
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};

export const json = (response, status, payload) => {
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
    });
    response.end(JSON.stringify(payload));
};

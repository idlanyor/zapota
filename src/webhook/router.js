/**
 * @typedef {Object} RouteContext
 * @property {import('node:http').IncomingMessage} req
 * @property {Record<string, string>} query
 * @property {() => Promise<any>} body   parsed JSON body (read once, cached)
 * @property {() => any} getSocket       current WhatsApp socket or null
 * @property {string} ip
 *
 * @typedef {Object} Route
 * @property {'GET'|'POST'|'DELETE'|'PATCH'|'PUT'} method
 * @property {string} path                exact pathname
 * @property {boolean} [public]           skip allowlist/token/rate limit
 * @property {string} [ownerOnly]         feature name; requires `userId` (query for GET,
 *                                        body otherwise) to be a bot owner
 * @property {(ctx: RouteContext) => Promise<{ status: number, body: any }>} handler
 */

/** @param {Route[]} routes */
export const createRouter = (routes) => {
    const table = new Map();
    for (const route of routes) {
        const key = `${route.method} ${route.path}`;
        if (table.has(key)) throw new Error(`Duplicate webhook route: ${key}`);
        if (typeof route.handler !== 'function') throw new Error(`Route ${key} has no handler`);
        table.set(key, route);
    }
    return {
        /** @returns {Route | null} */
        match: (method, pathname) => table.get(`${method} ${pathname}`) || null,
        routes: [...table.values()],
    };
};

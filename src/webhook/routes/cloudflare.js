import * as cloudflare from '../../services/cloudflare.js';
import { reply } from '../http.js';

const ownerOnly = 'Cloudflare features';

export default [
    {
        method: 'GET',
        path: '/api/webhook/cloudflare/zones',
        ownerOnly,
        handler: async ({ query }) =>
            reply(200, { ok: true, data: await cloudflare.fetchAllZones(query.page || 1) }),
    },
    {
        method: 'GET',
        path: '/api/webhook/cloudflare/dns',
        ownerOnly,
        handler: async ({ query }) => {
            if (!query.zoneId) return reply(400, { ok: false, error: 'zoneId is required' });
            return reply(200, {
                ok: true,
                data: await cloudflare.listDnsRecords(query.zoneId, query.page || 1),
            });
        },
    },
    {
        method: 'POST',
        path: '/api/webhook/cloudflare/dns',
        ownerOnly,
        handler: async ({ body }) => {
            const { zoneId, type, name, content, proxied } = await body();
            if (!zoneId || !type || !name || !content) {
                return reply(400, { ok: false, error: 'Missing required fields' });
            }
            const data = await cloudflare.addDnsRecord(zoneId, type, name, content, !!proxied);
            return reply(200, { ok: true, data });
        },
    },
    {
        method: 'GET',
        path: '/api/webhook/cloudflare/rules',
        ownerOnly,
        handler: async ({ query }) =>
            reply(200, { ok: true, data: await cloudflare.listRules(query.mode, query.page || 1) }),
    },
    {
        method: 'POST',
        path: '/api/webhook/cloudflare/rules',
        ownerOnly,
        handler: async ({ body }) => {
            const { ip, mode, notes } = await body();
            if (!ip || !mode) return reply(400, { ok: false, error: 'ip and mode are required' });
            return reply(200, { ok: true, data: await cloudflare.createRule(ip, mode, notes) });
        },
    },
    {
        method: 'DELETE',
        path: '/api/webhook/cloudflare/rules',
        ownerOnly,
        handler: async ({ body }) => {
            const { ip } = await body();
            if (!ip) return reply(400, { ok: false, error: 'ip is required' });
            const data = await cloudflare.deleteRule(ip);
            return reply(200, { ok: !!data, data });
        },
    },
];

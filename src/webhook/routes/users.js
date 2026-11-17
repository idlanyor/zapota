import { coreRequest } from '../../services/kanataCore.js';
import { reply } from '../http.js';

const ownerOnly = 'User Management';

/** User management, delegated to Kanata Core (the data source). */
export default [
    {
        method: 'GET',
        path: '/api/webhook/users/list',
        ownerOnly,
        handler: async ({ query }) => {
            const page = parseInt(query.page) || 1;
            const limit = parseInt(query.limit) || 20;
            const search = encodeURIComponent(query.search || '');
            const core = await coreRequest(
                'GET',
                `/v1/users?page=${page}&limit=${limit}&search=${search}`
            );
            return reply(core.status || 200, core);
        },
    },
    {
        method: 'POST',
        path: '/api/webhook/users/update',
        ownerOnly,
        handler: async ({ body }) => {
            const { targetJid, balance, role, name } = await body();
            if (!targetJid) return reply(400, { ok: false, error: 'targetJid is required' });

            const fields = {};
            if (balance !== undefined) fields.balance = parseInt(balance);
            if (role) fields.role = role;
            if (name) fields.display_name = name;

            const core = await coreRequest(
                'PATCH',
                `/v1/users/${encodeURIComponent(targetJid)}`,
                fields
            );
            return reply(core.status || 200, core);
        },
    },
];

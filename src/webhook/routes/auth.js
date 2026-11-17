import { coreRequest } from '../../services/kanataCore.js';
import { userRepo } from '../../database/repos/userRepo.js';
import { reply } from '../http.js';
import { isOwner } from '../owner.js';

/** Web-client login, delegated to Kanata Core. */
export default [
    {
        method: 'POST',
        path: '/api/webhook/auth/login',
        handler: async ({ body }) => {
            const { username, password } = await body();
            if (!username || !password) {
                return reply(400, { ok: false, error: 'Username and password are required' });
            }
            const core = await coreRequest('POST', '/v1/auth/login', { username, password });
            if (!core.ok) {
                return reply(core.status || 401, {
                    ok: false,
                    error: core.error || 'Invalid credentials',
                });
            }
            const d = core.data;
            const user = await userRepo.findOne({ jid: d.userId });
            return reply(200, {
                ok: true,
                data: {
                    userId: d.userId,
                    username: d.username || username,
                    whatsappNumber: d.whatsappNumber || username,
                    isOwner: d.isOwner ?? (user ? await isOwner(user.jid) : false),
                },
            });
        },
    },
];

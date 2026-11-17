import { jadibotService } from '../../services/jadibotService.js';
import { reply } from '../http.js';

const withPhone =
    (fn) =>
    async ({ body }) => {
        const { phoneNumber } = await body();
        if (!phoneNumber) return reply(400, { ok: false, error: 'phoneNumber is required' });
        return fn(phoneNumber);
    };

export default [
    {
        method: 'POST',
        path: '/api/webhook/jadibot/start',
        handler: withPhone(async (phone) =>
            reply(200, { ok: true, data: await jadibotService.startSession(phone) })
        ),
    },
    {
        method: 'GET',
        path: '/api/webhook/jadibot/sessions',
        handler: async () => reply(200, { ok: true, data: jadibotService.listSessions() }),
    },
    {
        method: 'POST',
        path: '/api/webhook/jadibot/stop',
        handler: withPhone(async (phone) => {
            const result = await jadibotService.stopSession(phone);
            return reply(200, { ok: result.success, data: result });
        }),
    },
];

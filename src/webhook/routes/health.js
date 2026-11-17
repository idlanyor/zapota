import { reply } from '../http.js';

export default [
    {
        method: 'GET',
        path: '/health',
        public: true,
        handler: async () => reply(200, { ok: true, service: 'webhook-api' }),
    },
];

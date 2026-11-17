import { getCachedSettings, clearSettingsCache } from '../../handlers/messageFlow.js';
import { settingsRepo } from '../../database/repos/settingsRepo.js';
import { reply } from '../http.js';

const ownerOnly = 'Bot Settings';

/** Fields the web client may change. */
const UPDATEABLE = [
    'mode',
    'autoStatusRead',
    'autoAiPrivate',
    'mustJoinGroup',
    'groupInviteLink',
    'privateAiPersona',
];

export default [
    {
        method: 'GET',
        path: '/api/webhook/settings',
        ownerOnly,
        handler: async () => reply(200, { ok: true, data: await getCachedSettings() }),
    },
    {
        method: 'POST',
        path: '/api/webhook/settings/update',
        ownerOnly,
        handler: async ({ body }) => {
            const input = await body();
            const patch = Object.fromEntries(
                UPDATEABLE.filter((f) => input[f] !== undefined).map((f) => [f, input[f]])
            );
            if (Object.keys(patch).length === 0) {
                return reply(400, { ok: false, error: 'No valid fields to update' });
            }
            const updated = await settingsRepo.update(patch);
            clearSettingsCache();
            return reply(200, { ok: true, data: updated });
        },
    },
];

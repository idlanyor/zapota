import fs from 'fs';
import path from 'path';
import { settings } from '../config/settings.js';
import { createBaileysAdapter } from './baileysAdapter.js';
import { createZapoAdapter } from './zapoAdapter.js';

/**
 * Satu pintu pembuatan koneksi WhatsApp.
 * WA_TRANSPORT=baileys (default) | zapo
 */
export const createTransport = async ({ sessionId = 'default' } = {}) => {
    const transport = settings.transport === 'zapo' ? 'zapo' : 'baileys';

    if (transport === 'baileys') {
        if (sessionId !== 'default') {
            return createBaileysAdapter({
                authFolder: path.join('sessions_jadibot', sessionId),
            });
        }
        return createBaileysAdapter({ authFolder: 'auth_info_baileys' });
    }

    const dbPath =
        sessionId === 'default'
            ? settings.zapoDbPath
            : path.join(path.dirname(settings.zapoDbPath), `jadibot-${sessionId}.sqlite`);

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    return createZapoAdapter({ storePath: dbPath, sessionId });
};

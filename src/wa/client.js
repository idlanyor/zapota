import fs from 'fs';
import path from 'path';
import { settings } from '../config/settings.js';

let baileysAdapterPromise;
const getBaileysAdapter = async () => {
    baileysAdapterPromise ??= import('./baileysAdapter.js');
    const { createBaileysAdapter } = await baileysAdapterPromise;
    return createBaileysAdapter;
};

let zapoAdapterPromise;
const getZapoAdapter = async () => {
    zapoAdapterPromise ??= import('./zapoAdapter.js');
    const { createZapoAdapter } = await zapoAdapterPromise;
    return createZapoAdapter;
};

/**
 * Satu pintu pembuatan koneksi WhatsApp.
 * WA_TRANSPORT=baileys (default) | zapo
 */
export const createTransport = async ({ sessionId = 'default' } = {}) => {
    const transport = settings.transport === 'zapo' ? 'zapo' : 'baileys';

    if (transport === 'baileys') {
        const createBaileysAdapter = await getBaileysAdapter();
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

    const createZapoAdapter = await getZapoAdapter();
    return createZapoAdapter({ storePath: dbPath, sessionId });
};

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

/** zapo credential store of a sub-bot session (next to the main one). */
export const subBotStorePath = (sessionId) =>
    path.join(path.dirname(settings.zapoDbPath), `jadibot-${sessionId}.sqlite`);

/** Baileys auth folder of a sub-bot session. */
export const subBotAuthFolder = (sessionId) => path.join('sessions_jadibot', sessionId);

/**
 * Satu pintu pembuatan koneksi WhatsApp.
 * WA_TRANSPORT=baileys (default) | zapo
 *
 * `pairingNumber` (sub-bot sessions, zapo): log in with a pairing code for
 * that number instead of a QR. The main session uses BOT_PHONE_NUMBER.
 * Baileys sockets request their code themselves (`requestPairingCode`).
 */
export const createTransport = async ({ sessionId = 'default', pairingNumber } = {}) => {
    const transport = settings.transport === 'zapo' ? 'zapo' : 'baileys';

    if (transport === 'baileys') {
        const createBaileysAdapter = await getBaileysAdapter();
        if (sessionId !== 'default') {
            return createBaileysAdapter({
                authFolder: subBotAuthFolder(sessionId),
            });
        }
        return createBaileysAdapter({ authFolder: 'auth_info_baileys' });
    }

    const dbPath = sessionId === 'default' ? settings.zapoDbPath : subBotStorePath(sessionId);

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const createZapoAdapter = await getZapoAdapter();
    return createZapoAdapter({
        storePath: dbPath,
        sessionId,
        pairingNumber: sessionId === 'default' ? settings.pairingNumber : pairingNumber,
    });
};

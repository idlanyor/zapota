import {
    Browsers,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    makeWASocket,
    useMultiFileAuthState,
} from 'baileys';
import NodeCache from 'node-cache';
import pino from 'pino';
import { attachGroupMetadataPatch } from '../lib/groupMetadataPatch.js';
import { attachGroupStatusCompat } from '../lib/groupStatusCompat.js';
import { attachListMessageCompat } from '../lib/listMessageCompat.js';
import { patchInteractiveMessageForMd } from '../lib/appSetup.js';
import { sanitizeAuthFolder, wrapSignalKeyStoreWithSanitizer } from '../lib/authStateSanitizer.js';

const msgRetryCounterCache = new NodeCache();

export const createBaileysAdapter = async ({ authFolder = 'auth_info_baileys' } = {}) => {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    await sanitizeAuthFolder(authFolder);
    state.keys = wrapSignalKeyStoreWithSanitizer(state.keys, authFolder);
    const { version } = await fetchLatestBaileysVersion();
    const baileysLogger = pino({ level: 'warn' });

    const sock = makeWASocket({
        version,
        logger: baileysLogger,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
        },
        browser: Browsers.macOS('safari'),
        msgRetryCounterCache,
        markOnline: true,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        patchMessageBeforeSending: patchInteractiveMessageForMd,
    });

    attachGroupStatusCompat(sock);
    attachListMessageCompat(sock);
    attachGroupMetadataPatch(sock);

    return { client: sock, saveCreds, authFolder, transport: 'baileys' };
};

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { messageHandler } from '../handlers/messageHandler.js';
import { createTransport } from '../wa/client.js';
import { disconnectReason as DisconnectReason } from '../wa/reasons.js';

class JadibotService {
    constructor() {
        this.sessions = new Map(); // stores { sock, status, pairingCode, phoneNumber }
        this.baseAuthPath = 'sessions_jadibot';
        this.io = null;
        fs.mkdirSync(this.baseAuthPath, { recursive: true });
    }

    setIo(io) {
        this.io = io;
    }

    emitUpdate(phoneNumber, update) {
        if (this.io) {
            this.io.emit('jadibot:update', { phoneNumber, ...update });
        }
    }

    async startSession(phoneNumber) {
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        const authPath = path.join(this.baseAuthPath, cleanNumber);
        const sessionId = process.env.WA_TRANSPORT === 'zapo' ? `jadibot:${cleanNumber}` : cleanNumber;
        const oldSession = this.sessions.get(cleanNumber);

        if (oldSession?.sock && oldSession.status !== 'open') {
            oldSession.reconnect = false;
            this.closeClient(oldSession.sock);
        }

        // Marker preserves session discovery for transports whose credentials live elsewhere.
        fs.mkdirSync(authPath, { recursive: true });
        const adapter = await createTransport({ sessionId, authFolder: authPath });
        const sock = adapter.client;
        const sessionData = {
            sock,
            transport: adapter.transport,
            status: 'connecting',
            phoneNumber: cleanNumber,
            qr: null,
            pairingCode: null,
            registered: Boolean(sock?.authState?.creds?.registered),
            reconnect: true,
        };
        this.sessions.set(cleanNumber, sessionData);

        const isCurrent = () => this.sessions.get(cleanNumber) === sessionData;
        const setConnection = (connection) => {
            if (!connection || !isCurrent()) return;
            sessionData.status = connection;
            this.emitUpdate(cleanNumber, { status: connection });
        };
        const setQr = (qr) => {
            if (!qr || !isCurrent()) return;
            sessionData.qr = qr;
            this.emitUpdate(cleanNumber, { qr });
        };
        const setPairingCode = (pairingCode) => {
            if (!pairingCode || !isCurrent()) return;
            sessionData.pairingCode = pairingCode;
            this.emitUpdate(cleanNumber, { pairingCode });
        };
        const onOpen = () => {
            if (!isCurrent()) return;
            setConnection('open');
            logger.info(`Jadibot session opened: ${cleanNumber}`, 'JADIBOT');
            sessionData.registered = true;
            sessionData.qr = null;
            sessionData.pairingCode = null;
            this.emitUpdate(cleanNumber, { qr: null, pairingCode: null });
        };
        const onClose = ({ statusCode, isLogout = false } = {}) => {
            if (!isCurrent()) return;
            setConnection('close');
            const loggedOut = isLogout || statusCode === DisconnectReason.loggedOut;

            logger.warn(
                `Jadibot session closed: ${cleanNumber}. Status: ${statusCode ?? 'unknown'}`,
                'JADIBOT'
            );

            if (loggedOut) {
                logger.error(`Jadibot logged out: ${cleanNumber}. Purging session...`, 'JADIBOT');
                sessionData.reconnect = false;
                this.sessions.delete(cleanNumber);
                this.emitUpdate(cleanNumber, { status: 'removed' });
                setTimeout(() => fs.rmSync(authPath, { recursive: true, force: true }), 2000);
            } else if (sessionData.reconnect) {
                logger.info(`Reconnecting Jadibot: ${cleanNumber}...`, 'JADIBOT');
                setTimeout(() => {
                    if (isCurrent() && sessionData.reconnect) {
                        this.startSession(cleanNumber).catch((err) =>
                            logger.error(err, 'Error reconnecting jadibot')
                        );
                    }
                }, 5000);
            }
        };
        const onMessage = async (chatUpdate) => {
            try {
                const message = chatUpdate?.messages?.[0] ?? chatUpdate;
                if (!message?.message) return;
                await messageHandler(sock, message);
            } catch (err) {
                logger.error(err, 'Error in jadibot message handler');
            }
        };

        if (sock.ev?.on) {
            if (adapter.saveCreds) sock.ev.on('creds.update', adapter.saveCreds);
            sock.ev.on('connection.update', ({ connection, lastDisconnect, qr, pairingCode }) => {
                if (qr) setQr(qr);
                if (pairingCode) setPairingCode(pairingCode);
                if (connection === 'open') onOpen();
                else if (connection === 'close') {
                    onClose({ statusCode: lastDisconnect?.error?.output?.statusCode });
                } else {
                    setConnection(connection);
                }
            });
            sock.ev.on('messages.upsert', onMessage);
        } else if (sock.on) {
            sock.on('auth_qr', ({ qr }) => setQr(qr));
            sock.on('auth_pairing_code', ({ code }) => setPairingCode(code));
            sock.on('auth_paired', () => {
                sessionData.registered = true;
            });
            sock.on('connection', (event) => {
                if (event.status === 'open') onOpen();
                else onClose({ statusCode: event.reason, isLogout: event.isLogout });
            });
            sock.on('message', onMessage);
        }

        if (adapter.transport === 'zapo' && typeof sock.connect === 'function') {
            await sock.connect();
        }

        return { success: true, phoneNumber: cleanNumber };
    }

    closeClient(client) {
        try {
            const result = client.disconnect?.() ?? client.end?.();
            if (result?.catch) result.catch(() => {});
        } catch {}
    }

    async stopSession(phoneNumber) {
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        const session = this.sessions.get(cleanNumber);
        const authPath = path.join(this.baseAuthPath, cleanNumber);

        logger.info(`Stopping jadibot session: ${cleanNumber}`, 'JADIBOT');

        if (session) {
            session.reconnect = false;
            try {
                await session.sock.logout?.();
            } catch {}
            this.closeClient(session.sock);
            this.sessions.delete(cleanNumber);
        }

        try {
            fs.rmSync(authPath, { recursive: true, force: true });
        } catch (err) {
            logger.error(
                `Error removing auth path for ${cleanNumber}: ${err.message}`,
                'JADIBOT'
            );
        }

        this.emitUpdate(cleanNumber, { status: 'removed' });
        return { success: true };
    }

    listSessions() {
        return Array.from(this.sessions.values()).map((s) => ({
            phoneNumber: s.phoneNumber,
            status: s.status,
            qr: s.qr,
            pairingCode: s.pairingCode,
            registered: s.registered || s.sock?.authState?.creds?.registered || false,
        }));
    }

    async init() {
        if (!fs.existsSync(this.baseAuthPath)) return;
        const folders = fs.readdirSync(this.baseAuthPath);
        for (const folder of folders) {
            const fullPath = path.join(this.baseAuthPath, folder);
            if (fs.statSync(fullPath).isDirectory()) {
                logger.info(`Resuming jadibot session: ${folder}`, 'JADIBOT');
                this.startSession(folder).catch((err) =>
                    logger.error(err, 'Error resuming jadibot session')
                );
            }
        }
    }
}

export const jadibotService = new JadibotService();

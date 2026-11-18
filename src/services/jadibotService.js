import fs from 'fs';
import logger from '../utils/logger.js';
import { messageHandler } from '../handlers/messageHandler.js';
import { createTransport, subBotAuthFolder, subBotStorePath } from '../wa/client.js';
import { disconnectReason as DisconnectReason } from '../wa/reasons.js';
import { settings } from '../config/settings.js';
import { jadibotRepo } from '../database/repos/jadibotRepo.js';
import { getBotProfile, mainSocket, registerSubBot } from '../lib/botProfile.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Product rules for sub-bots (jadibot). */
export const JADIBOT = Object.freeze({
    PRICE: 15_000,
    PREMIUM_DAYS: 30,
    /** Unpaired sessions are cancelled after this long. */
    PAIRING_TIMEOUT_MS: 3 * MINUTE,
    /** How long `.jadibot` waits for WhatsApp to hand out a pairing code. */
    CODE_WAIT_MS: 45_000,
    /** Free sub-bots with no activity this long are stopped. */
    IDLE_MS: 7 * DAY,
    /** Premium owners are reminded this long before their period ends. */
    REMINDER_MS: 3 * DAY,
    /** Activity is written to the DB at most this often per sub-bot. */
    ACTIVITY_WRITE_MS: HOUR,
    MAINTENANCE_EVERY_MS: HOUR,
});

export const normalizeNumber = (value) => String(value ?? '').replace(/\D/g, '');

const formatDate = (date) =>
    date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

const rmQuiet = (target) => {
    try {
        fs.rmSync(target, { recursive: true, force: true });
    } catch (err) {
        logger.error(`Jadibot cleanup failed for ${target}: ${err.message}`, 'JADIBOT');
    }
};

/** Every file a sub-bot session leaves on disk, for both transports. */
const sessionFiles = (number) => {
    const store = subBotStorePath(number);
    return [subBotAuthFolder(number), store, `${store}-wal`, `${store}-shm`];
};

export class JadibotService {
    /**
     * @param {object} [deps] overridable for tests
     */
    constructor({
        transportFactory = createTransport,
        repo = jadibotRepo,
        handleMessage = messageHandler,
        getMainSocket = mainSocket,
        removeSessionFiles = (number) => sessionFiles(number).forEach(rmQuiet),
        now = () => Date.now(),
        maxFree = () => settings.jadibotMax,
        reconnectDelayMs = 5000,
    } = {}) {
        /** @type {Map<string, object>} live sessions by number */
        this.sessions = new Map();
        this.io = null;
        this.deps = {
            transportFactory,
            repo,
            handleMessage,
            getMainSocket,
            removeSessionFiles,
            now,
            maxFree,
            reconnectDelayMs,
        };
        this.maintenanceTimer = null;
        /** Numbers with a `.jadibot` request waiting for its code. */
        this.pairingInProgress = new Set();
    }

    setIo(io) {
        this.io = io;
    }

    emitUpdate(phoneNumber, update) {
        this.io?.emit('jadibot:update', { phoneNumber, ...update });
    }

    /** Message the sub-bot's owner through the main bot (best effort). */
    async notify(jid, text) {
        if (!jid) return;
        const sock = this.deps.getMainSocket();
        if (!sock) return;
        try {
            await sock.sendMessage(jid, { text });
        } catch (err) {
            logger.warn(`Jadibot notify ${jid} failed: ${err.message}`, 'JADIBOT');
        }
    }

    isRunning(number) {
        return this.sessions.get(normalizeNumber(number))?.status === 'open';
    }

    /* ------------------------------ pairing ------------------------------ */

    /**
     * `.jadibot`: start a session for `number` and wait for its pairing code.
     *
     * @param {{ number: string, ownerJid: string }} req
     * @returns {Promise<{ ok: true, code: string } |
     *   { ok: false, reason: 'running' | 'busy' | 'full' | 'no_code', max?: number }>}
     */
    async requestPairing({ number, ownerJid }) {
        const clean = normalizeNumber(number);
        if (this.isRunning(clean)) return { ok: false, reason: 'running' };
        if (this.pairingInProgress.has(clean)) return { ok: false, reason: 'busy' };
        this.pairingInProgress.add(clean);
        try {
            return await this.startPairing(clean, ownerJid);
        } finally {
            this.pairingInProgress.delete(clean);
        }
    }

    async startPairing(clean, ownerJid) {
        const { repo } = this.deps;

        const existing = await repo.findByNumber(clean);
        const isPremium = existing?.tier === 'premium';
        if (!isPremium) {
            const used = await repo.countFreeSlotsUsed();
            const ownSlot = existing && ['pending', 'active'].includes(existing.status) ? 1 : 0;
            const max = this.deps.maxFree();
            if (used - ownSlot >= max) return { ok: false, reason: 'full', max };
        }

        await repo.upsert({ number: clean }, { ownerJid, status: 'pending' });

        // Start from a clean slate: a half-finished earlier pairing must not linger.
        await this.closeSession(clean);
        this.deps.removeSessionFiles(clean);

        const session = await this.startSession(clean, { pairing: true, tier: existing?.tier });
        session.pairingTimer = setTimeout(
            () => this.cancelPairing(clean, session),
            JADIBOT.PAIRING_TIMEOUT_MS
        );
        session.pairingTimer.unref?.();

        try {
            const code = await session.codePromise;
            return { ok: true, code };
        } catch {
            await this.cancelPairing(clean, session, { notify: false });
            return { ok: false, reason: 'no_code' };
        }
    }

    /** Pairing window ran out (or no code came): drop the session and its files. */
    async cancelPairing(number, session, { notify = true } = {}) {
        if (this.sessions.get(number) !== session || session.status === 'open') return;
        logger.info(`Jadibot pairing expired: ${number}`, 'JADIBOT');
        await this.closeSession(number);
        this.deps.removeSessionFiles(number);
        const row = await this.deps.repo.findByNumber(number);
        if (row?.status === 'pending') {
            await this.deps.repo.update({ number }, { status: 'stopped' });
        }
        this.emitUpdate(number, { status: 'removed' });
        if (notify) {
            await this.notify(
                row?.ownerJid,
                '⌛ Waktu pairing Jadibot habis. Ketik *.jadibot* lagi untuk kode baru.'
            );
        }
    }

    /* ------------------------------ sessions ----------------------------- */

    /**
     * Connect a sub-bot session. Also used by the dashboard API and for
     * resuming at startup.
     *
     * @param {string} phoneNumber
     * @param {{ pairing?: boolean, tier?: 'free'|'premium' }} [opts]
     */
    async startSession(phoneNumber, { pairing = false, tier } = {}) {
        const number = normalizeNumber(phoneNumber);
        const { repo } = this.deps;
        const row = await repo.findByNumber(number);
        if (!row) await repo.create({ number, status: 'pending' });
        const effectiveTier = tier ?? row?.tier ?? 'free';

        const adapter = await this.deps.transportFactory({
            sessionId: number,
            pairingNumber: pairing ? number : undefined,
        });
        const sock = adapter.client;

        let resolveCode;
        let rejectCode;
        const codePromise = new Promise((resolve, reject) => {
            resolveCode = resolve;
            rejectCode = reject;
        });
        codePromise.catch(() => {});
        const codeTimer = pairing
            ? setTimeout(() => rejectCode(new Error('no pairing code')), JADIBOT.CODE_WAIT_MS)
            : null;
        codeTimer?.unref?.();

        const session = {
            sock,
            transport: adapter.transport,
            status: 'connecting',
            phoneNumber: number,
            qr: null,
            pairingCode: null,
            registered: Boolean(sock?.authState?.creds?.registered),
            reconnect: true,
            pairing,
            codePromise,
            pairingTimer: null,
            lastActivityWrite: 0,
        };
        this.sessions.set(number, session);

        registerSubBot(sock, {
            number,
            tier: effectiveTier,
            onActivity: () => this.recordActivity(number),
        });

        const isCurrent = () => this.sessions.get(number) === session;
        const setStatus = (status) => {
            if (!status || !isCurrent()) return;
            session.status = status;
            this.emitUpdate(number, { status });
        };
        let baileysCodeRequested = false;
        const onQr = async (qr) => {
            if (!qr || !isCurrent()) return;
            session.qr = qr;
            this.emitUpdate(number, { qr });
            // Baileys has no pairing option at creation; ask once the socket is up.
            if (pairing && adapter.transport === 'baileys' && !baileysCodeRequested) {
                baileysCodeRequested = true;
                try {
                    onPairingCode(await sock.requestPairingCode(number));
                } catch (err) {
                    rejectCode(err);
                }
            }
        };
        const onPairingCode = (code) => {
            if (!code || !isCurrent()) return;
            session.pairingCode = code;
            clearTimeout(codeTimer);
            resolveCode(code);
            this.emitUpdate(number, { pairingCode: code });
        };
        const onOpen = async () => {
            if (!isCurrent()) return;
            const firstOpen = session.pairing && !session.registered;
            setStatus('open');
            session.registered = true;
            session.qr = null;
            session.pairingCode = null;
            clearTimeout(session.pairingTimer);
            clearTimeout(codeTimer);
            this.emitUpdate(number, { qr: null, pairingCode: null });
            logger.info(`Jadibot session opened: ${number}`, 'JADIBOT');

            const now = this.deps.now();
            const updated = await repo
                .updateOne({ number }, { status: 'active', lastActiveAt: now })
                .catch((err) => logger.error(err, 'Jadibot: failed to mark active'));
            if (firstOpen) await this.notify(updated?.ownerJid, connectedMessage(updated));
        };
        const onClose = async ({ statusCode, isLogout = false } = {}) => {
            if (!isCurrent()) return;
            setStatus('close');
            const loggedOut = isLogout || statusCode === DisconnectReason.loggedOut;
            logger.warn(
                `Jadibot session closed: ${number}. Status: ${statusCode ?? 'unknown'}`,
                'JADIBOT'
            );

            if (loggedOut && session.registered) {
                logger.error(`Jadibot logged out: ${number}. Purging session...`, 'JADIBOT');
                session.reconnect = false;
                this.sessions.delete(number);
                this.emitUpdate(number, { status: 'removed' });
                this.deps.removeSessionFiles(number);
                const stopped = await repo.updateOne({ number }, { status: 'stopped' });
                await this.notify(
                    stopped?.ownerJid,
                    '🔌 Jadibot kamu ter-logout dari WhatsApp dan sudah dihentikan.\nKetik *.jadibot* untuk menyambungkan lagi.'
                );
                return;
            }
            // zapo reconnects its own client; a Baileys socket is dead once closed.
            if (session.reconnect && adapter.transport === 'baileys') {
                setTimeout(() => {
                    if (isCurrent() && session.reconnect) {
                        this.startSession(number, {
                            pairing: session.pairing && !session.registered,
                        }).catch((err) => logger.error(err, 'Error reconnecting jadibot'));
                    }
                }, this.deps.reconnectDelayMs);
            }
        };
        const onMessage = async (chatUpdate) => {
            try {
                const message = chatUpdate?.messages?.[0] ?? chatUpdate;
                if (!message?.message) return;
                await this.deps.handleMessage(sock, message);
            } catch (err) {
                logger.error(err, 'Error in jadibot message handler');
            }
        };

        if (sock.ev?.on) {
            if (adapter.saveCreds) sock.ev.on('creds.update', adapter.saveCreds);
            sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr, pairingCode, pairingError } = update;
                if (qr) onQr(qr);
                if (pairingCode) onPairingCode(pairingCode);
                if (pairingError) rejectCode(pairingError);
                if (connection === 'open') onOpen();
                else if (connection === 'close') {
                    onClose({ statusCode: lastDisconnect?.error?.output?.statusCode });
                } else if (connection) {
                    setStatus(connection);
                }
            });
            sock.ev.on('messages.upsert', onMessage);
        }

        if (typeof adapter.connect === 'function') {
            await adapter.connect();
        }
        return session;
    }

    /** Disconnect a live session without logging out or touching its files. */
    async closeSession(number) {
        const session = this.sessions.get(number);
        if (!session) return;
        session.reconnect = false;
        clearTimeout(session.pairingTimer);
        this.sessions.delete(number);
        try {
            const result = session.sock.end?.() ?? session.sock.disconnect?.();
            if (result?.catch) result.catch(() => {});
        } catch {
            // Already closed: nothing left to do.
        }
    }

    /**
     * Stop a sub-bot for good: log out the linked device, delete its
     * credentials and mark it stopped (premium time is kept).
     */
    async stopSession(phoneNumber) {
        const number = normalizeNumber(phoneNumber);
        const session = this.sessions.get(number);
        logger.info(`Stopping jadibot session: ${number}`, 'JADIBOT');

        if (session) {
            session.reconnect = false;
            try {
                await session.sock.logout?.();
            } catch (err) {
                // Offline or already unlinked: the files are deleted below anyway.
                logger.warn(`Jadibot logout ${number} failed: ${err.message}`, 'JADIBOT');
            }
        }
        await this.closeSession(number);
        this.deps.removeSessionFiles(number);
        await this.deps.repo.update({ number }, { status: 'stopped' });
        this.emitUpdate(number, { status: 'removed' });
        return { success: true };
    }

    /* ------------------------------- premium ------------------------------ */

    /**
     * `.jadibot premium`: pay from the wallet and extend premium by 30 days.
     * @returns {ReturnType<typeof jadibotRepo.purchasePremium>}
     */
    async upgradePremium({ number, payerJid }) {
        const clean = normalizeNumber(number);
        const result = await this.deps.repo.purchasePremium({
            number: clean,
            payerJid,
            price: JADIBOT.PRICE,
            days: JADIBOT.PREMIUM_DAYS,
            now: this.deps.now(),
        });
        if (result.ok) this.setLiveTier(clean, 'premium');
        return result;
    }

    setLiveTier(number, tier) {
        const session = this.sessions.get(number);
        if (!session) return;
        const profile = getBotProfile(session.sock);
        if (profile.kind === 'sub') profile.tier = tier;
    }

    /* ---------------------------- housekeeping ---------------------------- */

    /** Called by the pipeline on each handled message; persisted at most hourly. */
    recordActivity(number) {
        const session = this.sessions.get(number);
        if (!session) return;
        const now = this.deps.now();
        if (now - session.lastActivityWrite < JADIBOT.ACTIVITY_WRITE_MS) return;
        session.lastActivityWrite = now;
        this.deps.repo
            .update({ number }, { lastActiveAt: now })
            .catch((err) => logger.warn(`Jadibot activity write failed: ${err.message}`));
    }

    /** Hourly: premium reminders and expiry, idle free sub-bots. */
    async runMaintenance() {
        const { repo } = this.deps;
        const now = this.deps.now();

        for (const bot of await repo.findPremiumDueForReminder(JADIBOT.REMINDER_MS, now)) {
            await repo.update({ number: bot.number }, { reminderSentAt: now });
            await this.notify(
                bot.ownerJid,
                `⏰ Jadibot Premium kamu berakhir *${formatDate(bot.premiumUntil)}*.\n` +
                    `Perpanjang lewat bot utama: *.jadibot premium* (Rp${JADIBOT.PRICE.toLocaleString('id-ID')}/${JADIBOT.PREMIUM_DAYS} hari).`
            );
        }

        for (const bot of await repo.findExpiredPremium(now)) {
            // Restart the idle clock so a just-downgraded bot is not stopped right away.
            await repo.update(
                { number: bot.number },
                { tier: 'free', reminderSentAt: null, lastActiveAt: now }
            );
            this.setLiveTier(bot.number, 'free');
            await this.notify(
                bot.ownerJid,
                bot.status === 'active'
                    ? '📉 Masa Jadibot Premium kamu sudah habis. Jadibot tetap jalan sebagai *Free* ' +
                          '(hanya merespon kamu sendiri di chat pribadi).\nPerpanjang: *.jadibot premium*'
                    : '📉 Masa Jadibot Premium kamu sudah habis.\nPerpanjang: *.jadibot premium*'
            );
        }

        for (const bot of await repo.findIdleFree(now - JADIBOT.IDLE_MS)) {
            await this.stopSession(bot.number);
            await this.notify(
                bot.ownerJid,
                '💤 Jadibot Free kamu dimatikan karena tidak dipakai selama 7 hari.\nKetik *.jadibot* untuk menyalakannya lagi.'
            );
        }
    }

    /** Stored record of one sub-bot plus whether it is connected right now. */
    async describe(number) {
        const clean = normalizeNumber(number);
        const row = await this.deps.repo.findByNumber(clean);
        if (!row) return null;
        return { ...row, live: this.sessions.get(clean)?.status ?? 'offline' };
    }

    /** Every sub-bot that is pending or active, with live status (owner view). */
    async listAll() {
        const rows = await this.deps.repo.find({}, { orderBy: 'createdAt' });
        return rows
            .filter((r) => r.status !== 'stopped' || this.sessions.has(r.number))
            .map((r) => ({ ...r, live: this.sessions.get(r.number)?.status ?? 'offline' }));
    }

    /** Make sure a record exists so premium can be bought before pairing. */
    async ensureRecord(number, ownerJid) {
        const clean = normalizeNumber(number);
        return (
            (await this.deps.repo.findByNumber(clean)) ??
            this.deps.repo.create({ number: clean, ownerJid, status: 'stopped' })
        );
    }

    listSessions() {
        return Array.from(this.sessions.values()).map((s) => ({
            phoneNumber: s.phoneNumber,
            status: s.status,
            tier: getBotProfile(s.sock).tier ?? 'free',
            qr: s.qr,
            pairingCode: s.pairingCode,
            registered: s.registered || s.sock?.authState?.creds?.registered || false,
        }));
    }

    /** Resume active sub-bots and start the hourly housekeeping. */
    async init() {
        const rows = await this.deps.repo.findActive();
        for (const row of rows) {
            logger.info(`Resuming jadibot session: ${row.number}`, 'JADIBOT');
            this.startSession(row.number).catch((err) =>
                logger.error(err, 'Error resuming jadibot session')
            );
        }
        if (!this.maintenanceTimer) {
            this.maintenanceTimer = setInterval(
                () =>
                    this.runMaintenance().catch((err) =>
                        logger.error(err, 'Jadibot maintenance failed')
                    ),
                JADIBOT.MAINTENANCE_EVERY_MS
            );
            this.maintenanceTimer.unref?.();
        }
    }
}

const connectedMessage = (bot) => {
    const premium = bot?.tier === 'premium';
    return (
        '✅ *Jadibot tersambung!*\n\n' +
        `Paket: *${premium ? 'Premium' : 'Free'}*\n` +
        (premium
            ? `Aktif sampai: ${formatDate(bot.premiumUntil)}\n` +
              'Bot kamu merespon semua orang, di chat pribadi dan grup.\n'
            : 'Bot kamu hanya merespon *kamu sendiri* di chat pribadi.\n' +
              `Upgrade ke Premium (Rp${JADIBOT.PRICE.toLocaleString('id-ID')}/${JADIBOT.PREMIUM_DAYS} hari) ` +
              'agar bisa dipakai semua orang + fitur grup: *.jadibot premium*\n') +
        '\nCoba ketik *.menu* dari WhatsApp kamu.\n' +
        'Jadibot Free mati otomatis kalau tidak dipakai 7 hari.\n' +
        'Hentikan kapan saja: *.stopjadibot*'
    );
};

export const jadibotService = new JadibotService();

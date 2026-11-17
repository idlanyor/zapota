import { disconnectReason as DisconnectReason } from '../wa/reasons.js';
import cron from 'node-cron';
import { messageHandler, clearSettingsCache } from '../handlers/messageHandler.js';
import { groupParticipantsUpdate, handleMessagesUpdate } from '../handlers/groupHandler.js';
import logger from '../utils/logger.js';
import { settings } from '../config/settings.js';
import { serverRepo } from '../database/repos/serverRepo.js';
import { groupRepo } from '../database/repos/groupRepo.js';
import { botSocket } from './socket.js';
import { cleanupCaches } from '../handlers/messageFlow.js';
import { pollRepo } from '../database/repos/pollRepo.js';

import { env } from '../config/env.js';
const safeAck = (ack, payload) => {
    if (typeof ack === 'function') ack(payload);
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isAlreadyLeftError = (message) =>
    /not\s+a?\s*participant|not\s*found|404|bad request|forbidden|group.*not.*found/i.test(message);

const runGroupSync = async (sock, data, ack) => {
    try {
        const targetJid = data.jid;
        if (targetJid) {
            const meta = await sock.groupMetadata(targetJid);
            await groupRepo.upsert(
                { jid: targetJid },
                { name: meta.subject, announce: !!meta.announce, restrict: !!meta.restrict }
            );
            botSocket.emitLog('Synced: ' + meta.subject, 'success');
            safeAck(ack, { ok: true });
            return;
        }

        logger.info('Starting Smart Group Sync...');
        const groups = await sock.groupFetchAllParticipating();
        let count = 0;

        for (const jid in groups) {
            const dbGroup = await groupRepo.findOne({ jid });
            if (dbGroup && dbGroup.name) continue;

            await delay(5000);
            try {
                const meta = await sock.groupMetadata(jid);
                await groupRepo.upsert(
                    { jid },
                    { name: meta.subject, announce: !!meta.announce, restrict: !!meta.restrict }
                );
                count++;
                logger.info('Resolved: ' + meta.subject);
            } catch (e) {
                logger.warn('Fail: ' + jid);
                if (e.message.includes('rate')) break;
            }
        }

        botSocket.emitLog('Smart Sync complete. Updated ' + count + ' groups', 'success');
        safeAck(ack, { ok: true, updated: count });
    } catch (err) {
        logger.error(err);
        safeAck(ack, { ok: false, error: err.message });
    }
};

const runGroupDelete = async (sock, data, ack) => {
    const targetJid = data.jid;
    if (!targetJid) {
        safeAck(ack, { ok: false, error: 'Group JID is required' });
        return;
    }

    try {
        await sock.groupLeave(targetJid);
        botSocket.emitLog(`Left group: ${data.groupName || targetJid}`, 'success');
        safeAck(ack, { ok: true, alreadyLeft: false });
    } catch (err) {
        const message = String(err?.message || err || '');
        if (isAlreadyLeftError(message)) {
            botSocket.emitLog(
                `Group leave skipped (already left): ${data.groupName || targetJid}`,
                'warning'
            );
            safeAck(ack, { ok: true, alreadyLeft: true });
            return;
        }
        logger.error(err);
        safeAck(ack, { ok: false, error: err.message || 'Failed to leave group' });
    }
};

const registerBotSocketCommands = (sock) => {
    if (!botSocket.socket) return;
    botSocket.socket.off('bot:command').on('bot:command', async (data, ack) => {
        if (data.command === 'group:sync') {
            await runGroupSync(sock, data, ack);
            return;
        }

        if (data.command === 'group:delete') {
            await runGroupDelete(sock, data, ack);
        }
    });
};

export const registerSocketEvents = ({
    sock,
    saveCreds,
    connectToWhatsApp,
    authFolder,
    onOpen,
    onLoggedOut,
}) => {
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr, pairingCode, pairingError } = update;

        if (pairingError) logger.error(`Failed to request pairing code: ${pairingError.message}`);

        if (pairingCode) {
            const formatted = pairingCode.match(/.{1,4}/g).join('-');
            logger.event({
                scope: 'WA',
                action: 'Pairing code',
                details: `${formatted} → WhatsApp > Perangkat tertaut > Tautkan dengan nomor telepon`,
                level: 'success',
            });
            logger.info(`PAIRING CODE: ${formatted}`);
        }

        // zapo + BOT_PHONE_NUMBER logs in by pairing code; Baileys still uses QR.
        if (qr && !(settings.pairingNumber && settings.transport === 'zapo')) {
            import('qrcode-terminal').then(({ default: qrcode }) => {
                qrcode.generate(qr, { small: true });
            });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect.error?.output?.statusCode;
            logger.event({
                scope: 'WA',
                action: 'Connection closed',
                details: `statusCode=${statusCode ?? 'unknown'}`,
                level: 'warn',
            });
            logger.warn(`WhatsApp connection closed. statusCode=${statusCode ?? 'unknown'}`);
            if (statusCode === DisconnectReason.loggedOut) {
                logger.error('WhatsApp session logged out (401).');
                // Restarting with the same dead credentials would just loop on 401.
                if (typeof onLoggedOut === 'function') {
                    Promise.resolve(onLoggedOut()).catch((err) =>
                        logger.error(`Re-login after logout failed: ${err.message}`)
                    );
                } else {
                    process.exit(1);
                }
                return;
            }

            if (statusCode === DisconnectReason.connectionReplaced) {
                logger.error(
                    'WhatsApp session was replaced by another connection. Stopping auto-reconnect to avoid a 440 loop.'
                );
                return;
            }

            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                if (
                    statusCode === DisconnectReason.restartRequired ||
                    statusCode === DisconnectReason.connectionLost ||
                    statusCode === 405
                ) {
                    setTimeout(() => connectToWhatsApp(), 5000);
                } else {
                    connectToWhatsApp();
                }
            }
        } else if (connection === 'open') {
            logger.event({
                scope: 'WA',
                action: 'Connection opened',
                level: 'success',
            });
            logger.info(' Opened connection to WhatsApp');
            if (typeof onOpen === 'function') onOpen();
        }
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type === 'notify' && Array.isArray(messages) && messages.length > 0) {
            await Promise.allSettled(messages.map((m) => messageHandler(sock, m)));
        }
    });

    sock.ev.on('group-participants.update', async (data) => {
        await groupParticipantsUpdate(sock, data);
    });

    sock.ev.on('messages.update', async (events) => {
        await handleMessagesUpdate(sock, events);
    });

    registerBotSocketCommands(sock);
};

const scheduleBackup = (sock) => {
    cron.schedule(
        '0 0 * * *',
        async () => {
            logger.info('Running automated database backup...');
            const { sendBackupToOwner } = await import('./backup.js');
            await sendBackupToOwner(sock);
        },
        { scheduled: true, timezone: 'Asia/Jakarta' }
    );
};

const scheduleAutoSuspend = (sock) => {
    cron.schedule(
        '0 * * * *',
        async () => {
            try {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                const expiredServers = await serverRepo.findExpiredBefore(sevenDaysAgo, {
                    status: 'active',
                });
                if (expiredServers.length === 0) return;
                const { pteroApp: ptero } = await import('../services/pterodactyl.js');

                for (const srv of expiredServers) {
                    try {
                        await ptero.post(`/servers/${srv.pteroId}/suspend`);
                        srv.status = 'suspended';
                        await serverRepo.save(srv);
                        await sock.sendMessage(srv.userId, {
                            text: `*LAYANAN DI-SUSPEND*\n\nServer Anda *${srv.planName}* (ID: ${srv.identifier}) telah ditangguhkan karena melewati jatuh tempo lebih dari 7 hari.\nSilakan perpanjang untuk mengaktifkan kembali.`,
                        });
                    } catch (err) {
                        logger.error(
                            `[SYSTEM] Failed to suspend server ${srv.pteroId}: ${err.message}`
                        );
                    }
                }
            } catch (err) {
                logger.error('[SYSTEM] Error in auto-suspend task:', err);
            }
        },
        { scheduled: true, timezone: 'Asia/Jakarta' }
    );
};

const scheduleExpiryReminder = (sock) => {
    cron.schedule(
        '0 8 * * *',
        async () => {
            try {
                const fiveDaysLater = new Date();
                fiveDaysLater.setDate(fiveDaysLater.getDate() + 5);
                const startOf5Days = new Date(fiveDaysLater.setHours(0, 0, 0, 0));
                const endOf5Days = new Date(fiveDaysLater.setHours(23, 59, 59, 999));

                const expiringServers = await serverRepo.findExpiringBetween(
                    startOf5Days,
                    endOf5Days,
                    {
                        status: 'active',
                    }
                );

                for (const srv of expiringServers) {
                    await sock.sendMessage(srv.userId, {
                        text: `*REMINDER MASA AKTIF*\n\nServer Anda *${srv.planName}* (ID: ${srv.identifier}) akan expired dalam *5 hari* lagi (${srv.expiredAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}).\n\nSegera lakukan perpanjangan agar layanan tidak terputus.`,
                    });
                }
            } catch (err) {
                logger.error('[SYSTEM] Error in reminder task:', err);
            }
        },
        { scheduled: true, timezone: 'Asia/Jakarta' }
    );
};

/**
 * Schedule periodic cache cleanup (every 10 minutes)
 */
const scheduleCacheCleanup = () => {
    cron.schedule(
        '*/10 * * * *',
        async () => {
            try {
                const { cleanupChatHistories } = await import('../lib/ai.js');
                const chatCleaned = cleanupChatHistories();
                const cacheCleaned = cleanupCaches();
                // Polls are only needed to decrypt votes; drop them after 7 days.
                const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                const pollsRemoved = await pollRepo.removeOlderThan(weekAgo);

                if (chatCleaned > 0 || cacheCleaned > 0 || pollsRemoved > 0) {
                    logger.info(
                        `[CACHE] Cleaned up ${chatCleaned} chat histories, ${cacheCleaned} cache entries, ${pollsRemoved} expired polls`
                    );
                }
            } catch (err) {
                logger.error('[SYSTEM] Error in cache cleanup task:', err);
            }
        },
        { scheduled: true, timezone: 'Asia/Jakarta' }
    );
};

let recurringTasksRegistered = false;

/**
 * Register cron jobs once per process. Pass a live socket (see
 * lib/liveSocket.js) so jobs keep working after reconnects.
 */
export const registerRecurringTasks = (sock) => {
    if (recurringTasksRegistered) return;
    recurringTasksRegistered = true;
    scheduleBackup(sock);
    // scheduleAutoSuspend(sock); // Dimatikan sementara karena menyebabkan error 404
    scheduleExpiryReminder(sock);
    scheduleCacheCleanup();
};

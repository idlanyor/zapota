import { jidNormalizedUser } from '../wa/helpers.js';
import { serialize, decodeJid } from '../utils/serialize.js';
import { commands } from '../lib/commands.js';
import logger from '../utils/logger.js';
import { settings } from '../config/settings.js';
import { saveMessage } from '../lib/msgStore.js';
import {
    getCachedSettings,
    getGroupSettings,
    handlePreProcessing,
    handleAfk,
    handleSpecialMessages,
    handleAutoAiPrivate,
    handleOwnerAgentTrigger,
} from './messageFlow.js';
import { handleButtons } from './buttonHandler.js';
import { sessionManager } from '../utils/session.js';
import NodeCache from 'node-cache';
import { DEFAULT_PREFIXES, CACHE_TTL, CACHE_CHECK_PERIOD } from '../constants/config.js';
import { getBotIdentity, checkOwner, checkJoinGroup, isOwnerAdminInGroup } from '../middlewares/auth.js';
import { handleDeleteServerConfirmation } from '../middlewares/deleteServer.js';
import { getCachedGroupMetadata, refreshGroupMetadata } from '../middlewares/group.js';
import { recordWerewolfPrivateContact } from '../games/werewolf/service.js';

export { clearSettingsCache } from './messageFlow.js';

const processingMessages = new NodeCache({
    stdTTL: CACHE_TTL.MESSAGES,
    checkperiod: CACHE_CHECK_PERIOD.MESSAGES,
});
const prefixes = [settings.prefix, ...DEFAULT_PREFIXES];

const buildJidCandidates = (...values) => {
    const candidates = new Set();

    for (const value of values) {
        if (!value || typeof value !== 'string') continue;
        candidates.add(value);

        const decoded = decodeJid(value);
        if (decoded) candidates.add(decoded);

        const userPart = value.split('@')[0];
        if (userPart) candidates.add(userPart);

        if (decoded && decoded.includes('@')) {
            const decodedUserPart = decoded.split('@')[0];
            if (decodedUserPart) candidates.add(decodedUserPart);
        }
    }

    return [...candidates];
};

export const messageHandler = async (sock, m) => {
    if (!m || !m.key || !m.key.id) return;
    if (m.key.remoteJid.includes('120363403334136453@g.us'))
        logger.info(m.message.extendedTextMessage?.contextInfo);
    if (processingMessages.has(m.key.id)) return;
    processingMessages.set(m.key.id, true);

    try {
        const [botSettings, mSerialized] = await Promise.all([
            getCachedSettings(),
            (async () => {
                if (m.key.remoteJid === 'status@broadcast') return null;
                return serialize(m, sock);
            })(),
        ]);

        if (m.key.remoteJid === 'status@broadcast') {
            if (botSettings?.autoStatusRead) {
                const participant = m.key.participant;
                if (participant) {
                    await sock.readMessages([m.key]);
                    logger.debug(`Read status from: ${participant.split('@')[0]}`, 'STORY');
                }
            }
            return;
        }

        m = mSerialized;
        if (!m || (!m.body && !m.mtype)) return;
        if (m.chat?.endsWith('@newsletter')) return;

        const usedPrefix = m.body ? prefixes.find((p) => m.body.startsWith(p)) : undefined;
        const cachedMetadata = m.isGroup ? getCachedGroupMetadata(m.chat) : null;
        m.metadata = cachedMetadata?.data || {};

        if (m.isGroup && !cachedMetadata?.isFresh) {
            refreshGroupMetadata(sock, m.chat).catch(() => {});
        }

        const isOwner = checkOwner(m, sock, botSettings);
        m.isOwner = isOwner;

        const groupDataPromise =
            m.isGroup && !isOwner && !m.key.fromMe
                ? getGroupSettings(m.chat, m.metadata?.subject || '')
                : Promise.resolve(null);

        if (m.body) {
            saveMessage(m);
            const senderName = m.pushName || (m.sender ? m.sender.split('@')[0] : 'Unknown');
            logger.chat({
                chatType: m.isGroup ? 'GROUP' : 'PRIVATE',
                chatName: m.isGroup ? m.metadata?.subject || 'Group' : 'Private Chat',
                sender: senderName,
                body: m.body,
            });
        }

        const groupData = await groupDataPromise;

        if (!m.sender) return;

        if (!m.isGroup) recordWerewolfPrivateContact(m);

        const activeSession = sessionManager.get(m.chat) || sessionManager.get(m.sender);
        if (activeSession && !m.body.startsWith(settings.prefix)) {
            const command = commands.get(activeSession.data.commandName);
            if (command && typeof command.handleSession === 'function') {
                await command.handleSession(sock, m, activeSession);
                return;
            }
        }

        if (isOwner && global.confirmDelete?.has(m.sender)) {
            if (await handleDeleteServerConfirmation(m)) return;
        }

        if (m.key.fromMe) {
            global.lastOwnerActivity = Date.now();
        }

        if (await handlePreProcessing(sock, m, groupData, isOwner)) return;
        await handleAfk(sock, m, usedPrefix);
        await handleSpecialMessages(sock, m);

        if (await handleButtons(sock, m, isOwner)) return;

        if (m.key.fromMe && botSettings.mode !== 'self') return;

        const canProceed = await checkJoinGroup(sock, m, isOwner, botSettings, buildJidCandidates);
        if (!canProceed) return;

        if (await handleOwnerAgentTrigger(sock, m, isOwner)) return;

        if (usedPrefix) {
            const cmdName = m.body.slice(usedPrefix.length).trim().split(/\s+/)[0].toLowerCase();
            const command =
                commands.get(cmdName) ||
                [...commands.values()].find((c) => c.aliases?.includes(cmdName));

            if (command) {
                if (groupData?.mute && !isOwner) {
                    let participants = m.metadata?.participants;
                    if (!participants) {
                        try {
                            participants = (await sock.groupMetadata(m.chat)).participants;
                        } catch {
                            participants = [];
                        }
                    }
                    const isAdmin = participants.some(
                        (p) =>
                            jidNormalizedUser(p.id) === jidNormalizedUser(m.sender) &&
                            (p.admin === 'admin' || p.admin === 'superadmin')
                    );
                    if (!isAdmin) return;
                }
                if (botSettings.mode === 'self' && !isOwner) return;
                if (botSettings.mode === 'group' && !m.isGroup && !isOwner) return;
                if (command.category === 'Owner' && !isOwner)
                    return m.reply(' Akses Ditolak. Perintah ini hanya untuk Owner.');
                if (command.category === 'RPG' && m.isGroup) {
                    const isOwnerAdmin = await isOwnerAdminInGroup(sock, m, botSettings);
                    if (!isOwnerAdmin) {
                        return m.reply(
                            '🔒 *AKSES TERBATAS*\n\nFitur RPG saat ini sedang dalam masa uji coba tertutup dan hanya dapat digunakan di grup yang memiliki Owner bot sebagai Admin.'
                        );
                    }
                }

                m.command = cmdName;
                sock.sendPresenceUpdate('composing', m.chat).catch(() => {});

                try {
                    logger.command({
                        phase: 'RUN',
                        name: cmdName,
                        sender: m.sender,
                        chat: m.isGroup ? m.metadata?.subject || m.chat : m.chat,
                        extra: `mode=${botSettings.mode}`,
                    });
                    await command.execute(sock, m, m.args, m.text);
                    logger.command({
                        phase: 'DONE',
                        name: cmdName,
                        sender: m.sender,
                        chat: m.isGroup ? m.metadata?.subject || m.chat : m.chat,
                    });
                } catch (err) {
                    logger.command({
                        phase: 'FAIL',
                        name: cmdName,
                        sender: m.sender,
                        chat: m.isGroup ? m.metadata?.subject || m.chat : m.chat,
                        extra: err.message,
                    });
                    logger.error(err, `Error in command: ${cmdName}`);

                    const { ownerJid } = getBotIdentity(sock);
                    const errorMsg = ` *COMMAND ERROR REPORT*\n\n➛ *Command:* ${cmdName}\n➛ *Sender:* @${m.sender.split('@')[0]}\n➛ *Error:* ${err.message}\n\n\`\`\`${err.stack}\`\`\``;
                    await sock
                        .sendMessage(ownerJid, { text: errorMsg, mentions: [m.sender] })
                        .catch(() => {});
                    m.reply(` Terjadi kesalahan. Detail error telah dikirim ke Owner.`);
                }
            }
        }

        await handleAutoAiPrivate(sock, m, botSettings, isOwner);
    } catch (err) {
        logger.error(err, 'Error in messageHandler');
    } finally {
        processingMessages.del(m.key.id);
    }
};

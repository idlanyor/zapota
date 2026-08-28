import { jidNormalizedUser } from '../wa/helpers.js';
import { decryptPollVote } from 'baileys';
import { createHash } from 'crypto';
import { decodeJid } from '../utils/serialize.js';
import { settings } from '../config/settings.js';
import Settings from '../database/models/Settings.js';
import Group from '../database/models/Group.js';
import Poll from '../database/models/Poll.js';
import { getMessage } from '../lib/msgStore.js';
import { generateAIResponse } from '../lib/ai.js';
import NodeCache from 'node-cache';
import {
    initAfkCache,
    getAfk,
    removeAfk,
    formatAfkDuration,
} from '../services/afkService.js';

initAfkCache().catch(() => {});

let settingsCache = null;
let lastCacheTime = 0;
const groupCache = new NodeCache({ stdTTL: 300, checkperiod: 300 });
const requiredGroupParticipantsCache = new NodeCache({ stdTTL: 300, checkperiod: 300 });
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (was 1 minute)

const addJidVariants = (bucket, jid) => {
    if (!jid || typeof jid !== 'string') return;
    bucket.add(jid);

    const normalized = jidNormalizedUser(jid);
    if (normalized) bucket.add(normalized);

    const userPart = jid.split('@')[0];
    if (userPart) bucket.add(userPart);
};

export const getCachedSettings = async () => {
    const now = Date.now();
    if (!settingsCache || now - lastCacheTime > SETTINGS_CACHE_TTL_MS) {
        settingsCache =
            (await Settings.findOne({ id: 'bot_settings' })) ||
            (await Settings.create({ id: 'bot_settings' }));
        lastCacheTime = now;
    }
    return settingsCache;
};

export const getGroupSettings = async (jid, subject = '') => {
    const now = Date.now();
    const cached = groupCache.get(jid);
    if (cached) return cached;

    let data = await Group.findOne({ jid });
    if (!data) {
        data = await Group.create({ jid, name: subject || '' });
    } else if (subject && !data.name) {
        data = await Group.findOneAndUpdate({ jid }, { name: subject }, { new: true });
    }

    groupCache.set(jid, data);
    return data;
};

export const clearSettingsCache = () => {
    settingsCache = null;
    groupCache.flushAll();
    requiredGroupParticipantsCache.flushAll();
};

/**
 * NodeCache menghapus entry expired lewat stdTTL/checkperiod.
 */
export const cleanupCaches = () => 0;

export const getRequiredGroupParticipants = async (sock, groupJid, forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh) {
        const cached = requiredGroupParticipantsCache.get(groupJid);
        if (cached) return cached;
    }

    const groupMetadata = await sock.groupMetadata(groupJid);
    const participants = new Set();
    for (const participant of groupMetadata.participants) {
        addJidVariants(participants, participant.id);
        addJidVariants(participants, participant.lid);
    }
    requiredGroupParticipantsCache.set(groupJid, participants);
    return participants;
};

export const handlePreProcessing = async (sock, m, groupData, isOwner) => {
    if (!m.isGroup || isOwner || m.key.fromMe) return false;

    if (groupData?.antilink) {
        const linkRegex = /chat.whatsapp.com\/(?:invite\/)?([0-9A-Za-z]{20,26})/i;
        if (linkRegex.test(m.body)) {
            await sock.sendMessage(m.chat, { delete: m.key });
            await m.reply(
                `*── 「 ANTI LINK 」 ──*\n\nMaaf @${m.sender.split('@')[0]}, link grup dilarang!`,
                { mentions: [m.sender] }
            );
            return true;
        }
    }

    if (groupData?.antitoxic) {
        const toxicWords = ['anjing', 'babi', 'monyet', 'memek', 'kontol', 'ajg', 'kntl', 'peler'];
        if (toxicWords.some((word) => m.body.toLowerCase().includes(word))) {
            await sock.sendMessage(m.chat, { delete: m.key });
            await m.reply(`*── 「 ANTI TOXIC 」 ──*\n\nJaga ucapanmu @${m.sender.split('@')[0]}!`, {
                mentions: [m.sender],
            });
            return true;
        }
    }

    if (m.mtype === 'editedMessage') {
        const original = getMessage(m.key.id);
        const newText =
            m.message.editedMessage.message.conversation ||
            m.message.editedMessage.message.extendedTextMessage?.text;
        if (original && original.body !== newText) {
            await m.reply(
                `*── 「 PESAN DIEDIT 」 ──*\n\n*Dari:* @${m.sender.split('@')[0]}\n*Sebelum:* ${original.body}\n*Sesudah:* ${newText}`,
                { mentions: [m.sender] }
            );
        }
        return true;
    }

    return false;
};

export const handleAfk = async (sock, m, usedPrefix) => {
    if (!m || !m.sender) return;

    // 1. Cek apakah pengirim pesan sendiri sebelumnya sedang AFK
    const isAfkCommand =
        usedPrefix &&
        ['afk', 'setafk', 'away'].some((cmd) =>
            m.body?.slice(usedPrefix.length).trim().toLowerCase().startsWith(cmd)
        );

    if (!isAfkCommand) {
        const senderAfk = await removeAfk(m.sender);
        if (senderAfk) {
            const duration = formatAfkDuration(Date.now() - senderAfk.time);
            await m.reply(
                `👋 *SELAMAT DATANG KEMBALI!*\n\n` +
                    `@${m.sender.split('@')[0]} telah berhenti AFK.\n` +
                    `⏱️ *Durasi AFK:* ${duration}\n` +
                    `📝 *Alasan sebelumnya:* ${senderAfk.reason}`,
                { mentions: [m.sender] }
            );
        }
    }

    // 2. Cek apakah pesan me-mention atau me-reply orang yang sedang AFK
    const targets = new Set();
    if (m.mentionedJid && Array.isArray(m.mentionedJid)) {
        for (const jid of m.mentionedJid) targets.add(jid);
    }
    if (m.quoted?.sender && m.quoted.sender !== m.sender) {
        targets.add(m.quoted.sender);
    }

    for (const targetJid of targets) {
        if (targetJid === m.sender) continue;
        const targetAfk = getAfk(targetJid);
        if (targetAfk) {
            const duration = formatAfkDuration(Date.now() - targetAfk.time);
            await m.reply(
                `💤 *PENGINGAT AFK* 💤\n\n` +
                    `Pengguna @${targetJid.split('@')[0]} sedang AFK!\n` +
                    `📝 *Alasan:* ${targetAfk.reason}\n` +
                    `⏰ *Sejak:* ${duration} yang lalu`,
                { mentions: [targetJid] }
            );
        }
    }
};

export const handleSpecialMessages = async (sock, m) => {
    if (m.mtype === 'pollUpdateMessage') await handlePollUpdate(sock, m);
};

const handlePollUpdate = async (sock, m) => {
    try {
        const pollUpdate = m.message.pollUpdateMessage;
        const pollId = pollUpdate.pollCreationMessageKey.id;
        const pollData = await Poll.findOne({ pollId });
        if (!pollData) return;

        const voterJid = jidNormalizedUser(m.sender);
        let selectedOptionName;

        if (pollUpdate.selectedOptionNames?.length > 0) {
            const zapoSelectedOptionName = pollUpdate.selectedOptionNames[0];
            selectedOptionName = pollData.options.includes(zapoSelectedOptionName)
                ? zapoSelectedOptionName
                : undefined;
        } else {
            const meJid = jidNormalizedUser(sock.user.id);
            const meLid = sock.user.lid ? jidNormalizedUser(sock.user.lid) : meJid;
            const pollCreatorJid = pollUpdate.pollCreationMessageKey.fromMe
                ? meLid
                : jidNormalizedUser(
                      pollUpdate.pollCreationMessageKey.participant ||
                          pollUpdate.pollCreationMessageKey.remoteJid
                  );

            let vote;
            try {
                vote = decryptPollVote(pollUpdate.vote, {
                    pollCreatorJid,
                    pollMsgId: pollId,
                    pollEncKey: pollData.messageSecret,
                    voterJid,
                });
            } catch (e) {
                if (
                    pollUpdate.pollCreationMessageKey.fromMe &&
                    pollCreatorJid === meLid &&
                    meLid !== meJid
                ) {
                    vote = decryptPollVote(pollUpdate.vote, {
                        pollCreatorJid: meJid,
                        pollMsgId: pollId,
                        pollEncKey: pollData.messageSecret,
                        voterJid,
                    });
                }
            }

            if (vote?.selectedOptions?.length > 0) {
                const selectedHash = Buffer.from(vote.selectedOptions[0])
                    .toString('hex')
                    .toLowerCase();
                selectedOptionName = pollData.options.find(
                    (opt) =>
                        createHash('sha256').update(opt).digest('hex').toLowerCase() === selectedHash
                );
            }
        }

        if (selectedOptionName) {
            if (pollData.question.startsWith('CONFIRM_DELETE_SRV:')) {
                const ownerJid = jidNormalizedUser(settings.ownerNumber);
                const ownerLid = settings.ownerLid
                    ? jidNormalizedUser(settings.ownerLid)
                    : null;
                if (![ownerJid, ownerLid].includes(voterJid)) {
                    return sock.sendMessage(m.chat, {
                        text: '❌ Hanya Owner yang bisa memberikan konfirmasi ini.',
                    });
                }

                if (selectedOptionName === 'YA, HAPUS SEKARANG') {
                    const parts = pollData.question.split(':');
                    const pteroId = parts[1];
                    const force = parts.includes('FORCE');

                    await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

                    try {
                        const PTERO_URL = process.env.PTERO_URL;
                        const PTERO_API_KEY = process.env.PTERO_API_KEY;
                        const axios = (await import('axios')).default;

                        const ptero = axios.create({
                            baseURL: `${PTERO_URL}/api/application`,
                            headers: {
                                Authorization: `Bearer ${PTERO_API_KEY}`,
                                'Content-Type': 'application/json',
                                Accept: 'Application/vnd.pterodactyl.v1+json',
                            },
                        });

                        try {
                            await ptero.delete(
                                force ? `/servers/${pteroId}/force` : `/servers/${pteroId}`
                            );
                        } catch (e) {
                            if (e.response?.status !== 404) throw e;
                        }

                        const Server = (await import('../database/models/Server.js')).default;
                        const deletedDb = await Server.deleteOne({ pteroId });

                        await sock.sendMessage(m.chat, {
                            text: `✅ *SERVER BERHASIL DIHAPUS*\n\nID: ${pteroId}\nDB: ${deletedDb.deletedCount > 0 ? 'Terhapus' : 'Tidak di DB'}`,
                        });
                        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
                    } catch (err) {
                        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                        await sock.sendMessage(m.chat, {
                            text: `❌ Gagal menghapus server: ${err.message}`,
                        });
                    }
                } else {
                    await sock.sendMessage(m.chat, {
                        text: '❌ Penghapusan server dibatalkan.',
                    });
                }

                await Poll.deleteOne({ pollId });
                return;
            }

            await sock.sendMessage(m.chat, {
                text: `✅ *@${voterJid.split('@')[0]}* memilih *"${selectedOptionName}"*`,
                mentions: [voterJid],
            });
        }
    } catch {}
};

export const handleAutoAiPrivate = async (sock, m, botSettings, isOwner = false) => {
    if (!botSettings?.autoAiPrivate || m.isGroup || m.key.fromMe) return;

    const isMedia = m.isImage;
    if (!(m.body || isMedia)) return;

    const textLength = m.body?.length || 50;
    const configuredDelay = Number(process.env.AUTO_AI_TYPING_DELAY_MS);
    // Reduced default delay: 10ms per char, min 100ms, max 1000ms (was 20ms, 300-2000ms)
    const typingDelay =
        Number.isFinite(configuredDelay) && configuredDelay >= 0
            ? configuredDelay
            : Math.min(Math.max(textLength * 10, 100), 1000);

    if (typingDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, typingDelay));
    }

    await sock.sendPresenceUpdate('composing', m.chat);

    let progressKey = null;
    try {
        let imageBuffer = null;
        let imageMime = null;

        if (isMedia) {
            imageBuffer = await m.download();
            imageMime = m.msg.mimetype || 'image/jpeg';
        }

        const prompt = m.body || 'Analyze this image.';
        const progressMessage = await m.reply('Sedang berpikir...');
        progressKey = progressMessage?.key || null;
        let lastEditAt = Date.now();
        const response = await generateAIResponse({
            sock,
            m,
            prompt,
            imageBuffer,
            imageMime,
            customSystemInstruction: botSettings.privateAiPersona,
            chatId: m.chat,
            isOwner,
            onTextDelta: async (partialText) => {
                const now = Date.now();
                if (!progressKey || now - lastEditAt < 1200 || !partialText.trim()) return;
                try {
                    await sock.sendMessage(m.chat, {
                        text: `${partialText.replace(/\*\*(.*?)\*\*/g, '*$1*')} ▒`,
                        edit: progressKey,
                    });
                    lastEditAt = now;
                } catch {}
            },
        });
        if (progressKey) {
            await sock.sendMessage(m.chat, { text: response, edit: progressKey });
        } else {
            await m.reply(response);
        }
        await sock.sendPresenceUpdate('paused', m.chat);
    } catch (e) {
        console.error('Auto-AI Private Error:', e);
        const errorText = `Error: ${e.message || 'Failed to process request'}`;
        if (progressKey) {
            await sock.sendMessage(m.chat, { text: errorText, edit: progressKey }).catch(() => {});
        }
    }
};

export const handleOwnerAgentTrigger = async (sock, m, isOwner) => {
    if (!isOwner || !m.body) return false;

    const normalizedBody = m.body.trim().toLowerCase();
    if (['confirm', 'cancel'].includes(normalizedBody)) {
        const { hasPendingConfirmation, resolvePendingConfirmation } =
            await import('../services/ownerAgent.js');
        if (hasPendingConfirmation(m.chat)) {
            await m.react('⏳');
            const result = await resolvePendingConfirmation(m, normalizedBody === 'confirm');
            await m.reply(result);
            await m.react('✅');
            return true;
        }
    }

    const botJid = decodeJid(sock.user?.id);
    const botLid = sock.user?.lid ? decodeJid(sock.user.lid) : null;
    const mentioned = (m.mentionedJid || []).map((jid) => decodeJid(jid) || jid);
    const isBotMentioned = mentioned.some((jid) => jid === botJid || (botLid && jid === botLid));
    if (!isBotMentioned) return false;

    await m.react('🤔');
    try {
        const { runOwnerAgent } = await import('../services/ownerAgent.js');
        const response = await runOwnerAgent(sock, m);
        await m.reply(response);
        await m.react('✅');
    } catch (error) {
        console.error('Owner Agent Error:', error);
        await m.react('❌');
        await m.reply(`❌ Owner Agent error: ${error.message}`);
    }
    return true;
};

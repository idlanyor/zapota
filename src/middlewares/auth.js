import { jidNormalizedUser } from '../wa/helpers.js';
import { decodeJid } from '../utils/serialize.js';
import { settings } from '../config/settings.js';
import { getRequiredGroupParticipants } from '../handlers/messageFlow.js';
import logger from '../utils/logger.js';
import { isSubBot } from '../lib/botProfile.js';

/** Resolved "must join" group for the configured invite link. */
let requiredGroup = { inviteLink: null, jid: null };

/** Forget the resolved group (call after the invite link changes). */
export const resetRequiredGroupCache = () => {
    requiredGroup = { inviteLink: null, jid: null };
};

/**
 * Owner and bot JIDs for `sock`. Computed per call: each socket (main bot or
 * a sub-bot) has its own identity, and it changes after a re-login.
 */
export const getBotIdentity = (sock) => {
    const ownerJid = decodeJid(settings.ownerNumber);
    const ownerLid = settings.ownerLid ? decodeJid(settings.ownerLid) : null;
    const botJid = sock?.user?.id ? decodeJid(sock.user.id) : null;
    const botLid = sock?.user?.lid ? decodeJid(sock.user.lid) : null;
    return { ownerJid, ownerLid, botJid, botLid };
};

export const checkOwner = (m, sock, botSettings) => {
    const { ownerJid, ownerLid, botJid, botLid } = getBotIdentity(sock);
    // The main bot's own number acts as owner. A sub-bot's number belongs to a
    // regular user and must never gain owner rights on this server.
    const selfOwners = isSubBot(sock) ? [] : [botJid, botLid];
    const staticOwners = [ownerJid, ownerLid, ...selfOwners].filter(Boolean);

    let dbOwners = botSettings?.owners || [];
    if (typeof dbOwners === 'string') {
        try {
            dbOwners = JSON.parse(dbOwners);
        } catch {
            dbOwners = [dbOwners];
        }
    }
    if (!Array.isArray(dbOwners)) dbOwners = [];

    const rawCandidates = [
        m?.sender,
        m?.key?.participant,
        m?.key?.remoteJid && !m?.isGroup ? m.key.remoteJid : null,
    ].filter(Boolean);

    const candidateSet = new Set();
    for (const cand of rawCandidates) {
        if (typeof cand === 'string') {
            candidateSet.add(cand);
            const decoded = decodeJid(cand);
            if (decoded) candidateSet.add(decoded);
            try {
                const normalized = jidNormalizedUser(cand);
                if (normalized) candidateSet.add(normalized);
            } catch {}
            const numOnly = cand.split('@')[0].split(':')[0];
            if (numOnly) candidateSet.add(numOnly);
        }
    }

    const allOwners = [...staticOwners, ...dbOwners].filter(Boolean);
    const ownerSet = new Set();
    for (const owner of allOwners) {
        if (typeof owner === 'string') {
            ownerSet.add(owner);
            const decoded = decodeJid(owner);
            if (decoded) ownerSet.add(decoded);
            try {
                const normalized = jidNormalizedUser(owner);
                if (normalized) ownerSet.add(normalized);
            } catch {}
            const numOnly = owner.split('@')[0].split(':')[0];
            if (numOnly) ownerSet.add(numOnly);
        }
    }

    for (const cand of candidateSet) {
        if (ownerSet.has(cand)) return true;
    }

    return false;
};

export const checkJoinGroup = async (sock, m, isOwner, botSettings, buildJidCandidates) => {
    if (!m.isGroup && !isOwner && botSettings?.mustJoinGroup) {
        try {
            if (!requiredGroup.jid || requiredGroup.inviteLink !== botSettings.groupInviteLink) {
                const code = botSettings.groupInviteLink.split('chat.whatsapp.com/')[1];
                const groupInfo = await sock.groupGetInviteInfo(code);
                requiredGroup = { inviteLink: botSettings.groupInviteLink, jid: groupInfo.id };
            }

            const senderCandidates = buildJidCandidates(
                m.sender,
                m.key?.participant,
                m.key?.remoteJid
            );
            let participants = await getRequiredGroupParticipants(sock, requiredGroup.jid);
            let isMember = senderCandidates.some((candidate) => participants.has(candidate));

            if (!isMember) {
                participants = await getRequiredGroupParticipants(
                    sock,
                    requiredGroup.jid,
                    true
                );
                isMember = senderCandidates.some((candidate) => participants.has(candidate));
            }

            if (!isMember) {
                await m.reply(
                    `*AKSES DITOLAK*\n\nMaaf @${m.sender.split('@')[0]}, untuk menggunakan bot ini di Private Chat, kamu wajib bergabung ke grup official kami terlebih dahulu.\n\n*Link Grup:* ${botSettings.groupInviteLink}\n\nSetelah bergabung, silakan coba lagi!`,
                    { mentions: [m.sender] }
                );
                return false;
            }
        } catch (e) {
            logger.error('Join Group Check failed:', e.message);
        }
    }
    return true;
};

export const isOwnerAdminInGroup = async (sock, m, botSettings) => {
    if (!m.isGroup) return true;

    let participants = m.metadata?.participants;
    if (!participants || participants.length === 0) {
        try {
            participants = (await sock.groupMetadata(m.chat)).participants;
        } catch {
            participants = [];
        }
    }

    const { ownerJid, ownerLid } = getBotIdentity(sock);
    let dbOwners = botSettings?.owners || [];
    if (typeof dbOwners === 'string') {
        try {
            dbOwners = JSON.parse(dbOwners);
        } catch {
            dbOwners = [dbOwners];
        }
    }
    if (!Array.isArray(dbOwners)) dbOwners = [];

    const ownerList = [ownerJid, ownerLid, ...dbOwners].filter(Boolean);
    const ownerSet = new Set();
    for (const o of ownerList) {
        if (typeof o === 'string') {
            ownerSet.add(o);
            const dec = decodeJid(o);
            if (dec) ownerSet.add(dec);
            try {
                const norm = jidNormalizedUser(o);
                if (norm) ownerSet.add(norm);
            } catch {}
            const num = o.split('@')[0].split(':')[0];
            if (num) ownerSet.add(num);
        }
    }

    return participants.some((p) => {
        if (p.admin !== 'admin' && p.admin !== 'superadmin') return false;
        const pId = p.id ? decodeJid(p.id) : '';
        const pLid = p.lid ? decodeJid(p.lid) : '';
        const pNorm = p.id ? jidNormalizedUser(p.id) : '';
        const pNum = p.id ? p.id.split('@')[0].split(':')[0] : '';
        return (
            ownerSet.has(pId) ||
            ownerSet.has(pLid) ||
            ownerSet.has(pNorm) ||
            ownerSet.has(pNum)
        );
    });
};

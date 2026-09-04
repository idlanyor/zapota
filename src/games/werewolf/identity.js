import { decodeJid } from '../../utils/serialize.js';

export const normalizeIdentity = (jid) => {
    if (!jid || typeof jid !== 'string') return null;
    const normalized = decodeJid(jid);
    if (!normalized || normalized.endsWith('@g.us')) return null;
    return normalized;
};

export const identityAliasesFromMessage = (m) => {
    const aliases = new Set();
    const candidates = [m?.sender, m?.key?.participant, m?.key?.participantAlt];

    // Untuk private chat, m.sender/m.chat adalah identitas lawan bicara yang aman.
    // remoteJidAlt/chatAlt tidak dipakai karena pada mode LID nilainya dapat menunjuk
    // ke JID bot sendiri dan membuat beberapa pemain berbagi alias yang sama.
    if (!m?.isGroup) candidates.push(m?.chat);
    for (const candidate of candidates) {
        const normalized = normalizeIdentity(candidate);
        if (normalized) aliases.add(normalized);
    }
    return [...aliases];
};

export const sameIdentity = (player, aliases) =>
    aliases.some((alias) => player.aliases.includes(alias));

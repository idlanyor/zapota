/**
 * Sub-bot (jadibot) gate: decides which messages a user's sub-bot answers.
 * Messages on the main bot's socket pass straight through.
 *
 *   free     → only its owner (messages typed on the linked phone), only in
 *              private chats
 *   premium  → everyone, private chats and groups
 *   any tier → never its own outgoing replies; silent in groups the main
 *              bot is in
 */
import { getBotProfile, mainSocket, sentBySubBot } from '../../lib/botProfile.js';
import { findParticipant } from '../../lib/groupRoles.js';
import { getCachedGroupMetadata, refreshGroupMetadata } from '../../middlewares/group.js';

/** Last known main-bot identity, so the check still works while it reconnects. */
let lastMainUser = null;

const mainBotUser = () => {
    const user = mainSocket()?.user;
    if (user?.id) lastMainUser = { id: user.id, lid: user.lid };
    return lastMainUser;
};

const groupParticipants = async (sock, jid) => {
    const cached = getCachedGroupMetadata(jid)?.data;
    if (cached?.participants?.length) return cached.participants;
    try {
        return (await refreshGroupMetadata(sock, jid))?.participants || [];
    } catch {
        return [];
    }
};

/** True when the main bot is a member of group `jid`. */
export const mainBotInGroup = async (sock, jid) => {
    const main = mainBotUser();
    if (!main) return false;
    return Boolean(findParticipant(await groupParticipants(sock, jid), main.id, main.lid));
};

export const subBotGate = async (ctx, next) => {
    const profile = getBotProfile(ctx.sock);
    if (profile.kind !== 'sub') return next();

    const { sock, m } = ctx;
    if (m.key.fromMe && sentBySubBot(sock, m.key.id)) return;

    if (profile.tier !== 'premium') {
        if (m.isGroup || !m.key.fromMe) return;
    } else if (m.isGroup && (await mainBotInGroup(sock, m.chat))) {
        return;
    }

    ctx.subBot = profile;
    profile.onActivity?.();
    await next();
};

import { decodeJid } from '../utils/serialize.js';

const userNumber = (jid) => (jid ? jid.split('@')[0].split(':')[0] : null);

/** Normalized bot identity derived from the live socket. */
export const getBotIds = (sock) => {
    const botJid = decodeJid(sock.user?.id);
    const botLid = sock.user?.lid ? decodeJid(sock.user.lid) : null;
    return { botJid, botLid, botNum: userNumber(botJid), botLidNum: userNumber(botLid) };
};

/**
 * Whether a serialized message is addressed to the bot: the bot is
 * @-mentioned, or the message quotes one of the bot's own messages.
 */
export const isAddressedToBot = (sock, m) => {
    const { botJid, botLid, botNum, botLidNum } = getBotIds(sock);

    const mentioned = (m.mentionedJid || []).map((jid) => decodeJid(jid) || jid);
    const isMentioned = mentioned.some((jid) => jid === botJid || (botLid && jid === botLid));

    const quotedNum = userNumber(m.quoted?.sender);
    const isReply = Boolean(
        m.quoted &&
        (m.quoted.fromMe ||
            m.quoted.sender === botJid ||
            (botLid && m.quoted.sender === botLid) ||
            (botNum && quotedNum === botNum) ||
            (botLidNum && quotedNum === botLidNum))
    );

    return { isMentioned, isReply, addressed: isMentioned || isReply };
};

/** Remove `@<botnumber>` / `@<botlid>` mentions from a text prompt. */
export const stripBotMentions = (sock, text = '') => {
    const { botNum, botLidNum } = getBotIds(sock);
    let out = text;
    for (const num of [botNum, botLidNum]) {
        if (num) out = out.replace(new RegExp(`@${num}`, 'g'), '');
    }
    return out.trim();
};

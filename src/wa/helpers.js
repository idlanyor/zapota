import { downloadMediaMessage as downloadZapoMedia } from 'zapo-js';

const isZapoSource = (source) =>
    source === 'zapo' ||
    source?.transport === 'zapo' ||
    source?.provider === 'zapo' ||
    source?.constructor?.name === 'WaClient' ||
    typeof source?.message?.download === 'function';

const toMessageContent = (message, type) => {
    if (getContentType(message)) return message;
    const key = type?.endsWith('Message') ? type : `${type}Message`;
    return { [key]: message };
};

export const jidNormalizedUser = (jid) => {
    if (!jid || typeof jid !== 'string') return '';
    const sepIdx = jid.indexOf('@');
    if (sepIdx < 0) return '';
    const server = jid.slice(sepIdx + 1);
    const userCombined = jid.slice(0, sepIdx);
    const [userAgent] = userCombined.split(':');
    const [user] = userAgent.split('_');
    return `${user}@${server === 'c.us' ? 's.whatsapp.net' : server}`;
};

export const getContentType = (content) => {
    if (content && typeof content === 'object') {
        const keys = Object.keys(content);
        return keys.find(
            (k) =>
                (k === 'conversation' || k.includes('Message')) &&
                k !== 'senderKeyDistributionMessage'
        );
    }
};

let downloadBaileysContentPromise;
const getDownloadBaileysContent = async () => {
    downloadBaileysContentPromise ??= import('baileys').then((m) => m.downloadContentFromMessage);
    return downloadBaileysContentPromise;
};

export const downloadContentFromMessage = async (message, type, sourceOrOptions, options) => {
    const source = isZapoSource(sourceOrOptions) ? sourceOrOptions : undefined;
    const downloadOptions = source ? options : sourceOrOptions;
    if (!source) {
        const downloadBaileysContent = await getDownloadBaileysContent();
        return downloadBaileysContent(message, type, downloadOptions);
    }

    const content = toMessageContent(message, type);
    if (typeof source?.message?.download === 'function') {
        return source.message.download(content, downloadOptions);
    }
    return downloadZapoMedia(content, downloadOptions);
};

/**
 * Download a message's media into a single Buffer.
 * @param {object} msg     message content (e.g. m.msg or m.quoted)
 * @param {string} type    'image' | 'video' | 'audio' | 'document' | 'sticker'
 * @param {object} sock    transport client
 */
export const downloadMediaBuffer = async (msg, type, sock) => {
    const stream = await downloadContentFromMessage(msg, type, sock);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
};

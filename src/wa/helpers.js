import {
    downloadContentFromMessage as downloadBaileysContent,
    getContentType as getBaileysContentType,
    jidNormalizedUser as normalizeBaileysJid,
} from 'baileys';
import { downloadMediaMessage as downloadZapoMedia } from 'zapo-js';

const isZapoSource = (source) =>
    source === 'zapo' ||
    source?.transport === 'zapo' ||
    source?.provider === 'zapo' ||
    source?.constructor?.name === 'WaClient' ||
    typeof source?.message?.download === 'function';

const toMessageContent = (message, type) => {
    if (getBaileysContentType(message)) return message;
    const key = type?.endsWith('Message') ? type : `${type}Message`;
    return { [key]: message };
};

export const jidNormalizedUser = (jid) => normalizeBaileysJid(jid);

export const getContentType = (content) => getBaileysContentType(content);

export const downloadContentFromMessage = (message, type, sourceOrOptions, options) => {
    const source = isZapoSource(sourceOrOptions) ? sourceOrOptions : undefined;
    const downloadOptions = source ? options : sourceOrOptions;
    if (!source) return downloadBaileysContent(message, type, downloadOptions);

    const content = toMessageContent(message, type);
    if (typeof source?.message?.download === 'function') {
        return source.message.download(content, downloadOptions);
    }
    return downloadZapoMedia(content, downloadOptions);
};

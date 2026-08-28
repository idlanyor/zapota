import crypto from 'node:crypto';
import { generateWAMessageContent, generateWAMessageFromContent } from 'baileys';

const MEDIA_KEYS = ['image', 'video', 'audio', 'document', 'sticker'];

const hasMediaKey = (content) =>
    MEDIA_KEYS.some((key) => Object.prototype.hasOwnProperty.call(content, key));

const buildMessageContent = async (sock, content = {}) => {
    if (content?.message) {
        return content.message;
    }

    const normalized = { ...content };
    const generationOptions = {
        upload: sock.waUploadToServer,
    };

    if (normalized.image || normalized.video) {
        if (normalized.text && !normalized.caption) {
            normalized.caption = normalized.text;
        }
        delete normalized.text;
        delete normalized.font;
        delete normalized.backgroundColor;
        delete normalized.waveform;
        delete normalized.ptt;
    }

    if (normalized.audio) {
        delete normalized.text;
        delete normalized.caption;
        delete normalized.font;

        if (typeof normalized.ptt !== 'boolean') {
            normalized.ptt = true;
        }

        // Let Baileys v7 generate a compatible waveform itself.
        delete normalized.waveform;
    }

    if (typeof normalized.backgroundColor !== 'undefined') {
        generationOptions.backgroundColor = normalized.backgroundColor;
        delete normalized.backgroundColor;
    }

    if (typeof normalized.font !== 'undefined') {
        generationOptions.font = normalized.font;
        delete normalized.font;
    }

    if (!('text' in normalized) && !hasMediaKey(normalized)) {
        throw new Error(
            `Unsupported group status payload: ${Object.keys(normalized).join(', ') || 'empty payload'}`
        );
    }

    return await generateWAMessageContent(normalized, generationOptions);
};

const relayGroupStatus = async (sock, groupJid, content, options = {}) => {
    const builtContent = await buildMessageContent(sock, content);
    const messageSecret = crypto.randomBytes(32);

    const msg = generateWAMessageFromContent(
        groupJid,
        {
            messageContextInfo: { messageSecret },
            groupStatusMessageV2: {
                message: {
                    ...builtContent,
                    messageContextInfo: {
                        ...(builtContent.messageContextInfo || {}),
                        messageSecret,
                    },
                },
            },
        },
        {
            userJid: sock.user?.id,
            messageId: options.messageId,
        }
    );

    const relayOptions = { ...options };
    delete relayOptions.messageId;

    return await sock.relayMessage(groupJid, msg.message, {
        messageId: msg.key.id,
        ...relayOptions,
    });
};

export const attachGroupStatusCompat = (sock) => {
    if (!sock || sock.__groupStatusCompatAttached) {
        return sock;
    }

    const originalSendMessage = sock.sendMessage.bind(sock);

    const sendGroupStatus = async (groupJid, content, options = {}) => {
        return relayGroupStatus(sock, groupJid, content, options);
    };

    sock.giftedStatus = {
        sendGroupStatus,
    };

    sock.sendGroupStatus = sendGroupStatus;

    sock.sendMessage = async (jid, content, options = {}) => {
        if (content && typeof content === 'object' && content.groupStatusMessage) {
            return sendGroupStatus(jid, content.groupStatusMessage, options);
        }

        return originalSendMessage(jid, content, options);
    };

    sock.__groupStatusCompatAttached = true;
    return sock;
};

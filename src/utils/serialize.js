import { getContentType, jidNormalizedUser, downloadContentFromMessage } from '../wa/helpers.js';

/**
 * Normalisasi JID (Support LID & PN)
 */
export const decodeJid = (jid) => {
    if (!jid) return jid;
    if (jid.includes('@')) {
        return jidNormalizedUser(jid);
    }
    return jid;
};

const getInteractiveResponseId = (paramsJson) => {
    try {
        return JSON.parse(paramsJson || '{}').id || '';
    } catch {
        return '';
    }
};

export const serialize = (m, sock) => {
    if (!m) return m;

    /**
     * Helper untuk download media secara instant
     */
    m.download = async () => {
        return await m.downloadMediaMessage(m);
    };

    m.downloadMediaMessage = async (message = m) => {
        let msg = message.msg || message;
        let mime = msg.mimetype || '';
        let messageType = message.mtype
            ? message.mtype.replace(/Message/gi, '')
            : mime.split('/')[0];
        const stream = await downloadContentFromMessage(msg, messageType, sock);
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    };

    if (m.key) {
        m.id = m.key.id;
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16;
        m.chat = decodeJid(m.key.remoteJid);
        m.chatAlt = decodeJid(m.key.remoteJidAlt);
        m.fromMe = m.key.fromMe;
        m.isGroup = m.chat.endsWith('@g.us');
        m.sender = decodeJid(
            m.fromMe ? sock.user.id || sock.user.lid : m.isGroup ? m.key.participant : m.chat
        );
    }

    if (m.message) {
        m.mtype = getContentType(m.message);

        let isViewOnce = false;
        let isEdited = false;

        // Robust Unwrapping (Recursive)
        while (
            [
                'ephemeralMessage',
                'viewOnceMessage',
                'viewOnceMessageV2',
                'documentWithCaptionMessage',
                'editedMessage',
            ].includes(m.mtype)
        ) {
            if (m.mtype === 'viewOnceMessage' || m.mtype === 'viewOnceMessageV2') isViewOnce = true;
            if (m.mtype === 'editedMessage') isEdited = true;

            m.message = m.message[m.mtype].message || m.message[m.mtype];
            m.mtype = getContentType(m.message);
        }

        m.msg = m.message[m.mtype];

        // Extracting Body/Text
        m.body =
            m.message.conversation ||
            m.msg?.caption ||
            m.msg?.text ||
            (m.mtype === 'listResponseMessage' && m.msg.singleSelectReply?.selectedRowId) ||
            (m.mtype === 'buttonsResponseMessage' && m.msg.selectedButtonId) ||
            (m.mtype === 'templateButtonReplyMessage' && m.msg.selectedId) ||
            (m.mtype === 'interactiveResponseMessage' &&
                getInteractiveResponseId(m.msg.nativeFlowResponseMessage?.paramsJson)) ||
            m.text ||
            '';

        m.arg = m.body.trim().split(/\s+/);
        m.args = m.body.trim().split(/\s+/).slice(1);
        m.text = m.args.join(' ');

        // Media Helpers
        m.isImage = m.mtype === 'imageMessage';
        m.isVideo = m.mtype === 'videoMessage';
        m.isAudio = m.mtype === 'audioMessage';
        m.isSticker = m.mtype === 'stickerMessage';
        m.isDocument = m.mtype === 'documentMessage';
        m.isViewOnce = isViewOnce || !!m.msg?.viewOnce;
        m.isEdited = isEdited;

        m.mentionedJid = m.msg?.contextInfo ? m.msg.contextInfo.mentionedJid : [];

        // Quoted Handling
        const contextInfo = m.msg?.contextInfo || m.message?.extendedTextMessage?.contextInfo;
        const quoted = contextInfo?.quotedMessage;

        if (quoted) {
            let type = getContentType(quoted);
            let q = quoted;
            let qViewOnce = false;
            let qEdited = false;

            // Robust Unwrapping Quoted
            while (
                [
                    'ephemeralMessage',
                    'viewOnceMessage',
                    'viewOnceMessageV2',
                    'documentWithCaptionMessage',
                    'editedMessage',
                ].includes(type)
            ) {
                if (type === 'viewOnceMessage' || type === 'viewOnceMessageV2') qViewOnce = true;
                if (type === 'editedMessage') qEdited = true;

                q = q[type].message || q[type];
                type = getContentType(q);
            }

            m.quoted = q[type];

            if (typeof m.quoted === 'string') {
                m.quoted = { text: m.quoted };
            }

            m.quoted.mtype = type;
            m.quoted.id = contextInfo.stanzaId;
            m.quoted.chat = decodeJid(contextInfo.remoteJid || m.chat);
            m.quoted.chatAlt = decodeJid(m.key?.remoteJidAlt || m.chatAlt);
            m.quoted.isBaileys = m.quoted.id
                ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16
                : false;
            m.quoted.sender = decodeJid(contextInfo.participant || contextInfo.remoteJid || m.chat);

            const botJid = decodeJid(sock.user.id);
            const botLid = sock.user.lid ? decodeJid(sock.user.lid) : botJid;
            m.quoted.fromMe = m.quoted.sender === botJid || m.quoted.sender === botLid;

            m.quoted.text =
                m.quoted.conversation ||
                m.quoted.caption ||
                m.quoted.text ||
                m.quoted.description ||
                '';
            m.quoted.msg = m.quoted;

            // Quoted Media Helpers
            m.quoted.isImage = m.quoted.mtype === 'imageMessage';
            m.quoted.isVideo = m.quoted.mtype === 'videoMessage';
            m.quoted.isAudio = m.quoted.mtype === 'audioMessage';
            m.quoted.isSticker = m.quoted.mtype === 'stickerMessage';
            m.quoted.isDocument = m.quoted.mtype === 'documentMessage';
            m.quoted.isViewOnce = qViewOnce || !!m.quoted?.viewOnce;
            m.quoted.isEdited = qEdited;

            m.quoted.download = () => m.downloadMediaMessage(m.quoted);
        } else {
            m.quoted = null;
        }
    }

    /**
     * Smart Reply with Global Fake Quote Verified
     */
    m.reply = async (text, options = {}) => {
        const chat = options.chat || m.chat;
        const messageOptions = { ...options };
        delete messageOptions.chat;
        delete messageOptions['context' + 'Info'];

        return sock.sendMessage(
            chat,
            {
                text: text,
                ...messageOptions,
            },
            { quoted: m }
        );
    };

    /**
     * React Helper
     */
    m.react = (emoji) => {
        return sock.sendMessage(m.chat, { react: { text: emoji, key: m.key } });
    };

    return m;
};

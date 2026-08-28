import { generateWAMessageFromContent, prepareWAMessageMedia, proto } from 'baileys';

const buildRelayOptions = (messageId, options = {}) => {
    const relayOptions = { ...options };
    delete relayOptions.messageId;
    return {
        messageId,
        ...relayOptions,
    };
};

const unwrapMessage = (message) => {
    return (
        message?.viewOnceMessage?.message ||
        message?.viewOnceMessageV2?.message ||
        message?.viewOnceMessageV2Extension?.message ||
        message
    );
};

const isGroupJid = (jid) => jid?.endsWith('@g.us');

const buildAdditionalNodes = (jid, message) => {
    const normalized = unwrapMessage(message);
    const additionalNodes = [];

    if (normalized?.interactiveMessage?.nativeFlowMessage) {
        const firstButtonName = normalized.interactiveMessage.nativeFlowMessage.buttons?.[0]?.name;

        if (firstButtonName === 'review_and_pay' || firstButtonName === 'payment_info') {
            additionalNodes.push({
                tag: 'biz',
                attrs: {
                    native_flow_name:
                        firstButtonName === 'review_and_pay' ? 'order_details' : firstButtonName,
                },
            });
        } else if (firstButtonName === 'single_select') {
            additionalNodes.push({
                tag: 'biz',
                attrs: {},
                content: [
                    {
                        tag: 'interactive',
                        attrs: { type: 'native_flow', v: '1' },
                        content: [
                            {
                                tag: 'native_flow',
                                attrs: { v: '2', name: firstButtonName },
                            },
                        ],
                    },
                ],
            });
        } else {
            additionalNodes.push({
                tag: 'biz',
                attrs: {},
                content: [
                    {
                        tag: 'interactive',
                        attrs: { type: 'native_flow', v: '1' },
                        content: [
                            {
                                tag: 'native_flow',
                                attrs: { v: '9', name: 'mixed' },
                            },
                        ],
                    },
                ],
            });
        }

        if (!isGroupJid(jid)) {
            additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
        }
    } else if (normalized?.listMessage) {
        additionalNodes.push({
            tag: 'biz',
            attrs: {},
            content: [
                {
                    tag: 'list',
                    attrs: { v: '2', type: 'product_list' },
                },
            ],
        });
    }

    return additionalNodes;
};

const buildHeaderMedia = async (sock, payload = {}) => {
    if (payload.image) {
        return await prepareWAMessageMedia(
            {
                image: payload.image,
                jpegThumbnail: payload.jpegThumbnail,
            },
            { upload: sock.waUploadToServer }
        );
    }

    if (payload.video) {
        return await prepareWAMessageMedia(
            {
                video: payload.video,
                jpegThumbnail: payload.jpegThumbnail,
            },
            { upload: sock.waUploadToServer }
        );
    }

    if (payload.document) {
        return await prepareWAMessageMedia(
            {
                document: payload.document,
                mimetype: payload.mimetype,
                fileName: payload.fileName,
                jpegThumbnail: payload.jpegThumbnail,
            },
            { upload: sock.waUploadToServer }
        );
    }

    return null;
};

const buildLegacyListPayload = (payload = {}) => {
    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    if (!sections.length) {
        throw new Error('List message requires at least one section');
    }
    if (!payload.buttonText) {
        throw new Error('List message requires buttonText');
    }

    return {
        sections,
        buttonText: payload.buttonText,
        title: payload.title || '',
        footer: payload.footer || payload.footerText || '',
        text: payload.text || payload.description || '',
        mentions: payload.mentions,
        viewOnce: true,
    };
};

const buildInteractiveListMessage = async (sock, payload = {}) => {
    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    if (!sections.length) {
        throw new Error('Interactive list requires at least one section');
    }

    const buttonParamsJson = JSON.stringify({
        title: payload.buttonTitle || payload.buttonText || payload.title || 'Pilih menu',
        sections,
    });
    const extraButtons = Array.isArray(payload.buttons) ? payload.buttons : [];
    const headerMedia = await buildHeaderMedia(sock, payload);

    return {
        interactiveButtons: [
            {
                name: 'single_select',
                buttonParamsJson,
            },
            ...extraButtons,
        ],
        title: payload.headerTitle || payload.title || '',
        subtitle: payload.headerSubtitle || '',
        footer: payload.footer || '',
        text: payload.text || payload.description || '',
        media: !!headerMedia,
        mentions: payload.mentions,
        viewOnce: true,
        ...(headerMedia
            ? {
                  ...(headerMedia.imageMessage ? { image: payload.image } : {}),
                  ...(headerMedia.videoMessage ? { video: payload.video } : {}),
                  ...(headerMedia.documentMessage ? { document: payload.document } : {}),
                  ...(payload.caption ? { caption: payload.caption } : {}),
                  __preparedMedia: headerMedia,
              }
            : {}),
    };
};

const buildWileysStyleContent = async (sock, payload = {}) => {
    if (payload.interactiveButtons) {
        let mediaMessage = {};
        if (payload.__preparedMedia) {
            mediaMessage = payload.__preparedMedia;
        } else if (payload.image || payload.video || payload.document) {
            mediaMessage = await prepareWAMessageMedia(
                {
                    ...(payload.image ? { image: payload.image } : {}),
                    ...(payload.video ? { video: payload.video } : {}),
                    ...(payload.document ? { document: payload.document } : {}),
                    ...(payload.jpegThumbnail ? { jpegThumbnail: payload.jpegThumbnail } : {}),
                    ...(payload.mimetype ? { mimetype: payload.mimetype } : {}),
                    ...(payload.fileName ? { fileName: payload.fileName } : {}),
                },
                { upload: sock.waUploadToServer }
            );
        }

        const interactiveMessage = {
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: payload.interactiveButtons,
            }),
        };

        if (payload.text) {
            interactiveMessage.body = {
                text: payload.text,
            };
        } else if (payload.caption) {
            interactiveMessage.body = {
                text: payload.caption,
            };
        }

        if (payload.footer) {
            interactiveMessage.footer = {
                text: payload.footer,
            };
        }

        interactiveMessage.header = {
            title: payload.title || '',
            subtitle: payload.subtitle || '',
            hasMediaAttachment: !!payload.media,
        };

        Object.assign(interactiveMessage.header, mediaMessage);

        let message = { interactiveMessage };
        if (payload.viewOnce) {
            message = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadata: {},
                            deviceListMetadataVersion: 2,
                        },
                        ...message,
                    },
                },
            };
        }

        return message;
    }

    if (payload.sections) {
        let message = {
            listMessage: proto.Message.ListMessage.fromObject({
                sections: payload.sections,
                buttonText: payload.buttonText,
                title: payload.title || '',
                footerText: payload.footer || payload.footerText || '',
                description: payload.text || payload.description || '',
                listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
            }),
        };

        if (payload.viewOnce) {
            message = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadata: {},
                            deviceListMetadataVersion: 2,
                        },
                        ...message,
                    },
                },
            };
        }

        return message;
    }

    throw new Error('Unsupported Wileys-style payload');
};

const relayContent = async (sock, jid, content, options = {}) => {
    const normalizedContent =
        content?.interactiveButtons || content?.sections
            ? await buildWileysStyleContent(sock, content)
            : content;

    const msg = generateWAMessageFromContent(jid, normalizedContent, {
        quoted: options.quoted,
        userJid: sock.user?.id,
        messageId: options.messageId,
    });

    const relayOptions = buildRelayOptions(msg.key.id, options);
    // Zapo derives the required button/list companion node from the proto message.
    // Adding our legacy companion as well produces two <biz> nodes and WhatsApp
    // rejects group sender-key publishes with SMAX_INVALID (479).
    const compatibilityNodes =
        sock.transport === 'zapo' ? [] : buildAdditionalNodes(jid, msg.message);
    const additionalNodes = [...(relayOptions.additionalNodes || []), ...compatibilityNodes];

    return await sock.relayMessage(jid, msg.message, {
        ...relayOptions,
        additionalNodes,
    });
};

export const attachListMessageCompat = (sock) => {
    if (!sock || sock.__listMessageCompatAttached) {
        return sock;
    }

    const originalSendMessage = sock.sendMessage.bind(sock);

    sock.sendListMessage = async (jid, payload, options = {}) => {
        return relayContent(sock, jid, buildLegacyListPayload(payload), options);
    };

    sock.sendInteractiveList = async (jid, payload, options = {}) => {
        return relayContent(sock, jid, await buildInteractiveListMessage(sock, payload), options);
    };

    sock.sendInteractiveButtons = async (jid, payload, options = {}) => {
        if (
            !Array.isArray(payload?.interactiveButtons) ||
            payload.interactiveButtons.length === 0
        ) {
            throw new Error('interactiveButtons must be a non-empty array');
        }

        return relayContent(
            sock,
            jid,
            {
                ...payload,
                viewOnce: payload.viewOnce ?? true,
            },
            options
        );
    };

    sock.sendMessage = async (jid, content, options = {}) => {
        if (content && typeof content === 'object') {
            if (Array.isArray(content.sections) && content.buttonText) {
                return sock.sendListMessage(jid, content, options);
            }

            if (content.interactiveList && typeof content.interactiveList === 'object') {
                return sock.sendInteractiveList(jid, content.interactiveList, options);
            }

            if (
                Array.isArray(content.interactiveButtons) &&
                content.interactiveButtons.length > 0
            ) {
                return sock.sendInteractiveButtons(jid, content, options);
            }
        }

        return originalSendMessage(jid, content, options);
    };

    sock.__listMessageCompatAttached = true;
    return sock;
};

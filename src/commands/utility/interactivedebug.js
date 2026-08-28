import { generateWAMessageFromContent, proto } from 'baileys';

export default {
    name: 'interactivedebug',
    aliases: ['idebug', 'debuginteractive'],
    description: 'Kirim interactive message minimal untuk debug render client',
    category: 'Utility',
    execute: async (sock, m) => {
        const targetChat = !m.isGroup && m.chatAlt && m.chatAlt !== m.chat ? m.chatAlt : m.chat;

        const msg = generateWAMessageFromContent(
            targetChat,
            {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadata: {},
                            deviceListMetadataVersion: 2,
                        },
                        interactiveMessage: proto.Message.InteractiveMessage.create({
                            body: proto.Message.InteractiveMessage.Body.create({
                                text: 'Debug interactive minimal',
                            }),
                            footer: proto.Message.InteractiveMessage.Footer.create({
                                text: 'Kanata Bot',
                            }),
                            header: proto.Message.InteractiveMessage.Header.create({
                                title: 'Interactive Debug',
                                subtitle: 'Quick Reply Only',
                                hasMediaAttachment: false,
                            }),
                            nativeFlowMessage:
                                proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                    buttons: [
                                        {
                                            name: 'quick_reply',
                                            buttonParamsJson: JSON.stringify({
                                                display_text: 'Tes Ping',
                                                id: '.ping',
                                            }),
                                        },
                                    ],
                                }),
                        }),
                    },
                },
            },
            { quoted: m, userJid: sock.user?.id }
        );

        await sock.relayMessage(targetChat, msg.message, { messageId: msg.key.id });
    },
};

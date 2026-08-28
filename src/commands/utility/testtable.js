export default {
    name: 'testtable',
    description: 'Uji coba rich table via precise botForwardedMessage',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        const msg = {
            botForwardedMessage: {
                message: {
                    richResponseMessage: {
                        messageType: 1, // STANDARD
                        submessages: [
                            {
                                messageType: 2, // TEXT
                                messageText: '📊 *TABLE REPORT (PRECISE)*',
                            },
                            {
                                messageType: 4, // TABLE
                                tableMetadata: {
                                    title: 'Status Server',
                                    rows: [
                                        {
                                            items: ['ID', 'Service', 'Load'],
                                            isHeading: true,
                                        },
                                        {
                                            items: ['001', 'Web Engine', 'Low'],
                                            isHeading: false,
                                        },
                                        {
                                            items: ['002', 'Media Proc', 'High'],
                                            isHeading: false,
                                        },
                                    ],
                                },
                            },
                        ],
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedAiBotMessageInfo: {
                                botJid: '867051314767696@bot',
                            },
                            forwardOrigin: 4,
                            // Normal quoted info
                            stanzaId: m.key.id,
                            participant: m.sender,
                            quotedMessage: m.message,
                        },
                    },
                },
            },
        };

        await sock.relayMessage(m.chat, msg, {
            messageId: sock.generateMessageTag(),
        });
    },
};

export default {
    name: 'testbutton',
    aliases: ['buttondemo', 'demobutton'],
    description: 'Kirim pesan test interactive button (khusus owner)',
    category: 'Owner',
    execute: async (sock, m, args) => {
        const mode = (args[0] || 'all').toLowerCase();
        const targetChat = !m.isGroup && m.chatAlt && m.chatAlt !== m.chat ? m.chatAlt : m.chat;

        const payload = {
            text: 'Demo interactive buttons non-list',
            footer: 'Kanata Bot',
            title: 'Button Debug',
            subtitle: mode.toUpperCase(),
            interactiveButtons: [],
        };

        if (mode === 'reply' || mode === 'all') {
            payload.interactiveButtons.push({
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Tes Ping',
                    id: '.ping',
                }),
            });
        }

        if (mode === 'url' || mode === 'all') {
            payload.interactiveButtons.push({
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Buka Website',
                    url: 'https://api.kanata.web.id',
                    merchant_url: 'https://api.kanata.web.id',
                }),
            });
        }

        if (mode === 'copy' || mode === 'all') {
            payload.interactiveButtons.push({
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Copy Code',
                    copy_code: 'KANATA-123',
                }),
            });
        }

        if (mode === 'call' || mode === 'all') {
            payload.interactiveButtons.push({
                name: 'cta_call',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Call Owner',
                    phone_number: '+62895395590009',
                }),
            });
        }

        if (!payload.interactiveButtons.length) {
            return m.reply('Mode tidak valid. Pakai: reply, url, copy, call, atau all');
        }

        if (sock.transport === 'zapo') {
            await sock.sendMessage(
                targetChat,
                {
                    interactiveMessage: {
                        body: { text: payload.text },
                        footer: { text: payload.footer },
                        header: {
                            title: payload.title,
                            subtitle: payload.subtitle,
                            hasMediaAttachment: false,
                        },
                        nativeFlowMessage: {
                            messageVersion: 1,
                            buttons: payload.interactiveButtons,
                        },
                    },
                },
                { quoted: m }
            );
            return;
        }

        await sock.sendInteractiveButtons(targetChat, payload, { quoted: m });
    },
};

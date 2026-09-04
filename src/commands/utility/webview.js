export default {
    name: 'webview',
    description: 'Tes tombol Webview (Eksperimental)',
    category: 'Info',
    execute: async (sock, m, args, text) => {
        const interactiveMessage = {
            header: {
                title: ' WEBVIEW TEST',
                hasMediaAttachment: false,
            },
            body: {
                text: 'Tombol ini akan mencoba membuka Webview di dalam WhatsApp (Hanya support di beberapa versi WA Business/Beta).',
            },
            footer: {
                text: 'Experimental by Kanata-Baileys',
            },
            nativeFlowMessage: {
                buttons: [
                    {
                        name: 'open_webview',
                        buttonParamsJson: JSON.stringify({
                            title: 'Buka Dashboard',
                            link: {
                                url: 'https://kanata-api.irengcloud.com',
                            },
                            has_multiple_buttons: true,
                        }),
                    },
                ],
            },
        };

        try {
            await sock.sendMessage(
                m.chat,
                {
                    interactive: interactiveMessage,
                    viewOnce: true,
                },
                { quoted: m }
            );
        } catch (err) {
            console.error(err);
            m.reply('Gagal mengirim Webview Button.');
        }
    },
};

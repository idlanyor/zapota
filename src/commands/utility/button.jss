import logger from '../../utils/logger.js';
export default {
    name: 'button',
    description: 'Mengirim modern interactive buttons (Native Support)',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        logger.info(`[DEBUG] Executing native button command for ${m.chat}`);

        const interactiveMessage = {
            header: {
                title: 'Kanata-Baileys Native',
                subtitle: 'Interactive Flow',
                hasMediaAttachment: false,
            },
            body: {
                text: 'Halo! Ini tombol melayang yang dikirim lewat core Kanata-Baileys secara native.',
            },
            footer: {
                text: 'Klik tombol di bawah ya!',
            },
            nativeFlowMessage: {
                buttons: [
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Visit API',
                            url: 'https://api.kanata.web.id',
                            merchant_url: 'https://api.kanata.web.id',
                        }),
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Ping Bot',
                            id: '.ping',
                        }),
                    },
                ],
            },
        };

        try {
            // Sekarang kita bisa pakai sendMessage biasa,
            // karena core Kanata-Baileys otomatis urus binary nodes-nya!
            await sock.sendMessage(
                m.chat,
                {
                    interactive: interactiveMessage,
                    viewOnce: true,
                },
                { quoted: m }
            );

            logger.info(`[DEBUG] Native button message sent via core.`);
        } catch (err) {
            logger.error('[ERROR] Failed to send native button:', err);
            m.reply('Gagal mengirim Button Message.');
        }
    },
};

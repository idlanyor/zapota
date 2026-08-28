import logger from '../../utils/logger.js';
export default {
    name: 'promochannel',
    aliases: ['pc', 'promosi'],
    description: 'Kirim pesan dengan label diteruskan dari Saluran',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Format: .promochannel Pesan Promosi Lu');

        // Data Saluran Lu (Hasil .ceknews tadi)
        const newsJid = '120363305152329358@newsletter';
        const newsName = 'AntiDonasi Creative | Rumah Kanata & Kachina';

        try {
            await sock.sendMessage(m.chat, {
                text: text,
                // Ini properti custom yang kita pasang di core tadi
                newsletterForward: {
                    jid: newsJid,
                    name: newsName,
                    serverId: 100, // ID pesan palsu
                },
            });

            logger.info(`[DEBUG] Promo Channel sent to ${m.chat}`);
        } catch (err) {
            logger.error(err);
            m.reply('Gagal mengirim promo saluran.');
        }
    },
};

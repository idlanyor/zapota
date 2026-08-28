import { settings } from '../../config/settings.js';
import { renderIqc } from '../../lib/iqcRenderer.js';
import logger from '../../utils/logger.js';

const getJakartaTime = () =>
    new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
        .format(new Date())
        .replace('.', ':');

export default {
    name: 'iqc',
    aliases: ['iphonequote', 'iosquote'],
    description: 'Buat gambar quoted chat WhatsApp bergaya iPhone',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        let quoteText = '';
        let reply = null;

        if (m.quoted?.text) {
            if (text && text.trim()) {
                quoteText = text.trim();
                const sender = m.quoted.pushName || m.quoted.name || 'Anda';
                reply = {
                    sender,
                    text: m.quoted.text.trim(),
                };
            } else {
                quoteText = m.quoted.text.trim();
            }
        } else if (text && text.trim()) {
            quoteText = text.trim();
        }

        if (!quoteText) {
            return m.reply(
                `Reply pesan dengan *${settings.prefix}iqc* atau ketik *${settings.prefix}iqc teks*.`
            );
        }

        m.react('⏳').catch(() => {});
        try {
            const image = await renderIqc({
                text: quoteText,
                time: getJakartaTime(),
                reply,
            });
            await sock.sendMessage(m.chat, { image }, { quoted: m });
            await m.react('✅');
        } catch (error) {
            logger.error(error, 'Failed to render IQC image');
            await m.react('❌');
            await m.reply('Gagal membuat gambar iPhone quoted chat.');
        }
    },
};


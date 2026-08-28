import { fetchAPI } from '../../lib/api.js';

export default {
    name: 'pindl',
    aliases: ['pinterestdl', 'pindownload', 'pinvid'],
    description: 'Download video/gambar dari Pinterest URL',
    category: 'Downloader',

    execute: async (sock, m, args, text) => {
        if (!text)
            return m.reply(`Mau download apa?
Ketik *pindl <url pinterest>*
Contoh: *pindl https://pin.it/4CrohdeTs*`);

        if (!text.includes('pin.it') && !text.includes('pinterest.com'))
            return m.reply('❌ Link harus dari Pinterest (pin.it atau pinterest.com).');

        await m.react('⏳');

        try {
            const data = await fetchAPI('/pinterest/fetch', { url: text });

            if (!data) {
                await m.react('❌');
                return m.reply('Gagal mengambil data dari Pinterest.');
            }

            const caption = `📌 *${data.description || 'Pinterest Media'}*\n\n👤 *Author:* ${data.author || 'Unknown'}`;

            // Prioritaskan video jika ada
            const videoUrl = data.cdn_url || data.video;
            if (videoUrl) {
                await sock.sendMessage(
                    m.chat,
                    {
                        video: { url: videoUrl },
                        caption,
                    },
                    { quoted: m }
                );
            } else if (data.image) {
                await sock.sendMessage(
                    m.chat,
                    {
                        image: { url: data.image },
                        caption,
                    },
                    { quoted: m }
                );
            } else if (data.thumbnail) {
                // Fallback ke thumbnail jika tidak ada media lain
                await sock.sendMessage(
                    m.chat,
                    {
                        image: { url: data.thumbnail },
                        caption: `${caption}\n\n⚠️ Hanya thumbnail yang tersedia.`,
                    },
                    { quoted: m }
                );
            } else {
                await m.react('❌');
                return m.reply('Tidak ada media ditemukan.');
            }

            await m.react('✅');
        } catch (err) {
            console.error('[ERROR] pindl:', err);
            await m.react('❌');
            await m.reply(`Terjadi kesalahan: ${err.message}`);
        }
    },
};

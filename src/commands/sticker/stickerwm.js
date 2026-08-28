import { Sticker, StickerTypes } from '../../lib/stickerFormatter.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'stickerwm',
    aliases: ['swm', 'wm'],
    description: 'Beri watermark pada sticker (Reply sticker/gambar)',
    category: 'Sticker',
    execute: async (sock, m, args, text) => {
        // Gunakan helper serialize baru: cek apakah ada media yang di-reply atau dikirim
        const target = m.quoted ? m.quoted : m;

        if (!target.isImage && !target.isVideo && !target.isSticker) {
            return m.reply(
                `Kirim/Balas gambar, video, atau sticker dengan: .swm PackName | AuthorName`
            );
        }

        await m.react('');

        try {
            // Gunakan helper download() yang baru kita buat di serialize.js
            const buffer = await target.download();

            // Parsing nama pack dan author
            const [pack, author] = text.includes('|')
                ? text.split('|').map((v) => v.trim())
                : [text || settings.botName, m.pushName || 'KanataBot'];

            const sticker = new Sticker(buffer, {
                pack: pack,
                author: author,
                type: StickerTypes.FULL,
                quality: 50,
            });

            const result = await sticker.toBuffer();

            // Gunakan helper reply() yang sudah support media (via options)
            await sock.sendMessage(m.chat, { sticker: result }, { quoted: m });

            await m.react('');
        } catch (err) {
            console.error(err);
            await m.reply(' Gagal memproses watermark.');
            await m.react('');
        }
    },
};

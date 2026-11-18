import { downloadMediaBuffer } from '../../wa/helpers.js';
import { Sticker, StickerTypes } from '../../lib/stickerFormatter.js';
import { settings } from '../../config/settings.js';
import { parseMemeText, renderMeme } from '../../lib/memeRenderer.js';

const isSupportedMedia = (message) => {
    const content = message?.msg || message || {};
    return (
        /^(imageMessage|stickerMessage)$/.test(message?.mtype || '') ||
        /^image\//.test(content.mimetype || '')
    );
};

export default {
    name: 'smeme',
    aliases: ['stickermeme'],
    description: 'Create a sticker with top and bottom text',
    category: 'Sticker',
    execute: async (sock, m, args, text) => {
        const react = async (emoji) => {
            try {
                await m.react(emoji);
            } catch {
                // A failed reaction must not interrupt sticker creation or delivery.
            }
        };
        try {
            const target = isSupportedMedia(m) ? m : m.quoted;
            if (!isSupportedMedia(target)) {
                return m.reply(
                    `Kirim gambar dengan caption *${settings.prefix}smeme ngeteh*, atau balas gambar/stiker. Gunakan *${settings.prefix}smeme atas.bawah* untuk dua teks.`
                );
            }
            const msg = target.msg || target;
            const mtype = target.mtype;

            const memeText = parseMemeText(text);
            if (!memeText.top && !memeText.bottom) {
                return m.reply(
                    `Contoh: ${settings.prefix}smeme ngeteh (teks bawah), atau ${settings.prefix}smeme atas.bawah`
                );
            }

            await react('⏳');

            // Download media
            const mediaType = mtype === 'stickerMessage' ? 'sticker' : 'image';
            const buffer = await downloadMediaBuffer(msg, mediaType, sock);
            const resultBuffer = await renderMeme(buffer, memeText);

            const sticker = new Sticker(resultBuffer, {
                pack: settings.botName,
                author: m.pushName || 'User',
                type: StickerTypes.FULL,
                quality: 50,
            });

            const stickerBuffer = await sticker.toBuffer();
            await sock.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m });
            await react('✅');
        } catch (error) {
            console.error('Error creating smeme:', error);
            await react('❌');
            await m.reply(
                `Gagal memproses gambar/stiker. Coba kirim ulang gambarnya dengan caption ${settings.prefix}smeme ngeteh.`
            );
        }
    },
};

import { Sticker, StickerTypes } from '../../lib/stickerFormatter.js';
import axios from 'axios';
import { scrapeTwitter } from '../../lib/twitterScraper.js';

export default {
    name: 'sticker',
    aliases: ['s', 'stiker'],
    description: 'Convert image/video to sticker',
    category: 'Sticker',
    execute: async (sock, m, args, text) => {
        try {
            await m.react('⏳');
            let buffer;
            let isAnimatedSource = false;

            if (text && /^https?:\/\//i.test(text.trim())) {
                const originalUrl = text.trim();
                const isTwitterUrl = /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\//i.test(
                    originalUrl
                );
                let mediaUrl = originalUrl;
                let forceAnimatedFromSource = false;

                if (isTwitterUrl) {
                    const data = await scrapeTwitter(originalUrl);
                    if (!data || !Array.isArray(data.medias) || data.medias.length === 0) {
                        await m.react('❌');
                        return m.reply('Gagal mengambil media dari link Twitter/X.');
                    }
                    mediaUrl = data.medias[0].url;
                    forceAnimatedFromSource = true;
                }

                const response = await axios.get(mediaUrl, {
                    responseType: 'arraybuffer',
                    timeout: 30000,
                });
                const contentType = (response.headers['content-type'] || '').toLowerCase();
                const urlLower = mediaUrl.toLowerCase();

                const isImageUrl = contentType.startsWith('image/');
                const isVideoUrl = contentType.startsWith('video/');
                const isGifUrl = contentType.includes('image/gif') || /\.gif($|\?)/.test(urlLower);
                const isAnimatedUrlByExt = /\.(mp4|webm|mkv|mov)($|\?)/.test(urlLower);

                if (!isImageUrl && !isVideoUrl && !isGifUrl && !isAnimatedUrlByExt) {
                    await m.react('❌');
                    return m.reply('URL harus mengarah ke media gambar/video/gif yang valid.');
                }

                isAnimatedSource =
                    forceAnimatedFromSource || isVideoUrl || isGifUrl || isAnimatedUrlByExt;
                buffer = Buffer.from(response.data);
            } else {
                const target = m.quoted || m;
                const mime = target?.msg?.mimetype || '';
                const fileName = (target?.msg?.fileName || '').toLowerCase();
                const isGifDocument = target.isDocument && /image\/gif/i.test(mime);
                const isVideoDocument = target.isDocument && /video\//i.test(mime);
                const isAnimatedDocumentByExt =
                    target.isDocument && /\.(gif|mp4|webm|mkv|mov)$/.test(fileName);
                isAnimatedSource =
                    target.isVideo || isGifDocument || isVideoDocument || isAnimatedDocumentByExt;

                if (!target.isImage && !isAnimatedSource) {
                    await m.react('❌');
                    return m.reply('Kirim/balas gambar-video-gif, atau pakai `.s <url>`');
                }

                if (isAnimatedSource) {
                    const duration = Number(target.seconds || target?.msg?.seconds || 0);
                    if (duration > 10) {
                        await m.react('❌');
                        return m.reply(
                            `Durasi video terlalu panjang (${duration}s). Maksimal 10 detik.`
                        );
                    }
                }

                buffer = await target.download();
            }

            const sticker = new Sticker(buffer, {
                pack: 'MyBot Pack',
                author: m.pushName || 'MyBot',
                type: StickerTypes.FULL,
                categories: ['', ''],
                id: m.id,
                quality: 50,
                animated: isAnimatedSource,
            });

            const stickerBuffer = await sticker.toBuffer();
            await sock.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m });
            await m.react('✅');
        } catch (err) {
            console.error(`[DEBUG] Sticker command failed:`, err);
            await m.react('❌');
            await m.reply('Gagal membuat sticker dari media tersebut.');
        }
    },
};

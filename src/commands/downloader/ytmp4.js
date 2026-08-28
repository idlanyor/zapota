import axios from 'axios';
import { convertVideo } from '../../lib/y2mate.js';
import { savetube } from '../../lib/savetube.js';
import { downloadYouTubeYtmp3 } from '../../lib/ytmp3Mobi.js';
import { optimizeVideoForWa } from '../../lib/videoHelper.js';
import { videoQueue } from '../../lib/queue.js';
import logger from '../../utils/logger.js';

export default {
    name: 'ytmp4',
    aliases: ['ytvideo', 'ytdl'],
    description: 'Download YouTube video (via y2mate / savetube)',
    category: 'Downloader',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Kirim link YouTube.\nContoh: *.ytmp4 https://youtu.be/xxxx --720*');

        const resFlag = args.find((arg) => arg.startsWith('--') && /\d+/.test(arg));
        const quality = resFlag ? resFlag.replace(/[^0-9]/g, '') : '360';
        const cleanUrl = text.replace(resFlag, '').trim();

        await m.react('⏳');

        let statusMsg = null;
        const onQueueStatus = async (position) => {
            try {
                if (position > 0) {
                    const txt = `⏳ Masuk antrean downloader. Posisi kamu: *#${position}*. Mohon tunggu...`;
                    if (statusMsg) {
                        // Update status message if possible (some environments don't support edit, so we just send/delete or ignore)
                    } else {
                        statusMsg = await m.reply(txt);
                    }
                } else if (position === 0 && statusMsg) {
                    // Task starts processing
                    await m.reply(`🔄 Memulai proses konversi... (${quality}p)`);
                }
            } catch (e) {
                logger.error(`Error sending queue status: ${e.message}`, 'YTMP4');
            }
        };

        const task = async () => {
            if (!statusMsg) {
                await m.reply(`🔄 Mengonversi video... (${quality}p). Mohon tunggu.`);
            }

            let data, source;
            try {
                // Primary: y2mate.best with requested quality
                try {
                    const res = await convertVideo(cleanUrl, quality);
                    data = {
                        url: res.url,
                        filename: res.filename,
                        title: res.filename.replace(/\s\(\d+p.*$/i, ''),
                        quality: String(res.quality || quality),
                    };
                    source = `y2mate.best (${quality}p)`;
                } catch (err) {
                    if (quality !== '360') {
                        logger.warn(`y2mate failed for quality ${quality}p, retrying with 360p: ${err.message}`, 'YTMP4');
                        const res = await convertVideo(cleanUrl, '360');
                        data = {
                            url: res.url,
                            filename: res.filename,
                            title: res.filename.replace(/\s\(\d+p.*$/i, ''),
                            quality: String(res.quality || '360'),
                        };
                        source = 'y2mate.best (360p Fallback)';
                    } else {
                        throw err;
                    }
                }
            } catch (err) {
                logger.warn(
                    `y2mate failed completely, falling back to YTmp3 H.264: ${err.message}`,
                    'YTMP4'
                );

                try {
                    const res = await downloadYouTubeYtmp3(cleanUrl, 'mp4');
                    data = {
                        url: res.url,
                        filename: `${res.title || 'video'}.mp4`,
                        title: res.title,
                        quality: quality === '360' ? '360' : `auto (request ${quality}p)`,
                        headers: { Referer: 'https://id.ytmp3.mobi/' },
                    };
                    source = 'YTmp3 (H.264 Fallback)';
                } catch (ytmp3Error) {
                    logger.warn(
                        `YTmp3 failed, falling back to savetube: ${ytmp3Error.message}`,
                        'YTMP4'
                    );
                    const res = await savetube(cleanUrl, 'video', quality);
                    data = {
                        url: res.downloadUrl,
                        filename: `${res.title || 'video'}.mp4`,
                        title: res.title,
                        quality: String(res.quality || quality),
                    };
                    source =
                        data.quality === quality
                            ? 'savetube (Fallback)'
                            : `savetube (${data.quality}p, fallback dari ${quality}p)`;
                }
            }

            const videoResponse = await axios.get(data.url, {
                responseType: 'arraybuffer',
                headers: {
                    accept: '*/*',
                    'User-Agent': 'Mozilla/5.0',
                    ...(data.headers || {}),
                },
                timeout: 120000,
            });
            let videoBuffer = Buffer.from(videoResponse.data);

            // FastStart optimization for WhatsApp playback
            videoBuffer = await optimizeVideoForWa(videoBuffer);

            const qualityLabel = /^\d+$/.test(data.quality || quality)
                ? `${data.quality || quality}p`
                : data.quality || quality;
            const caption = `🎬 *YouTube Downloaded*\n\nFile: ${data.title}\nQuality: ${qualityLabel}\nSource: ${source}`;

            await sock.sendMessage(
                m.chat,
                {
                    video: videoBuffer,
                    mimetype: 'video/mp4',
                    caption,
                    fileName: data.filename,
                },
                { quoted: m }
            );
            await m.react('✅');
        };

        try {
            await videoQueue.push(task, onQueueStatus);
        } catch (err) {
            logger.error('[ytmp4]', err);
            await m.react('❌');
            await m.reply(`❌ Gagal mengunduh video: ${err.message || 'Unknown error'}`);
        }
    },
};

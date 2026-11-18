import { downloadYouTubeVideo, isYouTubeUrl, pickHeight } from '../../lib/ytdlp.js';
import { optimizeVideoForWa } from '../../lib/videoHelper.js';
import { videoQueue } from '../../lib/queue.js';
import logger from '../../utils/logger.js';

const USAGE =
    'Kirim link YouTube.\nContoh: *.ytmp4 https://youtu.be/xxxx --720*\n' +
    'Resolusi: 144, 240, 360 (default), 480, 720, 1080.\n' +
    'Cadangan lewat scraper: *.ytv2*';

export default {
    name: 'ytmp4',
    aliases: ['ytvideo', 'ytdl'],
    description: 'Download video YouTube (yt-dlp)',
    category: 'Downloader',
    execute: async (sock, m, args) => {
        const resFlag = args.find((arg) => /^--\d+p?$/.test(arg));
        const url = args.find((arg) => arg !== resFlag);
        if (!url) return m.reply(USAGE);
        if (!isYouTubeUrl(url)) return m.reply(`❌ Itu bukan link YouTube.\n\n${USAGE}`);

        const height = pickHeight(resFlag ? resFlag.replace(/\D/g, '') : undefined);
        await m.react('⏳');

        let queued = false;
        const onQueueStatus = async (position) => {
            if (position > 0 && !queued) {
                queued = true;
                await m
                    .reply(`⏳ Masuk antrean downloader. Posisi kamu: *#${position}*.`)
                    .catch(() => {});
            }
        };

        const task = async () => {
            const video = await downloadYouTubeVideo(url, { height });
            const buffer = await optimizeVideoForWa(video.buffer);
            const quality = video.height ? `${video.height}p` : `≤${height}p`;
            await sock.sendMessage(
                m.chat,
                {
                    video: buffer,
                    mimetype: 'video/mp4',
                    caption: `🎬 *YouTube Downloaded*\n\nJudul: ${video.title}\nKualitas: ${quality}`,
                    fileName: `${video.title}.mp4`,
                },
                { quoted: m }
            );
            await m.react('✅');
        };

        try {
            await videoQueue.push(task, onQueueStatus);
        } catch (err) {
            logger.error(`[ytmp4] ${err.message}`, 'YTMP4');
            await m.react('❌');
            await m.reply(
                `❌ Gagal mengunduh video: ${err.message || 'Unknown error'}\n\n` +
                    'Coba resolusi lebih kecil, atau pakai cadangan: *.ytv2 <link>*'
            );
        }
    },
};

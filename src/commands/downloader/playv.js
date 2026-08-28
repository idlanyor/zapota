import { downloadYouTubeYtmp3 } from '../../lib/ytmp3Mobi.js';
import { videoQueue } from '../../lib/queue.js';
import { searchYouTube } from '../../lib/youtubeSearch.js';
import logger from '../../utils/logger.js';

const safeFileName = (value) => value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);

export default {
    name: 'playv',
    aliases: ['playvideo', 'pv'],
    description: 'Cari dan mainkan video YouTube via YTmp3',
    category: 'Downloader',
    execute: async (sock, m, args, text) => {
        if (!text)
            return m.reply('Kirim judul lagu atau link YouTube.\nContoh: *.playv 12 seconds*');

        const resolutionFlag = args.find((arg) => /^--\d+$/.test(arg));
        const cleanQuery = resolutionFlag ? text.replace(resolutionFlag, '').trim() : text.trim();
        await m.react('⏳').catch(() => {});

        try {
            const [video] = await searchYouTube(cleanQuery, 1);
            if (!video) throw new Error('Video tidak ditemukan.');

            let statusMessage = null;
            const onQueueStatus = async (position) => {
                try {
                    if (position > 0 && !statusMessage) {
                        statusMessage = await m.reply(
                            `Masuk antrean downloader. Posisi: *#${position}*.`
                        );
                    }
                } catch (err) {
                    logger.warn(`Gagal mengirim status antrean: ${err.message}`, 'PLAYV');
                }
            };

            const task = async () => {
                if (!statusMessage) {
                    statusMessage = await m.reply(`Mengonversi video "${video.title}"...`);
                }

                const data = await downloadYouTubeYtmp3(video.url, 'mp4');
                const videoTitle = data.title || video.title;
                const requestedQuality = resolutionFlag
                    ? '\n*Catatan:* YTmp3 menentukan kualitas secara otomatis.'
                    : '';
                const caption =
                    `*YouTube Video*\n\n` +
                    `*Title:* ${videoTitle}\n` +
                    `*Channel:* ${video.author.name}\n` +
                    `*Duration:* ${video.timestamp}\n` +
                    `*Source:* YTmp3${requestedQuality}`;

                await sock.sendMessage(
                    m.chat,
                    {
                        video: { url: data.url },
                        mimetype: 'video/mp4',
                        caption: caption.slice(0, 1000),
                        fileName: `${safeFileName(videoTitle)}.mp4`,
                    },
                    { quoted: m }
                );
                await m.react('✅').catch(() => {});
            };

            await videoQueue.push(task, onQueueStatus);
        } catch (err) {
            logger.error(err, 'PLAYV');
            await m.react('❌').catch(() => {});
            await m.reply(`Gagal memproses video: ${err.message || 'Unknown error'}`);
        }
    },
};

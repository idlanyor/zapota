import { downloadYouTubeVideo, isYouTubeUrl, pickHeight } from '../../lib/ytdlp.js';
import { optimizeVideoForWa } from '../../lib/videoHelper.js';
import { videoQueue } from '../../lib/queue.js';
import { searchYouTube } from '../../lib/youtubeSearch.js';
import logger from '../../utils/logger.js';

const safeFileName = (value) => value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);

export default {
    name: 'playv',
    aliases: ['playvideo', 'pv'],
    description: 'Cari dan putar video YouTube (yt-dlp)',
    category: 'Downloader',
    execute: async (sock, m, args, text) => {
        if (!text)
            return m.reply(
                'Kirim judul atau link YouTube.\nContoh: *.playv 12 seconds* atau *.playv 12 seconds --720*'
            );

        const resolutionFlag = args.find((arg) => /^--\d+p?$/.test(arg));
        const query = resolutionFlag ? text.replace(resolutionFlag, '').trim() : text.trim();
        const height = pickHeight(resolutionFlag ? resolutionFlag.replace(/\D/g, '') : undefined);
        await m.react('⏳').catch(() => {});

        try {
            let video = { url: query };
            if (!isYouTubeUrl(query)) {
                [video] = await searchYouTube(query, 1);
                if (!video) throw new Error('Video tidak ditemukan.');
            }

            let queued = false;
            const onQueueStatus = async (position) => {
                if (position > 0 && !queued) {
                    queued = true;
                    await m
                        .reply(`⏳ Masuk antrean downloader. Posisi: *#${position}*.`)
                        .catch(() => {});
                }
            };

            const task = async () => {
                const result = await downloadYouTubeVideo(video.url, { height });
                const buffer = await optimizeVideoForWa(result.buffer);
                const title = result.title || video.title;
                const caption =
                    `*YouTube Video*\n\n` +
                    `*Judul:* ${title}\n` +
                    (video.author?.name ? `*Channel:* ${video.author.name}\n` : '') +
                    (video.timestamp ? `*Durasi:* ${video.timestamp}\n` : '') +
                    `*Kualitas:* ${result.height ? `${result.height}p` : `≤${height}p`}`;

                await sock.sendMessage(
                    m.chat,
                    {
                        video: buffer,
                        mimetype: 'video/mp4',
                        caption: caption.slice(0, 1000),
                        fileName: `${safeFileName(title)}.mp4`,
                    },
                    { quoted: m }
                );
                await m.react('✅').catch(() => {});
            };

            await videoQueue.push(task, onQueueStatus);
        } catch (err) {
            logger.error(`[playv] ${err.message}`, 'PLAYV');
            await m.react('❌').catch(() => {});
            await m.reply(`❌ Gagal memproses video: ${err.message || 'Unknown error'}`);
        }
    },
};

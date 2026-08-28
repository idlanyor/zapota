import axios from 'axios';
import * as cheerio from 'cheerio';
import { checkOwner } from '../../middlewares/auth.js';
import { getCachedSettings } from '../../handlers/messageFlow.js';

const CMD_ALIAS = 'xanohimitahananonamaewobokutachiwamadashiranai';
const FALLBACK_PP = 'https://files.catbox.moe/uovwz0.jpg';

async function xnxxSearch(query) {
    const page = Math.floor(3 * Math.random()) + 1;
    const url = `https://www.xnxx.com/search/${encodeURIComponent(query)}/${page}`;
    const resp = await axios.get(url, {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 30000,
    });
    const $ = cheerio.load(resp.data);
    const results = [];

    $('div[id*="video"]').each((_, bkp) => {
        const title = $(bkp).find('.thumb-under p:nth-of-type(1) a').text().trim();
        const views = $(bkp)
            .find('.thumb-under p.metadata span.right')
            .contents()
            .not('span.superfluous')
            .text()
            .trim();
        const resolution = $(bkp)
            .find('.thumb-under p.metadata span.video-hd')
            .contents()
            .not('span.superfluous')
            .text()
            .trim();
        const duration = $(bkp)
            .find('.thumb-under p.metadata')
            .contents()
            .not('span')
            .text()
            .trim();
        const cover =
            $(bkp).find('.thumb-inside .thumb img').attr('data-src') ||
            $(bkp).find('.thumb-inside .thumb img').attr('src');
        const href = $(bkp).find('.thumb-inside .thumb a').attr('href');
        if (!href) return;
        const fixed = href.replace('/THUMBNUM/', '/');
        const link = `https://xnxx.com${fixed}`;
        results.push({ title, views, resolution, duration, cover, url: link });
    });
    return results;
}

async function xnxxDownload(url) {
    const resp = await axios.get(url, {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        },
        timeout: 30000,
    });
    const $ = cheerio.load(resp.data);

    // Aggregate all scripts for robust parsing
    const scripts = $('script')
        .map((_, el) => $(el).html() || '')
        .get()
        .join('\n');
    const extract = (re) => {
        const m = scripts.match(re);
        return m ? m[1] : undefined;
    };

    const videos = {
        low: extract(/html5player\.setVideoUrlLow\('(.*?)'\);/),
        high: extract(/html5player\.setVideoUrlHigh\('(.*?)'\);/),
        HLS: extract(/html5player\.setVideoHLS\('(.*?)'\);/),
    };
    const thumb = extract(/html5player\.setThumbUrl\('(.*?)'\);/);
    const title = $('title').text().trim();

    return { videos, thumb, title };
}

export default {
    name: 'xiykyk',
    aliases: [CMD_ALIAS],
    category: 'Hidden',
    description: 'Private command for search and download.',
    execute: async (sock, m, args, text) => {
        try {
            const botSettings = await getCachedSettings();
            const isOwner = checkOwner(m, sock, botSettings);
            if (!isOwner) {
                await m.reply('❌ Akses Ditolak. Perintah ini hanya untuk Owner.');
                return;
            }

            let query = text || '';

            if (!query) {
                await m.reply(
                    `🔒 Private Command\n\n` +
                        `Usage:\n.xiykyk <query|url> [--low|--high]\n\n` +
                        `Examples:\n.xiykyk japanese\n.xiykyk https://www.xnxx.com/video-xxxxxxxx/slug --high`
                );
                return;
            }

            // Detect flags
            let quality = 'high';
            if (query.includes('--low')) quality = 'low';
            if (query.includes('--high')) quality = 'high';
            query = query.replace(/--low|--high/g, '').trim();

            // Show processing reaction
            await m.react('⏳');

            // Decide search or download
            if (!query.includes('xnxx.com')) {
                const results = await xnxxSearch(query);
                if (!results.length) {
                    await m.react('❌');
                    await m.reply('❌ Tidak ditemukan hasil. Coba kata kunci lain.');
                    return;
                }

                const top = results.slice(0, 10);
                let msg = `🔎 Hasil Pencarian (${query})\n\n`;
                top.forEach((r, i) => {
                    msg +=
                        `${i + 1}. ${r.title}\n` +
                        `   ⏱ ${r.duration} • 👁️ ${r.views} • ${r.resolution || '-'}\n` +
                        `   🔗 ${r.url}\n\n`;
                });
                msg += `Gunakan:\n.xiykyk <url> untuk mengunduh.`;

                await m.reply(msg);
                await m.react('✅');
                return;
            }

            // Download flow
            const info = await xnxxDownload(query);
            const url = info.videos[quality] || info.videos.high || info.videos.low;
            if (!url) {
                await m.react('❌');
                await m.reply('❌ Gagal mengambil URL video (mungkin hanya HLS tersedia).');
                return;
            }

            const caption =
                `✅ Download via Kanata Bot\n` +
                `${info.title || 'Video'}\n` +
                `Quality: ${quality.toUpperCase()}`;

            await sock.sendMessage(
                m.chat,
                {
                    document: { url },
                    fileName: `${(info.title || 'video').replace(/[^a-z0-9\s\-_\.]/gi, ' ').slice(0, 60)}.mp4`,
                    mimetype: 'video/mp4',
                    caption,
                },
                { quoted: m }
            );

            await m.react('✅');
        } catch (error) {
            console.error('Error in xiykyk handler:', error);
            await m.react('❌');
            await m.reply(`❌ Gagal memproses permintaan. ${error.message}`);
        }
    },
};

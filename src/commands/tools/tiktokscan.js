import puppeteer from 'puppeteer';
import logger from '../../utils/logger.js';
import { settings } from '../../config/settings.js';

const getTikTokProfileVideos = async (username) => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        const page = await browser.newPage();
        const url = username.startsWith('http')
            ? username
            : `https://www.tiktok.com/@${username.replace('@', '')}`;

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        );
        await page.goto(url, { waitUntil: 'networkidle2' });

        logger.info(`Scanning profile: ${url}...`, 'SCRAPER');

        let prevHeight = -1;
        let maxScrolls = 10;
        let scrolls = 0;

        while (scrolls < maxScrolls) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const newHeight = await page.evaluate(() => document.body.scrollHeight);
            if (newHeight === prevHeight) break;
            prevHeight = newHeight;
            scrolls++;
        }

        const videos = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a'));
            return anchors
                .map((a) => a.href)
                .filter((href) => href.includes('/video/'))
                .filter((v, i, a) => a.indexOf(v) === i);
        });

        await browser.close();
        return videos;
    } catch (error) {
        await browser.close();
        logger.error(error, 'TikTok Scraper Error');
        return [];
    }
};

export default {
    name: 'tiktokscan',
    aliases: ['ttscan'],
    description: 'Scan all video links from a TikTok profile (Owner Only)',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        const isOwner = m.sender === settings.ownerNumber || m.sender === settings.ownerLid;
        if (!isOwner) return;

        const target = args[0];
        if (!target)
            return m.reply(
                'Masukkan username TikTok atau link profil!\nContoh: .ttscan @soffymedicallambulnce21'
            );

        await m.react('⏳');

        const videos = await getTikTokProfileVideos(target);

        if (videos.length === 0) {
            await m.react('❌');
            return m.reply(
                'Gagal mendapatkan video. Pastikan akun tidak privat atau coba lagi nanti.'
            );
        }

        let resMsg = `*── 「 TIKTOK SCANNER 」 ──*\n\n`;
        resMsg += `➛ *Target:* ${target}\n`;
        resMsg += `➛ *Total Video:* ${videos.length}\n\n`;

        resMsg += videos.join('\n');

        await m.reply(resMsg);
        await m.react('✅');
    },
};

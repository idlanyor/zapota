import { createPage } from '../../lib/browserManager.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'ssweb',
    aliases: ['ssweb', 'screenshot', 'webss'],
    description: 'Take a screenshot of a website',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        if (!text) {
            return sock.sendMessage(
                m.chat,
                {
                    text: `Please provide a URL.\nExample: ${settings.prefix}ssweb https://google.com`,
                },
                { quoted: m }
            );
        }

        let url = text.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        await m.react('⏳');

        let page;
        try {
            page = await createPage();

            // Set viewport to a reasonable desktop size
            await page.setViewport({ width: 1280, height: 720 });

            // Go to URL and wait for network to be idle
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

            const screenshot = await page.screenshot({
                type: 'png',
                fullPage: false,
                omitBackground: true,
            });
            const screenshotBuffer = Buffer.from(screenshot);

            if (!screenshotBuffer.length) {
                throw new Error('Screenshot result is empty.');
            }

            await sock.sendMessage(
                m.chat,
                {
                    image: screenshotBuffer,
                    mimetype: 'image/png',
                    caption: `Screenshot of: ${url}`,
                },
                { quoted: m }
            );
            await m.react('✅');
        } catch (error) {
            console.error('Error in ssweb command:', error);
            await m.react('❌');
            await sock.sendMessage(
                m.chat,
                { text: `Failed to take screenshot.\nError: ${error.message}` },
                { quoted: m }
            );
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch (e) {
                    console.error('Error closing page:', e);
                }
            }
        }
    },
};

import stickerly from '../../lib/stickerly.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'stsearch',
    aliases: ['stickersearch', 'slysearch'],
    description: 'Search sticker packs on Sticker.ly',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply(`Usage: ${settings.prefix}stsearch <query>`);

        await m.react('⏳');

        try {
            const results = await stickerly.search(text);
            if (results.length === 0) {
                await m.react('❌');
                return m.reply('No results found.');
            }

            let msg = `Sticker.ly Search Results for: ${text}\n\n`;
            results.slice(0, 10).forEach((p, i) => {
                msg += `${i + 1}. *${p.name}*\n`;
                msg += `   Author: ${p.author}\n`;
                msg += `   Count: ${p.stickerCount}\n`;
                msg += `   URL: ${p.url}\n\n`;
            });

            msg += `Use ${settings.prefix}stget <URL> to get the pack.`;
            await m.reply(msg);
            await m.react('✅');
        } catch (error) {
            console.error('STSearch Error:', error);
            await m.react('❌');
            await m.reply(`Error: ${error.message}`);
        }
    },
};

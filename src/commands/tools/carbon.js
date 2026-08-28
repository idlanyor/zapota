import { post } from '../../lib/api.js';
import { settings } from '../../config/settings.js';
import logger from '../../utils/logger.js';

export default {
    name: 'carbon',
    aliases: ['carbonize', 'codeimg'],
    description: 'Create a beautiful image of your code using Carbon',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        if (!text && !m.quoted?.text) {
            return sock.sendMessage(
                m.chat,
                {
                    text: `Please provide the code or reply to a message.
Example: ${settings.prefix}carbon logger.info("Hello World")

You can also use flags:
--lang <language>
--theme <theme>
--bg <color>`,
                },
                { quoted: m }
            );
        }

        let code = m.quoted ? m.quoted.text : m.body.slice(m.arg[0].length).trim();
        let lang = 'auto';
        let theme = 'Dracula';
        let bg = '#abb8c3';

        // Simple flag parsing from the code string
        const langMatch = code.match(/(?:^|\s)--lang\s+(\S+)/);
        if (langMatch) {
            lang = langMatch[1];
            code = code.replace(langMatch[0], '').trim();
        }

        const themeMatch = code.match(/(?:^|\s)--theme\s+(\S+)/);
        if (themeMatch) {
            theme = themeMatch[1];
            code = code.replace(themeMatch[0], '').trim();
        }

        const bgMatch = code.match(/(?:^|\s)--bg\s+(\S+)/);
        if (bgMatch) {
            bg = bgMatch[1];
            code = code.replace(bgMatch[0], '').trim();
        }

        if (!code) {
            return m.reply('No code found to carbonize.');
        }

        await m.react('⏳');

        try {
            const buffer = await post(
                '/carbon',
                {
                    code,
                    lang,
                    theme,
                    bg,
                },
                {
                    responseType: 'arraybuffer',
                    headers: {
                        accept: 'image/png',
                        'Content-Type': 'application/json',
                    },
                }
            );

            await sock.sendMessage(
                m.chat,
                {
                    image: Buffer.from(buffer),
                    caption: `Carbonized Code (${lang})`,
                },
                { quoted: m }
            );
            await m.react('✅');
        } catch (error) {
            logger.error('Error in carbon command:', error);
            await m.react('❌');
            await m.reply(`Failed to generate Carbon image.
Error: ${error.message}`);
        }
    },
};

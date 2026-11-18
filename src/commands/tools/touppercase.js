import { settings } from '../../config/settings.js';

export default {
    name: 'touppercase',
    aliases: [],
    description: 'Ubah seluruh teks pesan atau reply menjadi huruf kapital',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        // Remove only the command and one separator; preserve the original formatting.
        const inlineText = typeof m.body === 'string' ? m.body.replace(/^\s*\S+\s?/, '') : text;
        const input = m.quoted?.text || inlineText || '';

        if (!input.trim()) {
            return m.reply(
                `Kirim ${settings.prefix}touppercase <teks> atau reply pesan teks dengan ${settings.prefix}touppercase.`
            );
        }

        return m.reply(input.toUpperCase());
    },
};

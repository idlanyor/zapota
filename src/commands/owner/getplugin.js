import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import logger from '../../utils/logger.js';

export default {
    name: 'getplugin',
    aliases: ['gp'],
    category: 'Owner',
    description: 'Tampilkan source plugin sebagai teks biasa',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Masukkan nama plugin. Contoh: `.gp testbutton`');

        const commandsDir = path.join(process.cwd(), 'src/commands');
        const query = text.trim().replace(/\.js$/i, '');

        try {
            const files = await glob(`**/${query}.js`, {
                cwd: commandsDir,
                absolute: true,
            });

            if (files.length === 0) {
                return m.reply(`Plugin '${text}' tidak ditemukan.`);
            }

            const fileToRead = files[0];
            const content = fs.readFileSync(fileToRead, 'utf8');

            await m.reply(content);
        } catch (error) {
            logger.error(error, 'Get Plugin Error');
            await m.reply(`Gagal menampilkan plugin: ${error.message}`);
        }
    },
};

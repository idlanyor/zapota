import { settings } from '../../config/settings.js';
import logger from '../../utils/logger.js';

export default {
    name: 'inspect-m',
    aliases: ['debugm', 'checkm'],
    description: 'Debug message object (m) to console',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        logger.info('--- [ DEBUG MESSAGE OBJECT (m) ] ---');

        // Kita gunakan util.inspect agar object nested terlihat jelas dan tidak circular error
        const util = await import('util');
        logger.info(util.inspect(m, { showHidden: false, depth: 3, colors: true }));

        logger.info('--- [ END OF DEBUG ] ---');

        await m.reply('✅ Struktur object `m` sudah dikirim ke console log server.');
    },
};

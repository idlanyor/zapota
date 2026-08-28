import util from 'util';
import logger from '../../utils/logger.js';

export default {
    name: 'inspect',
    aliases: ['m', 'debug-m'],
    description: 'Mengintip isi objek m (Serialized Message)',
    category: 'Owner',
    execute: async (sock, m, args) => {
        // Kita hanya cetak ke console karena objeknya sangat besar dan berputar (circular)
        // Jika dikirim ke WhatsApp, bisa menyebabkan bot hang/crash
        logger.info('─── [ DEBUG OBJECT M ] ───');

        // Menggunakan util.inspect agar properti non-enumerable dan depth terlihat jelas
        logger.info(
            util.inspect(m, {
                depth: 1, // Kita set depth 1 dulu agar tidak terlalu panjang, naikkan jika ingin lebih detail
                colors: true,
                showProxy: true,
            })
        );

        logger.info('─── [ END OF DEBUG ] ───');

        await m.reply(
            '✅ Isi objek `m` telah dicetak ke terminal PM2. Silakan cek dengan perintah `pm2 logs`.'
        );
    },
};

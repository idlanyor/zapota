import fs from 'fs';

export default {
    name: 'vnote',
    description: 'Mengirim Video Note (Circular Video)',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        const quoted = m.quoted ? m.quoted : m;
        const mime = (quoted.msg || quoted).mimetype || '';

        if (!/video/.test(mime)) return m.reply('Balas video yang ingin dijadikan Video Note!');

        await m.react('⏳');

        try {
            const buffer = await m.downloadMediaMessage(quoted);

            await sock.sendMessage(
                m.chat,
                {
                    video: buffer,
                    ptv: true, // Fitur Kanata-Baileys: Otomatis jadi Video Note
                },
                { quoted: m }
            );
            await m.react('✅');
        } catch (err) {
            console.error(err);
            await m.react('❌');
            await m.reply('Gagal mengirim Video Note.');
        }
    },
};

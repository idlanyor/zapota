import { setAfk } from '../../services/afkService.js';

export default {
    name: 'afk',
    aliases: ['setafk', 'away'],
    description: 'Mengaktifkan status AFK (Away From Keyboard)',
    category: 'General',
    execute: async (sock, m, args, text) => {
        const sender = m.sender;
        const pushName = m.pushName || sender.split('@')[0];
        const reason = text.trim() || 'Tanpa alasan';

        await setAfk(sender, reason, pushName);

        const responseText =
            `💤 *STATUS AFK DIAKTIFKAN* 💤\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `👤 *User:* @${sender.split('@')[0]}\n` +
            `📝 *Alasan:* ${reason}\n\n` +
            `_Bot akan memberitahu siapa saja yang memanggil / mention Anda bahwa Anda sedang AFK._\n` +
            `_Kirim pesan apa saja untuk menonaktifkan status AFK._`;

        await m.reply(responseText, { mentions: [sender] });
    },
};

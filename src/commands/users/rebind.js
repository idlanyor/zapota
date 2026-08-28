import User from '../../database/models/User.js';

export default {
    name: 'rebind',
    aliases: ['bindpn', 'updateno'],
    description: 'Sinkronisasi nomor WhatsApp ke database',
    category: 'Users',
    execute: async (sock, m, args, text) => {
        // Ambil nomor WA dari remoteJidAlt (PN)
        const pnJid = m.key.remoteJidAlt;

        if (!pnJid || !pnJid.includes('@s.whatsapp.net')) {
            return m.reply(
                '❌ Gagal mendeteksi nomor WhatsApp asli kamu. Pastikan kamu tidak mengirim pesan dari nomor yang sama dengan bot.'
            );
        }

        const phoneNumber = pnJid.split('@')[0];

        try {
            let user = await User.findOne({ jid: m.sender });

            if (!user) {
                user = await User.create({
                    jid: m.sender,
                    name: m.pushName || '',
                });
            }

            user.phoneNumber = phoneNumber;
            await user.save();

            await m.reply(
                `✅ *REBIND BERHASIL*\n\n` +
                    `*ID (LID):* ${m.sender}\n` +
                    `*Nomor WA:* ${phoneNumber}\n\n` +
                    `Data kamu sekarang sudah tersinkronisasi di dashboard web.`
            );
        } catch (err) {
            console.error('Rebind Error:', err);
            await m.reply('❌ Terjadi kesalahan saat melakukan rebind.');
        }
    },
};

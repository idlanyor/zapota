export default {
    name: 'invadmin',
    aliases: ['admininvite'],
    description: 'Undang admin ke Saluran/Newsletter (WA Beta Feature)',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Format: .invadmin JID_Saluran | Nama_Saluran | Caption');

        const [jid, name, cap] = text.split('|').map((v) => v.trim());
        if (!jid || !name) return m.reply('JID dan Nama Saluran wajib diisi!');

        try {
            // Expire dalam 7 hari
            const expire = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;

            await sock.sendMessage(m.chat, {
                newsletterAdminInvite: {
                    newsletterJid: jid.includes('@newsletter') ? jid : `${jid}@newsletter`,
                    newsletterName: name,
                    caption: cap || 'Ayo jadi admin saluran kami!',
                    inviteExpiration: expire,
                },
            });

            m.reply(' Undangan admin saluran berhasil dikirim!');
        } catch (err) {
            console.error(err);
            m.reply('Gagal mengirim undangan. Pastikan fitur Saluran sudah aktif.');
        }
    },
};

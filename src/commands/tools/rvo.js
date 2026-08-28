export default {
    name: 'rvo',
    aliases: ['readviewonce', 'lihat'],
    description: 'Ambil/Download media dari pesan View Once (Sekali Lihat)',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        if (!m.quoted || !m.quoted.isViewOnce) {
            return m.reply(
                ' Balas pada pesan *Sekali Lihat* (gambar/video/audio) untuk mengambil datanya.'
            );
        }

        await m.react('');

        try {
            const buffer = await m.quoted.download();
            const caption = m.quoted.text
                ? `*Read View Once Success*\n\n*Caption:* ${m.quoted.text}`
                : `*Read View Once Success*`;

            if (m.quoted.isImage || m.quoted.mtype === 'imageMessage') {
                await sock.sendMessage(m.chat, { image: buffer, caption }, { quoted: m });
            } else if (m.quoted.isVideo || m.quoted.mtype === 'videoMessage') {
                await sock.sendMessage(m.chat, { video: buffer, caption }, { quoted: m });
            } else if (m.quoted.isAudio || m.quoted.mtype === 'audioMessage') {
                const isPtt = m.quoted.msg?.ptt || false;
                await sock.sendMessage(
                    m.chat,
                    {
                        audio: buffer,
                        mimetype: 'audio/mpeg',
                        ptt: isPtt,
                    },
                    { quoted: m }
                );
            } else {
                return m.reply(` Tipe media (${m.quoted.mtype}) tidak didukung.`);
            }

            await m.react('');
        } catch (err) {
            console.error('RVO Error:', err);
            await m.reply(` Gagal mengambil media: ${err.message}`);
            await m.react('');
        }
    },
};

import logger from '../../utils/logger.js';

export default {
    name: 'rvo',
    aliases: ['readviewonce', 'lihat'],
    description: 'Ambil/Download media dari pesan View Once (Sekali Lihat)',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        if (!m.quoted || !m.quoted.isViewOnce) {
            return m.reply(
                '⚠️ Balas pada pesan *Sekali Lihat* (gambar/video/audio) untuk mengambil datanya.'
            );
        }

        // WhatsApp may deliver a view-once to linked devices (which this bot is)
        // without its media key; then there is nothing to download.
        if (!m.quoted.mediaKey || !m.quoted.directPath) {
            logger.warn(
                `RVO: quoted ${m.quoted.mtype} has no media key/path; fields: ${Object.keys(
                    m.quoted
                )
                    .filter((k) => typeof m.quoted[k] !== 'function')
                    .join(',')}`
            );
            await m.react('❌');
            return m.reply(
                '❌ Media sekali lihat ini tidak bisa diambil: WhatsApp tidak mengirim ' +
                    'kunci medianya ke bot (perangkat tertaut).'
            );
        }

        await m.react('⏳');

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
                        mimetype:
                            m.quoted.mimetype || (isPtt ? 'audio/ogg; codecs=opus' : 'audio/mpeg'),
                        ptt: isPtt,
                    },
                    { quoted: m }
                );
            } else {
                return m.reply(`❌ Tipe media (${m.quoted.mtype}) tidak didukung.`);
            }

            await m.react('✅');
        } catch (err) {
            console.error('RVO Error:', err);
            await m.reply(`❌ Gagal mengambil media: ${err.message}`);
            await m.react('❌');
        }
    },
};

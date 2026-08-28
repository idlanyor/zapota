import logger from '../../utils/logger.js';
export default {
    name: 'ceknews',
    description: 'Cek metadata newsletter via link',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        const link = text || 'https://whatsapp.com/channel/0029VagADOLLSmbaxFNswH1m';
        const code = link.split('/').pop();

        try {
            m.reply(` Menarik data Saluran untuk kode: ${code}...`);
            const metadata = await sock.newsletterMetadata('invite', code);
            const tm = metadata.thread_metadata;

            let resText = ` *Metadata Saluran*\n\n`;
            resText += `➛ *Nama:* ${tm?.name?.text || 'Gak tau'}\n`;
            resText += `➛ *JID:* ${metadata.id}\n`;
            resText += `➛ *Subscriber:* ${tm?.subscribers_count || 'Hidden'}\n`;
            resText += `➛ *Status:* ${metadata.state?.type || '-'}\n`;
            resText += `➛ *Role Lu:* ${metadata.viewer_metadata?.role || 'Guest'}\n\n`;
            resText += `➛ *Deskripsi:* \n${tm?.description?.text || '-'}`;

            m.reply(resText);
            logger.info('[DEBUG] Newsletter Metadata:', metadata);
        } catch (err) {
            logger.error(err);
            m.reply(` Gagal mendapatkan metadata. Pesan: ${err.message}`);
        }
    },
};

import fs from 'fs';
import logger from '../../utils/logger.js';

export default {
    name: 'listimg',
    description: 'Mengirim List Message dengan Gambar',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        // Gunakan gambar lokal maskot.jpeg
        const imageBuffer = fs.readFileSync('./maskot.jpeg');

        const sections = [
            {
                title: 'MENU BOT UTAMA',
                rows: [
                    { title: 'Ping', id: '.ping', description: 'Cek kecepatan bot' },
                    { title: 'Menu', id: '.menu', description: 'Tampilkan perintah' },
                ],
            },
            {
                title: 'MENU EKSPERIMENTAL',
                rows: [
                    { title: 'Vnote', id: '.vnote', description: 'Kirim video note' },
                    { title: 'Button', id: '.button', description: 'Tes tombol' },
                ],
            },
        ];

        const interactiveMessage = {
            header: {
                title: ' KANATA MULTIMEDIA',
                subtitle: 'List with Image',
                hasMediaAttachment: true,
                image: imageBuffer, // Fitur Kanata-Baileys: Bisa masukin buffer langsung di header!
            },
            body: {
                text: 'Halo! Ini adalah List Menu dengan Header Gambar yang ditarik dari core library.',
            },
            footer: {
                text: 'Power by Kanata-Baileys',
            },
            nativeFlowMessage: {
                buttons: [
                    {
                        name: 'single_select',
                        buttonParamsJson: JSON.stringify({
                            title: 'Pilih Menu Gambar',
                            sections: sections,
                        }),
                    },
                ],
            },
        };

        try {
            await sock.sendMessage(
                m.chat,
                {
                    interactive: interactiveMessage,
                    viewOnce: true,
                },
                { quoted: m }
            );
            logger.info(`[DEBUG] List image message with AdReply sent.`);
        } catch (err) {
            logger.error('[ERROR] Failed to send list image:', err);
            m.reply('Gagal mengirim List Gambar.');
        }
    },
};

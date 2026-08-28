import Server from '../../database/models/Server.js';
import { settings } from '../../config/settings.js';
import axios from 'axios';

const PTERO_URL = process.env.PTERO_URL;
const PTERO_API_KEY = process.env.PTERO_API_KEY;

const ptero = axios.create({
    baseURL: `${PTERO_URL}/api/application`,
    headers: {
        Authorization: `Bearer ${PTERO_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'Application/vnd.pterodactyl.v1+json',
    },
});

export default {
    name: 'delsrv',
    aliases: ['deleteserver', 'hapusserver'],
    description: 'Delete a server from Panel and Database (Owner only)',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        const id = args[0];
        const force = args.includes('--force');

        if (!id) {
            return m.reply(`*Format Salah!*

Gunakan:
• ${settings.prefix}delsrv <id/identifier> [--force]

Contoh:
• ${settings.prefix}delsrv 14`);
        }

        try {
            // 1. Cari data server
            let srv = await Server.findOne({ $or: [{ pteroId: id }, { identifier: id }] });
            let pteroId = srv ? srv.pteroId : isNaN(id) ? null : id;

            if (!pteroId && isNaN(id)) {
                try {
                    const resp = await ptero.get(`/servers?filter[identifier]=${id}`);
                    if (resp.data.data.length > 0) {
                        pteroId = resp.data.data[0].attributes.id;
                        if (!srv) srv = resp.data.data[0].attributes;
                    }
                } catch (e) {
                    /* ignore */
                }
            }

            if (!pteroId) {
                return m.reply('Server tidak ditemukan di database maupun panel.');
            }

            // 2. Kirim Pesan Konfirmasi
            const confirmMsg =
                `*KONFIRMASI PENGHAPUSAN SERVER*\n\n` +
                `ID: ${pteroId}\n` +
                `Name: ${srv?.planName || srv?.name || 'Unknown'}\n` +
                `Identifier: ${srv?.identifier || id}\n` +
                `Force Mode: ${force ? 'AKTIF' : 'NONAKTIF'}\n\n` +
                `⚠️ *PERINGATAN:* Tindakan ini tidak dapat dibatalkan.\n` +
                `Balas pesan ini dengan mengetik *Y* untuk melanjutkan penghapusan. (Waktu: 30 detik)`;

            const sent = await m.reply(confirmMsg);

            // Simpan state konfirmasi ke global agar bisa ditangkap messageHandler
            if (!global.confirmDelete) global.confirmDelete = new Map();
            global.confirmDelete.set(m.sender, {
                pteroId,
                force,
                timeout: setTimeout(() => {
                    if (global.confirmDelete.has(m.sender)) {
                        global.confirmDelete.delete(m.sender);
                        // Optional: kirim pesan timeout
                    }
                }, 30000),
            });
        } catch (error) {
            console.error(error);
            await m.reply(`Error: ${error.message}`);
        }
    },
};

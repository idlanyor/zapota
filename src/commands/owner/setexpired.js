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
    name: 'setexpired',
    aliases: ['setexp', 'setmasaaktif'],
    description: 'Set, list, or sync server expiration (Owner only)',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        const sub = args[0]?.toLowerCase();

        // Fitur 1: List Server
        if (sub === 'list') {
            const servers = await Server.find({}).sort({ expiredAt: 1 });
            if (servers.length === 0)
                return m.reply(
                    `Belum ada data server di database bot. Gunakan ${settings.prefix}setexpired sync untuk mengambil data dari panel.`
                );

            let msg = `*DAFTAR MASA AKTIF SERVER*\n\n`;
            servers.forEach((srv, i) => {
                const now = new Date();
                const remains = Math.ceil((srv.expiredAt - now) / (1000 * 60 * 60 * 24));
                const status = remains <= 0 ? '❌ EXPIRED' : `✅ ${remains} Hari lagi`;

                msg += `${i + 1}. *${srv.planName}*\n`;
                msg += `   ID: ${srv.pteroId} | Identifier: ${srv.identifier}\n`;
                msg += `   Owner: @${srv.userId.split('@')[0]}\n`;
                msg += `   Expired: ${srv.expiredAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}\n`;
                msg += `   Status: ${status}\n`;
                msg += `--------------------------\n`;
            });

            return sock.sendMessage(
                m.chat,
                { text: msg, mentions: servers.map((s) => s.userId) },
                { quoted: m }
            );
        }

        // Fitur 2: Sync Server dari Panel
        if (sub === 'sync') {
            await m.react('⏳');
            try {
                // Ambil semua server & user dari panel
                const [serversResp, usersResp] = await Promise.all([
                    ptero.get('/servers'),
                    ptero.get('/users'),
                ]);

                const pteroServers = serversResp.data.data;
                const pteroUsers = usersResp.data.data;
                let addedCount = 0;

                for (const srvData of pteroServers) {
                    const s = srvData.attributes;

                    // Cek apakah sudah ada di DB
                    const exists = await Server.findOne({ pteroId: s.id });
                    if (!exists) {
                        const owner = pteroUsers.find((u) => u.attributes.id === s.user);
                        const userJid = owner?.attributes.external_id || 'unknown';

                        const defaultExpired = new Date();
                        defaultExpired.setDate(defaultExpired.getDate() + 30); // Default 30 hari dari sekarang

                        await Server.create({
                            userId: userJid,
                            pteroId: s.id,
                            identifier: s.identifier,
                            planName: s.name,
                            price: 0,
                            expiredAt: defaultExpired,
                        });
                        addedCount++;
                    }
                }

                await m.react('✅');
                return m.reply(
                    `Selesai! Berhasil mensinkronisasi ${addedCount} server baru ke database bot.\n\nSekarang gunakan .setexpired list untuk melihat hasilnya.`
                );
            } catch (e) {
                console.error(e);
                await m.react('❌');
                return m.reply(`Gagal sinkronisasi: ${e.message}`);
            }
        }

        // Fitur 3: Set Expired Manual
        const id = args[0];
        const dateInput = args[1];

        if (!id || !dateInput || dateInput.length !== 6) {
            return m.reply(
                `*Format Salah!*\n\n` +
                    `Gunakan:\n` +
                    `• ${settings.prefix}setexpired list (Melihat daftar)\n` +
                    `• ${settings.prefix}setexpired sync (Ambil semua server dari panel)\n` +
                    `• ${settings.prefix}setexpired <id/identifier> <DDMMYY> (Set expired)`
            );
        }

        const day = parseInt(dateInput.substring(0, 2));
        const month = parseInt(dateInput.substring(2, 4)) - 1;
        const year = parseInt('20' + dateInput.substring(4, 6));
        const expiredDate = new Date(year, month, day, 23, 59, 59);

        if (isNaN(expiredDate.getTime()))
            return m.reply('Format tanggal tidak valid. Gunakan DDMMYY.');

        try {
            await m.react('⏳');
            let srv = await Server.findOne({ $or: [{ pteroId: id }, { identifier: id }] });

            if (!srv) {
                let pteroSrv;
                if (!isNaN(id)) {
                    const resp = await ptero.get(`/servers/${id}`);
                    pteroSrv = resp.data.attributes;
                } else {
                    const resp = await ptero.get(`/servers?filter[identifier]=${id}`);
                    if (resp.data.data.length > 0) pteroSrv = resp.data.data[0].attributes;
                }

                if (pteroSrv) {
                    const userResp = await ptero.get(`/users/${pteroSrv.user}`);
                    const userJid = userResp.data.attributes.external_id || 'unknown';
                    srv = await Server.create({
                        userId: userJid,
                        pteroId: pteroSrv.id,
                        identifier: pteroSrv.identifier,
                        planName: pteroSrv.name,
                        price: 0,
                        expiredAt: expiredDate,
                    });
                } else {
                    await m.react('❌');
                    return m.reply('Server tidak ditemukan di panel.');
                }
            } else {
                srv.expiredAt = expiredDate;
                srv.status = 'active';
                await srv.save();
            }

            await m.reply(
                `Berhasil! Server ${srv.planName} disetel expired hingga ${expiredDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}.`
            );
            await m.react('✅');
        } catch (error) {
            await m.react('❌');
            await m.reply(`Error: ${error.message}`);
        }
    },
};

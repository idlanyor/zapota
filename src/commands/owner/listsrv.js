import Server from '../../database/models/Server.js';
import User from '../../database/models/User.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'listsrv',
    aliases: ['listserver'],
    description: 'List all servers and their owners (Owner only)',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        try {
            const servers = await Server.find({});
            if (servers.length === 0) {
                return m.reply(
                    `Belum ada data server di database bot. Gunakan ${settings.prefix}setexpired sync untuk sinkronisasi.`
                );
            }

            // Ambil semua user untuk mapping nama owner
            const users = await User.find({});
            const userMap = users.reduce((acc, user) => {
                acc[user.jid] = user.name || 'No Name';
                return acc;
            }, {});

            let msg = `*DAFTAR SERVER BOT*\n\n`;
            servers.forEach((srv) => {
                const ownerName = userMap[srv.userId] || 'Unknown';
                msg += `ID: *${srv.pteroId}* | *${srv.planName}* - ${ownerName}\n`;
                msg += `   Identifier: ${srv.identifier}\n`;
                msg += `   JID: @${srv.userId.split('@')[0]}\n`;
                msg += `--------------------------\n`;
            });

            await sock.sendMessage(
                m.chat,
                {
                    text: msg,
                    mentions: servers.map((s) => s.userId),
                },
                { quoted: m }
            );
        } catch (error) {
            console.error(error);
            await m.reply(`Error: ${error.message}`);
        }
    },
};

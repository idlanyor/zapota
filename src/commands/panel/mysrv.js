import { getUserServers } from '../../services/pterodactyl.js';
import { settings } from '../../config/settings.js';
import Server from '../../database/models/Server.js';

export default {
    name: 'mysrv',
    aliases: ['listsrv', 'vpsku'],
    description: 'List your Pterodactyl servers',
    category: 'Panel',
    execute: async (sock, m, args, text) => {
        try {
            await m.react('⏳');
            const servers = await getUserServers(m.sender);

            if (servers.length === 0) {
                await m.react('❌');
                return m.reply(
                    `You don't have any servers yet or your account is not linked. Use ${settings.prefix}bind if you already have an account.`
                );
            }

            // Get expiration data from DB
            const dbServers = await Server.find({ userId: m.sender });

            let msg = `*YOUR SERVERS*\n\n`;
            servers.forEach((s, i) => {
                const dbSrv = dbServers.find((ds) => ds.identifier === s.identifier);
                const expiredStr = dbSrv
                    ? dbSrv.expiredAt.toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                      })
                    : 'Indefinite';

                msg += `${i + 1}. *${s.name}*\n`;
                msg += `   ID: ${s.identifier}\n`;
                msg += `   RAM: ${s.limits.memory}MB\n`;
                msg += `   Disk: ${s.limits.disk}MB\n`;
                msg += `   Expired: ${expiredStr}\n`;
                msg += `   Status: ${s.suspended ? 'Suspended' : 'Active'}\n`;
                msg += `--------------------------\n`;
            });

            msg += `\nTo manage a server, use: ${settings.prefix}panel <identifier> <action>\nActions: start, stop, restart, status`;

            await m.reply(msg);
            await m.react('✅');
        } catch (error) {
            console.error(error);
            await m.react('❌');
            await m.reply(`Error: ${error.message}`);
        }
    },
};

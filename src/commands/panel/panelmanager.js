import {
    setServerPowerState,
    getServerResources,
    getUserServers,
} from '../../services/pterodactyl.js';
import { settings } from '../../config/settings.js';
import Server from '../../database/models/Server.js';

export default {
    name: 'panel',
    aliases: ['managepanel'],
    description: 'Manage your panel (start/stop/restart/status)',
    category: 'Panel',
    execute: async (sock, m, args, text) => {
        const id = args[0];
        const action = args[1]?.toLowerCase();

        if (!id || !action) {
            return m.reply(
                `Usage: ${settings.prefix}panel <identifier> <action>\nActions: start, stop, restart, status\n\nExample: ${settings.prefix}panel a1b2c3d4 restart`
            );
        }

        try {
            // Verification: Ensure the server belongs to the user
            const myServers = await getUserServers(m.sender);
            const server = myServers.find((s) => s.identifier === id || s.uuid.startsWith(id));

            if (!server) {
                return m.reply(
                    'Server not found or you do not have permission to manage this server.'
                );
            }

            if (action === 'status' || action === 'info') {
                const resources = await getServerResources(id);
                const dbSrv = await Server.findOne({ identifier: id });
                const expiredStr = dbSrv
                    ? dbSrv.expiredAt.toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                      })
                    : 'Indefinite';

                const statusMsg =
                    `*SERVER STATUS: ${server.name}*\n\n` +
                    `State: ${resources.current_state}\n` +
                    `Expired: ${expiredStr}\n` +
                    `CPU Usage: ${resources.resources.cpu_absolute.toFixed(2)}%\n` +
                    `Memory: ${(resources.resources.memory_bytes / 1024 / 1024).toFixed(2)} MB\n` +
                    `Disk: ${(resources.resources.disk_bytes / 1024 / 1024).toFixed(2)} MB\n` +
                    `Network Up: ${(resources.resources.network_tx_bytes / 1024 / 1024).toFixed(2)} MB\n` +
                    `Network Down: ${(resources.resources.network_rx_bytes / 1024 / 1024).toFixed(2)} MB`;
                return m.reply(statusMsg);
            }

            const validActions = {
                start: 'start',
                stop: 'stop',
                restart: 'restart',
                kill: 'kill',
            };

            const signal = validActions[action];
            if (!signal) {
                return m.reply('Invalid action. Use: start, stop, restart, status');
            }

            await m.react('⏳');
            await setServerPowerState(id, signal);
            await m.reply(`Success! Signal ${signal} has been sent to server *${server.name}*.`);
            await m.react('✅');
        } catch (error) {
            console.error(error);
            const detail = error.response?.data?.errors?.[0]?.detail || error.message;
            await m.react('❌');
            await m.reply(`Failed to manage server: ${detail}`);
        }
    },
};

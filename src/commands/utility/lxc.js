import {
    getUserLXCs,
    setLxcPowerState,
    getLxcStatus,
    getCloudUsers,
    updateCloudUser,
    deleteCloudUser,
} from '../../services/cloudApi.js';
import User from '../../database/models/User.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'lxc',
    aliases: ['proxmox', 'node'],
    description: 'Manage Proxmox LXC containers from cloud.kanata.web.id',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        const isOwner = m.sender === settings.ownerNumber || m.sender === settings.ownerLid;
        const sub = args[0]?.toLowerCase();

        // 1. Bind Account
        if (sub === 'bind') {
            const email = args[1];
            if (!email || !email.includes('@'))
                return m.reply(`Usage: ${settings.prefix}lxc bind <email_cloud>`);

            await User.findOneAndUpdate({ jid: m.sender }, { emailCloud: email }, { upsert: true });
            return m.reply(`Success! WhatsApp linked to cloud account: *${email}*`);
        }

        // 2. Cloud User Management (Owner Only)
        if (sub === 'user' && isOwner) {
            const userSub = args[1]?.toLowerCase();
            try {
                switch (userSub) {
                    case 'list':
                    case 'ls': {
                        const users = await getCloudUsers();
                        let msg = `*CLOUD USER LIST*\n\n`;
                        users.forEach((u, i) => {
                            msg += `${i + 1}. *${u.name}*\n`;
                            msg += `   Email: ${u.email}\n`;
                            msg += `   VPS Count: ${u.vpsCount || 0}\n`;
                            msg += `   ID: ${u.id}\n`;
                            msg += `--------------------------\n`;
                        });
                        return m.reply(msg);
                    }
                    case 'search': {
                        const query = args[2]?.toLowerCase();
                        if (!query)
                            return m.reply(`Usage: ${settings.prefix}lxc user search <name/email>`);
                        const users = await getCloudUsers();
                        const results = users.filter(
                            (u) =>
                                u.name.toLowerCase().includes(query) ||
                                u.email.toLowerCase().includes(query)
                        );
                        if (results.length === 0) return m.reply('No users found.');
                        let msg = `*SEARCH RESULTS*\n\n`;
                        results.forEach((u) => {
                            msg += `+ *${u.name}* (${u.email})\n  ID: ${u.id}\n  VPS: ${u.vpsCount}\n\n`;
                        });
                        return m.reply(msg);
                    }
                    case 'info': {
                        const input = args[2];
                        if (!input)
                            return m.reply(`Usage: ${settings.prefix}lxc user info <id/email>`);

                        const users = await getCloudUsers();
                        const u = users.find((user) => user.id === input || user.email === input);
                        if (!u) return m.reply('User cloud not found.');

                        let msg = `*CLOUD USER DETAIL*\n\n`;
                        msg += `+ Name: ${u.name}\n`;
                        msg += `+ Email: ${u.email}\n`;
                        msg += `+ Role: ${u.role}\n`;
                        msg += `+ Balance: Rp ${u.balance.toLocaleString()}\n`;
                        msg += `+ Instances: ${u.assignedVpsIds?.join(', ') || 'None'}\n\n`;
                        msg += `_Use ${settings.prefix}lxc <vmid> status to check specific VPS_`;
                        return m.reply(msg);
                    }
                    case 'edit': {
                        const input = args[2];
                        const field = args[3]?.toLowerCase();
                        const value = args.slice(4).join(' ');
                        if (!input || !field || !value)
                            return m.reply(
                                `Usage: ${settings.prefix}lxc user edit <id/email> <name|role|balance> <value>`
                            );

                        const users = await getCloudUsers();
                        const u = users.find((user) => user.id === input || user.email === input);
                        if (!u) return m.reply('User not found.');

                        await updateCloudUser(u.id, {
                            [field]: field === 'balance' ? parseInt(value) : value,
                        });
                        return m.reply(
                            `Success! User *${u.email}* field *${field}* updated to: ${value}`
                        );
                    }
                    case 'delete': {
                        const input = args[2];
                        if (!input)
                            return m.reply(`Usage: ${settings.prefix}lxc user delete <id/email>`);
                        const users = await getCloudUsers();
                        const u = users.find((user) => user.id === input || user.email === input);
                        if (!u) return m.reply('User not found.');

                        await deleteCloudUser(u.id);
                        return m.reply(`Success! User *${u.email}* deleted.`);
                    }
                    default:
                        return m.reply(
                            `*CLOUD USER MGMT*\n\n` +
                                `• ${settings.prefix}lxc user list\n` +
                                `• ${settings.prefix}lxc user edit <id> <field> <value>\n` +
                                `• ${settings.prefix}lxc user delete <id>`
                        );
                }
            } catch (err) {
                return m.reply(`Error: ${err.message}`);
            }
        }

        // Fetch User Data
        const dbUser = await User.findOne({ jid: m.sender });
        const emailCloud = dbUser?.emailCloud;

        if (!emailCloud && !isOwner) {
            return m.reply(
                `Your WhatsApp is not linked to cloud account. Use ${settings.prefix}lxc bind <email> first.`
            );
        }

        try {
            switch (sub) {
                case 'list':
                case 'ls': {
                    await m.react('⏳');
                    const lxcs = await getUserLXCs(isOwner ? null : emailCloud, isOwner);

                    if (lxcs.length === 0) {
                        await m.react('❌');
                        return m.reply('No LXC containers found.');
                    }

                    let msg = `*PROXMOX LXC LIST*

`;
                    lxcs.forEach((l, i) => {
                        msg += `${i + 1}. *${l.name}* (ID: ${l.vmid})
`;
                        msg += `   Status: ${l.status === 'running' ? '🟢 Running' : '🔴 Stopped'}
`;
                        msg += `   Node: ${l.node}
`;
                        msg += `   CPU: ${l.cpuPercent}%
`;
                        msg += `   RAM: ${l.memUsedMB}MB / ${l.memMaxMB}MB
`;
                        msg += `--------------------------
`;
                    });
                    msg += `
To manage: ${settings.prefix}lxc <vmid> <start|stop|reboot|status>`;
                    await m.reply(msg);
                    await m.react('✅');
                    break;
                }

                case 'status':
                case 'info': {
                    const vmid = args[1];
                    if (!vmid) return m.reply(`Usage: ${settings.prefix}lxc status <vmid>`);

                    const lxcs = await getUserLXCs(emailCloud, isOwner);
                    const lxc = lxcs.find((l) => l.vmid.toString() === vmid);
                    if (!lxc) return m.reply('LXC not found or access denied.');

                    const status = await getLxcStatus(lxc.node, vmid);
                    let msg = `*LXC STATUS: ${status.name}*

`;
                    msg += `ID: ${vmid}
`;
                    msg += `Node: ${lxc.node}
`;
                    msg += `Status: ${status.status}
`;
                    msg += `Uptime: ${(status.uptime / 3600).toFixed(2)} hours
`;
                    msg += `CPU: ${(status.cpu * 100).toFixed(2)}%
`;
                    msg += `RAM: ${(status.mem / 1024 / 1024).toFixed(2)}MB / ${(status.maxmem / 1024 / 1024).toFixed(2)}MB
`;
                    msg += `Disk: ${(status.disk / 1024 / 1024 / 1024).toFixed(2)}GB / ${(status.maxdisk / 1024 / 1024 / 1024).toFixed(2)}GB
`;

                    await m.reply(msg);
                    break;
                }

                case 'start':
                case 'stop':
                case 'reboot': {
                    const vmid = args[1] || args[0]; // .lxc stop 105 OR .lxc 105 stop
                    const action =
                        sub === 'start' || sub === 'stop' || sub === 'reboot' ? sub : args[1];

                    if (!vmid || isNaN(vmid))
                        return m.reply(`Usage: ${settings.prefix}lxc <action> <vmid>`);

                    const lxcs = await getUserLXCs(emailCloud, isOwner);
                    const lxc = lxcs.find((l) => l.vmid.toString() === vmid.toString());
                    if (!lxc) return m.reply('LXC not found or access denied.');

                    await m.react('⏳');
                    await setLxcPowerState(lxc.node, vmid, action);
                    await m.reply(
                        `Success! Action *${action}* has been sent to LXC *${lxc.name}*.`
                    );
                    await m.react('✅');
                    break;
                }

                default:
                    // Support shorthand like .lxc 105 status
                    if (args[0] && !isNaN(args[0]) && args[1]) {
                        const vmid = args[0];
                        const action = args[1].toLowerCase();

                        const lxcs = await getUserLXCs(emailCloud, isOwner);
                        const lxc = lxcs.find((l) => l.vmid.toString() === vmid);
                        if (!lxc) return m.reply('LXC not found or access denied.');

                        if (action === 'status' || action === 'info') {
                            // Recursively call status logic
                            return this.execute(sock, m, ['status', vmid], '');
                        }

                        await m.react('⏳');
                        await setLxcPowerState(lxc.node, vmid, action);
                        await m.reply(
                            `Success! Action *${action}* has been sent to LXC *${lxc.name}*.`
                        );
                        await m.react('✅');
                    } else {
                        await m.reply(
                            `*PROXMOX LXC MANAGER*

` +
                                `• ${settings.prefix}lxc bind <email>
` +
                                `• ${settings.prefix}lxc list
` +
                                `• ${settings.prefix}lxc <vmid> status
` +
                                `• ${settings.prefix}lxc <vmid> start
` +
                                `• ${settings.prefix}lxc <vmid> stop
` +
                                `• ${settings.prefix}lxc <vmid> reboot`
                        );
                    }
            }
        } catch (error) {
            console.error(error);
            await m.reply(`Error: ${error.message}`);
        }
    },
};

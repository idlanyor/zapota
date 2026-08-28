import {
    createPteroUser,
    listPteroUsers,
    updatePteroUser,
    deletePteroUser,
} from '../../services/pterodactyl.js';
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
    name: 'puser',
    aliases: ['ptero-user'],
    description: 'Manage Pterodactyl Users (CRUD)',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        const sub = args[0]?.toLowerCase();

        switch (sub) {
            case 'list': {
                const page = args[1] || 1;
                const data = await listPteroUsers(page);
                let msg = `*PTERODACTYL USERS (Page ${data.meta.pagination.current_page}/${data.meta.pagination.total_pages})*\n\n`;
                data.data.forEach((u) => {
                    msg += `ID: ${u.attributes.id} | ${u.attributes.username} (${u.attributes.email})\n`;
                });
                msg += `\nTotal: ${data.meta.pagination.total}`;
                await m.reply(msg);
                break;
            }

            case 'add':
            case 'create': {
                const username = args[1];
                const email = args[2];
                if (!username || !email)
                    return m.reply(`Usage: ${settings.prefix}puser add <username> <email>`);

                try {
                    const newUser = await createPteroUser({ username, email });
                    await m.reply(
                        `User created successfully!\nID: ${newUser.id}\nUsername: ${newUser.username}\nEmail: ${newUser.email}`
                    );
                } catch (e) {
                    await m.reply(`Failed to create user: ${e.message}`);
                }
                break;
            }

            case 'info': {
                const id = args[1];
                if (!id) return m.reply(`Usage: ${settings.prefix}puser info <id>`);
                try {
                    const resp = await ptero.get(`/users/${id}`);
                    const u = resp.data.attributes;
                    let msg = `*USER INFO (ID: ${u.id})*\n\n`;
                    msg += `Username: ${u.username}\n`;
                    msg += `Email: ${u.email}\n`;
                    msg += `Name: ${u.first_name} ${u.last_name}\n`;
                    msg += `External ID: ${u.external_id || '-'}\n`;
                    msg += `2FA: ${u['2fa'] ? 'Enabled' : 'Disabled'}\n`;
                    msg += `Created: ${u.created_at}`;
                    await m.reply(msg);
                } catch (e) {
                    await m.reply(`User not found or error: ${e.message}`);
                }
                break;
            }

            case 'edit':
            case 'update': {
                const id = args[1];
                const field = args[2]?.toLowerCase();
                const value = args.slice(3).join(' ');

                if (!id || !field || !value) {
                    return m.reply(
                        `Usage: ${settings.prefix}puser edit <id> <username|email|first_name|last_name|password> <value>`
                    );
                }

                try {
                    // Fetch existing data first because patch requires full data for some fields or to be safe
                    const resp = await ptero.get(`/users/${id}`);
                    const current = resp.data.attributes;

                    const updateData = {
                        email: current.email,
                        username: current.username,
                        first_name: current.first_name,
                        last_name: current.last_name,
                        [field]: value,
                    };

                    const updated = await updatePteroUser(id, updateData);
                    await m.reply(
                        `User ${id} updated successfully!\nField ${field} is now: ${value}`
                    );
                } catch (e) {
                    await m.reply(`Failed to update user: ${e.message}`);
                }
                break;
            }

            case 'delete': {
                const id = args[1];
                if (!id) return m.reply(`Usage: ${settings.prefix}puser delete <id>`);
                try {
                    await deletePteroUser(id);
                    await m.reply(`User ${id} deleted successfully.`);
                } catch (e) {
                    await m.reply(`Failed to delete user: ${e.message}`);
                }
                break;
            }

            default:
                await m.reply(
                    `*PTERODACTYL USER MANAGEMENT*\n\n` +
                        `• ${settings.prefix}puser list [page]\n` +
                        `• ${settings.prefix}puser add <username> <email>\n` +
                        `• ${settings.prefix}puser info <id>\n` +
                        `• ${settings.prefix}puser edit <id> <field> <value>\n` +
                        `• ${settings.prefix}puser delete <id>`
                );
        }
    },
};

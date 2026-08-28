import { jidNormalizedUser } from '../../wa/helpers.js';
import Settings from '../../database/models/Settings.js';
import { clearSettingsCache } from '../../handlers/messageFlow.js';

export default [
    {
        name: 'addowner',
        aliases: ['ao'],
        description: 'Menambahkan owner baru',
        category: 'Owner',
        execute: async (sock, m, args, text) => {
            let target;
            if (m.quoted) {
                target = m.quoted.sender;
            } else if (m.mentionedJid?.[0]) {
                target = m.mentionedJid[0];
            } else if (args[0]) {
                target = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            }

            if (!target)
                return m.reply(
                    '❌ Tag user, reply pesannya, atau masukkan nomornya untuk dijadikan owner.'
                );

            const normalizedTarget = jidNormalizedUser(target);
            const botSettings =
                (await Settings.findOne({ id: 'bot_settings' })) ||
                (await Settings.create({ id: 'bot_settings' }));

            if (botSettings.owners.includes(normalizedTarget)) {
                return m.reply('❌ User tersebut sudah menjadi owner.');
            }

            botSettings.owners.push(normalizedTarget);
            await botSettings.save();
            clearSettingsCache();

            m.reply(`✅ Berhasil menambahkan @${normalizedTarget.split('@')[0]} sebagai owner.`, {
                mentions: [normalizedTarget],
            });
        },
    },
    {
        name: 'delowner',
        aliases: ['do'],
        description: 'Menghapus owner',
        category: 'Owner',
        execute: async (sock, m, args, text) => {
            let target;
            if (m.quoted) {
                target = m.quoted.sender;
            } else if (m.mentionedJid?.[0]) {
                target = m.mentionedJid[0];
            } else if (args[0]) {
                target = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            }

            if (!target)
                return m.reply(
                    '❌ Tag user, reply pesannya, atau masukkan nomornya untuk dihapus dari owner.'
                );

            const normalizedTarget = jidNormalizedUser(target);
            const botSettings =
                (await Settings.findOne({ id: 'bot_settings' })) ||
                (await Settings.create({ id: 'bot_settings' }));

            if (!botSettings.owners.includes(normalizedTarget)) {
                return m.reply('❌ User tersebut bukan owner.');
            }

            botSettings.owners = botSettings.owners.filter((o) => o !== normalizedTarget);
            await botSettings.save();
            clearSettingsCache();

            m.reply(`✅ Berhasil menghapus @${normalizedTarget.split('@')[0]} dari daftar owner.`, {
                mentions: [normalizedTarget],
            });
        },
    },
    {
        name: 'listowner',
        aliases: ['lo', 'ownerlist'],
        description: 'Menampilkan daftar owner',
        category: 'Owner',
        execute: async (sock, m, args, text) => {
            const { settings } = await import('../../config/settings.js');
            const botSettings =
                (await Settings.findOne({ id: 'bot_settings' })) ||
                (await Settings.create({ id: 'bot_settings' }));

            const dbOwners = botSettings.owners || [];

            let msg = `*── 「 OWNER LIST 」 ──*\n\n`;
            msg += `*Main Owner:* @${settings.ownerNumber.split('@')[0]}\n\n`;

            if (dbOwners.length === 0) {
                msg += `_Tidak ada owner tambahan di database._`;
            } else {
                msg += `*Dynamic Owners:*\n`;
                dbOwners.forEach((owner, i) => {
                    msg += `${i + 1}. @${owner.split('@')[0]}\n`;
                });
            }

            m.reply(msg, { mentions: dbOwners });
        },
    },
];

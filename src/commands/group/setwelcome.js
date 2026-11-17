import { groupRepo } from '../../database/repos/groupRepo.js';
import { clearSettingsCache } from '../../handlers/messageHandler.js';

export default [
    {
        name: 'setwelcome',
        aliases: ['setw'],
        description: 'Atur pesan welcome kustom',
        category: 'Group',
        execute: async (sock, m, args, text) => {
            if (!m.isGroup) return m.reply('Hanya di grup!');
            if (!text) return m.reply(`Ketik pesannya!\nPlaceholder: @user, @group, @desc`);

            await groupRepo.upsert({ jid: m.chat }, { welcomeMsg: text });
            clearSettingsCache();
            m.reply(` Berhasil mengatur pesan welcome:\n\n${text}`);
        },
    },
    {
        name: 'setleave',
        aliases: ['setl'],
        description: 'Atur pesan leave kustom',
        category: 'Group',
        execute: async (sock, m, args, text) => {
            if (!m.isGroup) return m.reply('Hanya di grup!');
            if (!text) return m.reply(`Ketik pesannya!\nPlaceholder: @user, @group`);

            await groupRepo.upsert({ jid: m.chat }, { leaveMsg: text });
            clearSettingsCache();
            m.reply(` Berhasil mengatur pesan leave:\n\n${text}`);
        },
    },
    {
        name: 'setwelcomebg',
        aliases: ['setwbg'],
        description: 'Atur background gambar welcome (URL gambar)',
        category: 'Group',
        execute: async (sock, m, args, text) => {
            if (!m.isGroup) return m.reply('Hanya di grup!');
            const input = (text || '').trim();

            if (!input) {
                const g = await groupRepo.findOne({ jid: m.chat });
                const bg = g?.welcomeBg || 'https://i.ibb.co/4YBNyvP/images-76.jpg (default)';
                return m.reply(
                    `Background welcome saat ini:\n${bg}\n\nKetik URL baru untuk mengganti, atau \`setwelcomebg reset\` untuk balik ke default.`
                );
            }

            if (input.toLowerCase() === 'reset') {
                await groupRepo.resetWelcomeBg(m.chat);
                clearSettingsCache();
                return m.reply('✅ Background welcome direset ke default.');
            }

            if (!/^https?:\/\//i.test(input)) {
                return m.reply('⚠️ URL tidak valid! Pastikan diawali http:// atau https://');
            }

            await groupRepo.upsert({ jid: m.chat }, { welcomeBg: input });
            clearSettingsCache();
            m.reply(`✅ Background welcome diatur ke:\n${input}`);
        },
    },
];

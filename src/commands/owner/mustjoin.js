import { getBotSettings, saveBotSettings } from '../../services/settingsService.js';

export default {
    name: 'mustjoin',
    aliases: ['mj', 'joincheck'],
    description: 'Toggle wajib gabung grup untuk chat pribadi',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        const botSettings = await getBotSettings();

        if (!args[0]) {
            return m.reply(
                `*── 「 MUST JOIN CONFIG 」 ──*\n\n` +
                    `➛ *Status:* ${botSettings.mustJoinGroup ? '✅ Aktif' : '❌ Mati'}\n` +
                    `➛ *Link:* ${botSettings.groupInviteLink}\n\n` +
                    `*Cara Penggunaan:*\n` +
                    `• .mustjoin on/off (Toggle fitur)\n` +
                    `• .mustjoin set <link_grup> (Set link grup)`
            );
        }

        const action = args[0].toLowerCase();

        if (action === 'on') {
            botSettings.mustJoinGroup = true;
            await saveBotSettings(botSettings);
            return m.reply('✅ Fitur *Must Join Group* berhasil diaktifkan.');
        }

        if (action === 'off') {
            botSettings.mustJoinGroup = false;
            await saveBotSettings(botSettings);
            return m.reply('❌ Fitur *Must Join Group* berhasil dimatikan.');
        }

        if (action === 'set') {
            const link = args[1];
            if (!link || !link.includes('chat.whatsapp.com/')) {
                return m.reply(
                    '❌ Link grup tidak valid! Harap masukkan link invite WhatsApp yang benar.'
                );
            }
            botSettings.groupInviteLink = link;
            await saveBotSettings(botSettings);
            return m.reply(`✅ Link grup berhasil diubah ke:\n${link}`);
        }

        return m.reply('❌ Perintah tidak dikenal. Gunakan .mustjoin untuk bantuan.');
    },
};

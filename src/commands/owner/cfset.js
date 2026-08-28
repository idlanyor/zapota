import Settings from '../../database/models/Settings.js';
import { clearSettingsCache } from '../../handlers/messageFlow.js';

export default {
    name: 'cfset',
    aliases: ['setcf'],
    description: 'Konfigurasi Cloudflare API',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        const botSettings =
            (await Settings.findOne({ id: 'bot_settings' })) ||
            (await Settings.create({ id: 'bot_settings' }));

        if (!args[0]) {
            return m.reply(
                `*── 「 CLOUDFLARE CONFIG 」 ──*\n\n` +
                    `➛ *Token:* ${botSettings.cfToken ? '✅ Terpasang' : '❌ Kosong'}\n` +
                    `➛ *Account ID:* ${botSettings.cfAccountId ? '✅ Terpasang' : '❌ Kosong'}\n` +
                    `➛ *Total Zones:* ${botSettings.cfZones?.length || 0}\n\n` +
                    `*Cara Penggunaan:*\n` +
                    `• .cfset token <your_token>\n` +
                    `• .cfset account <your_account_id>\n` +
                    `• .cfset zone add <domain.com> <zone_id>\n` +
                    `• .cfset zone del <domain.com>\n` +
                    `• .cfset zone list`
            );
        }

        const action = args[0].toLowerCase();

        if (action === 'token' || action === 'key') {
            const value = args[1];
            if (!value) return m.reply('❌ Masukkan API Token!');
            botSettings.cfToken = value;
            await botSettings.save();
            clearSettingsCache();
            return m.reply('✅ Cloudflare API Token berhasil diperbarui.');
        }

        if (action === 'account' || action === 'acc') {
            const value = args[1];
            if (!value) return m.reply('❌ Masukkan Account ID!');
            botSettings.cfAccountId = value;
            await botSettings.save();
            clearSettingsCache();
            return m.reply('✅ Cloudflare Account ID berhasil diperbarui.');
        }

        if (action === 'zone') {
            const subAction = args[1]?.toLowerCase();

            if (subAction === 'add') {
                const domain = args[2]?.toLowerCase();
                const zoneId = args[3];
                if (!domain || !zoneId)
                    return m.reply('❌ Format: .cfset zone add <domain.com> <zone_id>');

                // Update if exists, otherwise push
                const existingIndex = botSettings.cfZones.findIndex((z) => z.domain === domain);
                if (existingIndex > -1) {
                    botSettings.cfZones[existingIndex].zoneId = zoneId;
                } else {
                    botSettings.cfZones.push({ domain, zoneId });
                }

                await botSettings.save();
                clearSettingsCache();
                return m.reply(`✅ Berhasil menambahkan/memperbarui Zone ID untuk *${domain}*.`);
            }

            if (subAction === 'del' || subAction === 'remove') {
                const domain = args[2]?.toLowerCase();
                if (!domain) return m.reply('❌ Format: .cfset zone del <domain.com>');

                botSettings.cfZones = botSettings.cfZones.filter((z) => z.domain !== domain);
                await botSettings.save();
                clearSettingsCache();
                return m.reply(`✅ Zone ID untuk *${domain}* berhasil dihapus.`);
            }

            if (subAction === 'list') {
                if (botSettings.cfZones.length === 0)
                    return m.reply('❌ Belum ada Zone ID yang terdaftar.');
                let msg = `*── 「 CLOUDFLARE ZONES 」 ──*\n\n`;
                botSettings.cfZones.forEach((z, i) => {
                    msg += `${i + 1}. *${z.domain}*\n   ID: \`${z.zoneId}\`\n\n`;
                });
                return m.reply(msg);
            }

            return m.reply('❌ Sub-perintah zone tidak dikenal. Gunakan add/del/list.');
        }

        return m.reply('❌ Perintah tidak dikenal. Gunakan .cfset untuk bantuan.');
    },
};

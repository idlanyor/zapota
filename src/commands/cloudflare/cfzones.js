import { fetchAllZones } from '../../services/cloudflare.js';
import Settings from '../../database/models/Settings.js';
import { clearSettingsCache } from '../../handlers/messageFlow.js';

export default {
    name: 'cfzones',
    aliases: ['listzones', 'cfz'],
    description: 'Mengambil daftar domain dari Cloudflare',
    category: 'Cloudflare',
    execute: async (sock, m, args) => {
        try {
            await m.react('⏳');
            const zones = await fetchAllZones();

            if (!zones || zones.length === 0) {
                await m.react('❌');
                return m.reply(
                    '❌ Tidak ada domain ditemukan atau Token tidak memiliki izin `Zone:Read`.'
                );
            }

            let msg = `*── 「 CLOUDFLARE ZONES 」 ──*\n\n`;
            const newZones = [];

            zones.forEach((z, i) => {
                msg += `${i + 1}. *${z.name}*\n   ID: \`${z.id}\`\n   Status: ${z.status === 'active' ? '✅' : '⚠️'} ${z.status}\n\n`;
                newZones.push({ domain: z.name, zoneId: z.id });
            });

            msg += `_Ketik_ *.cfzones sync* _untuk menyimpan semua domain ini ke database bot._`;

            // Handle Sync
            if (args[0] === 'sync') {
                const botSettings =
                    (await Settings.findOne({ id: 'bot_settings' })) ||
                    (await Settings.create({ id: 'bot_settings' }));
                botSettings.cfZones = newZones;
                await botSettings.save();
                clearSettingsCache();
                await m.react('✅');
                return m.reply(`✅ Berhasil menyinkronkan ${newZones.length} domain ke database.`);
            }

            await m.reply(msg);
            await m.react('✅');
        } catch (err) {
            const errMsg = err.response?.data?.errors?.[0]?.message || err.message;
            await m.react('❌');
            await m.reply(`❌ Gagal mengambil daftar zone: ${errMsg}`);
        }
    },
};

import { listRules, listDnsRecords } from '../../services/cloudflare.js';
import Settings from '../../database/models/Settings.js';

export default {
    name: 'cftest',
    aliases: ['cfcheck', 'cft'],
    description: 'Menguji konektivitas API Cloudflare',
    category: 'Cloudflare',
    execute: async (sock, m, args) => {
        const botSettings = await Settings.findOne({ id: 'bot_settings' });

        if (!botSettings || (!botSettings.cfToken && !process.env.CLOUDFLARE_API_TOKEN)) {
            return m.reply(
                '❌ Token Cloudflare belum dikonfigurasi. Gunakan `.cfset token <key>`.'
            );
        }

        await m.react('⏳');

        let report = `*── 「 CLOUDFLARE TEST REPORT 」 ──*\n\n`;
        let hasError = false;

        // 1. Test Account & Token Connectivity
        try {
            await listRules(null, 1);
            report += `➛ *Account API:* ✅ Terhubung\n`;
            report += `➛ *Firewall Access:* ✅ Izin diberikan\n`;
        } catch (err) {
            hasError = true;
            const errMsg = err.response?.data?.errors?.[0]?.message || err.message;
            report += `➛ *Account API:* ❌ Gagal\n`;
            report += `   _Error: ${errMsg}_\n`;
        }

        report += `\n*── 「 ZONE VALIDATION 」 ──*\n`;

        // 2. Test Registered Zones
        const zones = botSettings.cfZones || [];
        if (zones.length === 0) {
            report += `_Belum ada Zone ID yang didaftarkan di database._\n`;
        } else {
            for (const zone of zones) {
                try {
                    await listDnsRecords(zone.zoneId, 1);
                    report += `➛ *${zone.domain}:* ✅ Valid\n`;
                } catch (err) {
                    const errMsg =
                        err.response?.data?.errors?.[0]?.message || 'Invalid Zone ID/Permission';
                    report += `➛ *${zone.domain}:* ❌ Error\n`;
                    report += `   _ID: ${zone.zoneId}_\n`;
                    report += `   _Note: ${errMsg}_\n`;
                }
            }
        }

        if (!hasError && zones.length > 0) {
            report += `\n*Status Keseluruhan:* ✅ Siap digunakan!`;
        } else if (hasError) {
            report += `\n*Status Keseluruhan:* ⚠️ Ada masalah pada konfigurasi utama.`;
        } else {
            report += `\n*Status Keseluruhan:* ℹ️ API Oke, tapi tidak ada Zone yang aktif.`;
        }

        await m.reply(report);
        await m.react(hasError ? '❌' : '✅');
    },
};

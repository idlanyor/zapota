import {
    listPlugins,
    readPlugin,
    deletePlugin,
    togglePlugin,
    savePlugin,
    rebuildManifest,
} from '../../services/selfManagementService.js';
import { buildAiRichCodeMessage } from './getplugin.js';
import logger from '../../utils/logger.js';

export default {
    name: 'plugin',
    aliases: ['plug', 'pl'],
    category: 'Owner',
    description: 'Manajemen plugin bot: list, get, toggle, delete, save, reload (Owner Only)',
    execute: async (sock, m, args, text) => {
        const subCmd = (args[0] || '').toLowerCase();
        const target = (args[1] || '').trim();

        if (!subCmd || subCmd === 'help') {
            const helpText = `🛠️ *PLUGIN MANAGER (OWNER)*\n
• *.plugin list [kategori]*
  _Melihat daftar seluruh plugin/command_
• *.plugin get <nama>*
  _Melihat source code plugin (AI Rich Code)_
• *.plugin toggle <nama>*
  _Aktifkan / nonaktifkan plugin_
• *.plugin del <nama>*
  _Hapus plugin dari bot (auto-backup)_
• *.plugin save <kategori> <nama> <code>*
  _Simpan / buat plugin baru (reply file/text)_
• *.plugin reload*
  _Rebuild manifest & reload command memory_`;
            return m.reply(helpText);
        }

        // 1. LIST
        if (subCmd === 'list' || subCmd === 'ls') {
            const list = listPlugins();
            const filterCat = target.toLowerCase();
            const filtered = filterCat
                ? list.filter((p) => p.category.toLowerCase() === filterCat)
                : list;

            if (!filtered.length) {
                return m.reply(`Tidak ada plugin yang cocok${filterCat ? ` untuk kategori "${target}"` : ''}.`);
            }

            // Group by category
            const grouped = {};
            for (const item of filtered) {
                grouped[item.category] = grouped[item.category] || [];
                grouped[item.category].push(item);
            }

            let msg = `📦 *DAFTAR PLUGIN BOT* (Total: ${filtered.length})\n`;
            for (const [cat, plugins] of Object.entries(grouped)) {
                msg += `\n📁 *${cat.toUpperCase()}* (${plugins.length}):\n`;
                for (const p of plugins) {
                    const status = p.disabled ? '🔴 _[disabled]_' : '🟢';
                    msg += `  ${status} ${p.name}\n`;
                }
            }

            msg += `\nGunakan *.plugin get <nama>* untuk melihat kode.`;
            return m.reply(msg);
        }

        // 2. GET
        if (subCmd === 'get' || subCmd === 'cat') {
            if (!target) return m.reply('❌ Tentukan nama plugin. Contoh: `.plugin get eval`');
            try {
                const data = readPlugin(target);
                const message = buildAiRichCodeMessage({
                    content: data.content,
                    fileName: data.fileName,
                    m,
                });
                return await sock.relayMessage(m.chat, message, {
                    messageId: sock.generateMessageTag(),
                });
            } catch (err) {
                return m.reply(`❌ ${err.message}`);
            }
        }

        // 3. TOGGLE (ENABLE / DISABLE)
        if (subCmd === 'toggle' || subCmd === 'enable' || subCmd === 'disable') {
            if (!target) return m.reply('❌ Tentukan nama plugin. Contoh: `.plugin toggle tiktok`');
            try {
                const isExplicitEnable = subCmd === 'enable' ? true : subCmd === 'disable' ? false : null;
                const result = await togglePlugin(target, isExplicitEnable);
                return m.reply(`✅ ${result.message || (result.enabled ? `Plugin *${target}* diaktifkan.` : `Plugin *${target}* dinonaktifkan.`)}`);
            } catch (err) {
                return m.reply(`❌ ${err.message}`);
            }
        }

        // 4. DELETE
        if (subCmd === 'del' || subCmd === 'delete' || subCmd === 'rm') {
            if (!target) return m.reply('❌ Tentukan nama plugin. Contoh: `.plugin del testcmd`');
            try {
                const result = await deletePlugin(target);
                return m.reply(`✅ Plugin *${target}* berhasil dihapus.\n📦 Backup disimpan di: \`${result.backupPath}\``);
            } catch (err) {
                return m.reply(`❌ ${err.message}`);
            }
        }

        // 5. SAVE / ADD
        if (subCmd === 'save' || subCmd === 'add' || subCmd === 'write') {
            const category = target;
            const pluginName = (args[2] || '').trim();
            const rawCode = args.slice(3).join(' ') || m.quoted?.text || '';

            if (!category || !pluginName || !rawCode) {
                return m.reply('❌ Format salah.\nContoh: `.plugin save tools ping <kode>`\nAtau quote/reply pesan berisi kode: `.plugin save tools ping`');
            }

            await m.react('⏳');
            const result = await savePlugin({
                name: pluginName,
                category,
                code: rawCode,
            });

            if (result.success) {
                await m.react('✅');
                return m.reply(`✅ Plugin *${pluginName}* berhasil disimpan!\n📁 Kategori: *${result.category}*\n📄 Lokasi: \`${result.filePath}\`\n\n_Plugin sudah aktif dan siap digunakan._`);
            } else {
                await m.react('❌');
                return m.reply(`❌ Gagal menyimpan plugin:\n${result.error}\n\n${result.rolledBack ? '⚠️ _Perubahan dibatalkan / di-rollback secara otomatis._' : ''}`);
            }
        }

        // 6. RELOAD
        if (subCmd === 'reload' || subCmd === 'refresh') {
            await m.react('⏳');
            try {
                const ok = await rebuildManifest();
                await m.react('✅');
                return m.reply(`✅ Manifest command bot berhasil diperbarui.`);
            } catch (err) {
                await m.react('❌');
                return m.reply(`❌ Gagal reload manifest: ${err.message}`);
            }
        }

        return m.reply(`Perintah tidak dikenal. Ketik \`.plugin\` untuk bantuan.`);
    },
};

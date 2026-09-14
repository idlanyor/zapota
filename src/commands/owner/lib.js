import {
    detectPackageManager,
    installPackage,
    uninstallPackage,
    gitStatus,
    gitDiff,
    gitCommit,
    gitRollback,
} from '../../services/selfManagementService.js';
import fs from 'fs';
import path from 'path';

export default {
    name: 'lib',
    aliases: ['npm', 'package', 'pkg', 'devsync'],
    category: 'Owner',
    description: 'Manajemen library/package & git synchronization bot (Owner Only)',
    execute: async (sock, m, args, text) => {
        const subCmd = (args[0] || '').toLowerCase();
        const target = (args[1] || '').trim();

        if (!subCmd || subCmd === 'help') {
            const pm = detectPackageManager();
            const helpText = `📚 *LIBRARY & DEVSYNC MANAGER (OWNER)*\n_Detected PM: ${pm}_\n
• *.lib install <package> [-D]*
  _Install library NPM/NodeJS_
• *.lib remove <package>*
  _Hapus library dari dependencies_
• *.lib list*
  _Melihat dependencies yang terpasang_
• *.lib status*
  _Cek git status repository bot_
• *.lib diff*
  _Lihat diff perubahan kode git_
• *.lib commit <pesan>*
  _Commit perubahan bot ke git_
• *.lib rollback*
  _Kembalikan source commands ke HEAD terakhir_
• *.lib logs [baris]*
  _Lihat log aktivitas realtime bot (default 25 baris)_`;
            return m.reply(helpText);
        }

        // 1. INSTALL
        if (subCmd === 'install' || subCmd === 'add' || subCmd === 'i') {
            if (!target) return m.reply('❌ Tentukan nama package. Contoh: `.lib install dayjs`');
            const isDev = args.includes('-D') || args.includes('--dev');
            await m.react('⏳');
            await m.reply(`⏳ Menginstall package *${target}*...`);

            try {
                const res = await installPackage(target, isDev);
                await m.react('✅');
                return m.reply(`✅ *Package Berhasil Terinstall*\nManager: \`${res.manager}\`\nCommand: \`${res.command}\`\n\n\`\`\`\n${res.output.slice(-1500)}\n\`\`\``);
            } catch (err) {
                await m.react('❌');
                return m.reply(`❌ Gagal menginstall package: ${err.message}`);
            }
        }

        // 2. REMOVE / UNINSTALL
        if (subCmd === 'remove' || subCmd === 'uninstall' || subCmd === 'rm') {
            if (!target) return m.reply('❌ Tentukan nama package. Contoh: `.lib remove dayjs`');
            await m.react('⏳');
            await m.reply(`⏳ Menghapus package *${target}*...`);

            try {
                const res = await uninstallPackage(target);
                await m.react('✅');
                return m.reply(`✅ *Package Berhasil Dihapus*\nManager: \`${res.manager}\`\nCommand: \`${res.command}\`\n\n\`\`\`\n${res.output.slice(-1500)}\n\`\`\``);
            } catch (err) {
                await m.react('❌');
                return m.reply(`❌ Gagal menghapus package: ${err.message}`);
            }
        }

        // 3. LIST DEPENDENCIES
        if (subCmd === 'list' || subCmd === 'ls') {
            try {
                const pkgJsonPath = path.resolve(process.cwd(), 'package.json');
                const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
                const deps = Object.entries(pkg.dependencies || {});
                const devDeps = Object.entries(pkg.devDependencies || {});

                let out = `📋 *BOT DEPENDENCIES* (${deps.length} total)\n`;
                for (const [name, ver] of deps) {
                    out += `• ${name}: \`${ver}\`\n`;
                }
                if (devDeps.length) {
                    out += `\n🛠️ *DEV DEPENDENCIES* (${devDeps.length}):\n`;
                    for (const [name, ver] of devDeps) {
                        out += `• ${name}: \`${ver}\`\n`;
                    }
                }
                return m.reply(out);
            } catch (err) {
                return m.reply(`❌ Gagal membaca package.json: ${err.message}`);
            }
        }

        // 4. GIT STATUS
        if (subCmd === 'status' || subCmd === 'st') {
            try {
                const st = await gitStatus();
                return m.reply(`📊 *GIT STATUS:*\n\`\`\`\n${st}\n\`\`\``);
            } catch (err) {
                return m.reply(`❌ Gagal cek git status: ${err.message}`);
            }
        }

        // 5. GIT DIFF
        if (subCmd === 'diff') {
            try {
                const df = await gitDiff(target);
                return m.reply(`📝 *GIT DIFF:*\n\`\`\`\n${df.slice(0, 3000)}\n\`\`\``);
            } catch (err) {
                return m.reply(`❌ Gagal cek git diff: ${err.message}`);
            }
        }

        // 6. GIT COMMIT
        if (subCmd === 'commit' || subCmd === 'save') {
            const commitMsg = args.slice(1).join(' ').trim();
            if (!commitMsg) return m.reply('❌ Masukkan pesan commit. Contoh: `.lib commit update plugin weather`');
            await m.react('⏳');
            try {
                const res = await gitCommit(commitMsg);
                await m.react('✅');
                return m.reply(`✅ *Git Commit Berhasil*\nPesan: _"${commitMsg}"_\n\n\`\`\`\n${res}\n\`\`\``);
            } catch (err) {
                await m.react('❌');
                return m.reply(`❌ Gagal commit: ${err.message}`);
            }
        }

        // 7. GIT ROLLBACK
        if (subCmd === 'rollback' || subCmd === 'revert') {
            await m.react('⏳');
            try {
                const res = await gitRollback();
                await m.react('✅');
                return m.reply(`✅ *Rollback Selesai*\n${res}`);
            } catch (err) {
                await m.react('❌');
                return m.reply(`❌ Gagal rollback: ${err.message}`);
            }
        }

        // 8. LOGS MONITORING
        if (subCmd === 'logs' || subCmd === 'log') {
            const lines = parseInt(target, 10) || 25;
            const logFile = path.resolve(process.cwd(), 'logs/pm2-out.log');
            const errLogFile = path.resolve(process.cwd(), 'logs/pm2-err.log');

            try {
                let outContent = fs.existsSync(logFile)
                    ? fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-lines).join('\n')
                    : '(log kosong)';
                let errContent = fs.existsSync(errLogFile)
                    ? fs.readFileSync(errLogFile, 'utf8').trim().split('\n').slice(-10).join('\n')
                    : '';

                let replyMsg = `📋 *LIVE LOG MONITOR (${lines} BARIS TERAKHIR)*\n\n\`\`\`\n${outContent}\n\`\`\``;
                if (errContent && errContent.trim()) {
                    replyMsg += `\n\n⚠️ *ERROR LOG (10 BARIS TERAKHIR):*\n\`\`\`\n${errContent}\n\`\`\``;
                }
                return m.reply(replyMsg);
            } catch (err) {
                return m.reply(`❌ Gagal membaca log: ${err.message}`);
            }
        }

        return m.reply('Perintah tidak dikenal. Ketik `.lib` untuk bantuan.');
    },
};

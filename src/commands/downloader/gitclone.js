import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';

const execFilePromise = promisify(execFile);

export default {
    name: 'gitclone',
    aliases: ['git', 'github'],
    description: 'Clone a GitHub repository and send it as a ZIP file',
    category: 'Downloader',
    execute: async (sock, m, args, text) => {
        if (!args[0]) {
            return m.reply(`Usage: .gitclone <github_url>
Example: .gitclone https://github.com/user/repo`);
        }

        // Validasi ketat: hanya https://(www.)github.com/<owner>/<repo>
        let parsed;
        try {
            parsed = new URL(args[0]);
        } catch {
            return m.reply(' URL GitHub tidak valid.');
        }
        const host = parsed.hostname.replace(/^www\./, '');
        if (parsed.protocol !== 'https:' || host !== 'github.com') {
            return m.reply(' URL GitHub tidak valid.');
        }
        const segments = parsed.pathname.split('/').filter(Boolean);
        if (segments.length < 2) {
            return m.reply(' URL GitHub tidak valid.');
        }
        const user = segments[0];
        const repo = segments[1].replace(/\.git$/, '');
        if (!/^[A-Za-z0-9._-]+$/.test(user) || !/^[A-Za-z0-9._-]+$/.test(repo)) {
            return m.reply(' URL GitHub tidak valid.');
        }

        const tempDir = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), `git_${crypto.randomUUID().slice(0, 8)}_`)
        );
        const zipPath = path.join(os.tmpdir(), `${repo}_${crypto.randomUUID()}.zip`);

        try {
            await m.react('⏳');

            // Clone repo (execFile: tanpa shell, argumen sebagai array)
            const cloneUrl = `${parsed.protocol}//github.com/${user}/${repo}.git`;
            await execFilePromise('git', ['clone', '--depth', '1', cloneUrl, tempDir]);

            // Remove .git directory to save space/privacy
            const gitFolder = path.join(tempDir, '.git');
            if (fs.existsSync(gitFolder)) {
                await fs.promises.rm(gitFolder, { recursive: true, force: true });
            }

            // Zip the folder
            const zip = new AdmZip();
            zip.addLocalFolder(tempDir);
            zip.writeZip(zipPath);

            // Send ZIP
            await sock.sendMessage(
                m.chat,
                {
                    document: fs.readFileSync(zipPath),
                    mimetype: 'application/zip',
                    fileName: `${repo}.zip`,
                    caption: ` *Repository:* ${user}/${repo}
 *Source:* https://github.com/${user}/${repo}`,
                },
                { quoted: m }
            );
            await m.react('✅');
        } catch (error) {
            console.error('GitClone Error:', error);
            await m.react('❌');
            await m.reply(` Gagal meng-clone repository: ${error.message}`);
        } finally {
            // Cleanup
            await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
            await fs.promises.unlink(zipPath).catch(() => {});
        }
    },
};

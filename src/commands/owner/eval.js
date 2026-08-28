import { exec, execSync } from 'child_process';
import { settings } from '../../config/settings.js';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

const pickPackageManager = () => {
    const has = (bin) => {
        try {
            execSyncSafe(`${bin} --version`, { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    };

    if (has('pnpm')) return 'pnpm';
    if (has('npm')) return 'npm';
    if (has('yarn')) return 'yarn';
    if (has('bun')) return 'bun';
    return null;
};

const execSyncSafe = (cmd, options = {}) => {
    return execSync(cmd, options);
};

const transformShortcut = (input) => {
    const trimmed = input.trim();
    if (!trimmed) return trimmed;

    if (/^(npm|pnpm|yarn|bun)$/i.test(trimmed)) {
        return 'echo "Gunakan subcommand. Contoh: npm install <paket> atau .x install <paket>"';
    }

    const installMatch = trimmed.match(/^install\s+(.+)$/i);
    const installShortMatch = trimmed.match(/^i\s+(.+)$/i);
    const pkgSpecFromShortcut = installMatch?.[1] || installShortMatch?.[1];
    if (!pkgSpecFromShortcut) return trimmed;

    const manager = pickPackageManager();
    const pkgSpec = pkgSpecFromShortcut.trim();
    if (!manager) {
        if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) return `pnpm add ${pkgSpec}`;
        if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) return `yarn add ${pkgSpec}`;
        if (
            fs.existsSync(path.join(projectRoot, 'bun.lockb')) ||
            fs.existsSync(path.join(projectRoot, 'bun.lock'))
        )
            return `bun add ${pkgSpec}`;
        return `npm install ${pkgSpec}`;
    }

    if (manager === 'yarn') return `yarn add ${pkgSpec}`;
    if (manager === 'bun') return `bun add ${pkgSpec}`;
    if (manager === 'pnpm') return `pnpm add ${pkgSpec}`;
    return `npm install ${pkgSpec}`;
};

const withNvmBootstrap = (command) => {
    const parts = [
        'export NVM_DIR="$HOME/.nvm"',
        '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
        '[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"',
        'command -v nvm >/dev/null 2>&1 && nvm use --silent >/dev/null 2>&1 || true',
        command,
    ];
    return parts.join(' ; ');
};

const replyUncut = async (sock, m, text, fileName) => {
    const payload = util.format(text ?? '');
    try {
        return await m.reply(payload || 'Done.');
    } catch {
        return sock.sendMessage(
            m.chat,
            {
                document: Buffer.from(payload || 'Done.', 'utf-8'),
                mimetype: 'text/plain',
                fileName,
            },
            { quoted: m }
        );
    }
};

import { checkOwner } from '../../middlewares/auth.js';
import { getCachedSettings } from '../../handlers/messageFlow.js';

export default {
    name: 'eval',
    aliases: ['exec', 'x', '>'],
    description: 'Evaluate JavaScript code or execute shell commands (Owner Only)',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        const botSettings = await getCachedSettings();
        const isOwner = checkOwner(m, sock, botSettings);
        if (!isOwner) return; // Silent return for unauthorized users

        const command = m.body.slice(settings.prefix.length).trim().split(' ')[0].toLowerCase();

        if (command === 'exec' || command === 'x') {
            if (!text) return m.reply('Provide a shell command.');
            const shellCommand = withNvmBootstrap(transformShortcut(text));
            const options = {
                cwd: fs.existsSync(projectRoot) ? projectRoot : process.cwd(),
                shell: '/bin/bash',
                env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' },
                timeout: 10 * 60 * 1000,
                maxBuffer: 10 * 1024 * 1024,
            };

            exec(shellCommand, options, (err, stdout, stderr) => {
                if (err) {
                    const errOutput = [err.message, stderr, stdout].filter(Boolean).join('\n');
                    return replyUncut(sock, m, errOutput, 'exec-error.txt');
                }

                const output = [stdout, stderr].filter(Boolean).join('\n').trim();
                if (!output) return replyUncut(sock, m, 'Done.', 'exec-output.txt');

                return replyUncut(sock, m, output, 'exec-output.txt');
            });
        } else if (command === 'eval' || command === '>') {
            if (!text) return m.reply('Provide JS code.');
            try {
                let evaled = await eval(text);
                if (typeof evaled !== 'string')
                    evaled = util.inspect(evaled, {
                        depth: null,
                        maxArrayLength: null,
                        maxStringLength: null,
                    });
                await replyUncut(sock, m, evaled, 'eval-output.txt');
            } catch (err) {
                await replyUncut(sock, m, err, 'eval-error.txt');
            }
        }
    },
};

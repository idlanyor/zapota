import { exec } from 'child_process';
import fs from 'fs';
import util from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { commands } from '../lib/commands.js';
import { settings } from '../config/settings.js';

const execAsync = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

const MODEL = process.env.OWNER_AGENT_MODEL || 'MiniMax-M3';
const MAX_TOOL_ITERATIONS = 8;

// The SDK appends /v1/messages itself, so strip a trailing /v1 some providers include in their base URL.
const normaliseBaseUrl = (url) => url?.replace(/\/v1\/?$/, '');

let anthropicPromise;
const getAnthropicClass = async () => {
    anthropicPromise ??= import('@anthropic-ai/sdk').then((m) => m.default || m);
    return anthropicPromise;
};

const getClient = async () => {
    const Anthropic = await getAnthropicClass();
    return new Anthropic({
        apiKey: process.env.OWNER_AGENT_API_KEY,
        baseURL: normaliseBaseUrl(process.env.OWNER_AGENT_BASE_URL),
    });
};

import {
    listPlugins,
    readPlugin,
    savePlugin,
    deletePlugin,
    togglePlugin,
    installPackage,
    uninstallPackage,
    gitStatus,
    gitDiff,
    gitCommit,
    gitRollback,
    validateCodeSnippet,
} from './selfManagementService.js';

const SYSTEM_PROMPT = `Kamu adalah asisten pribadi Owner bot WhatsApp ini yang memiliki kemampuan Self-Management (bisa mengelola diri sendiri, plugin, kode, library, dan git secara otonom dan aman).
Kamu memiliki akses:
1. Tool pengelolaan plugin & kode (plugin_list, plugin_read, plugin_write, plugin_delete, plugin_toggle, plugin_test).
2. Tool package/library (pkg_install, pkg_uninstall).
3. Tool git sync (git_status, git_diff, git_commit, git_rollback).
4. Tool eksekusi command bot (run_bot_command) dan shell lingkungan VPS (run_shell).

PANDUAN PEMBUATAN/MODIFIKASI PLUGIN:
- Format plugin bot adalah ES Module (export default { name, aliases, description, category, execute: async (sock, m, args, text) => { ... } }).
- Gunakan try-catch di dalam execute agar ramah error.
- Bila membutuhkan library baru, gunakan tool pkg_install terlebih dahulu.
- Setelah plugin ditulis via plugin_write, sistem otomatis mengecek syntax dan melakukan auto-rollback jika terjadi error runtime saat import.
- Jika Owner meminta fitur baru, buatkan kodenya secara lengkap, bersih, dan fungsional.
- Jika diminta menyimpan ke git, gunakan git_commit dengan pesan yang jelas.
- Jawab dalam Bahasa Indonesia dengan format WhatsApp yang rapi (*tebal*, _miring_, \`kode\`).`;

const tools = [
    {
        name: 'run_shell',
        description:
            'Execute a shell command on the VPS hosting this bot. Full access to the filesystem and OS, including passwordless sudo — prefix with "sudo" when root privileges are needed. Commands matching destructive patterns (with or without sudo) are held for manual owner confirmation instead of running immediately.',
        input_schema: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'The shell command to run' },
            },
            required: ['command'],
        },
    },
    {
        name: 'run_bot_command',
        description:
            'Invoke any registered WhatsApp bot command as if the Owner typed it directly in this chat.',
        input_schema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'Command name without prefix, e.g. "cfban" or "cfasnban"',
                },
                args: {
                    type: 'string',
                    description: 'Arguments string, e.g. "1.2.3.4 spam"',
                },
            },
            required: ['command'],
        },
    },
    {
        name: 'plugin_list',
        description: 'Daftar semua plugin bot yang terpasang beserta kategori dan status aktif/nonaktifnya.',
        input_schema: {
            type: 'object',
            properties: {
                category: { type: 'string', description: 'Filter kategori (opsional)' },
            },
        },
    },
    {
        name: 'plugin_read',
        description: 'Membaca kode sumber lengkap dari sebuah file plugin/command.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Nama plugin/command yang ingin dibaca' },
            },
            required: ['name'],
        },
    },
    {
        name: 'plugin_write',
        description: 'Membuat atau memperbarui file plugin bot. Kode akan divalidasi syntax dan auto-rollback jika gagal diimpor.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Nama plugin/command (huruf kecil tanpa spasi, misal "gempa" atau "remind")' },
                category: { type: 'string', description: 'Kategori folder di src/commands/ (contoh: "tools", "info", "general", "ai", "downloader")' },
                code: { type: 'string', description: 'Kode lengkap JavaScript (ES Module) untuk plugin' },
            },
            required: ['name', 'category', 'code'],
        },
    },
    {
        name: 'plugin_delete',
        description: 'Menghapus plugin dari bot dengan auto-backup.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Nama plugin yang ingin dihapus' },
            },
            required: ['name'],
        },
    },
    {
        name: 'plugin_toggle',
        description: 'Mengaktifkan (enable) atau menonaktifkan (disable) suatu plugin bot.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Nama plugin' },
                enable: { type: 'boolean', description: 'True untuk aktifkan, False untuk nonaktifkan' },
            },
            required: ['name', 'enable'],
        },
    },
    {
        name: 'plugin_test',
        description: 'Uji syntax string kode JavaScript sebelum disimpan.',
        input_schema: {
            type: 'object',
            properties: {
                code: { type: 'string', description: 'Kode JavaScript yang ingin diuji' },
            },
            required: ['code'],
        },
    },
    {
        name: 'pkg_install',
        description: 'Install npm package / library ke dalam bot.',
        input_schema: {
            type: 'object',
            properties: {
                packageName: { type: 'string', description: 'Nama package npm (bisa include versi, misal: "dayjs" atau "lodash@4.17.21")' },
                dev: { type: 'boolean', description: 'Simpan sebagai devDependencies jika true' },
            },
            required: ['packageName'],
        },
    },
    {
        name: 'pkg_uninstall',
        description: 'Uninstall/hapus package dari dependencies bot.',
        input_schema: {
            type: 'object',
            properties: {
                packageName: { type: 'string', description: 'Nama package npm yang ingin dihapus' },
            },
            required: ['packageName'],
        },
    },
    {
        name: 'git_status',
        description: 'Melihat status file yang berubah pada git repository bot.',
        input_schema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'git_diff',
        description: 'Melihat diff perubahan kode git repository.',
        input_schema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'Target file (opsional)' },
            },
        },
    },
    {
        name: 'git_commit',
        description: 'Melakukan git add dan git commit untuk menyimpan perubahan bot.',
        input_schema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Pesan commit (contoh: "feat: add gempa command")' },
                files: { type: 'string', description: 'File spesifik atau "." untuk semua (default ".")' },
            },
            required: ['message'],
        },
    },
    {
        name: 'git_rollback',
        description: 'Mengembalikan perubahan kode di src/commands ke commit git sebelumnya (HEAD).',
        input_schema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'Target commit atau branch (default "HEAD")' },
            },
        },
    },
];

// --- Audit log ---

const AUDIT_LOG_PATH = path.join(projectRoot, 'logs', 'owner-agent-audit.log');

const appendAuditLog = async (entry) => {
    try {
        const line = `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`;
        await fs.promises.appendFile(AUDIT_LOG_PATH, line);
    } catch (error) {
        console.error('Owner Agent Audit Log Error:', error.message);
    }
};

// --- Destructive command guard ---

const DANGEROUS_PATTERNS = [
    /\brm\s+-[a-z]*r[a-z]*f\b/i,
    /\brm\s+-[a-z]*f[a-z]*r\b/i,
    /\bmkfs\b/i,
    /\bdd\s+if=/i,
    />\s*\/dev\/sd[a-z]/i,
    /:\(\)\s*\{\s*:\|\s*:\s*&\s*\}\s*;\s*:/,
    /\b(shutdown|reboot|halt|poweroff)\b/i,
    /\biptables\s+-F\b/i,
    /\bufw\s+disable\b/i,
    /\bsystemctl\s+(stop|disable)\b/i,
    /\bkill\s+-9\s+1\b/i,
    /\bpm2\s+(delete|kill)\b/i,
    /\bgit\s+reset\s+--hard\b/i,
    /\bgit\s+push\s+--force\b/i,
    /\bdrop\s+(table|database)\b/i,
    /\btruncate\s+table\b/i,
    /\buserdel\b/i,
    /\bchmod\s+-R\s+777\s+\/\b/i,
    /\bchown\s+-R\b.*\/\s*$/i,
    /\bmkfs\.\w+\b/i,
];

const isDangerousCommand = (command) => DANGEROUS_PATTERNS.some((re) => re.test(command));

const PENDING_CONFIRMATION_TTL_MS = 2 * 60 * 1000; // 2 minutes
const pendingConfirmations = new Map(); // chatId -> { command, timestamp }

export const hasPendingConfirmation = (chatId) => {
    const pending = pendingConfirmations.get(chatId);
    if (!pending) return false;
    if (Date.now() - pending.timestamp > PENDING_CONFIRMATION_TTL_MS) {
        pendingConfirmations.delete(chatId);
        return false;
    }
    return true;
};

export const resolvePendingConfirmation = async (m, confirmed) => {
    const pending = pendingConfirmations.get(m.chat);
    pendingConfirmations.delete(m.chat);
    if (!pending) return null;

    if (!confirmed) {
        await appendAuditLog({
            type: 'run_shell_cancelled',
            chat: m.chat,
            sender: m.sender,
            command: pending.command,
        });
        return 'Command dibatalkan.';
    }

    const result = await executeShell(pending.command);
    await appendAuditLog({
        type: 'run_shell_confirmed',
        chat: m.chat,
        sender: m.sender,
        command: pending.command,
        result: result.slice(0, 2000),
    });
    return `✅ Command dikonfirmasi dan dijalankan:\n\n${result}`;
};

// --- Tool execution ---

const executeShell = async (command) => {
    try {
        const { stdout, stderr } = await execAsync(command, {
            shell: '/bin/bash',
            cwd: projectRoot,
            timeout: 5 * 60 * 1000,
            maxBuffer: 5 * 1024 * 1024,
            env: process.env,
        });
        return [stdout, stderr].filter(Boolean).join('\n').trim() || '(no output)';
    } catch (error) {
        return [`Error: ${error.message}`, error.stdout, error.stderr]
            .filter(Boolean)
            .join('\n')
            .trim();
    }
};

export const runShellTool = async (m, command) => {
    if (isDangerousCommand(command)) {
        pendingConfirmations.set(m.chat, { command, timestamp: Date.now() });
        await appendAuditLog({
            type: 'run_shell_blocked',
            chat: m.chat,
            sender: m.sender,
            command,
        });
        return `[GUARD] Command ini terdeteksi berpotensi destruktif dan TIDAK dijalankan otomatis: "${command}"\nMinta Owner balas "CONFIRM" (tanpa tag bot) dalam 2 menit untuk menjalankannya, atau "CANCEL" untuk membatalkan.`;
    }

    const result = await executeShell(command);
    await appendAuditLog({
        type: 'run_shell',
        chat: m.chat,
        sender: m.sender,
        command,
        result: result.slice(0, 2000),
    });
    return result;
};

export const executeBotCommand = async (
    sock,
    m,
    commandName,
    argsString = '',
    { isOwner = false } = {}
) => {
    const cmd = commands.get(String(commandName).toLowerCase());
    if (!cmd) return `Command not found: ${commandName}`;
    if (cmd.category === 'Owner' && !isOwner) {
        return `Akses ditolak: command ${cmd.name} hanya untuk Owner.`;
    }
    if (cmd.name === 'ai') {
        return 'Command .ai tidak dapat memanggil dirinya sendiri.';
    }

    const args = argsString ? argsString.split(' ') : [];
    const captured = [];
    const sentOutputs = [];
    const fakeM = Object.create(m);
    fakeM.args = args;
    fakeM.text = argsString;
    fakeM.body = `${settings.prefix}${cmd.name}${argsString ? ` ${argsString}` : ''}`;
    fakeM.isOwner = isOwner;
    fakeM.reply = async (content, opts) => {
        captured.push(typeof content === 'string' ? content : '[non-text reply]');
        return m.reply.call(m, content, opts);
    };

    const toolSock = new Proxy(sock, {
        get(target, property) {
            if (property === 'sendMessage') {
                return async (jid, content, ...rest) => {
                    if (content?.audio) sentOutputs.push('audio');
                    else if (content?.video) sentOutputs.push('video');
                    else if (content?.image) sentOutputs.push('gambar');
                    else if (content?.document) sentOutputs.push('dokumen');
                    else if (content?.sticker) sentOutputs.push('stiker');
                    else if (content?.text) sentOutputs.push('pesan teks');
                    return target.sendMessage(jid, content, ...rest);
                };
            }

            const value = target[property];
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });

    let result;
    try {
        await cmd.execute(toolSock, fakeM, args, argsString);
        const uniqueOutputs = [...new Set(sentOutputs)];
        if (uniqueOutputs.length > 0) {
            result = [
                `Command ${cmd.name} selesai dijalankan.`,
                `Output yang sudah berhasil dikirim ke pengguna: ${uniqueOutputs.join(', ')}.`,
                captured.length > 0 ? `Pesan status command:\n${captured.join('\n')}` : '',
                'Jangan katakan output masih diproses atau akan dikirim; output tersebut sudah terkirim.',
            ]
                .filter(Boolean)
                .join('\n');
        } else {
            result =
                captured.join('\n') ||
                `Command ${cmd.name} selesai dijalankan tanpa output pesan yang terdeteksi.`;
        }
    } catch (error) {
        result = `Command error: ${error.message}`;
    }

    await appendAuditLog({
        type: 'run_bot_command',
        chat: m.chat,
        sender: m.sender,
        command: commandName,
        args: argsString,
        result: String(result).slice(0, 2000),
    });
    return result;
};

// --- Conversation memory (resets every 1 hour, per chat) ---

const MEMORY_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_HISTORY_MESSAGES = 20; // last ~10 turns
const chatMemories = new Map(); // chatId -> { messages, timestamp }

const getMemory = (chatId) => {
    const existing = chatMemories.get(chatId);
    if (!existing) return [];
    if (Date.now() - existing.timestamp > MEMORY_TTL_MS) {
        chatMemories.delete(chatId);
        return [];
    }
    return existing.messages;
};

const saveMemory = (chatId, messages) => {
    const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);
    chatMemories.set(chatId, { messages: trimmed, timestamp: Date.now() });
};

// --- Context building ---

const quotedTypeLabel = (q) => {
    if (q.isImage) return 'gambar';
    if (q.isVideo) return 'video';
    if (q.isAudio) return 'audio';
    if (q.isSticker) return 'stiker';
    if (q.isDocument) return 'dokumen';
    return 'teks';
};

const buildContextualMessage = (m) => {
    const parts = [];

    const senderName = m.pushName || (m.sender ? m.sender.split('@')[0] : 'Owner');
    if (m.isGroup) {
        const groupTitle = m.metadata?.subject || 'Grup WhatsApp';
        parts.push(`[ContextInfo: Chat berlangsung di GRUP "${groupTitle}". Pengirim pesan ini adalah Owner bot (${senderName}).]`);
    } else {
        parts.push(`[ContextInfo: Chat berlangsung di PRIVATE CHAT dengan Owner bot (${senderName}).]`);
    }

    if (m.quoted) {
        const q = m.quoted;
        const senderTag = q.sender ? `@${q.sender.split('@')[0]}` : 'tidak diketahui';
        parts.push(`[ContextInfo: Owner me-reply pesan dari ${senderTag} (fromMe: ${q.fromMe})]`);
        parts.push(`Tipe pesan yang di-reply: ${quotedTypeLabel(q)}`);
        if (q.text) parts.push(`Isi pesan yang di-reply: "${q.text}"`);
    }

    if (Array.isArray(m.mentionedJid) && m.mentionedJid.length > 0) {
        const numbers = m.mentionedJid.map((jid) => jid.split('@')[0]).join(', ');
        parts.push(`[ContextInfo: Nomor yang ditag di pesan ini: ${numbers}]`);
    }

    parts.push(m.body || '');
    return parts.join('\n');
};

// --- Main agent loop ---

export const runOwnerAgent = async (sock, m) => {
    const client = await getClient();
    // Session dipisah per room chat (grup vs private terpisah otomatis lewat m.chat)
    const sessionKey = m.chat;
    const history = getMemory(sessionKey);
    const userMessage = { role: 'user', content: buildContextualMessage(m) };
    const messages = [...history, userMessage];

    let finalText = '';

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        const response = await client.messages.create({
            model: MODEL,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools,
            messages,
        });

        const toolUses = response.content.filter((b) => b.type === 'tool_use');
        const textBlocks = response.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .trim();

        if (toolUses.length === 0) {
            finalText = textBlocks || '(tidak ada respon dari agent)';
            break;
        }

        messages.push({ role: 'assistant', content: response.content });

        const toolResults = [];
        for (const toolUse of toolUses) {
            let result;
            if (toolUse.name === 'run_shell') {
                result = await runShellTool(m, toolUse.input.command);
            } else if (toolUse.name === 'run_bot_command') {
                result = await executeBotCommand(
                    sock,
                    m,
                    toolUse.input.command,
                    toolUse.input.args || '',
                    { isOwner: true }
                );
            } else if (toolUse.name === 'plugin_list') {
                const list = listPlugins();
                const filtered = toolUse.input?.category
                    ? list.filter((p) => p.category.toLowerCase() === toolUse.input.category.toLowerCase())
                    : list;
                result = `Total ${filtered.length} plugin:\n` +
                    filtered.map((p) => `- ${p.name} [${p.category}] ${p.disabled ? '(NONAKTIF)' : '(AKTIF)'}`).join('\n');
            } else if (toolUse.name === 'plugin_read') {
                try {
                    const data = readPlugin(toolUse.input.name);
                    result = `File: ${data.filePath}\nStatus: ${data.isDisabled ? 'NONAKTIF' : 'AKTIF'}\n\n${data.content}`;
                } catch (e) {
                    result = `Gagal membaca plugin: ${e.message}`;
                }
            } else if (toolUse.name === 'plugin_write') {
                const saveRes = await savePlugin({
                    name: toolUse.input.name,
                    category: toolUse.input.category,
                    code: toolUse.input.code,
                });
                if (saveRes.success) {
                    result = `Berhasil menyimpan plugin "${toolUse.input.name}" di "${saveRes.filePath}". Plugin otomatis aktif dan terdaftar di bot runtime.`;
                } else {
                    result = `Gagal menyimpan plugin: ${saveRes.error}${saveRes.rolledBack ? ' (Otomatis di-rollback ke versi sebelumnya/dibatalkan)' : ''}`;
                }
            } else if (toolUse.name === 'plugin_delete') {
                try {
                    const delRes = await deletePlugin(toolUse.input.name);
                    result = `Plugin "${toolUse.input.name}" berhasil dihapus. Backup tersimpan di: ${delRes.backupPath}`;
                } catch (e) {
                    result = `Gagal menghapus plugin: ${e.message}`;
                }
            } else if (toolUse.name === 'plugin_toggle') {
                try {
                    const togRes = await togglePlugin(toolUse.input.name, toolUse.input.enable);
                    result = `Toggle plugin berhasil: ${togRes.message || (togRes.enabled ? 'Aktif' : 'Nonaktif')}`;
                } catch (e) {
                    result = `Gagal toggle plugin: ${e.message}`;
                }
            } else if (toolUse.name === 'plugin_test') {
                const valRes = await validateCodeSnippet(toolUse.input.code);
                result = valRes.valid ? 'Syntax valid, tidak ada error.' : `Syntax Error: ${valRes.error}`;
            } else if (toolUse.name === 'pkg_install') {
                try {
                    const pkgRes = await installPackage(toolUse.input.packageName, toolUse.input.dev);
                    result = `Package berhasil diinstall via ${pkgRes.manager}:\n${pkgRes.output || 'Selesai.'}`;
                } catch (e) {
                    result = `Gagal install package: ${e.message}`;
                }
            } else if (toolUse.name === 'pkg_uninstall') {
                try {
                    const unRes = await uninstallPackage(toolUse.input.packageName);
                    result = `Package berhasil diuninstall via ${unRes.manager}:\n${unRes.output || 'Selesai.'}`;
                } catch (e) {
                    result = `Gagal uninstall package: ${e.message}`;
                }
            } else if (toolUse.name === 'git_status') {
                result = await gitStatus();
            } else if (toolUse.name === 'git_diff') {
                result = await gitDiff(toolUse.input?.target || '');
            } else if (toolUse.name === 'git_commit') {
                try {
                    result = await gitCommit(toolUse.input.message, toolUse.input.files || '.');
                } catch (e) {
                    result = `Gagal commit git: ${e.message}`;
                }
            } else if (toolUse.name === 'git_rollback') {
                try {
                    result = await gitRollback(toolUse.input?.target || 'HEAD');
                } catch (e) {
                    result = `Gagal rollback git: ${e.message}`;
                }
            } else {
                result = `Unknown tool: ${toolUse.name}`;
            }
            toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: String(result).slice(0, 8000),
            });
        }
        messages.push({ role: 'user', content: toolResults });
    }

    if (!finalText) finalText = 'Agent berhenti setelah terlalu banyak iterasi tool.';

    saveMemory(sessionKey, [...history, userMessage, { role: 'assistant', content: finalText }]);

    return finalText;
};

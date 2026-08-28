import Anthropic from '@anthropic-ai/sdk';
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

const getClient = () =>
    new Anthropic({
        apiKey: process.env.OWNER_AGENT_API_KEY,
        baseURL: normaliseBaseUrl(process.env.OWNER_AGENT_BASE_URL),
    });

const SYSTEM_PROMPT = `Kamu adalah asisten pribadi Owner bot WhatsApp ini. Kamu memiliki akses penuh ke seluruh command bot (lewat tool run_bot_command) dan ke shell environment VPS tempat bot ini berjalan (lewat tool run_shell). Akun shell punya akses sudo tanpa password, jadi kamu boleh memakai "sudo" di command run_shell kapan pun perlu (misal install package, restart service, baca file yang butuh root) tanpa perlu minta izin tambahan. Bertindak sebagai asisten yang serba bisa, teknis, ringkas, dan langsung membantu menyelesaikan permintaan Owner. Hanya Owner yang bisa mengakses kamu, jadi tidak perlu konfirmasi izin tambahan untuk setiap aksi yang diminta. Pesan dari Owner kadang diawali baris [ContextInfo: ...] yang berisi info pesan yang di-reply atau nomor yang ditag di chat WhatsApp — gunakan info itu untuk memahami konteks permintaan. Kamu mengingat percakapan dalam 1 jam terakhir di chat yang sama. Beberapa command shell yang berpotensi merusak (termasuk yang memakai sudo) akan otomatis ditahan oleh sistem dan butuh konfirmasi manual dari Owner — kalau itu terjadi, sampaikan saja pesan konfirmasinya ke Owner. Jawab dalam Bahasa Indonesia kecuali diminta lain.`;

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
    const client = getClient();
    const chatId = m.chat;
    const history = getMemory(chatId);
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

    saveMemory(chatId, [...history, userMessage, { role: 'assistant', content: finalText }]);

    return finalText;
};

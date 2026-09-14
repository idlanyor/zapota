import { commands } from './commands.js';
import { executeBotCommand, runShellTool } from '../services/ownerAgent.js';
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
} from '../services/selfManagementService.js';
import logger from '../utils/logger.js';

const CHAT_HISTORY_TTL_MS = 30 * 60 * 1000;
const MAX_CHAT_HISTORY_SIZE = 15;
const MAX_TOTAL_CHATS = 100;
const MAX_TOOL_ITERATIONS = 20;
const chatHistories = new Map();

const getApiConfig = () => {
    const apiKey = process.env.AI_AGENT_API_KEY;
    const baseURL = process.env.AI_AGENT_BASE_URL?.replace(/\/+$/, '');

    if (!apiKey) throw new Error('AI_AGENT_API_KEY belum diset.');
    if (!baseURL) throw new Error('AI_AGENT_BASE_URL belum diset.');

    return { apiKey, endpoint: `${baseURL}/messages` };
};

const normaliseJsonResponse = (payload) => {
    if (Array.isArray(payload?.content)) return payload;

    const message = payload?.choices?.[0]?.message;
    if (!message) throw new Error('Format respons AI tidak dikenali.');

    const content = [];
    if (message.content) content.push({ type: 'text', text: message.content });
    for (const call of message.tool_calls || []) {
        let input = {};
        try {
            input = JSON.parse(call.function?.arguments || '{}');
        } catch {}
        content.push({
            type: 'tool_use',
            id: call.id,
            name: call.function?.name,
            input,
        });
    }
    return { content, stop_reason: payload.choices?.[0]?.finish_reason };
};

const createStreamingMessage = async (requestBody, onTextDelta) => {
    const { apiKey, endpoint } = getApiConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ ...requestBody, stream: true }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`AI API ${response.status}: ${errorBody.slice(0, 500)}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return normaliseJsonResponse(await response.json());
        }
        if (!response.body) throw new Error('AI API tidak mengirim response body.');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const blocks = new Map();
        let buffer = '';
        let stopReason = null;
        let streamedText = '';

        const handleEvent = async (event) => {
            if (event.type === 'content_block_start') {
                const block = { ...event.content_block };
                if (block.type === 'tool_use') block._inputJson = '';
                blocks.set(event.index, block);
                return false;
            }

            if (event.type === 'content_block_delta') {
                const block = blocks.get(event.index);
                if (!block) return false;

                if (event.delta?.type === 'text_delta') {
                    block.text = `${block.text || ''}${event.delta.text || ''}`;
                    streamedText += event.delta.text || '';
                    if (onTextDelta && streamedText.trim()) await onTextDelta(streamedText);
                } else if (event.delta?.type === 'input_json_delta') {
                    block._inputJson += event.delta.partial_json || '';
                }
                return false;
            }

            if (event.type === 'content_block_stop') {
                const block = blocks.get(event.index);
                if (block?.type === 'tool_use') {
                    try {
                        block.input = JSON.parse(block._inputJson || '{}');
                    } catch {
                        block.input = {};
                    }
                    delete block._inputJson;
                }
                return false;
            }

            if (event.type === 'message_delta') {
                stopReason = event.delta?.stop_reason || stopReason;
                return false;
            }

            return event.type === 'message_stop';
        };

        while (true) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            buffer = buffer.replace(/\r\n/g, '\n');

            let separator;
            while ((separator = buffer.indexOf('\n\n')) !== -1) {
                const rawEvent = buffer.slice(0, separator);
                buffer = buffer.slice(separator + 2);
                const data = rawEvent
                    .split('\n')
                    .filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).trimStart())
                    .join('\n');
                if (!data || data === '[DONE]') continue;

                let event;
                try {
                    event = JSON.parse(data);
                } catch {
                    continue;
                }

                if (event.type === 'error') {
                    throw new Error(event.error?.message || 'Streaming AI gagal.');
                }
                if (await handleEvent(event)) {
                    await reader.cancel().catch(() => {});
                    return {
                        content: [...blocks.entries()]
                            .sort((a, b) => a[0] - b[0])
                            .map(([, block]) => block),
                        stop_reason: stopReason,
                    };
                }
            }

            if (done) break;
        }

        if (blocks.size === 0) throw new Error('Stream AI berakhir tanpa konten.');
        return {
            content: [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, block]) => block),
            stop_reason: stopReason,
        };
    } finally {
        clearTimeout(timeout);
    }
};

export const clearChatHistory = (chatId) => chatHistories.delete(chatId);

export const cleanupChatHistories = () => {
    const now = Date.now();
    let cleaned = 0;

    for (const [chatId, data] of chatHistories.entries()) {
        if (now - data.timestamp > CHAT_HISTORY_TTL_MS) {
            chatHistories.delete(chatId);
            cleaned++;
        }
    }

    if (chatHistories.size > MAX_TOTAL_CHATS) {
        const oldest = [...chatHistories.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
        for (const [chatId] of oldest.slice(0, chatHistories.size - MAX_TOTAL_CHATS)) {
            chatHistories.delete(chatId);
            cleaned++;
        }
    }

    return cleaned;
};

const getChatHistory = (chatId) => {
    const existing = chatHistories.get(chatId);
    if (!existing) return [];

    if (Date.now() - existing.timestamp > CHAT_HISTORY_TTL_MS) {
        chatHistories.delete(chatId);
        return [];
    }

    return existing.messages;
};

const setChatHistory = (chatId, messages) => {
    if (chatHistories.size >= MAX_TOTAL_CHATS) cleanupChatHistories();
    chatHistories.set(chatId, {
        messages: messages.slice(-MAX_CHAT_HISTORY_SIZE),
        timestamp: Date.now(),
    });
};

const commandCatalog = (isOwner) => {
    const unique = new Map();
    for (const command of commands.values()) {
        if (!command?.name || (!isOwner && command.category === 'Owner')) continue;
        unique.set(command.name, command);
    }
    return [...unique.values()]
        .map((command) => `${command.name}: ${command.description || 'tanpa deskripsi'}`)
        .join('\n');
};

const buildSystemInstruction = (customSystemInstruction, isOwner, m = null) => {
    const persona = customSystemInstruction
        ? customSystemInstruction
        : `Kamu adalah KanataBot, asisten AI yang cerdas. Selalu jawab dalam Bahasa Indonesia kecuali diminta lain. Jangan gunakan emoji kecuali pengguna memintanya.`;

    const chatContext = m?.isGroup
        ? `Kamu sedang diajak bicara di sebuah GRUP WhatsApp "${m.metadata?.subject || 'Grup'}". ${isOwner ? 'Pengirim pesan saat ini adalah OWNER bot (kenali dia sebagai Owner/pemilikmu).' : 'Pengirim pesan saat ini BUKAN Owner.'}`
        : `Kamu sedang diajak bicara di PRIVATE CHAT. ${isOwner ? 'Pengguna saat ini adalah OWNER bot.' : 'Pengguna saat ini BUKAN Owner.'}`;

    return `${persona}

Konteks Percakapan:
${chatContext}

Waktu saat ini: ${new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        dateStyle: 'full',
        timeStyle: 'long',
    })}.

Gunakan format WhatsApp: *tebal*, _miring_, \`kode\`, dan blok kode tiga backtick. Jangan gunakan markdown double-asterisk.
Kamu dapat menjalankan command bot yang relevan melalui run_bot_command. Gunakan nama command tanpa prefix dan jangan mengarang nama command.
Setelah tool selesai, baca hasil tool secara harfiah. Jika hasil menyatakan media atau output sudah dikirim, katakan bahwa output sudah dikirim dan jangan menyebutnya masih diproses atau akan segera dikirim.
${isOwner ? `Pengguna ini adalah OWNER bot dan memiliki akses penuh ke fitur Self-Management (plugin_list, plugin_read, plugin_write, plugin_delete, plugin_toggle, plugin_test, pkg_install, pkg_uninstall, git_status, git_diff, git_commit, git_rollback) serta run_shell bila diperlukan.
Bila Owner meminta bantuan membuat/memperbaiki fitur, baca kodenya dengan plugin_read, perbaiki, tulis dengan plugin_write, dan bila perlu install library dengan pkg_install atau simpan dengan git_commit.` : 'Pengguna ini bukan Owner. Kamu tidak memiliki akses shell atau command khusus Owner.'}

Command yang tersedia:
${commandCatalog(isOwner)}`;
};

const buildTools = (isOwner) => {
    const availableTools = [
        {
            name: 'run_bot_command',
            description:
                'Jalankan command WhatsApp bot yang tersedia bagi pengguna ini. Nama command ditulis tanpa prefix.',
            input_schema: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Nama command tanpa prefix' },
                    args: { type: 'string', description: 'Argumen command sebagai satu string' },
                },
                required: ['command'],
            },
        },
    ];

    if (isOwner) {
        availableTools.push(
            {
                name: 'run_shell',
                description:
                    'Jalankan command shell pada server bot. Command destruktif akan ditahan untuk konfirmasi manual.',
                input_schema: {
                    type: 'object',
                    properties: {
                        command: { type: 'string', description: 'Command shell yang akan dijalankan' },
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
                        packageName: { type: 'string', description: 'Nama package npm (bisa include versi)' },
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
                        message: { type: 'string', description: 'Pesan commit' },
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
            }
        );
    }

    return availableTools;
};

const imageContent = (buffer, mimeType) => {
    if (!buffer) return null;
    const allowed = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
    const mediaType = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
    if (!allowed.has(mediaType)) {
        throw new Error(`Format gambar ${mimeType || 'tidak diketahui'} tidak didukung.`);
    }

    return {
        type: 'image',
        source: {
            type: 'base64',
            media_type: mediaType,
            data: buffer.toString('base64'),
        },
    };
};

export const generateAIResponse = async ({
    sock,
    m,
    prompt,
    imageBuffer = null,
    imageMime = null,
    customSystemInstruction = null,
    chatId = null,
    isOwner = false,
    onTextDelta = null,
}) => {
    const history = chatId ? getChatHistory(chatId) : [];
    const userContent = [];
    const image = imageContent(imageBuffer, imageMime);
    if (image) userContent.push(image);
    userContent.push({ type: 'text', text: prompt || 'Analisis gambar ini.' });

    const messages = [...history, { role: 'user', content: userContent }];
    let finalText = '';

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const response = await createStreamingMessage(
            {
                model: process.env.AI_AGENT_MODEL || 'Kanata',
                max_tokens: 4096,
                system: buildSystemInstruction(customSystemInstruction, isOwner, m),
                tools: buildTools(isOwner),
                messages,
            },
            onTextDelta
        );

        const toolUses = response.content.filter((block) => block.type === 'tool_use');
        const text = response.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('\n')
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .trim();

        if (toolUses.length === 0) {
            finalText = text || '(tidak ada respons dari AI)';
            break;
        }

        messages.push({ role: 'assistant', content: response.content });
        const toolResults = [];

        for (const toolUse of toolUses) {
            let result;
            if (toolUse.name === 'run_bot_command') {
                result = await executeBotCommand(
                    sock,
                    m,
                    toolUse.input.command,
                    toolUse.input.args || '',
                    { isOwner }
                );
            } else if (toolUse.name === 'run_shell' && isOwner) {
                result = await runShellTool(m, toolUse.input.command);
            } else if (toolUse.name === 'plugin_list' && isOwner) {
                const list = listPlugins();
                const filtered = toolUse.input?.category
                    ? list.filter((p) => p.category.toLowerCase() === toolUse.input.category.toLowerCase())
                    : list;
                result = `Total ${filtered.length} plugin:\n` +
                    filtered.map((p) => `- ${p.name} [${p.category}] ${p.disabled ? '(NONAKTIF)' : '(AKTIF)'}`).join('\n');
            } else if (toolUse.name === 'plugin_read' && isOwner) {
                try {
                    const data = readPlugin(toolUse.input.name);
                    result = `File: ${data.filePath}\nStatus: ${data.isDisabled ? 'NONAKTIF' : 'AKTIF'}\n\n${data.content}`;
                } catch (e) {
                    result = `Gagal membaca plugin: ${e.message}`;
                }
            } else if (toolUse.name === 'plugin_write' && isOwner) {
                const saveRes = await savePlugin({
                    name: toolUse.input.name,
                    category: toolUse.input.category,
                    code: toolUse.input.code,
                });
                if (saveRes.success) {
                    result = `Berhasil menyimpan plugin "${toolUse.input.name}" di "${saveRes.filePath}". Plugin otomatis aktif dan terdaftar di bot runtime.`;
                } else {
                    result = `Gagal menyimpan plugin: ${saveRes.error}${saveRes.rolledBack ? ' (Otomatis di-rollback/dibatalkan)' : ''}`;
                }
            } else if (toolUse.name === 'plugin_delete' && isOwner) {
                try {
                    const delRes = await deletePlugin(toolUse.input.name);
                    result = `Plugin "${toolUse.input.name}" berhasil dihapus. Backup tersimpan di: ${delRes.backupPath}`;
                } catch (e) {
                    result = `Gagal menghapus plugin: ${e.message}`;
                }
            } else if (toolUse.name === 'plugin_toggle' && isOwner) {
                try {
                    const togRes = await togglePlugin(toolUse.input.name, toolUse.input.enable);
                    result = `Toggle plugin berhasil: ${togRes.message || (togRes.enabled ? 'Aktif' : 'Nonaktif')}`;
                } catch (e) {
                    result = `Gagal toggle plugin: ${e.message}`;
                }
            } else if (toolUse.name === 'plugin_test' && isOwner) {
                const valRes = await validateCodeSnippet(toolUse.input.code);
                result = valRes.valid ? 'Syntax valid, tidak ada error.' : `Syntax Error: ${valRes.error}`;
            } else if (toolUse.name === 'pkg_install' && isOwner) {
                try {
                    const pkgRes = await installPackage(toolUse.input.packageName, toolUse.input.dev);
                    result = `Package berhasil diinstall via ${pkgRes.manager}:\n${pkgRes.output || 'Selesai.'}`;
                } catch (e) {
                    result = `Gagal install package: ${e.message}`;
                }
            } else if (toolUse.name === 'pkg_uninstall' && isOwner) {
                try {
                    const unRes = await uninstallPackage(toolUse.input.packageName);
                    result = `Package berhasil diuninstall via ${unRes.manager}:\n${unRes.output || 'Selesai.'}`;
                } catch (e) {
                    result = `Gagal uninstall package: ${e.message}`;
                }
            } else if (toolUse.name === 'git_status' && isOwner) {
                result = await gitStatus();
            } else if (toolUse.name === 'git_diff' && isOwner) {
                result = await gitDiff(toolUse.input?.target || '');
            } else if (toolUse.name === 'git_commit' && isOwner) {
                try {
                    result = await gitCommit(toolUse.input.message, toolUse.input.files || '.');
                } catch (e) {
                    result = `Gagal commit git: ${e.message}`;
                }
            } else if (toolUse.name === 'git_rollback' && isOwner) {
                try {
                    result = await gitRollback(toolUse.input?.target || 'HEAD');
                } catch (e) {
                    result = `Gagal rollback git: ${e.message}`;
                }
            } else {
                result = 'Tool tidak tersedia untuk pengguna ini.';
            }

            logger.agent({
                phase: 'TOOL',
                room: m?.isGroup ? m.metadata?.subject || m.chat : 'Private',
                sender: m?.pushName || m?.sender?.split('@')[0] || '',
                action: `${toolUse.name}(${JSON.stringify(toolUse.input || {}).slice(0, 50)})`,
                result: String(result).replace(/\n/g, ' ').slice(0, 60),
            });

            toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: String(result).slice(0, 8000),
            });
        }

        messages.push({ role: 'user', content: toolResults });
    }

    if (!finalText) {
        // Jika batas iterasi tercapai saat masih memanggil tool, minta AI menyimpulkan temuan
        try {
            messages.push({
                role: 'user',
                content: [{ type: 'text', text: 'Berdasarkan semua langkah pengecekan dan investigasi di atas, berikan kesimpulan temuan dan solusinya kepada Owner sekarang.' }],
            });
            const summaryRes = await createStreamingMessage({
                model: process.env.AI_AGENT_MODEL || 'Kanata',
                max_tokens: 4096,
                system: buildSystemInstruction(customSystemInstruction, isOwner, m),
                messages,
            });
            finalText = summaryRes.content
                ?.filter((b) => b.type === 'text')
                .map((b) => b.text)
                .join('\n')
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .trim() || 'AI telah menyelesaikan pemeriksaan.';
        } catch {
            finalText = 'AI telah menyelesaikan langkah pemeriksaan namun mencapai batas waktu/iterasi.';
        }
    }

    logger.agent({
        phase: 'DONE',
        room: m?.isGroup ? m.metadata?.subject || m.chat : 'Private',
        sender: m?.pushName || m?.sender?.split('@')[0] || '',
        action: 'Response Generated',
        result: finalText.replace(/\n/g, ' ').slice(0, 80),
    });

    if (chatId) {
        const storedPrompt = imageBuffer ? `[Gambar terlampir]\n${prompt || ''}`.trim() : prompt;
        setChatHistory(chatId, [
            ...history,
            { role: 'user', content: storedPrompt || 'Analisis gambar ini.' },
            { role: 'assistant', content: finalText },
        ]);
    }

    return finalText.replace(/\*\*(.*?)\*\*/g, '*$1*');
};

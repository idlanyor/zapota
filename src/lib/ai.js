import { commands } from './commands.js';
import { executeBotCommand, runShellTool } from '../services/ownerAgent.js';

const CHAT_HISTORY_TTL_MS = 30 * 60 * 1000;
const MAX_CHAT_HISTORY_SIZE = 15;
const MAX_TOTAL_CHATS = 100;
const MAX_TOOL_ITERATIONS = 8;
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

const buildSystemInstruction = (customSystemInstruction, isOwner) => {
    const persona = customSystemInstruction
        ? customSystemInstruction
        : `Kamu adalah KanataBot, asisten AI yang cerdas. Selalu jawab dalam Bahasa Indonesia kecuali diminta lain. Jangan gunakan emoji kecuali pengguna memintanya.`;

    return `${persona}

Waktu saat ini: ${new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        dateStyle: 'full',
        timeStyle: 'long',
    })}.

Gunakan format WhatsApp: *tebal*, _miring_, \`kode\`, dan blok kode tiga backtick. Jangan gunakan markdown double-asterisk.
Kamu dapat menjalankan command bot yang relevan melalui run_bot_command. Gunakan nama command tanpa prefix dan jangan mengarang nama command.
Setelah tool selesai, baca hasil tool secara harfiah. Jika hasil menyatakan media atau output sudah dikirim, katakan bahwa output sudah dikirim dan jangan menyebutnya masih diproses atau akan segera dikirim.
${isOwner ? 'Pengguna ini adalah Owner dan kamu juga dapat memakai run_shell bila memang diperlukan.' : 'Pengguna ini bukan Owner. Kamu tidak memiliki akses shell atau command khusus Owner.'}

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
        availableTools.push({
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
        });
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
                system: buildSystemInstruction(customSystemInstruction, isOwner),
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
            } else {
                result = 'Tool tidak tersedia untuk pengguna ini.';
            }

            toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: String(result).slice(0, 8000),
            });
        }

        messages.push({ role: 'user', content: toolResults });
    }

    if (!finalText) finalText = 'AI berhenti setelah terlalu banyak iterasi tool.';

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

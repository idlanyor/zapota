import { reply, normalizeJid, decodeBase64Data } from '../http.js';

/** Resolve socket + recipient shared by every send-* route. */
const prepare = async ({ body, getSocket }) => {
    const input = await body();
    const sock = getSocket();
    if (!sock) return { error: reply(503, { ok: false, error: 'Bot socket unavailable' }) };
    const to = normalizeJid(input.to);
    if (!to) return { error: reply(400, { ok: false, error: 'Invalid payload. Required: to' }) };
    return { input, sock, to };
};

const sent = (to, result) => reply(200, { ok: true, data: { to, messageId: result?.key?.id } });

export default [
    {
        method: 'POST',
        path: '/api/webhook/send-text',
        handler: async (ctx) => {
            const { error, input, sock, to } = await prepare(ctx);
            if (error) return error;
            const text = typeof input.text === 'string' ? input.text.trim() : '';
            if (!text) return reply(400, { ok: false, error: 'Invalid payload. Required: text' });
            return sent(to, await sock.sendMessage(to, { text }));
        },
    },
    {
        method: 'POST',
        path: '/api/webhook/send-document',
        handler: async (ctx) => {
            const { error, input, sock, to } = await prepare(ctx);
            if (error) return error;
            const document = decodeBase64Data(input.data);
            if (!document)
                return reply(400, { ok: false, error: 'Invalid payload. Required: base64 data' });
            const result = await sock.sendMessage(to, {
                document,
                mimetype: input.mimetype || 'application/pdf',
                fileName: input.fileName || 'document.pdf',
                caption: input.caption || '',
            });
            return sent(to, result);
        },
    },
    {
        // Used by the Werewolf web app: caption with a large link-preview image.
        method: 'POST',
        path: '/api/webhook/send-image',
        handler: async (ctx) => {
            const { error, input, sock, to } = await prepare(ctx);
            if (error) return error;
            const imageUrl = typeof input.url === 'string' ? input.url.trim() : '';
            if (!/^https?:\/\//i.test(imageUrl)) {
                return reply(400, {
                    ok: false,
                    error: 'Invalid payload. Required: https image url',
                });
            }
            const image = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
            if (!image.ok) throw new Error(`Thumbnail HTTP ${image.status}`);
            const thumbnail = Buffer.from(await image.arrayBuffer());
            const result = await sock.sendMessage(to, {
                text: typeof input.caption === 'string' ? input.caption : '',
                contextInfo: {
                    externalAdReply: {
                        title: '⌂ W E R E W O L F',
                        body: 'Ultimate Werewolf',
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        thumbnail,
                        thumbnailUrl: imageUrl,
                        sourceUrl: '',
                        mediaUrl: imageUrl,
                    },
                },
            });
            return sent(to, result);
        },
    },
];

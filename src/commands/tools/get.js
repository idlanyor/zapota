import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import axios from 'axios';
import logger from '../../utils/logger.js';
import { looksLikeMedia, probeMedia, prepareMediaForWa } from '../../lib/getMedia.js';
import { videoQueue } from '../../lib/queue.js';

const MAX_DOWNLOAD_SIZE = 1024 * 1024 * 1024;

function detectMimeFromUrl(url) {
    const ext = path.extname(new URL(url).pathname).toLowerCase().replace('.', '');
    const map = {
        mp4: 'video/mp4',
        mkv: 'video/x-matroska',
        avi: 'video/x-msvideo',
        ts: 'video/mp2t',
        webm: 'video/webm',
        mov: 'video/quicktime',
        mp3: 'audio/mpeg',
        m4a: 'audio/mp4',
        ogg: 'audio/ogg; codecs=opus',
        opus: 'audio/ogg; codecs=opus',
        wav: 'audio/wav',
        flac: 'audio/flac',
        aac: 'audio/aac',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        pdf: 'application/pdf',
        json: 'application/json',
        txt: 'text/plain',
    };
    return map[ext] || '';
}

export default {
    name: 'get',
    aliases: ['get'],
    description: 'Ambil URL dan siapkan video/audio untuk pemutar WhatsApp',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Please provide a URL.');

        let url = text.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

        const react = async (emoji) => {
            try { await m.react(emoji); } catch {}
        };
        await react('⏳');
        let tempDir;

        try {
            const parsedUrl = new URL(url);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('URL harus HTTP atau HTTPS.');
            tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mybot-get-'));
            const tempFilePath = path.join(tempDir, 'download');
            const response = await axios.get(url, {
                timeout: 600000,
                maxContentLength: MAX_DOWNLOAD_SIZE,
                maxBodyLength: MAX_DOWNLOAD_SIZE,
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
            });

            const rawContentType = response.headers['content-type'] || '';
            let mime = rawContentType.split(';')[0].trim().toLowerCase();

            if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
                const detected = detectMimeFromUrl(url);
                if (detected) mime = detected;
            }

            if (mime === 'audio/mp3') mime = 'audio/mpeg';

            let downloadedSize = 0;
            const limiter = new Transform({
                transform(chunk, encoding, callback) {
                    downloadedSize += chunk.length;
                    callback(downloadedSize > MAX_DOWNLOAD_SIZE
                        ? new Error('Ukuran file melebihi batas 1 GB.') : null, chunk);
                },
            });
            await pipeline(response.data, limiter, fs.createWriteStream(tempFilePath));

            const stats = await fs.promises.stat(tempFilePath);
            if (!stats.size) throw new Error('Server mengembalikan file kosong.');
            logger.info(`[DEBUG] GET ${url} - Type: ${mime} (raw: ${rawContentType}) - Size: ${stats.size} bytes`);

            const statusCaption = `Status: ${response.status} ${response.statusText}`;

            const sourceName = path.basename(new URL(url).pathname).replace(/[^\p{L}\p{N}_. -]/gu, '_') || 'response';
            const sendDocument = async (caption, fileName = sourceName) => {
                await sock.sendMessage(m.chat, {
                    document: { url: tempFilePath },
                    mimetype: mime || 'application/octet-stream',
                    fileName,
                    caption,
                }, { quoted: m });
            };
            const mediaCandidate = mime.startsWith('video/') || mime.startsWith('audio/') ||
                await looksLikeMedia(tempFilePath);
            if (mediaCandidate) {
                let prepared;
                try {
                    prepared = await videoQueue.push(async () => {
                        const media = await probeMedia(tempFilePath);
                        return prepareMediaForWa(tempFilePath, tempDir, media);
                    });
                } catch (error) {
                    logger.warn(`GET media conversion failed: ${error.message}`, 'GET');
                }
                if (prepared) {
                    const payload = {
                        [prepared.type]: { url: prepared.path },
                        mimetype: prepared.mime,
                        fileName: `${path.parse(sourceName).name}.${prepared.ext}`,
                        ...(prepared.duration > 0 ? { seconds: Math.ceil(prepared.duration) } : {}),
                        ...(prepared.type === 'audio' ? { ptt: false } : { caption: statusCaption }),
                    };
                    try {
                        await sock.sendMessage(m.chat, payload, { quoted: m });
                    } catch (error) {
                        logger.warn(`GET inline media send failed: ${error.message}`, 'GET');
                        await sendDocument(`${statusCaption}\nMedia gagal dikirim sebagai pemutar. File asli dikirim sebagai dokumen.`);
                    }
                } else {
                    await sendDocument(`${statusCaption}\nMedia belum bisa disiapkan untuk pemutar. File asli dikirim sebagai dokumen.`);
                }
            } else if (mime.startsWith('image/')) {
                await sock.sendMessage(m.chat, {
                    image: { url: tempFilePath }, caption: statusCaption,
                }, { quoted: m });
            } else if ((mime === 'application/json' || mime.startsWith('text/')) && stats.size < 10 * 1024 * 1024) {
                const textData = fs.readFileSync(tempFilePath, 'utf-8');
                let result = textData;
                try {
                    result = JSON.stringify(JSON.parse(textData), null, 2);
                } catch {
                    result = textData;
                }
                try {
                    if (result.length > 4000) throw new Error('Respons terlalu panjang untuk chat.');
                    await m.reply(` *Response:* \n${result}`);
                } catch {
                    await sock.sendMessage(
                        m.chat,
                        {
                            document: fs.readFileSync(tempFilePath),
                            mimetype: 'text/plain',
                            fileName: 'get-response.txt',
                            caption: statusCaption,
                        },
                        { quoted: m }
                    );
                }
            } else {
                await sendDocument(`${statusCaption}\nUkuran: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
            }
            await react('✅');
        } catch (err) {
            logger.error(`[DEBUG] GET request failed:`, err);
            await react('❌');
            await m.reply(` *Error:* ${err.message}`);
        } finally {
            if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
    },
};

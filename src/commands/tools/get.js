import fs from 'fs';
import path from 'path';
import axios from 'axios';
import logger from '../../utils/logger.js';

function detectMimeFromUrl(url) {
    const ext = path.extname(new URL(url).pathname).toLowerCase().replace('.', '');
    const map = {
        mp4: 'video/mp4',
        mkv: 'video/mp4',
        webm: 'video/webm',
        mov: 'video/quicktime',
        mp3: 'audio/mpeg',
        m4a: 'audio/mp4',
        ogg: 'audio/ogg; codecs=opus',
        opus: 'audio/ogg; codecs=opus',
        wav: 'audio/wav',
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
    description: 'Make a GET request to a URL',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Please provide a URL.');

        let url = text.trim();
        if (!url.startsWith('http')) url = 'https://' + url;

        await m.react('⏳');

        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempFilePath = path.join(tempDir, `get_${Date.now()}.tmp`);

        try {
            const response = await axios.get(url, {
                timeout: 600000,
                maxContentLength: 1073741824,
                maxBodyLength: 1073741824,
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

            const writer = fs.createWriteStream(tempFilePath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            const stats = fs.statSync(tempFilePath);
            logger.info(`[DEBUG] GET ${url} - Type: ${mime} (raw: ${rawContentType}) - Size: ${stats.size} bytes`);

            const statusCaption = `Status: ${response.status} ${response.statusText}`;

            if (mime.startsWith('image/')) {
                await sock.sendMessage(
                    m.chat,
                    { image: fs.readFileSync(tempFilePath), caption: statusCaption },
                    { quoted: m }
                );
            } else if (mime.startsWith('video/')) {
                await sock.sendMessage(
                    m.chat,
                    {
                        video: fs.readFileSync(tempFilePath),
                        caption: statusCaption,
                        mimetype: mime,
                    },
                    { quoted: m }
                );
            } else if (mime.startsWith('audio/')) {
                await sock.sendMessage(
                    m.chat,
                    {
                        audio: fs.readFileSync(tempFilePath),
                        mimetype: mime,
                        ptt: false,
                    },
                    { quoted: m }
                );
            } else if (mime === 'application/json' || (mime.startsWith('text/') && stats.size < 10 * 1024 * 1024)) {
                const textData = fs.readFileSync(tempFilePath, 'utf-8');
                let result = textData;
                try {
                    result = JSON.stringify(JSON.parse(textData), null, 2);
                } catch {
                    result = textData;
                }
                try {
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
                const ext = mime.split('/')[1] || path.extname(new URL(url).pathname).replace('.', '') || 'bin';
                await sock.sendMessage(
                    m.chat,
                    {
                        document: fs.readFileSync(tempFilePath),
                        mimetype: mime || 'application/octet-stream',
                        fileName: `response.${ext}`,
                        caption: `${statusCaption}\nUkuran: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
                    },
                    { quoted: m }
                );
            }
            await m.react('✅');
        } catch (err) {
            logger.error(`[DEBUG] GET request failed:`, err);
            await m.react('❌');
            await m.reply(` *Error:* ${err.message}`);
        } finally {
            if (fs.existsSync(tempFilePath)) {
                try {
                    fs.unlinkSync(tempFilePath);
                } catch {}
            }
        }
    },
};

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import logger from '../../utils/logger.js';

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
                timeout: 600000, // 10 minutes timeout for 1GB stream download
                maxContentLength: 1073741824, // 1GB limit
                maxBodyLength: 1073741824, // 1GB limit
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
            });

            const contentType = response.headers['content-type'] || '';
            const writer = fs.createWriteStream(tempFilePath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            const stats = fs.statSync(tempFilePath);
            logger.info(`[DEBUG] GET ${url} - Type: ${contentType} - Size: ${stats.size} bytes`);

            if (contentType.includes('image')) {
                await sock.sendMessage(
                    m.chat,
                    { image: fs.readFileSync(tempFilePath), caption: `Status: ${response.status} ${response.statusText}` },
                    { quoted: m }
                );
            } else if (contentType.includes('video')) {
                await sock.sendMessage(
                    m.chat,
                    {
                        video: fs.readFileSync(tempFilePath),
                        caption: `Status: ${response.status} ${response.statusText}`,
                        mimetype: contentType,
                    },
                    { quoted: m }
                );
            } else if (contentType.includes('audio')) {
                await sock.sendMessage(
                    m.chat,
                    { audio: fs.readFileSync(tempFilePath), mimetype: contentType },
                    { quoted: m }
                );
            } else if (contentType.includes('application/json') || (contentType.includes('text') && stats.size < 10 * 1024 * 1024)) {
                const textData = fs.readFileSync(tempFilePath, 'utf-8');
                let result = textData;
                try {
                    const json = JSON.parse(textData);
                    result = JSON.stringify(json, null, 2);
                } catch (e) {
                    result = textData;
                }
                try {
                    await m.reply(` *Response:* \n${result}`);
                } catch (sendErr) {
                    await sock.sendMessage(
                        m.chat,
                        {
                            document: { url: tempFilePath },
                            mimetype: 'text/plain',
                            fileName: 'get-response.txt',
                            caption: `Status: ${response.status} ${response.statusText}`,
                        },
                        { quoted: m }
                    );
                }
            } else {
                // Send as document via stream
                const ext = contentType.split('/')[1]?.split(';')[0] || 'bin';
                await sock.sendMessage(
                    m.chat,
                    {
                        document: fs.createReadStream(tempFilePath),
                        mimetype: contentType || 'application/octet-stream',
                        fileName: `response.${ext}`,
                        caption: `Status: ${response.status} ${response.statusText}\nUkuran: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
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
                } catch (e) {}
            }
        }
    },
};

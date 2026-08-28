import axios from 'axios';
import logger from '../../utils/logger.js';

export default {
    name: 'post',
    aliases: ['post'],
    description: 'Make a POST request to a URL. Usage: !post <url> | <body>',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        if (!text)
            return m.reply(
                'Usage: !post <url> | <body>\nExample: !post https://api.example.com/data | {"key": "value"}'
            );

        const [urlPart, ...bodyParts] = text.split('|');
        let url = urlPart.trim();
        const bodyRaw = bodyParts.join('|').trim();

        if (!url.startsWith('http')) url = 'https://' + url;

        let body = {};
        if (bodyRaw) {
            try {
                body = JSON.parse(bodyRaw);
            } catch (e) {
                return m.reply(
                    ' Invalid JSON body. Ensure you use strict JSON format (double quotes).'
                );
            }
        }

        await m.react('⏳');

        try {
            const response = await axios.post(url, body, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000,
                responseType: 'arraybuffer',
            });

            const contentType = response.headers['content-type'] || '';
            const buffer = response.data;

            logger.info(`[DEBUG] POST ${url} - Type: ${contentType} - Size: ${buffer.length}`);

            if (contentType.includes('image')) {
                await sock.sendMessage(
                    m.chat,
                    { image: buffer, caption: `Status: ${response.status} ${response.statusText}` },
                    { quoted: m }
                );
            } else if (contentType.includes('video')) {
                await sock.sendMessage(
                    m.chat,
                    {
                        video: buffer,
                        caption: `Status: ${response.status} ${response.statusText}`,
                        mimetype: contentType,
                    },
                    { quoted: m }
                );
            } else if (contentType.includes('audio')) {
                await sock.sendMessage(
                    m.chat,
                    { audio: buffer, mimetype: contentType },
                    { quoted: m }
                );
            } else if (contentType.includes('application/json') || contentType.includes('text')) {
                const textData = buffer.toString('utf-8');
                let result = textData;
                try {
                    const json = JSON.parse(textData);
                    result = JSON.stringify(json, null, 2);
                } catch (e) {
                    result = textData.slice(0, 4000); // Limit text length
                }
                await m.reply(` *Response:* \n${result}`);
            } else {
                // Send as document for other types
                const ext = contentType.split('/')[1]?.split(';')[0] || 'bin';
                await sock.sendMessage(
                    m.chat,
                    {
                        document: buffer,
                        mimetype: contentType,
                        fileName: `response.${ext}`,
                        caption: `Status: ${response.status} ${response.statusText}`,
                    },
                    { quoted: m }
                );
            }
            await m.react('✅');
        } catch (err) {
            logger.error(`[DEBUG] POST request failed:`, err.message);
            await m.react('❌');
            await m.reply(` *Error:* ${err.message}`);
        }
    },
};

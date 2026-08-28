import axios from 'axios';
import logger from '../../utils/logger.js';

export default {
    name: 'curl',
    aliases: ['curl'],
    description: 'Execute a curl command. Supports -X, -H, -d, --data-raw.',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        if (!text)
            return m.reply(
                'Please provide a curl command.\nExample: .curl -X GET "https://api.example.com" -H "accept: application/json"'
            );

        // Parse curl string
        const parseCurl = (curlString) => {
            // Remove backslashes and newlines
            curlString = curlString.replace(/\\\n/g, ' ').replace(/\n/g, ' ');

            const regex = /'([^']*)'|"([^"]*)"|(\S+)/g;
            const tokens = [];
            let match;
            while ((match = regex.exec(curlString)) !== null) {
                tokens.push(match[1] || match[2] || match[3]);
            }

            const config = {
                method: 'GET',
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                },
                url: '',
                data: null,
            };

            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                if (token === '-X' || token === '--request') {
                    config.method = tokens[++i]?.toUpperCase() || 'GET';
                } else if (token === '-H' || token === '--header') {
                    const header = tokens[++i];
                    if (header) {
                        const colonIndex = header.indexOf(':');
                        if (colonIndex !== -1) {
                            const key = header.substring(0, colonIndex).trim();
                            const value = header.substring(colonIndex + 1).trim();
                            config.headers[key] = value;
                        }
                    }
                } else if (
                    token === '-d' ||
                    token === '--data' ||
                    token === '--data-raw' ||
                    token === '--data-binary'
                ) {
                    config.data = tokens[++i];
                    if (config.method === 'GET') config.method = 'POST';
                } else if (token.startsWith('http')) {
                    config.url = token;
                } else if (!config.url && !token.startsWith('-')) {
                    if (token.includes('.') || token.includes('/')) {
                        config.url = token;
                    }
                }
            }

            return config;
        };

        const config = parseCurl(text);

        if (!config.url) return m.reply('Could not identify a URL in the curl command.');

        await m.react('⏳');

        try {
            const axiosConfig = {
                method: config.method,
                url: config.url,
                headers: config.headers,
                data: config.data,
                timeout: 60000,
                responseType: 'arraybuffer',
                validateStatus: () => true, // Allow any status code
            };

            const response = await axios(axiosConfig);

            const contentType = response.headers['content-type'] || '';
            const buffer = response.data;

            logger.info(
                `[DEBUG] CURL ${config.method} ${config.url} - Type: ${contentType} - Size: ${buffer.length} - Status: ${response.status}`
            );

            const caption = `*Status:* ${response.status} ${response.statusText}\n*URL:* ${config.url}`;

            if (contentType.includes('image')) {
                await sock.sendMessage(m.chat, { image: buffer, caption }, { quoted: m });
            } else if (contentType.includes('video')) {
                await sock.sendMessage(
                    m.chat,
                    { video: buffer, caption, mimetype: contentType },
                    { quoted: m }
                );
            } else if (contentType.includes('audio')) {
                await sock.sendMessage(
                    m.chat,
                    { audio: buffer, mimetype: contentType, caption },
                    { quoted: m }
                );
            } else if (
                contentType.includes('application/json') ||
                contentType.includes('text') ||
                buffer.length < 50000
            ) {
                let textData = buffer.toString('utf-8');
                let result = textData;
                try {
                    const json = JSON.parse(textData);
                    result = JSON.stringify(json, null, 2);
                } catch (e) {
                    // Not JSON, keep as is
                }

                if (result.length > 4000) {
                    await sock.sendMessage(
                        m.chat,
                        {
                            document: Buffer.from(result, 'utf-8'),
                            mimetype: 'text/plain',
                            fileName: 'response.txt',
                            caption: caption,
                        },
                        { quoted: m }
                    );
                } else {
                    await m.reply(`*Response:*\n\n${result}\n\n${caption}`);
                }
            } else {
                // Send as document for other types
                const ext = contentType.split('/')[1]?.split(';')[0] || 'bin';
                await sock.sendMessage(
                    m.chat,
                    {
                        document: buffer,
                        mimetype: contentType,
                        fileName: `response.${ext}`,
                        caption: caption,
                    },
                    { quoted: m }
                );
            }
            await m.react('✅');
        } catch (err) {
            logger.error(`[DEBUG] CURL request failed:`, err.message);
            await m.react('❌');
            await m.reply(`*Error:* ${err.message}`);
        }
    },
};

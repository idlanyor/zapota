import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import logger from '../../utils/logger.js';

const MAX_AI_RICH_CODE_LENGTH = 24_000;
const AI_BOT_JID = '867051314767696@bot';

const fitCodeForAiRich = (content) => {
    if (content.length <= MAX_AI_RICH_CODE_LENGTH) {
        return { code: content, truncated: false };
    }

    return {
        code: `${content.slice(0, MAX_AI_RICH_CODE_LENGTH)}\n\n// ... output dipotong karena batas AI Rich`,
        truncated: true,
    };
};

const buildAiRichCodeMessage = ({ content, fileName, m }) => {
    const { code, truncated } = fitCodeForAiRich(content);
    const truncationNotice = truncated ? '\n⚠️ Tampilan dipotong karena file terlalu panjang.' : '';

    return {
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: [
                        {
                            messageType: 2,
                            messageText: `📄 *PLUGIN:* ${fileName}${truncationNotice}`,
                        },
                        {
                            messageType: 5,
                            codeMetadata: {
                                codeLanguage: 'javascript',
                                // Satu blok stabil; ratusan fragmen syntax token tidak dirender
                                // oleh sebagian client WhatsApp.
                                codeBlocks: [{ highlightType: 0, codeContent: code }],
                            },
                        },
                    ],
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedAiBotMessageInfo: { botJid: AI_BOT_JID },
                        forwardOrigin: 4,
                        stanzaId: m.key.id,
                        participant: m.sender,
                        quotedMessage: m.message,
                    },
                },
            },
        },
        messageContextInfo: {
            botMetadata: {
                messageDisclaimerText: 'Plugin source rendered via AI Rich',
            },
        },
    };
};

export default {
    name: 'getplugin',
    aliases: ['gp'],
    category: 'Owner',
    description: 'Tampilkan source plugin menggunakan AI Rich code',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Masukkan nama plugin. Contoh: `.gp testbutton`');

        const commandsDir = path.join(process.cwd(), 'src/commands');
        const query = text.trim().replace(/\.js$/i, '');

        try {
            const files = await glob(`**/${query}.js`, {
                cwd: commandsDir,
                absolute: true,
            });

            if (files.length === 0) {
                return m.reply(`Plugin '${text}' tidak ditemukan.`);
            }

            const fileToRead = files[0];
            const content = fs.readFileSync(fileToRead, 'utf8');
            const message = buildAiRichCodeMessage({
                content,
                fileName: path.basename(fileToRead),
                m,
            });

            await sock.relayMessage(m.chat, message, {
                messageId: sock.generateMessageTag(),
            });
        } catch (error) {
            logger.error(error, 'Get Plugin AI Rich Error');
            await m.reply(`Gagal menampilkan plugin: ${error.message}`);
        }
    },
};

export { buildAiRichCodeMessage, fitCodeForAiRich };

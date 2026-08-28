import { settings } from '../../config/settings.js';
import logger from '../../utils/logger.js';

export default {
    name: 'debugm',
    aliases: ['debugmsg', 'mstruct'],
    description: 'Debug message object structure',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        // Only owner can use this to avoid leaking private data
        const ownerJid = settings.ownerNumber.includes('@')
            ? settings.ownerNumber
            : settings.ownerNumber + '@s.whatsapp.net';
        if (m.sender !== ownerJid && m.sender !== sock.user.id && m.sender !== sock.user.lid) {
            return m.reply('Maaf, perintah ini hanya untuk Owner.');
        }

        logger.info('--- DEBUG M OBJECT START ---');
        // Log keys to avoid circular reference issues in some console implementations
        logger.info('M Keys:', Object.keys(m));

        // Log specific important fields
        const debugInfo = {
            id: m.id,
            chat: m.chat,
            sender: m.sender,
            mtype: m.mtype,
            body: m.body,
            isGroup: m.isGroup,
            fromMe: m.fromMe,
            pushName: m.pushName,
            messageKeys: m.message ? Object.keys(m.message) : 'N/A',
            quotedExists: !!m.quoted,
        };

        if (m.quoted) {
            debugInfo.quoted = {
                mtype: m.quoted.mtype,
                id: m.quoted.id,
                sender: m.quoted.sender,
                text: m.quoted.text,
                isBaileys: m.quoted.isBaileys,
            };
        }

        logger.info('Simplified Debug Info:', JSON.stringify(debugInfo, null, 2));
        logger.info('Raw M.message:', JSON.stringify(m.message, null, 2));
        logger.info('--- DEBUG M OBJECT END ---');

        let response = `*「 DEBUG MESSAGE OBJECT 」*\n\n`;
        response += `• *Type:* ${m.mtype}\n`;
        response += `• *Body:* ${m.body ? (m.body.length > 50 ? m.body.slice(0, 50) + '...' : m.body) : 'EMPTY'}\n`;
        response += `• *Sender:* ${m.sender}\n`;
        response += `• *Chat:* ${m.chat}\n`;
        response += `• *isGroup:* ${m.isGroup}\n`;
        response += `• *Quoted:* ${m.quoted ? 'YES' : 'NO'}\n\n`;
        response += `_Detail lengkap telah dikirim ke konsol terminal._`;

        await m.reply(response);
    },
};

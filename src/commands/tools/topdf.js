import { downloadContentFromMessage } from '../../wa/helpers.js';
import ILovePDfSdk from 'ilovepdf-sdk';
import fs from 'fs';
import path from 'path';
import { settings } from '../../config/settings.js';
import { makeResultPath } from '../../utils/resultPath.js';

const getRandom = (ext) => {
    return `${Math.floor(Math.random() * 10000)}${ext}`;
};

export default {
    name: 'topdf',
    description: 'Convert image or document to PDF via iLovePDF',
    category: 'Tools',
    execute: async (sock, m, args) => {
        if (!process.env.ILOVEPDF_PUBLIC_KEY || !process.env.ILOVEPDF_SECRET_KEY) {
            return m.reply('iLovePDF API keys are not set in .env file.');
        }

        try {
            const isQuoted = !!m.quoted;
            const msg = isQuoted ? m.quoted : m.msg;
            const mime = msg.mimetype || '';
            const mtype = isQuoted ? m.quoted.mtype : m.mtype;

            const isImage = /image/.test(mime) || /imageMessage/.test(mtype);
            const isDoc = /document/.test(mime) || /documentMessage/.test(mtype);

            if (!isImage && !isDoc) {
                return m.reply(
                    `Please reply to an image or document (Word/Excel/PPT) with ${settings.prefix}topdf`
                );
            }

            await m.react('⏳');

            // Download file
            const mediaType = isImage ? 'image' : 'document';
            const stream = await downloadContentFromMessage(msg, mediaType, sock);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // Save temporary input file
            const fileName = path.basename(msg.fileName || getRandom(isImage ? '.jpg' : '.docx'));
            const tempInputPath = makeResultPath(fileName);
            fs.writeFileSync(tempInputPath, buffer);

            // Initialize iLovePDF
            const ilovepdf = new ILovePDfSdk(
                process.env.ILOVEPDF_PUBLIC_KEY,
                process.env.ILOVEPDF_SECRET_KEY
            );

            // Choose task based on type
            const tool = isImage ? 'imagepdf' : 'officepdf';
            const task = await ilovepdf.createTask(tool);

            // Execute Task
            await task.addFile(tempInputPath);
            await task.process();

            const tempOutputPath = makeResultPath(getRandom('.pdf'));
            await task.download(tempOutputPath);

            // Ensure file exists and has content before reading
            if (!fs.existsSync(tempOutputPath) || fs.statSync(tempOutputPath).size === 0) {
                throw new Error('Downloaded PDF is empty or missing.');
            }

            const pdfBuffer = fs.readFileSync(tempOutputPath);

            // Send PDF with specific filename
            const cleanName = (msg.fileName || fileName).replace(/\s+/g, '_');
            const outputFileName = `${path.parse(cleanName).name}_${Date.now()}.pdf`;

            await sock.sendMessage(
                m.chat,
                {
                    document: pdfBuffer,
                    mimetype: 'application/pdf',
                    fileName: outputFileName,
                },
                { quoted: m }
            );
            await m.react('✅');

            // Cleanup
            if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
            if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
        } catch (error) {
            console.error('iLovePDF Error:', error);
            await m.react('❌');
            await m.reply(`Error: ${error.message || 'Failed to convert file to PDF'}`);
        }
    },
};

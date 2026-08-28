import { downloadContentFromMessage } from '../../wa/helpers.js';
import ILovePDfSdk from 'ilovepdf-sdk';
import fs from 'fs';
import path from 'path';
import { settings } from '../../config/settings.js';
import AdmZip from 'adm-zip';
import { makeResultPath } from '../../utils/resultPath.js';

const getRandom = (ext) => {
    return `${Math.floor(Math.random() * 10000)}${ext}`;
};

export default {
    name: 'pdf2img',
    aliases: ['pdftoimg', 'pdftojpg'],
    description: 'Convert PDF to Image (JPG) via iLovePDF',
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

            const isPdf =
                /pdf/.test(mime) ||
                /documentMessage/.test(mtype) ||
                (msg.fileName && msg.fileName.endsWith('.pdf'));

            if (!isPdf) {
                return m.reply(`Please reply to a PDF document with ${settings.prefix}pdf2img`);
            }

            await m.react('⏳');

            const stream = await downloadContentFromMessage(msg, 'document', sock);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            const tempPdfPath = makeResultPath(getRandom('.pdf'));
            fs.writeFileSync(tempPdfPath, buffer);

            const ilovepdf = new ILovePDfSdk(
                process.env.ILOVEPDF_PUBLIC_KEY,
                process.env.ILOVEPDF_SECRET_KEY
            );
            const task = await ilovepdf.createTask('pdfjpg');

            await task.addFile(tempPdfPath);
            await task.process();

            const tempOutputPath = makeResultPath(getRandom('.bin'));
            await task.download(tempOutputPath);

            // Wait a bit for filesystem
            await new Promise((resolve) => setTimeout(resolve, 1000));

            if (!fs.existsSync(tempOutputPath) || fs.statSync(tempOutputPath).size === 0) {
                throw new Error('Failed to download result from iLovePDF.');
            }

            const cleanName = (msg.fileName ? path.parse(msg.fileName).name : 'Converted').replace(
                /\s+/g,
                '_'
            );
            const baseFileName = `${cleanName}_${Date.now()}`;

            // Check if it's a ZIP or direct image
            const firstBytes = fs.readFileSync(tempOutputPath, { end: 3 });
            const isZip = firstBytes[0] === 0x50 && firstBytes[1] === 0x4b;

            if (isZip) {
                const zip = new AdmZip(tempOutputPath);
                const zipEntries = zip.getEntries();

                if (zipEntries.length === 1) {
                    const imgBuffer = zip.readFile(zipEntries[0]);
                    await sock.sendMessage(
                        m.chat,
                        {
                            image: imgBuffer,
                            caption: `Converted PDF to Image\nFile: ${baseFileName}.jpg`,
                        },
                        { quoted: m }
                    );
                } else {
                    await sock.sendMessage(
                        m.chat,
                        {
                            document: fs.readFileSync(tempOutputPath),
                            mimetype: 'application/zip',
                            fileName: `${baseFileName}.zip`,
                            caption: `Converted all ${zipEntries.length} PDF pages to images (ZIP)`,
                        },
                        { quoted: m }
                    );
                }
            } else {
                await sock.sendMessage(
                    m.chat,
                    {
                        image: fs.readFileSync(tempOutputPath),
                        caption: `Converted PDF to Image\nFile: ${baseFileName}.jpg`,
                    },
                    { quoted: m }
                );
            }

            if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
            if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
            await m.react('✅');
        } catch (error) {
            console.error('Pdf2Img Error:', error);
            await m.react('❌');
            await m.reply(`Error: ${error.message || 'Failed to convert PDF to Image'}`);
        }
    },
};

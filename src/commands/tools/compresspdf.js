import { downloadContentFromMessage } from '../../wa/helpers.js';
import ILovePDfSdk from 'ilovepdf-sdk';
import fs from 'fs';
import { makeResultPath } from '../../utils/resultPath.js';

const getRandom = (ext) => `${Math.floor(Math.random() * 10000)}${ext}`;
const LEVELS = ['low', 'recommended', 'extreme'];

const fmtSize = (bytes) => {
    const kb = bytes / 1024;
    return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
};

export default {
    name: 'compresspdf',
    aliases: ['cpdf'],
    description: 'Kompres PDF. Reply PDF: .compresspdf [low|recommended|extreme]',
    category: 'Tools',
    execute: async (sock, m, args) => {
        if (!process.env.ILOVEPDF_PUBLIC_KEY || !process.env.ILOVEPDF_SECRET_KEY) {
            return m.reply('iLovePDF API keys belum diset di .env.');
        }
        if (!m.quoted) return m.reply('Reply PDF yang mau dikompres.');

        const msg = m.quoted;
        const mime = msg.mimetype || '';
        const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(msg.fileName || '');
        if (!isPdf) return m.reply('Itu bukan PDF. Reply pesan PDF.');

        const level = (args[0] || 'recommended').toLowerCase();
        if (!LEVELS.includes(level)) {
            return m.reply(
                `Level tidak valid. Pilih: ${LEVELS.join(', ')}.\nContoh: .compresspdf extreme`
            );
        }

        const tempIn = makeResultPath(getRandom('.pdf'));
        const tempOut = makeResultPath(getRandom('.pdf'));
        try {
            await m.react('⏳');
            const stream = await downloadContentFromMessage(msg, 'document', sock);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            fs.writeFileSync(tempIn, buffer);

            const ilovepdf = new ILovePDfSdk(
                process.env.ILOVEPDF_PUBLIC_KEY,
                process.env.ILOVEPDF_SECRET_KEY
            );
            const task = await ilovepdf.createTask('compress');
            await task.addFile(tempIn);
            await task.process({ compression_level: level });
            await task.download(tempOut);

            if (!fs.existsSync(tempOut) || fs.statSync(tempOut).size === 0) {
                throw new Error('Hasil kompresi kosong / gagal.');
            }

            const outBuffer = fs.readFileSync(tempOut);
            const origSize = buffer.length;
            const newSize = outBuffer.length;
            const saved = origSize > 0 ? Math.max(0, Math.round((1 - newSize / origSize) * 100)) : 0;

            const outName = `${(msg.fileName || 'compressed').replace(/\.pdf$/i, '')}_compressed.pdf`;
            await sock.sendMessage(
                m.chat,
                {
                    document: outBuffer,
                    mimetype: 'application/pdf',
                    fileName: outName,
                },
                { quoted: m }
            );
            await m.react('✅');
            m.reply(
                `✅ Kompres (${level}) selesai.\n➛ Asli: ${fmtSize(origSize)}\n➛ Hasil: ${fmtSize(newSize)}\n➛ Hemat: ${saved}%`
            );
        } catch (err) {
            console.error('compresspdf error:', err);
            await m.react('❌');
            m.reply(`Gagal kompres: ${err.message || err}`);
        } finally {
            for (const p of [tempIn, tempOut]) {
                try {
                    if (fs.existsSync(p)) fs.unlinkSync(p);
                } catch {
                    /* ignore */
                }
            }
        }
    },
};

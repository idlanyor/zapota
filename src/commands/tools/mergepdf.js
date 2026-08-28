import { downloadContentFromMessage } from '../../wa/helpers.js';
import ILovePDfSdk from 'ilovepdf-sdk';
import fs from 'fs';
import { makeResultPath } from '../../utils/resultPath.js';

const getRandom = (ext) => `${Math.floor(Math.random() * 10000)}${ext}`;
const TTL_MS = 15 * 60 * 1000;
const MAX_FILES = 10;

const buffers = new Map();

const getEntry = (id) => {
    const e = buffers.get(id);
    if (!e) return null;
    if (Date.now() > e.expires) {
        buffers.delete(id);
        return null;
    }
    return e;
};

const ensureEntry = (id) => {
    let e = getEntry(id);
    if (!e) {
        e = { files: [], expires: Date.now() + TTL_MS };
        buffers.set(id, e);
    }
    e.expires = Date.now() + TTL_MS;
    return e;
};

const downloadDoc = async (msg) => {
    const stream = await downloadContentFromMessage(msg, 'document', sock);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
};

const formatList = (files) => files.map((f, i) => `➛ ${i + 1}. ${f.name}`).join('\n');

export default {
    name: 'mergepdf',
    description: 'Gabung beberapa PDF. Kirim/reply PDF dgn .mergepdf, lalu .mergepdf done',
    category: 'Tools',
    execute: async (sock, m, args) => {
        if (!process.env.ILOVEPDF_PUBLIC_KEY || !process.env.ILOVEPDF_SECRET_KEY) {
            return m.reply('iLovePDF API keys belum diset di .env.');
        }

        const sub = (args[0] || '').toLowerCase();
        const isQuoted = !!m.quoted;
        const msg = isQuoted ? m.quoted : m.msg;
        const mime = msg?.mimetype || '';
        const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(msg?.fileName || '');

        if (sub === 'done' || sub === 'finish' || sub === 'merge') {
            const entry = getEntry(m.sender);
            if (!entry || !entry.files.length) {
                return m.reply(
                    'Buffer kosong. Tambahkan PDF dulu: kirim/reply PDF dengan caption `.mergepdf`.'
                );
            }

            await m.react('⏳');
            const tempFiles = [];
            try {
                const ilovepdf = new ILovePDfSdk(
                    process.env.ILOVEPDF_PUBLIC_KEY,
                    process.env.ILOVEPDF_SECRET_KEY
                );
                const task = await ilovepdf.createTask('merge');

                for (const f of entry.files) {
                    const p = makeResultPath(getRandom('.pdf'));
                    fs.writeFileSync(p, f.buffer);
                    tempFiles.push(p);
                    await task.addFile(p);
                }

                await task.process();

                const outPath = makeResultPath(getRandom('.pdf'));
                await task.download(outPath);
                tempFiles.push(outPath);

                if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
                    throw new Error('Hasil merge kosong / gagal didownload.');
                }

                await sock.sendMessage(
                    m.chat,
                    {
                        document: fs.readFileSync(outPath),
                        mimetype: 'application/pdf',
                        fileName: `merged_${Date.now()}.pdf`,
                    },
                    { quoted: m }
                );
                await m.react('✅');
                buffers.delete(m.sender);
            } catch (err) {
                console.error('mergepdf error:', err);
                await m.react('❌');
                m.reply(`Gagal merge: ${err.message || err}`);
            } finally {
                for (const p of tempFiles) {
                    try {
                        if (fs.existsSync(p)) fs.unlinkSync(p);
                    } catch {
                        /* ignore cleanup error */
                    }
                }
            }
            return;
        }

        if (sub === 'cancel' || sub === 'clear' || sub === 'reset') {
            buffers.delete(m.sender);
            return m.reply('🗑️ Buffer merge dibersihkan.');
        }

        if (isPdf) {
            const entry = ensureEntry(m.sender);
            if (entry.files.length >= MAX_FILES) {
                return m.reply(
                    `Maksimal ${MAX_FILES} PDF. Ketik \`.mergepdf done\` untuk menggabungkan.`
                );
            }
            try {
                await m.react('⏳');
                const buffer = await downloadDoc(msg);
                const name = (msg?.fileName || `file${entry.files.length + 1}.pdf`).replace(
                    /\s+/g,
                    '_'
                );
                entry.files.push({ buffer, name });
                await m.react('✅');
                return m.reply(
                    `✅ PDF ditambahkan (${entry.files.length}).\n\n${formatList(
                        entry.files
                    )}\n\nTambah lagi, atau \`.mergepdf done\` untuk gabung, \`.mergepdf cancel\` untuk batal.`
                );
            } catch (err) {
                await m.react('❌');
                return m.reply(`Gagal mengambil PDF: ${err.message || err}`);
            }
        }

        const entry = getEntry(m.sender);
        const count = entry?.files.length || 0;
        return m.reply(
            `*Merge PDF*\nBuffer: ${count} PDF\n${count ? formatList(entry.files) : '(kosong)'}\n\n` +
                `Cara: kirim/reply PDF dgn caption \`.mergepdf\` untuk menambah, lalu \`.mergepdf done\` untuk gabung.`
        );
    },
};

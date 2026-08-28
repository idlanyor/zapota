import PDFDocument from 'pdfkit';

const M = 50;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CW = PAGE_W - M * 2;

const stripEmoji = (s) =>
    s
        .replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/\uFE0F|\u200D/gu, '')
        .replace(/\u00a0/g, ' ');

const parseBlocks = (raw) => {
    const lines = stripEmoji(raw).replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let i = 0;
    let inCode = false;
    let codeBuf = [];
    let paraBuf = [];

    const flushPara = () => {
        if (paraBuf.length) {
            blocks.push({ type: 'paragraph', text: paraBuf.join(' ') });
            paraBuf = [];
        }
    };

    while (i < lines.length) {
        const line = lines[i];

        if (/^```/.test(line.trim())) {
            if (!inCode) {
                flushPara();
                inCode = true;
                codeBuf = [];
            } else {
                blocks.push({ type: 'code', text: codeBuf.join('\n') });
                inCode = false;
                codeBuf = [];
            }
            i++;
            continue;
        }
        if (inCode) {
            codeBuf.push(line);
            i++;
            continue;
        }

        if (line.trim() === '') {
            flushPara();
            i++;
            continue;
        }

        const h = line.match(/^(#{1,6})\s+(.*)$/);
        if (h) {
            flushPara();
            blocks.push({ type: 'heading', level: h[1].length, text: h[2].trim() });
            i++;
            continue;
        }

        if (/^>\s?/.test(line)) {
            flushPara();
            blocks.push({ type: 'quote', text: line.replace(/^>\s?/, '') });
            i++;
            continue;
        }

        if (/^(\s*[-*_]){3,}\s*$/.test(line)) {
            flushPara();
            blocks.push({ type: 'hr' });
            i++;
            continue;
        }

        const ul = line.match(/^(\s*)[-*+]\s+(.*)$/);
        if (ul) {
            flushPara();
            blocks.push({
                type: 'list',
                ordered: false,
                text: ul[2],
                indent: Math.floor(ul[1].length / 2),
            });
            i++;
            continue;
        }

        const ol = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
        if (ol) {
            flushPara();
            blocks.push({
                type: 'list',
                ordered: true,
                num: parseInt(ol[2], 10),
                text: ol[3],
                indent: Math.floor(ol[1].length / 2),
            });
            i++;
            continue;
        }

        paraBuf.push(line.trim());
        i++;
    }
    flushPara();
    if (inCode && codeBuf.length) blocks.push({ type: 'code', text: codeBuf.join('\n') });
    return blocks;
};

const TOKEN =
    /(\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([\s\S]+?)\*|_([\s\S]+?)_|`([^`]+)`|~~([\s\S]+?)~~|\[([^\]]+)\]\(([^)\s]+)\))/g;

const parseInline = (text) => {
    const runs = [];
    let last = 0;
    let m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(text)) !== null) {
        if (m.index > last) runs.push({ text: text.slice(last, m.index) });
        if (m[2] !== undefined) runs.push({ text: m[2], bold: true });
        else if (m[3] !== undefined) runs.push({ text: m[3], bold: true });
        else if (m[4] !== undefined) runs.push({ text: m[4], italic: true });
        else if (m[5] !== undefined) runs.push({ text: m[5], italic: true });
        else if (m[6] !== undefined) runs.push({ text: m[6], code: true });
        else if (m[7] !== undefined) runs.push({ text: m[7], strike: true });
        else if (m[8] !== undefined)
            runs.push({ text: m[8], link: true, url: m[9] });
        last = TOKEN.lastIndex;
    }
    if (last < text.length) runs.push({ text: text.slice(last) });
    return runs.length ? runs : [{ text }];
};

const fontFor = (r, base = 'Helvetica') => {
    if (r.code) return 'Courier';
    if (r.bold && r.italic) return 'Helvetica-BoldOblique';
    if (r.bold) return 'Helvetica-Bold';
    if (r.italic) return 'Helvetica-Oblique';
    return base;
};

const writeRuns = (doc, runs, { size = 11, color = '#222222', x = M, width = CW } = {}) => {
    doc.x = x;
    const list = runs.length ? runs : [{ text: '' }];
    list.forEach((r, idx) => {
        const label =
            r.link && r.url && r.url !== r.text ? `${r.text} (${r.url})` : r.text;
        doc.font(fontFor(r)).fontSize(size);
        doc.fillColor(r.code ? '#c7254e' : r.link ? '#1155cc' : color);
        doc.text(label, { continued: idx < list.length - 1, width, lineGap: 2 });
    });
};

const ensureRoom = (doc, needed) => {
    if (doc.y + needed > PAGE_H - M) doc.addPage();
};

const render = (blocks) => {
    const doc = new PDFDocument({ size: 'A4', margin: M, info: { Title: 'mdpdf' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise((resolve) => doc.on('end', resolve));

    for (const block of blocks) {
        switch (block.type) {
            case 'heading': {
                const size = [22, 18, 15, 13, 12, 11][block.level - 1] || 11;
                doc.moveDown(0.6);
                ensureRoom(doc, size + 10);
                writeRuns(doc, parseInline(block.text), {
                    size,
                    color: '#111111',
                    x: M,
                    width: CW,
                });
                doc.moveDown(0.4);
                break;
            }
            case 'paragraph': {
                ensureRoom(doc, 16);
                writeRuns(doc, parseInline(block.text), { size: 11 });
                doc.moveDown(0.5);
                break;
            }
            case 'list': {
                const indent = Math.min(block.indent || 0, 4) * 16;
                const bullet = block.ordered ? `${block.num}. ` : '•  ';
                ensureRoom(doc, 16);
                writeRuns(
                    doc,
                    [{ text: bullet }, ...parseInline(block.text)],
                    { size: 11, x: M + indent, width: CW - indent }
                );
                doc.moveDown(0.3);
                break;
            }
            case 'quote': {
                doc.moveDown(0.3);
                const qx = M + 14;
                doc.font('Helvetica').fontSize(11);
                const qh = doc.heightOfString(block.text, {
                    width: CW - 14,
                    lineGap: 2,
                });
                ensureRoom(doc, qh + 8);
                const qy = doc.y;
                doc
                    .moveTo(M + 5, qy)
                    .lineTo(M + 5, qy + qh + 2)
                    .lineWidth(2)
                    .strokeColor('#bbbbbb')
                    .stroke();
                writeRuns(doc, parseInline(block.text), {
                    size: 11,
                    color: '#555555',
                    x: qx,
                    width: CW - 14,
                });
                doc.moveDown(0.5);
                break;
            }
            case 'code': {
                doc.moveDown(0.3);
                doc.font('Courier').fontSize(9.5);
                const codeW = CW - 16;
                const codeH = doc.heightOfString(block.text, {
                    width: codeW,
                    lineGap: 3,
                });
                ensureRoom(doc, codeH + 16);
                const ry = doc.y;
                doc.fillColor('#f4f4f4').rect(M, ry, CW, codeH + 12).fill();
                doc.fillColor('#333333').font('Courier').fontSize(9.5);
                doc.text(block.text, M + 8, ry + 6, {
                    width: codeW,
                    lineGap: 3,
                });
                doc.y = ry + codeH + 12;
                doc.moveDown(0.5);
                break;
            }
            case 'hr': {
                doc.moveDown(0.4);
                ensureRoom(doc, 12);
                const y = doc.y + 4;
                doc.moveTo(M, y)
                    .lineTo(M + CW, y)
                    .lineWidth(1)
                    .strokeColor('#cccccc')
                    .stroke();
                doc.y = y + 4;
                doc.moveDown(0.4);
                break;
            }
        }
    }

    doc.end();
    return done.then(() => Buffer.concat(chunks));
};

export default {
    name: 'mdpdf',
    aliases: ['md2pdf', 'textopdf', 'txt2pdf'],
    description:
        'Ubah teks/markdown jadi PDF. .mdpdf <teks> atau reply pesan. Support heading, bold, italic, list, code, quote.',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        const input = (m.quoted?.text || text || '').trim();
        if (!input)
            return m.reply(
                'Kirim teks/markdown untuk dijadikan PDF.\n\nContoh:\n.mdpdf # Judul\nIni **tebal** dan *miring*.\n\nAtau reply pesan teks lalu ketik .mdpdf'
            );

        try {
            await m.react('⏳');
            const buffer = await render(parseBlocks(input));
            if (!buffer.length) throw new Error('PDF kosong / gagal dirender.');

            await sock.sendMessage(
                m.chat,
                {
                    document: buffer,
                    mimetype: 'application/pdf',
                    fileName: `mdpdf_${Date.now()}.pdf`,
                },
                { quoted: m }
            );
            await m.react('✅');
        } catch (err) {
            console.error('mdpdf error:', err);
            await m.react('❌');
            m.reply(`Gagal membuat PDF: ${err.message || err}`);
        }
    },
};

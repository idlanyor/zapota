import { utamaGet } from '../../services/utamaApi.js';

const chunk = (text, size = 3500) => {
    const parts = [];
    let rest = String(text || '').trim();
    while (rest.length > size) {
        let at = rest.lastIndexOf('\n', size);
        if (at < size / 2) at = size;
        parts.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
    }
    if (rest) parts.push(rest);
    return parts;
};

const sendChunks = async (m, heading, text) => {
    const parts = chunk(text);
    if (!parts.length) return m.reply(`${heading}\n\nData tidak tersedia.`);
    for (let i = 0; i < parts.length; i += 1) {
        await m.reply(`${heading}${parts.length > 1 ? ` (${i + 1}/${parts.length})` : ''}\n\n${parts[i]}`);
    }
};

const printable = (value, depth = 0) => {
    if (value == null) return '';
    if (typeof value !== 'object') return String(value);
    if (Array.isArray(value)) return value.slice(0, 10).map((item, i) => `${i + 1}. ${printable(item, depth + 1)}`).join('\n\n');
    return Object.entries(value)
        .filter(([key]) => !['success', 'source'].includes(key))
        .map(([key, child]) => {
            const label = key.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            return typeof child === 'object' ? `*${label}*\n${printable(child, depth + 1)}` : `*${label}:* ${child}`;
        }).join('\n');
};

const run = (handler) => async (sock, m, args, text) => {
    await m.react('⏳');
    try { await handler(sock, m, args, text); await m.react('✅'); }
    catch (error) { await m.react('❌'); await m.reply(`Gagal mengambil data: ${error.message}`); }
};

const hadits = {
    name: 'hadits', aliases: ['hadis'], category: 'Islamic', description: 'Cari atau baca hadits 9 imam',
    execute: run(async (sock, m, args, text) => {
        const input = (text || '').trim();
        if (!input) return m.reply('Gunakan *.hadits <kata kunci>* atau *.hadits <imam> <nomor>*\nContoh: *.hadits puasa* / *.hadits bukhari 7*');
        const exact = input.match(/^(bukhari|muslim|abu-daud|abudaud|tirmidzi|nasai|ibnu-majah|ibnumajah|ahmad|malik|darimi)\s+(\d+)$/i);
        const payload = exact
            ? await utamaGet(`/hadits/${exact[1].toLowerCase().replace('abudaud', 'abu-daud').replace('ibnumajah', 'ibnu-majah')}/${exact[2]}`)
            : await utamaGet('/hadits/search', { q: input, limit: 5 });
        const items = Array.isArray(payload.data) ? payload.data : [payload.data || payload];
        const body = items.map((item) => `*${String(item.imam || 'Hadits').toUpperCase()} No. ${item.number || '-'}*${item.kitab ? `\nKitab: ${item.kitab}` : ''}${item.bab ? `\nBab: ${item.bab}` : ''}\n\n${item.arab || item.arabic || ''}${item.arab || item.arabic ? '\n\n' : ''}${item.terjemahan || item.translation || item.text || printable(item)}`).join('\n\n─────\n\n');
        await sendChunks(m, '📖 *HADITS 9 IMAM*', body);
    }),
};

const jadwal = {
    name: 'jadwalsholat', aliases: ['jadwalshalat'], category: 'Islamic', description: 'Lihat jadwal sholat berdasarkan kota',
    execute: run(async (sock, m, args, text) => {
        const input = (text || '').trim();
        if (!input) return m.reply('Gunakan:\n• *.jadwalsholat <kota>*\n• *.jadwalsholat cari <kota>*\n\nContoh: *.jadwalsholat Bandung*');
        const search = input.match(/^cari\s+(.+)$/i);
        if (search) {
            const payload = await utamaGet('/sholat/kota', { q: search[1].trim() });
            return m.reply(`🏙️ *KOTA SHOLAT*\n\n${(payload.data || []).map((item) => `• ${item.id} — ${item.kota}`).join('\n') || 'Tidak ditemukan.'}`);
        }
        const city = input;
        const now = new Date();
        const payload = await utamaGet('/sholat/jadwal', { kota: city, bulan: now.getMonth() + 1, tahun: now.getFullYear() });
        const data = payload.data || payload;
        const day = data.today || data.jadwal_bulanan?.find((item) => item.is_today) || data.jadwal_bulanan?.[0];
        if (!day) throw new Error('Jadwal tidak ditemukan');
        await m.reply(`🕌 *JADWAL SHOLAT ${String(data.kota || city).toUpperCase()}*\nTanggal: ${day.tanggal}/${data.periode?.bulan || now.getMonth() + 1}/${data.periode?.tahun || now.getFullYear()}\n\nImsak: ${day.imsak}\nSubuh: ${day.subuh}\nTerbit: ${day.terbit}\nDhuha: ${day.dhuha}\nDzuhur: ${day.dzuhur}\nAshar: ${day.ashr || day.ashar}\nMaghrib: ${day.maghrib}\nIsya: ${day.isya}`);
    }),
};

const aksara = {
    name: 'aksara', aliases: ['aksarajawa'], category: 'Culture',
    description: 'Transliterasi Latin dan Aksara Jawa',
    execute: run(async (sock, m, args, text) => {
        const input = (text || '').trim();
        const match = input.match(/^(latin|jawa)\s+(.+)$/is);
        if (!match) return m.reply('Gunakan:\n• *.aksara latin <teks Latin>*\n• *.aksara jawa <Aksara Jawa>*\n\nContoh: *.aksara latin sugeng enjang*');
        const direction = match[1].toLowerCase() === 'latin' ? 'latin-to-jawa' : 'jawa-to-latin';
        const payload = await utamaGet(`/aksara/${direction}`, { text: match[2].trim() });
        await m.reply(`📜 *TRANSLITERASI AKSARA*\n\n${payload.output || payload.data?.output || printable(payload.data || payload)}`);
    }),
};

const collection = (name, endpoint, heading, defaultCategory) => ({
    name, category: 'Islamic', description: `Akses koleksi ${name} dari API Utama`,
    execute: run(async (sock, m, args, text) => {
        const category = (text || '').trim() || defaultCategory;
        const payload = await utamaGet(endpoint, category ? { category } : {});
        await sendChunks(m, heading, printable(payload.data || payload));
    }),
});

const khutbah = {
    name: 'khutbah', category: 'Islamic', description: 'Daftar atau baca khutbah MUI',
    execute: run(async (sock, m, args, text) => {
        const input = (text || '').trim();
        const payload = /^https?:\/\//i.test(input)
            ? await utamaGet('/khutbah/detail', { url: input })
            : await utamaGet('/khutbah', { page: Number(input) || 1, per_page: 10 });
        await sendChunks(m, '📜 *KHUTBAH MUI*', printable(payload.data || payload));
    }),
};

export default [
    hadits, jadwal, khutbah,
    collection('wirid', '/wirid', '📿 *WIRID, RATIB & HIZIB*', 'ratib'),
    collection('doa', '/doa', '🤲 *KUMPULAN DOA*', 'doa-keseharian'),
    aksara,
];

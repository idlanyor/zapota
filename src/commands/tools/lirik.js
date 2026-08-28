import { utamaGet } from '../../services/utamaApi.js';

const chunkText = (text, max = 3500) => {
    const chunks = [];
    let rest = String(text || '').trim();
    while (rest.length > max) {
        let at = rest.lastIndexOf('\n', max);
        if (at < max / 2) at = max;
        chunks.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
    }
    if (rest) chunks.push(rest);
    return chunks;
};

const duration = (seconds) => Number.isFinite(Number(seconds))
    ? `${Math.floor(Number(seconds) / 60)}:${Math.floor(Number(seconds) % 60).toString().padStart(2, '0')}`
    : '-';

export default {
    name: 'lirik', aliases: ['lyrics', 'lyric'], category: 'Tools', description: 'Cari lirik lagu via API Utama',
    execute: async (sock, m, args, text) => {
        const raw = (text || m.quoted?.text || m.quoted?.message?.conversation || '').trim();
        if (!raw) return m.reply('*PENCARI LIRIK*\n\n• .lirik <judul atau artis>\n• .lirik <judul> | <artis>');
        await m.react('⏳');
        try {
            const split = raw.split('|').map((x) => x.trim());
            let payload;
            if (split.length > 1 && split[0] && split[1]) payload = await utamaGet('/lirik', { judul: split[0], artis: split[1] });
            else payload = await utamaGet('/lirik/search', { q: raw });
            const song = Array.isArray(payload.data) ? payload.data[0] : payload.data || payload;
            if (!song?.lirik && !song?.lirik_sinkron) throw new Error('Lirik tidak ditemukan');
            await m.reply(`*LIRIK DITEMUKAN*\n\n• Judul: ${song.judul || '-'}\n• Artis: ${song.artis || '-'}\n• Album: ${song.album || '-'}\n• Durasi: ${duration(song.durasi)}\n• Instrumental: ${song.instrumen ? 'Ya' : 'Tidak'}`);
            const pieces = chunkText(song.lirik || song.lirik_sinkron);
            for (let i = 0; i < pieces.length; i += 1) await m.reply(`*LIRIK${pieces.length > 1 ? ` (${i + 1}/${pieces.length})` : ''}*\n\n${pieces[i]}`);
            await m.react('✅');
        } catch (error) { await m.react('❌'); await m.reply(`Gagal mencari lirik: ${error.message}`); }
    },
};

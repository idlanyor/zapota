import { getOtakudesuSchedule } from '../../lib/otakudesuScraper.js';
import { getAnimasuSchedule } from '../../lib/animasuScraper.js';
import moment from 'moment';

const dayNamesIndonesian = {
    1: 'Senin',
    2: 'Selasa',
    3: 'Rabu',
    4: 'Kamis',
    5: 'Jumat',
    6: 'Sabtu',
    0: 'Minggu',
};

// Normalisasi nama hari agar cocok antar site (otakudesu: 'Jumat'/'Random', animasu: "Jum'at"/'Update Acak')
function dayKey(day) {
    const d = day.toLowerCase().replace(/[^a-z]/g, '');
    if (d === 'updateacak' || d === 'acak') return 'random';
    return d;
}

const DAY_INPUTS = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu', 'acak', 'random'];
const DAY_DISPLAY = {
    senin: 'Senin',
    selasa: 'Selasa',
    rabu: 'Rabu',
    kamis: 'Kamis',
    jumat: 'Jumat',
    sabtu: 'Sabtu',
    minggu: 'Minggu',
    random: 'Random/Acak',
};

function renderSite(schedule, dayFilter) {
    let msg = '';
    for (const [day, list] of Object.entries(schedule)) {
        if (dayFilter && dayKey(day) !== dayFilter) continue;
        if (!list || list.length === 0) continue;
        msg += `━━━ *${day}* ━━━\n`;
        list.forEach((item, i) => {
            msg += `${i + 1}. *${item.title}*\n`;
            const meta = [];
            if (item.episode) meta.push(`Ep ${item.episode}`);
            if (item.status) meta.push(item.status);
            if (meta.length) msg += `   ${meta.join(' • ')}\n`;
            if (item.link) msg += `   ${item.link}\n`;
        });
        msg += '\n';
    }
    return msg;
}

export default {
    name: 'jadwalanime',
    aliases: ['jadwal'],
    description: 'Jadwal rilis anime. 1=otakudesu 2=animasu. "all"=semua hari.',
    category: 'Downloader',
    execute: async (sock, m, args, text) => {
        await m.react('⏳');

        try {
            const parts = (text || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
            const showAll = parts.includes('all');
            const siteArg = parts.find((p) => p === '1' || p === '2');
            const dayPart = parts.find((p) => DAY_INPUTS.includes(p.replace(/[^a-z]/g, '')));

            const todayName = dayNamesIndonesian[moment().utcOffset('+07:00').day()];
            const todayKey = dayKey(todayName);
            const dayFilter = dayPart ? dayKey(dayPart) : showAll ? null : todayKey;
            const dayLabel = dayPart
                ? DAY_DISPLAY[dayKey(dayPart)]
                : showAll
                    ? 'Semua Hari'
                    : todayName;

            const siteMap = {
                '1': ['Otakudesu', getOtakudesuSchedule],
                '2': ['Animasu', getAnimasuSchedule],
            };

            const sites =
                siteArg && siteMap[siteArg]
                    ? [siteMap[siteArg]]
                    : [siteMap['1'], siteMap['2']];

            const results = await Promise.all(
                sites.map(async ([name, fn]) => {
                    try {
                        return [name, await fn()];
                    } catch {
                        return [name, null];
                    }
                })
            );

            let message = `📅 *Jadwal Rilis Anime*\n`;
            message += `Hari: *${dayLabel}*\n\n`;

            for (const [name, schedule] of results) {
                if (!schedule) {
                    message += `╔═ *${name}* ═╗\n❌ Gagal dimuat\n\n`;
                    continue;
                }
                const block = renderSite(schedule, dayFilter);
                message += `╔═ *${name}* ═╗\n`;
                message += block || `Tidak ada jadwal.\n\n`;
            }

            message += `💡 *1* / *2* pilih site | *[hari]* | *all* = semua hari\n`;
            message += `Contoh: *.jadwalanime 1 senin* | *.jadwalanime 2 all*`;

            await m.reply(message);
            await m.react('✅');
        } catch (error) {
            console.error('[ERROR] jadwalanime failed:', error);
            await m.react('❌');
            await m.reply(`❌ Gagal mengambil jadwal anime: ${error.message}`);
        }
    },
};

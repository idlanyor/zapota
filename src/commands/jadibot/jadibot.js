import { jadibotService, JADIBOT } from '../../services/jadibotService.js';
import { getBalance } from '../../services/walletService.js';
import { resolveSenderInfo } from '../../utils/phoneLookup.js';
import { mainSocket } from '../../lib/botProfile.js';
import { settings } from '../../config/settings.js';

const rupiah = (n) => `Rp${Number(n).toLocaleString('id-ID')}`;
const tanggal = (d) =>
    d
        ? new Date(d).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
          })
        : '-';

/** Format a pairing code as WhatsApp shows it: XXXX-XXXX. */
const formatCode = (code) =>
    /^[A-Z0-9]{8}$/i.test(code) ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

const PRICE = rupiah(JADIBOT.PRICE);

const help = (p) =>
    '🤖 *JADIBOT*\n\n' +
    'Jadikan nomor WhatsApp kamu sebagai bot.\n\n' +
    '*Free*: bot hanya merespon kamu sendiri, di chat pribadi. Mati otomatis kalau 7 hari tidak dipakai.\n' +
    `*Premium* (${PRICE}/${JADIBOT.PREMIUM_DAYS} hari): bot bisa dipakai semua orang, ` +
    'di chat pribadi dan grup, termasuk fitur manajemen grup.\n\n' +
    `• *${p}jadibot* — minta kode pairing\n` +
    `• *${p}jadibot status* — cek jadibot kamu\n` +
    `• *${p}jadibot premium* — upgrade/perpanjang Premium\n` +
    `• *${p}stopjadibot* — hentikan jadibot`;

/**
 * The sender's real phone number. A pairing code works only on the phone of
 * the number it was issued for, so users can only link their own number.
 */
const senderNumber = async (m) => {
    const { canonicalJid, phoneNumber } = await resolveSenderInfo(m);
    return canonicalJid?.endsWith('@s.whatsapp.net') ? phoneNumber : null;
};

const pair = async (m, number, p) => {
    const mainNumber = mainSocket()?.user?.id?.split('@')[0].split(':')[0];
    if (number === mainNumber) return m.reply('❌ Nomor bot utama tidak bisa dijadikan jadibot.');

    await m.react('⏳');
    const result = await jadibotService.requestPairing({ number, ownerJid: m.sender });

    if (!result.ok) {
        await m.react('❌');
        const reasons = {
            running: `✅ Jadibot kamu sudah aktif. Cek dengan *${p}jadibot status*.`,
            busy: '⏳ Kode pairing kamu sedang dibuat, tunggu sebentar.',
            full:
                `😔 Slot Jadibot Free sedang penuh (${result.max} sesi). Coba lagi nanti, ` +
                `atau ambil Premium (*${p}jadibot premium*) yang tidak dibatasi slot.`,
            no_code:
                '❌ Gagal mendapatkan kode pairing dari WhatsApp. Coba lagi beberapa saat lagi.',
        };
        return m.reply(reasons[result.reason] || '❌ Gagal memulai jadibot.');
    }

    await m.react('✅');
    await m.reply(
        '🔗 *KODE PAIRING JADIBOT*\n\n' +
            `*${formatCode(result.code)}*\n\n` +
            '*Cara memakai:*\n' +
            '1. Buka WhatsApp di HP nomor ini\n' +
            '2. Ketuk ⋮ / Setelan → *Perangkat tertaut*\n' +
            '3. *Tautkan perangkat* → *Tautkan dengan nomor telepon saja*\n' +
            '4. Masukkan kode di atas\n\n' +
            `⏱️ Kode berlaku ${JADIBOT.PAIRING_TIMEOUT_MS / 60_000} menit. ` +
            'Jangan berikan kode ini ke orang lain.'
    );
};

const status = async (m, number, p) => {
    const bot = await jadibotService.describe(number);
    if (!bot || (bot.status === 'stopped' && bot.tier !== 'premium')) {
        return m.reply(`Kamu belum punya jadibot aktif. Ketik *${p}jadibot* untuk mulai.`);
    }
    const live = { open: '🟢 Tersambung', connecting: '🟡 Menyambung', close: '🟠 Terputus' };
    return m.reply(
        '🤖 *STATUS JADIBOT*\n\n' +
            `Nomor: ${bot.number}\n` +
            `Paket: *${bot.tier === 'premium' ? 'Premium' : 'Free'}*\n` +
            (bot.tier === 'premium' ? `Premium sampai: ${tanggal(bot.premiumUntil)}\n` : '') +
            `Koneksi: ${bot.status === 'stopped' ? '⚫ Dihentikan' : live[bot.live] || '⚫ Offline'}` +
            (bot.status === 'stopped' ? `\n\nKetik *${p}jadibot* untuk menyambungkan lagi.` : '')
    );
};

const premium = async (m, number, args, p) => {
    const bot = await jadibotService.describe(number);
    const balance = await getBalance(m.sender);
    const until = bot?.tier === 'premium' ? bot.premiumUntil : null;

    if ((args[1] || '').toLowerCase() !== 'bayar') {
        return m.reply(
            '💎 *JADIBOT PREMIUM*\n\n' +
                `Harga: *${PRICE}* / ${JADIBOT.PREMIUM_DAYS} hari\n` +
                `Saldo kamu: ${rupiah(balance)}\n` +
                (until ? `Premium aktif sampai: ${tanggal(until)} (akan diperpanjang)\n` : '') +
                '\n✨ Bot bisa dipakai semua orang\n✨ Bisa dipakai di grup\n✨ Fitur manajemen grup\n\n' +
                `Ketik *${p}jadibot premium bayar* untuk membayar dari saldo.\n` +
                'Top up saldo hubungi admin.'
        );
    }

    await jadibotService.ensureRecord(number, m.sender);
    const result = await jadibotService.upgradePremium({ number, payerJid: m.sender });
    if (!result.ok) {
        return m.reply(
            `❌ Saldo tidak cukup. Saldo kamu ${rupiah(result.balance)}, butuh ${PRICE}.\n` +
                'Top up saldo hubungi admin.'
        );
    }
    const running = jadibotService.isRunning(number);
    return m.reply(
        '✅ *Jadibot Premium aktif!*\n\n' +
            `Berlaku sampai: *${tanggal(result.premiumUntil)}*\n` +
            `Sisa saldo: ${rupiah(result.balance)}\n\n` +
            (running
                ? 'Jadibot kamu sekarang bisa dipakai semua orang dan di grup.'
                : `Sambungkan jadibot kamu dengan *${p}jadibot*.`)
    );
};

export default {
    name: 'jadibot',
    aliases: ['subbot'],
    description: 'Jadikan nomor WhatsApp kamu sebagai bot (Free / Premium)',
    category: 'Jadibot',
    guards: ['private'],
    execute: async (sock, m, args) => {
        const p = settings.prefix;
        const number = await senderNumber(m);
        if (!number) {
            return m.reply(
                '❌ Nomor WhatsApp kamu tidak terbaca. Coba lagi nanti atau hubungi admin.'
            );
        }

        const sub = (args[0] || '').toLowerCase();
        if (sub === 'help' || sub === 'bantuan') return m.reply(help(p));
        if (sub === 'status') return status(m, number, p);
        if (sub === 'premium') return premium(m, number, args, p);
        if (sub) return m.reply(help(p));
        return pair(m, number, p);
    },
};

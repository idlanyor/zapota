import RpgBill from '../../database/models/RpgBill.js';
import { getOrCreatePlayer } from '../../services/rpgService.js';
import { sendRpgReply } from '../../lib/rpgVisuals.js';

export default {
    name: 'ngutang',
    aliases: ['pinjol', 'tagihan', 'bayar_tagihan', 'bayartagihan', 'bayarhutang'],
    description: 'Mengajukan pinjaman dana darurat atau membayar tagihan pinjol/kosan',
    category: 'RPG',
    execute: async (sock, m, args, text) => {
        const sender = m.sender;
        const cmd =
            m.command ||
            (m.body ? m.body.slice(1).trim().split(/\s+/)[0].toLowerCase() : 'ngutang');

        try {
            const { user, player } = await getOrCreatePlayer(sender, m.pushName);
            const bills = await RpgBill.find({ userId: sender, isPaid: false });

            // Helper: Tampilkan Daftar Tagihan
            const showTagihanList = () => {
                if (!bills || bills.length === 0) {
                    return sendRpgReply(
                        sock,
                        m,
                        `🎉 *BEBAS DARI HUTANG!* 🥳\n` +
                            `Kamu tidak memiliki tagihan pinjol atau cicilan yang menunggak saat ini.`,
                        'debtPaid'
                    );
                }

                let billText =
                    `🧾 *DAFTAR TAGIHAN & HUTANG AKTIF* 💸\n` + `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

                let totalDue = 0;
                bills.forEach((b, idx) => {
                    totalDue += b.amount;
                    billText +=
                        `*${idx + 1}. [ID: ${b.id || b._id}]* ${b.billType.toUpperCase()}\n` +
                        `    💵 Nominal: Rp ${b.amount.toLocaleString()}\n` +
                        `    📅 Jatuh Tempo: ${new Date(b.dueDate).toLocaleDateString('id-ID')}\n\n`;
                });

                billText +=
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `⚠️ *Total Tunggakan:* Rp ${totalDue.toLocaleString()}\n` +
                    `💡 Bayar dengan: */bayar_tagihan [Nomor]* atau */tagihan [Nomor]*\nContoh: */bayar_tagihan 1* atau */tagihan 1*`;

                return sendRpgReply(sock, m, billText, 'financeBills');
            };

            // Helper: Eksekusi Pembayaran Tagihan
            const handleBayarTagihan = async (targetInput) => {
                if (!targetInput) {
                    return showTagihanList();
                }

                let bill = null;
                const num = parseInt(targetInput, 10);
                if (!isNaN(num) && num >= 1 && num <= bills.length) {
                    bill = bills[num - 1];
                } else {
                    bill = await RpgBill.findOne({
                        userId: sender,
                        id: targetInput,
                        isPaid: false,
                    });
                }

                if (!bill || bill.isPaid) {
                    return m.reply(
                        '❌ Tagihan tidak ditemukan atau sudah lunas. Ketik */tagihan* untuk melihat nomor tagihan.'
                    );
                }

                if ((user.balance || 0) < bill.amount) {
                    return m.reply(
                        `💸 Saldomu tidak cukup untuk melunasi tagihan sebesar *Rp ${bill.amount.toLocaleString()}*.\nSaldo kamu saat ini: *Rp ${(user.balance || 0).toLocaleString()}*`
                    );
                }

                user.balance -= bill.amount;
                await user.save();

                bill.isPaid = true;
                await bill.save();

                player.kewarasan = Math.min(100, player.kewarasan + 20);
                player.reputasiWarga = Math.min(100, player.reputasiWarga + 10);
                await player.save();

                return sendRpgReply(
                    sock,
                    m,
                    `✅ *TAGIHAN BERHASIL DILUNASI!* 🎊\n\n` +
                        `Jenis: *${bill.billType.toUpperCase()}*\n` +
                        `Jumlah Terbayar: *Rp ${bill.amount.toLocaleString()}*\n` +
                        `Pikiranmu sekarang jauh lebih tenang dan bebas dari teror DC! (Kewarasan +20)`,
                    'debtPaid'
                );
            };

            // ROUTING:
            // 1. Command .bayar_tagihan / .bayartagihan / .bayarhutang
            if (cmd === 'bayar_tagihan' || cmd === 'bayartagihan' || cmd === 'bayarhutang') {
                return handleBayarTagihan(args[0]);
            }

            // 2. Command .tagihan
            if (cmd === 'tagihan') {
                if (args[0]) {
                    if (args[0].toLowerCase() === 'bayar') return handleBayarTagihan(args[1]);
                    return handleBayarTagihan(args[0]);
                }
                return showTagihanList();
            }

            // 3. Command .ngutang / .pinjol
            const sub = args[0]?.toLowerCase();
            if (sub === 'tagihan' || sub === 'list') {
                return showTagihanList();
            }
            if (sub === 'bayar') {
                return handleBayarTagihan(args[1]);
            }

            const amount = parseInt(args[0], 10);
            if (isNaN(amount) || amount < 10000 || amount > 1000000) {
                return sendRpgReply(
                    sock,
                    m,
                    `📱 *APLIKASI PINJOL CEPAT CAIR (2026)* ⚡\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `Syarat: Cukup foto KTP dan kontak darurat seluruh temanmu.\n\n` +
                        `📌 *Cara Meminjam:*\n` +
                        `Ketik: */ngutang [nominal]*\n` +
                        `Minimal: Rp 10.000\n` +
                        `Maksimal: Rp 1.000.000\n` +
                        `Bunga: 30% (Jatuh tempo 7 hari)\n\n` +
                        `Contoh: */ngutang 100000*\n\n` +
                        `💡 Ketik */tagihan* untuk melihat atau membayar tagihan aktif.`,
                    'loanApp'
                );
            }

            // Batasi maksimal 3 tagihan aktif
            const activeBillsCount = await RpgBill.countDocuments({
                userId: sender,
                isPaid: false,
            });
            if (activeBillsCount >= 3) {
                return m.reply(
                    `❌ *PENGAJUAN PINJOL DITOLAK!* 🚫\n` +
                        `Skor BI Checking / SLIK kamu merah karena ada 3 tagihan aktif belum dibayar!\n` +
                        `Lunasi dulu dengan ketik */tagihan*.`
                );
            }

            // Cairkan uang
            const interest = Math.round(amount * 0.3);
            const totalRepayment = amount + interest;

            user.balance = (user.balance || 0) + amount;
            await user.save();

            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);

            const newBill = await RpgBill.create({
                userId: sender,
                billType: 'pinjol',
                amount: totalRepayment,
                dueDate: dueDate,
                isPaid: false,
            });

            player.kewarasan = Math.max(10, player.kewarasan - 10);
            await player.save();

            return sendRpgReply(
                sock,
                m,
                `💸 *PINJOL BERHASIL CAIR KE REKENING!* 📥\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Dana Cair: *+Rp ${amount.toLocaleString()}*\n` +
                    `Total Wajib Bayar: *Rp ${totalRepayment.toLocaleString()}* (Bunga 30%)\n` +
                    `Jatuh Tempo: *${dueDate.toLocaleDateString('id-ID')}*\n` +
                    `ID Tagihan: *${newBill.id || newBill._id}*\n\n` +
                    `⚠️ _Awas! Jika telat bayar, data kontakmu akan disebar dan diteror Debt Collector!_`,
                'loanDisbursed'
            );
        } catch (error) {
            console.error('Error in ngutang command:', error);
            await m.reply('❌ Terjadi kesalahan saat memproses pinjaman.');
        }
    },
};

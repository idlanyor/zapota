import { deleteTransaction } from '../../services/financeService.js';

export default {
    name: 'hapus',
    aliases: ['delete', 'batal', 'undo'],
    description: 'Hapus transaksi yang salah input',
    category: 'Finance',
    execute: async (sock, m, args, text) => {
        try {
            const userId = m.sender;
            const targetId = args[0] || null;

            const deleted = await deleteTransaction(userId, targetId);

            if (!deleted) {
                return m.reply(
                    targetId
                        ? 'Transaksi tidak ditemukan atau ID salah. Pastikan kamu hanya menghapus transaksimu sendiri.'
                        : 'Kamu belum memiliki riwayat transaksi untuk dihapus.'
                );
            }

            const amountFormatted = new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                maximumFractionDigits: 0,
            }).format(deleted.amount);

            await m.reply(
                ` *TRANSAKSI BERHASIL DIHAPUS*\n\n*Keterangan:* ${deleted.description}\n*Nominal:* ${amountFormatted}\n*Kategori:* ${deleted.category}\n\n_Gunakan ".laporan" untuk melihat daftar lengkap._`
            );
        } catch (error) {
            console.error('Hapus Error:', error);
            await m.reply(
                'Terjadi kesalahan saat mencoba menghapus transaksi. Pastikan format ID benar.'
            );
        }
    },
};

import mongoose from '../index.js';

const voucherSchema = new mongoose.Schema(
    {
        code: { type: String, required: true, unique: true },
        value: { type: Number, required: true }, // Jumlah saldo
        quota: { type: Number, default: 1 }, // Berapa kali bisa dipakai
        usedBy: [{ type: String }], // List JID yang sudah pakai
        isPublic: { type: Boolean, default: false }, // Jika true, bisa dipakai banyak orang (sesuai quota)
        expiredAt: { type: Date },
    },
    { timestamps: true }
);

export default mongoose.model('Voucher', voucherSchema);

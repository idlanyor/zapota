import mongoose from '../index.js';

const serverSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true }, // WhatsApp JID
        pteroId: { type: Number, required: true }, // ID Server di Panel
        identifier: { type: String, required: true }, // Identifier unik (misal: a1b2c3d4)
        planName: { type: String, required: true },
        price: { type: Number, required: true },
        status: { type: String, default: 'active' }, // active, suspended, expired
        expiredAt: { type: Date, required: true },
        autoRenewEnabled: { type: Boolean, default: true, index: true },
        autoRenewCycleDays: { type: Number, default: 30, min: 1 },
        lastAutoRenewFor: { type: String, default: '' },
        lastAutoRenewAt: { type: Date, default: null },
        lastRenewalNotifyFor: { type: String, default: '' },
        suspendedAt: { type: Date, default: null },
        createdAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

export default mongoose.model('Server', serverSchema);

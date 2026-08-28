import mongoose from '../index.js';

const TransactionSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true },
        userName: { type: String },
        type: { type: String, enum: ['income', 'expense'], required: true },
        amount: { type: Number, required: true },
        category: { type: String, default: 'General' },
        source: {
            type: String,
            enum: ['finance', 'store', 'smm', 'general', 'other'],
            default: 'other',
            index: true,
        },
        description: { type: String },
        kakeiboCategory: {
            type: String,
            enum: ['needs', 'wants', 'culture', 'extras', null],
            default: null,
        },
        date: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

export default mongoose.model('Transaction', TransactionSchema);

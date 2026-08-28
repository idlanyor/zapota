import mongoose from '../index.js';

const BudgetSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true },
        month: { type: Number, required: true }, // 1-12
        year: { type: Number, required: true },
        incomeTarget: { type: Number, default: 0 },
        savingsTarget: { type: Number, default: 0 },
        note: { type: String },
    },
    { timestamps: true }
);

// Ensure one budget per user per month
BudgetSchema.index({ userId: 1, month: 1, year: 1 }, { unique: true });

export default mongoose.model('Budget', BudgetSchema);

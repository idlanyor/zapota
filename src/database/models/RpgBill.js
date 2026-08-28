import mongoose from '../index.js';

const RpgBillSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        billType: {
            type: String,
            enum: ['kosan', 'pinjol', 'cicilan_motor', 'denda_tilang'],
            required: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        dueDate: {
            type: Date,
            required: true,
        },
        isPaid: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

export default mongoose.model('RpgBill', RpgBillSchema, 'rpg_bills');

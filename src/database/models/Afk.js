import mongoose from '../index.js';

const AfkSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        userName: {
            type: String,
            default: '',
        },
        reason: {
            type: String,
            default: 'Tanpa alasan',
        },
        time: {
            type: Date,
            default: Date.now,
        },
    }
);

export default mongoose.model('Afk', AfkSchema, 'afk');

import mongoose from '../index.js';

const RpgProgressSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        dailyDate: {
            type: String,
            required: true,
        },
        dailyWork: { type: Number, default: 0 },
        dailyShop: { type: Number, default: 0 },
        dailyMeal: { type: Number, default: 0 },
        dailyWins: { type: Number, default: 0 },
        claimedMissions: { type: Array, default: [] },
        totalWork: { type: Number, default: 0 },
        totalShop: { type: Number, default: 0 },
        totalMeal: { type: Number, default: 0 },
        totalWins: { type: Number, default: 0 },
        unlockedAchievements: { type: Array, default: [] },
        equippedTitle: { type: String, default: '' },
    },
    { timestamps: true }
);

export default mongoose.model('RpgProgress', RpgProgressSchema, 'rpg_progress');

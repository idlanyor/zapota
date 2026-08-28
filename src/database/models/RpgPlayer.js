import mongoose from '../index.js';

const RpgPlayerSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        level: {
            type: Number,
            default: 1,
        },
        exp: {
            type: Number,
            default: 0,
        },
        hp: {
            type: Number,
            default: 100,
        },
        maxHp: {
            type: Number,
            default: 100,
        },
        gizi: {
            type: Number,
            default: 100,
        },
        kewarasan: {
            type: Number,
            default: 100,
        },
        energi: {
            type: Number,
            default: 100,
        },
        maxEnergi: {
            type: Number,
            default: 100,
        },
        job: {
            type: String,
            default: 'Pengangguran',
        },
        reputasiWarga: {
            type: Number,
            default: 50,
        },
        reputasiPreman: {
            type: Number,
            default: 20,
        },
        reputasiAparat: {
            type: Number,
            default: 50,
        },
        bintangKorupsi: {
            type: Number,
            default: 0,
        },
        lastMbgClaim: {
            type: Date,
            default: null,
        },
        lastWork: {
            type: Date,
            default: null,
        },
        lastHealing: {
            type: Date,
            default: null,
        },
        lastEnergyReset: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

export default mongoose.model('RpgPlayer', RpgPlayerSchema, 'rpg_players');

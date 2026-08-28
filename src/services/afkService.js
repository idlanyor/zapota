import Afk from '../database/models/Afk.js';

// In-memory cache for ultra-fast checks on every message
const afkCache = new Map();
let isInitialized = false;

export const initAfkCache = async () => {
    if (isInitialized) return;
    try {
        const records = await Afk.find({});
        for (const record of records) {
            afkCache.set(record.userId, {
                userId: record.userId,
                userName: record.userName,
                reason: record.reason,
                time: new Date(record.time).getTime(),
            });
        }
        isInitialized = true;
    } catch (e) {
        console.error('Failed to initialize AFK cache:', e);
    }
};

export const setAfk = async (userId, reason = 'Tanpa alasan', userName = '') => {
    const time = Date.now();
    afkCache.set(userId, { userId, userName, reason, time });

    try {
        let doc = await Afk.findOne({ userId });
        if (doc) {
            doc.userName = userName;
            doc.reason = reason;
            doc.time = new Date(time);
            await doc.save();
        } else {
            await Afk.create({ userId, userName, reason, time: new Date(time) });
        }
    } catch (e) {
        console.error('Error saving AFK to DB:', e);
    }
};

export const getAfk = (userId) => {
    return afkCache.get(userId) || null;
};

export const removeAfk = async (userId) => {
    const existing = afkCache.get(userId);
    afkCache.delete(userId);

    try {
        await Afk.deleteOne({ userId });
    } catch (e) {
        console.error('Error removing AFK from DB:', e);
    }

    return existing;
};

export const formatAfkDuration = (ms) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days} hari`);
    if (hours > 0) parts.push(`${hours} jam`);
    if (minutes > 0) parts.push(`${minutes} menit`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds} detik`);

    return parts.join(' ');
};

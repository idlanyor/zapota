import RpgProgress from '../database/models/RpgProgress.js';

export const RPG_TIME_ZONE = 'Asia/Jakarta';

export const DAILY_MISSIONS = Object.freeze({
    kerja: {
        id: 'kerja',
        name: '💼 Pejuang Rupiah',
        description: 'Selesaikan pekerjaan 2 kali',
        field: 'dailyWork',
        target: 2,
        rupiah: 20000,
        exp: 30,
    },
    belanja: {
        id: 'belanja',
        name: '🛒 Belanja Lokal',
        description: 'Belanja di Kopdes 1 kali',
        field: 'dailyShop',
        target: 1,
        rupiah: 10000,
        exp: 15,
    },
    makan: {
        id: 'makan',
        name: '🍱 Isi Tenaga',
        description: 'Makan atau minum 1 kali',
        field: 'dailyMeal',
        target: 1,
        rupiah: 8000,
        exp: 10,
    },
    menang: {
        id: 'menang',
        name: '🎮 Jagoan Warkop',
        description: 'Menangkan minigame 2 kali',
        field: 'dailyWins',
        target: 2,
        rupiah: 5000,
        exp: 10,
    },
});

export const ACHIEVEMENTS = Object.freeze({
    gajian_pertama: {
        id: 'gajian_pertama',
        icon: '💵',
        name: 'Gajian Pertama',
        title: 'Pejuang Rupiah',
        description: 'Selesaikan pekerjaan pertama',
        check: ({ progress }) => progress.totalWork >= 1,
    },
    budak_korporat: {
        id: 'budak_korporat',
        icon: '🏢',
        name: 'Budak Korporat',
        title: 'Tidak Kenal Cuti',
        description: 'Selesaikan pekerjaan 25 kali',
        check: ({ progress }) => progress.totalWork >= 25,
    },
    pelanggan_kopdes: {
        id: 'pelanggan_kopdes',
        icon: '🛍️',
        name: 'Pelanggan Tetap Kopdes',
        title: 'Sultan Sembako',
        description: 'Belanja di Kopdes 10 kali',
        check: ({ progress }) => progress.totalShop >= 10,
    },
    jagoan_warkop: {
        id: 'jagoan_warkop',
        icon: '🎮',
        name: 'Jagoan Warkop',
        title: 'Raja Minigame',
        description: 'Menangkan minigame pertama',
        check: ({ progress }) => progress.totalWins >= 1,
    },
    legenda_warkop: {
        id: 'legenda_warkop',
        icon: '🏆',
        name: 'Legenda Warkop',
        title: 'Sepuh Warkop',
        description: 'Menangkan 25 minigame',
        check: ({ progress }) => progress.totalWins >= 25,
    },
    naik_kelas: {
        id: 'naik_kelas',
        icon: '📈',
        name: 'Naik Kelas',
        title: 'Warga Berpengalaman',
        description: 'Capai level 5',
        check: ({ player }) => player.level >= 5,
    },
    sultan_desa: {
        id: 'sultan_desa',
        icon: '💰',
        name: 'Sultan Desa',
        title: 'Sultan Desa',
        description: 'Miliki saldo Rp1.000.000',
        check: ({ user }) => (user.balance || 0) >= 1000000,
    },
    warga_teladan: {
        id: 'warga_teladan',
        icon: '🌟',
        name: 'Warga Teladan',
        title: 'Kebanggaan RT',
        description: 'Capai reputasi warga 90',
        check: ({ player }) => (player.reputasiWarga || 0) >= 90,
    },
    dalam_pantauan: {
        id: 'dalam_pantauan',
        icon: '🚨',
        name: 'Dalam Pantauan',
        title: 'Langganan Pemeriksaan',
        description: 'Capai 3 bintang korupsi',
        check: ({ player }) => (player.bintangKorupsi || 0) >= 3,
    },
});

const ACTIVITY_FIELDS = Object.freeze({
    work: ['dailyWork', 'totalWork'],
    shop: ['dailyShop', 'totalShop'],
    meal: ['dailyMeal', 'totalMeal'],
    win: ['dailyWins', 'totalWins'],
});

export const getRpgDateKey = (date = new Date()) =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: RPG_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);

const resetDailyProgress = (progress, dateKey) => {
    if (progress.dailyDate === dateKey) return false;
    progress.dailyDate = dateKey;
    progress.dailyWork = 0;
    progress.dailyShop = 0;
    progress.dailyMeal = 0;
    progress.dailyWins = 0;
    progress.claimedMissions = [];
    return true;
};

export const getOrCreateRpgProgress = async (userId, now = new Date()) => {
    const dateKey = getRpgDateKey(now);
    let progress = await RpgProgress.findOne({ userId });
    if (!progress) {
        progress = await RpgProgress.create({ userId, dailyDate: dateKey });
        return progress;
    }

    if (resetDailyProgress(progress, dateKey)) await progress.save();
    return progress;
};

export const recordRpgActivity = async (userId, activity, amount = 1, now = new Date()) => {
    const fields = ACTIVITY_FIELDS[activity];
    if (!fields) throw new Error(`Aktivitas RPG tidak dikenal: ${activity}`);
    if (!Number.isInteger(amount) || amount < 1) throw new Error('Jumlah aktivitas harus positif');

    const progress = await getOrCreateRpgProgress(userId, now);
    const [dailyField, totalField] = fields;
    progress[dailyField] = (progress[dailyField] || 0) + amount;
    progress[totalField] = (progress[totalField] || 0) + amount;
    await progress.save();
    return progress;
};

export const syncAchievements = async (progress, player, user) => {
    const unlocked = new Set(progress.unlockedAchievements || []);
    const newlyUnlocked = [];

    for (const achievement of Object.values(ACHIEVEMENTS)) {
        if (!unlocked.has(achievement.id) && achievement.check({ progress, player, user })) {
            unlocked.add(achievement.id);
            newlyUnlocked.push(achievement);
        }
    }

    if (newlyUnlocked.length > 0) {
        progress.unlockedAchievements = [...unlocked];
        await progress.save();
    }
    return newlyUnlocked;
};

export const getMissionState = (progress, mission) => ({
    current: Math.min(progress[mission.field] || 0, mission.target),
    complete: (progress[mission.field] || 0) >= mission.target,
    claimed: (progress.claimedMissions || []).includes(mission.id),
});

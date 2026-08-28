import RpgPlayer from '../database/models/RpgPlayer.js';
import User from '../database/models/User.js';
import { getOrCreateRpgProgress, recordRpgActivity } from './rpgProgressService.js';

export const KOPDES_ITEMS = {
    kopi_saset: {
        id: 'kopi_saset',
        name: '☕ Kopi Saset Kapal Api',
        category: 'konsumsi',
        price: 5000,
        desc: 'Menghilangkan kantuk, nambah Energi +20, Kewarasan +10, Gizi +5',
        effect: { energi: 20, kewarasan: 10, gizi: 5, hp: 0 },
    },
    mie_instan: {
        id: 'mie_instan',
        name: '🍜 Indomie Goreng Spesial',
        category: 'konsumsi',
        price: 4000,
        desc: 'Makanan wajib anak kos. Gizi +30, Kewarasan +10',
        effect: { energi: 10, kewarasan: 10, gizi: 30, hp: 0 },
    },
    beras_5kg: {
        id: 'beras_5kg',
        name: '🌾 Beras Subsidi Kopdes 5kg',
        category: 'konsumsi',
        price: 70000,
        desc: 'Stok beras berkualitas. Gizi +80, HP +20',
        effect: { energi: 30, kewarasan: 20, gizi: 80, hp: 20 },
    },
    tolak_angin: {
        id: 'tolak_angin',
        name: '🌿 Jamu Tolak Angin',
        category: 'konsumsi',
        price: 6000,
        desc: 'Obat masuk angin dan capek. HP +35, Kewarasan +10',
        effect: { energi: 15, kewarasan: 10, gizi: 5, hp: 35 },
    },
    obat_maag: {
        id: 'obat_maag',
        name: '💊 Promag / Obat Sakit Perut',
        category: 'konsumsi',
        price: 8000,
        desc: 'Menyembuhkan efek keracunan makanan MBG. HP +40',
        effect: { energi: 10, kewarasan: 15, gizi: 0, hp: 40 },
    },
    token_listrik: {
        id: 'token_listrik',
        name: '💡 Token Listrik PLN 20k',
        category: 'konsumsi',
        price: 25000,
        desc: 'Kosan jadi terang, terhindar dari gelap gulita. Kewarasan +25',
        effect: { energi: 0, kewarasan: 25, gizi: 0, hp: 0 },
    },
    kuota_internet: {
        id: 'kuota_internet',
        name: '📶 Paket Kuota 10GB',
        category: 'konsumsi',
        price: 35000,
        desc: 'Bisa scroll medsos dan cari loker. Kewarasan +30',
        effect: { energi: 0, kewarasan: 30, gizi: 0, hp: 0 },
    },
    helm_sni: {
        id: 'helm_sni',
        name: '🪖 Helm Bogo SNI',
        category: 'senjata',
        price: 120000,
        desc: 'Equipment: Menambah pertahanan saat dicegat begal/preman (+25 Def)',
        effect: { defense: 25 },
    },
    kunci_inggris: {
        id: 'kunci_inggris',
        name: '🔧 Kunci Inggris Baja',
        category: 'senjata',
        price: 85000,
        desc: 'Equipment: Senjata andalan bela diri jalanan (+30 Atk)',
        effect: { attack: 30 },
    },
    sepeda_butut: {
        id: 'sepeda_butut',
        name: '🚲 Sepeda Onthel Butut',
        category: 'kendaraan',
        price: 300000,
        desc: 'Kendaraan: Hemat stamina kerja 10%',
        effect: { staminaBonus: 10 },
    },
    motor_matic: {
        id: 'motor_matic',
        name: '🛵 Motor Matic Beat Karbu',
        category: 'kendaraan',
        price: 2500000,
        desc: 'Kendaraan: Syarat wajib menjadi Driver Ojol!',
        effect: { unlockedJob: 'Driver Ojol' },
    },
};

export const JOBS = {
    Pengangguran: {
        name: 'Pengangguran',
        minLevel: 1,
        salaryMin: 0,
        salaryMax: 0,
        energyCost: 0,
        stress: 0,
        expGain: 5,
        desc: 'Rebahan di kamar, menunggu keajaiban.',
    },
    'Pemulung / Pengamen': {
        name: 'Pemulung / Pengamen',
        minLevel: 1,
        salaryMin: 15000,
        salaryMax: 35000,
        energyCost: 15,
        stress: 5,
        expGain: 15,
        desc: 'Keliling kampung mencari botol bekas atau ngamen di lampu merah.',
    },
    'Kasir Kopdes Merah Putih': {
        name: 'Kasir Kopdes Merah Putih',
        minLevel: 2,
        salaryMin: 50000,
        salaryMax: 90000,
        energyCost: 25,
        stress: 10,
        expGain: 25,
        desc: 'Melayani sembako warga. (Wajib lulus Ujian Fisik Semi-Militer Kopdes 2026)',
    },
    'Driver Ojol': {
        name: 'Driver Ojol',
        minLevel: 2,
        reqItem: 'motor_matic',
        salaryMin: 80000,
        salaryMax: 160000,
        energyCost: 30,
        stress: 15,
        expGain: 35,
        desc: 'Narik penumpang dan antar paket. Waspada begal & orderan fiktif.',
    },
    'Staf Lapangan SPPG (Gizi)': {
        name: 'Staf Lapangan SPPG (Gizi)',
        minLevel: 3,
        salaryMin: 150000,
        salaryMax: 250000,
        energyCost: 35,
        stress: 20,
        expGain: 50,
        desc: 'Membagikan makanan MBG ke sekolah. Ada godaan sunat anggaran.',
    },
    'Pegawai Swasta Kantoran': {
        name: 'Pegawai Swasta Kantoran',
        minLevel: 4,
        salaryMin: 250000,
        salaryMax: 400000,
        energyCost: 40,
        stress: 30,
        expGain: 70,
        desc: 'Bekerja 9-to-5 di bawah tekanan bos toxic dan AC bocor.',
    },
    'Pengurus Kopdes Pusat': {
        name: 'Pengurus Kopdes Pusat',
        minLevel: 5,
        salaryMin: 400000,
        salaryMax: 750000,
        energyCost: 45,
        stress: 25,
        expGain: 100,
        desc: 'Mengelola pengadaan barang dan dana desa. (Wajib Latsarmil Komcad Kopdes)',
    },
};

/**
 * Get or create RPG player linked with User model
 */
export const getOrCreatePlayer = async (jid, name = '') => {
    let user = await User.findOne({ jid });
    if (!user) {
        user = await User.create({
            jid,
            name: name || jid.split('@')[0],
            balance: 50000, // Modal awal warga baru Rp 50.000
        });
    }

    let player = await RpgPlayer.findOne({ userId: jid });
    if (!player) {
        player = await RpgPlayer.create({
            userId: jid,
            level: 1,
            exp: 0,
            hp: 100,
            maxHp: 100,
            gizi: 100,
            kewarasan: 100,
            energi: 100,
            maxEnergi: 100,
            job: 'Pengangguran',
            reputasiWarga: 50,
            reputasiPreman: 20,
            reputasiAparat: 50,
            bintangKorupsi: 0,
        });
    }

    // Auto-refresh daily energy if reset period passed (24h or new calendar day)
    const now = new Date();
    const lastReset = player.lastEnergyReset ? new Date(player.lastEnergyReset) : new Date(0);
    if (now.toDateString() !== lastReset.toDateString()) {
        player.energi = player.maxEnergi || 100;
        player.lastEnergyReset = now;

        // Natural decay per hari jika tidak makan
        player.gizi = Math.max(10, player.gizi - 25);
        player.kewarasan = Math.max(10, player.kewarasan - 15);
        if (player.gizi < 30) {
            player.hp = Math.max(20, player.hp - 20);
        }
        await player.save();
    }

    return { user, player };
};

/**
 * Award EXP and check level up
 */
export const addExp = async (player, expAmount) => {
    player.exp += expAmount;

    let leveledUp = false;
    while (player.exp >= player.level * 100) {
        const requiredExp = player.level * 100;
        player.exp -= requiredExp;
        player.level += 1;
        player.maxHp += 10;
        player.hp = player.maxHp;
        player.maxEnergi += 10;
        player.energi = player.maxEnergi;
        player.kewarasan = 100;
        leveledUp = true;
    }

    await player.save();
    return { leveledUp, newLevel: player.level };
};

/**
 * Unified reward helper when a player wins any minigame
 */
export const MINIGAME_REWARD_TIERS = Object.freeze([
    {
        id: 'full',
        maxDailyWins: 3,
        rupiahMin: 2500,
        rupiahMax: 5000,
        expMin: 8,
        expMax: 12,
    },
    {
        id: 'reduced',
        maxDailyWins: 6,
        rupiahMin: 1000,
        rupiahMax: 2500,
        expMin: 6,
        expMax: 10,
    },
    {
        id: 'xp_only',
        maxDailyWins: 15,
        rupiahMin: 0,
        rupiahMax: 0,
        expMin: 3,
        expMax: 3,
    },
    {
        id: 'practice',
        maxDailyWins: Infinity,
        rupiahMin: 0,
        rupiahMax: 0,
        expMin: 0,
        expMax: 0,
    },
]);

const randomInteger = (min, max, random) => Math.floor(random() * (max - min + 1)) + min;

export const calculateMinigameReward = (
    winsBeforeReward,
    customRupiah = null,
    customExp = null,
    random = Math.random
) => {
    const nextWin = Math.max(0, winsBeforeReward) + 1;
    const tier = MINIGAME_REWARD_TIERS.find((item) => nextWin <= item.maxDailyWins);
    const rolledRupiah = randomInteger(tier.rupiahMin, tier.rupiahMax, random);
    const rolledExp = randomInteger(tier.expMin, tier.expMax, random);

    return {
        earnedRupiah:
            customRupiah === null
                ? rolledRupiah
                : Math.max(0, Math.min(customRupiah, tier.rupiahMax)),
        earnedExp: customExp === null ? rolledExp : Math.max(0, Math.min(customExp, tier.expMax)),
        rewardTier: tier.id,
        dailyWinNumber: nextWin,
        cashLimitReached: tier.id === 'xp_only' || tier.id === 'practice',
        rewardLimitReached: tier.id === 'practice',
    };
};

export const awardMinigameWin = async (jid, customRupiah = null, customExp = null) => {
    const { user, player } = await getOrCreatePlayer(jid);
    const progress = await getOrCreateRpgProgress(jid);
    const reward = calculateMinigameReward(progress.dailyWins || 0, customRupiah, customExp);
    const { earnedRupiah, earnedExp } = reward;

    user.balance = (user.balance || 0) + earnedRupiah;
    await user.save();

    const { leveledUp, newLevel } = await addExp(player, earnedExp);
    await recordRpgActivity(jid, 'win');

    return {
        earnedRupiah,
        earnedExp,
        totalBalance: user.balance,
        leveledUp,
        newLevel,
        rewardTier: reward.rewardTier,
        dailyWinNumber: reward.dailyWinNumber,
        cashLimitReached: reward.cashLimitReached,
        rewardLimitReached: reward.rewardLimitReached,
    };
};

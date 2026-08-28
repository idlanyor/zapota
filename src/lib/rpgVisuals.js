import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prepareWAMessageMedia } from 'baileys';
import sharp from 'sharp';

const KANATA_SITE_URL = 'https://kanata.irengcloud.com';

const scene = (file, title, body) => ({
    path: fileURLToPath(new URL(`../assets/rpg/scenes/${file}`, import.meta.url)),
    title,
    body,
});

export const RPG_SCENES = Object.freeze({
    workComplete: scene('work-complete.png', '💼 PEKERJAAN SELESAI', 'Kanata RPG · Karier'),
    careerJobBoard: scene('career-job-board.png', '📋 PAPAN LOWONGAN', 'Kanata RPG · Karier'),
    careerAccepted: scene('career-accepted.png', '🤝 LAMARAN DITERIMA', 'Kanata RPG · Karier'),
    careerLatsarmil: scene('career-latsarmil.png', '🎖️ LATSARMIL KOPDES', 'Kanata RPG · Karier'),
    careerInsiderBribe: scene(
        'career-insider-bribe.png',
        '💼 JALUR ORANG DALAM',
        'Kanata RPG · Karier'
    ),
    careerExtortion: scene(
        'career-extortion.png',
        '⚠️ PUNGUTAN LIAR',
        'Kanata RPG · Event Jalanan'
    ),
    careerRobbery: scene('career-robbery.png', '🪖 EVENT BEGAL', 'Kanata RPG · Event Jalanan'),
    mbgUnavailable: scene(
        'mbg-unavailable.png',
        '🍱 MBG BELUM TERSEDIA',
        'Kanata RPG · Program MBG'
    ),
    mbgNutritious: scene('mbg-nutritious.png', '✨ MENU BERGIZI', 'Kanata RPG · Program MBG'),
    mbgPoorMeal: scene('mbg-poor-meal.png', '😐 MENU PAS-PASAN', 'Kanata RPG · Program MBG'),
    mbgPoisoning: scene('mbg-poisoning.png', '🚨 KERACUNAN MBG', 'Kanata RPG · Program MBG'),
    recoveryWarkop: scene('recovery-warkop.png', '☕ REHAT DI WARKOP', 'Kanata RPG · Pemulihan'),
    recoveryHospital: scene(
        'recovery-hospital.png',
        '🏥 PERAWATAN MEDIS',
        'Kanata RPG · Pemulihan'
    ),
    recoveryVacation: scene(
        'recovery-vacation.png',
        '🏖️ WAKTUNYA HEALING',
        'Kanata RPG · Pemulihan'
    ),
    corruptionSting: scene(
        'corruption-sting.png',
        '🚨 OPERASI TANGKAP TANGAN',
        'Kanata RPG · Risiko Korupsi'
    ),
    corruptionSuccess: scene(
        'finance-corruption-success.png',
        '💰 DANA BERHASIL DITILAP',
        'Kanata RPG · Risiko Korupsi'
    ),
    loanApp: scene('finance-loan-app-v2.png', '📱 PINJAMAN CEPAT CAIR', 'Kanata RPG · Keuangan'),
    loanDisbursed: scene('finance-loan-disbursed.png', '💸 PINJAMAN CAIR', 'Kanata RPG · Keuangan'),
    financeBills: scene('finance-bills.png', '🧾 TAGIHAN AKTIF', 'Kanata RPG · Keuangan'),
    debtPaid: scene('finance-debt-paid.png', '✅ TAGIHAN LUNAS', 'Kanata RPG · Keuangan'),
    kopdesCatalog: scene('kopdes-catalog.png', '🏪 KATALOG KOPDES', 'Kanata RPG · Belanja'),
    kopdesPurchase: scene('kopdes-purchase.png', '🛒 BELANJA BERHASIL', 'Kanata RPG · Belanja'),
    inventoryBag: scene('inventory-bag.png', '🎒 ISI TAS', 'Kanata RPG · Inventori'),
    inventoryUseEquip: scene(
        'inventory-use-equip.png',
        '✨ ITEM DIGUNAKAN',
        'Kanata RPG · Inventori'
    ),
});

const thumbnailCache = new Map();
const headerCache = new WeakMap();

export const getRpgThumbnail = async (sceneKey) => {
    const config = RPG_SCENES[sceneKey];
    if (!config) return null;
    if (!thumbnailCache.has(sceneKey)) {
        thumbnailCache.set(
            sceneKey,
            readFile(config.path)
                .then((image) =>
                    sharp(image)
                        .flatten({ background: '#ffffff' })
                        .resize(600, 400, { fit: 'cover' })
                        .jpeg({ quality: 78, mozjpeg: true })
                        .toBuffer()
                )
                .catch(() => null)
        );
    }
    return thumbnailCache.get(sceneKey);
};

export const sendRpgReply = async (sock, m, text, sceneKey) => {
    const config = RPG_SCENES[sceneKey];
    const thumbnail = await getRpgThumbnail(sceneKey);
    if (!config || !thumbnail || !sock?.sendMessage) return m.reply(text);
    const fingerprint = createHash('sha256').update(thumbnail).digest('hex').slice(0, 12);
    const previewUrl = `${KANATA_SITE_URL}/?rpg-scene=${encodeURIComponent(sceneKey)}&v=${fingerprint}`;

    try {
        return await sock.sendMessage(
            m.chat,
            {
                text,
                contextInfo: {
                    externalAdReply: {
                        title: config.title,
                        body: config.body,
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        thumbnail,
                        sourceUrl: previewUrl,
                        mediaUrl: previewUrl,
                    },
                },
            },
            { quoted: m }
        );
    } catch {
        return m.reply(text);
    }
};

export const getRpgHeaderImage = async (sock, sceneKey) => {
    const thumbnail = await getRpgThumbnail(sceneKey);
    if (!thumbnail || !sock || typeof sock !== 'object') return null;

    let socketCache = headerCache.get(sock);
    if (!socketCache) {
        socketCache = new Map();
        headerCache.set(sock, socketCache);
    }
    if (socketCache.has(sceneKey)) return socketCache.get(sceneKey);

    const prepared = (async () => {
        try {
            if (sock.__zapo?.message?.upload) {
                const media = await sock.__zapo.message.upload(thumbnail, {
                    type: 'image',
                    mimetype: 'image/jpeg',
                });
                return {
                    ...media,
                    mimetype: 'image/jpeg',
                    width: 600,
                    height: 400,
                    jpegThumbnail: thumbnail,
                };
            }
            if (typeof sock.waUploadToServer === 'function') {
                const media = await prepareWAMessageMedia(
                    { image: thumbnail },
                    { upload: sock.waUploadToServer }
                );
                return media.imageMessage || null;
            }
        } catch {
            return null;
        }
        return null;
    })();

    socketCache.set(sceneKey, prepared);
    return prepared;
};

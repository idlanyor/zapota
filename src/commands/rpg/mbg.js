import { getOrCreatePlayer } from '../../services/rpgService.js';
import { sendRpgReply } from '../../lib/rpgVisuals.js';
import { recordRpgActivity } from '../../services/rpgProgressService.js';

export default {
    name: 'klaim_mbg',
    aliases: ['mbg', 'makangratis', 'makangizigratis'],
    description: 'Mengantre Program Makan Bergizi Gratis (MBG) 2026',
    category: 'RPG',
    execute: async (sock, m, args, text) => {
        const sender = m.sender;

        try {
            const { user, player } = await getOrCreatePlayer(sender, m.pushName);

            // Sesuai regulasi 2026: Libur weekend (Sabtu & Minggu)
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0 = Minggu, 6 = Sabtu
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                return sendRpgReply(
                    sock,
                    m,
                    `⛔ *SPPG TUTUP (AKHIR PEKAN)* ⛔\n\n` +
                        `Sesuai aturan BGN tahun 2026, Program Makan Bergizi Gratis (MBG) libur di akhir pekan.\n` +
                        `Silakan beli makan sendiri di minimarket desa: */kopdes* atau warkop: */warkop*.`,
                    'mbgUnavailable'
                );
            }

            // Cooldown 1x per hari
            const lastClaim = player.lastMbgClaim ? new Date(player.lastMbgClaim) : null;
            if (lastClaim && lastClaim.toDateString() === now.toDateString()) {
                return sendRpgReply(
                    sock,
                    m,
                    `🍱 Kamu sudah mengambil jatah MBG hari ini!\n` +
                        `Antrean SPPG baru buka lagi besok pagi jam 07:00 WIB.`,
                    'mbgUnavailable'
                );
            }

            // Gacha hasil SPPG
            // 70% Standar Gizi Baik (Nasi, Ayam/Daging, Sayur, Susu)
            // 20% Rendah Gizi (Nasi porsi jumbo, tempe seuprit, susu kental manis)
            // 10% Kasus Korupsi SPPG -> Makanan basi / Keracunan massal
            const roll = Math.random();

            player.lastMbgClaim = now;

            if (roll < 0.7) {
                // Menu Bergizi Tinggi
                player.gizi = Math.min(100, player.gizi + 50);
                player.hp = Math.min(player.maxHp, player.hp + 10);
                player.kewarasan = Math.min(100, player.kewarasan + 10);
                await player.save();
                await recordRpgActivity(sender, 'meal');

                return sendRpgReply(
                    sock,
                    m,
                    `🍱 *SUKSES MENGANTRE MBG (SATUAN GIZI TERBAIK)* ✨\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `Petugas SPPG membagikan menu hari ini:\n` +
                        `• 🍗 Ayam Panggang Pangan Lokal\n` +
                        `• 🥦 Sayur Bayam & Wortel Segar\n` +
                        `• 🥛 Susu Segar Murni\n` +
                        `• 🍎 Apel Manis\n\n` +
                        `📈 *Efek:* Gizi +50 | HP +10 | Kewarasan +10\n` +
                        `_Kondisi gizi kamu sekarang: ${player.gizi}/100_`,
                    'mbgNutritious'
                );
            } else if (roll < 0.9) {
                // Menu Karbo Tinggi / Kualitas Minim
                player.gizi = Math.min(100, player.gizi + 20);
                player.kewarasan = Math.max(10, player.kewarasan - 5);
                await player.save();
                await recordRpgActivity(sender, 'meal');

                return sendRpgReply(
                    sock,
                    m,
                    `🍱 *MENDAPATKAN JATAH MBG (SPPG PAS-PASAN)* 😐\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `Menu hari ini agak memprihatinkan:\n` +
                        `• 🍚 Nasi dingin sekepal besar\n` +
                        `• 🟫 Tahu goreng tipis\n` +
                        `• 🧃 Susu kental manis encer\n\n` +
                        `📈 *Efek:* Gizi +20 | Kewarasan -5 (agak sedih liat lauknya)\n` +
                        `_Kondisi gizi kamu sekarang: ${player.gizi}/100_`,
                    'mbgPoorMeal'
                );
            } else {
                // Skandal SPPG Korup / Keracunan
                player.hp = Math.max(10, player.hp - 35);
                player.kewarasan = Math.max(10, player.kewarasan - 25);
                await player.save();
                await recordRpgActivity(sender, 'meal');

                return sendRpgReply(
                    sock,
                    m,
                    `🚨 *KASUS KERACUNAN MASSAL MBG!* 🤢🤮\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `Ternyata SPPG daerahmu memotong anggaran dan memakai bahan makanan basi!\n` +
                        `Perutmu melilit hebat dan muntah-muntah.\n\n` +
                        `📉 *Efek Buruk:* HP -35 | Kewarasan -25\n` +
                        `💡 *Solusi Darurat:* Segera minum obat maag (* /pakai obat_maag *) atau berobat ke RS (* /rs *) sebelum pingsan!`,
                    'mbgPoisoning'
                );
            }
        } catch (error) {
            console.error('Error in mbg command:', error);
            await m.reply('❌ Terjadi kesalahan saat mengantre MBG.');
        }
    },
};

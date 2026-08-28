import { getOrCreatePlayer } from '../../services/rpgService.js';
import { sendRpgReply } from '../../lib/rpgVisuals.js';

export default {
    name: 'sunat_dana',
    aliases: ['korupsi', 'markup', 'tilap'],
    description:
        'Mengambil jalur pintas korupsi anggaran untuk profesi tertentu (High Risk High Reward)',
    category: 'RPG',
    execute: async (sock, m, args, text) => {
        const sender = m.sender;

        try {
            const { user, player } = await getOrCreatePlayer(sender, m.pushName);

            // Hanya profesi tertentu yang punya akses korupsi
            const corruptibleJobs = [
                'Staf Lapangan SPPG (Gizi)',
                'Pegawai Swasta Kantoran',
                'Pengurus Kopdes Pusat',
            ];

            if (!corruptibleJobs.includes(player.job)) {
                return m.reply(
                    `❌ Pekerjaanmu saat ini (*${player.job}*) tidak memiliki akses ke anggaran negara atau pengadaan barang!\n` +
                        `Naikkan karirmu dulu ke posisi staf SPPG atau pengurus Kopdes.`
                );
            }

            // Hitung potensi hasil korupsi & risiko
            const korupsiGain =
                player.job === 'Pengurus Kopdes Pusat'
                    ? Math.floor(Math.random() * 1500000) + 1000000
                    : Math.floor(Math.random() * 500000) + 300000;

            player.bintangKorupsi = (player.bintangKorupsi || 0) + 1;
            player.reputasiAparat = Math.max(0, player.reputasiAparat - 20);
            player.reputasiWarga = Math.max(0, player.reputasiWarga - 15);

            // Cek apakah terkena OTT KPK (Peluang membesar seiring banyaknya bintang)
            const ottChance = player.bintangKorupsi * 0.22; // Bintang 5 = >100% OTT
            const isOtt = Math.random() < ottChance;

            if (isOtt) {
                // OTT KPK Event: Sita aset & turun kasta
                const confiscated = user.balance || 0;
                user.balance = 0;
                await user.save();

                player.job = 'Pengangguran (Mantan Napi Korupsi)';
                player.bintangKorupsi = 0;
                player.hp = 30;
                player.kewarasan = 10;
                player.reputasiAparat = 0;
                player.reputasiWarga = 5;
                await player.save();

                return sendRpgReply(
                    sock,
                    m,
                    `🚨🚨 *OPERASI TANGKAP TANGAN (OTT KPK & KEJAGUNG 2026)!* 🚨🚨\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `Kamu tertangkap basah sedang memotong anggaran pengadaan!\n\n` +
                        `⚖️ *VONIS HUKUM:* \n` +
                        `• Seluruh rekening disita negara (-Rp ${confiscated.toLocaleString()})\n` +
                        `• Dipecat tidak hormat dari pekerjaan\n` +
                        `• Status berubah menjadi: *Mantan Napi Korupsi*\n` +
                        `• Kewarasan hancur berantakan (10/100)\n\n` +
                        `_KPK: "Tidak ada toleransi bagi penilap anggaran rakyat di tahun 2026!"_`,
                    'corruptionSting'
                );
            }

            // Korupsi Lolos
            user.balance = (user.balance || 0) + korupsiGain;
            await user.save();
            await player.save();

            const starText = '⭐'.repeat(player.bintangKorupsi);

            return sendRpgReply(
                sock,
                m,
                `🤫 *SUNAT DANA BERHASIL (JALUR TIKUS)* 💼💰\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Kamu berhasil menggelembungkan nota belanja & menyunat anggaran!\n\n` +
                    `💵 Uang Haram Masuk Rekening: *+Rp ${korupsiGain.toLocaleString()}*\n` +
                    `🚨 Level Pantauan KPK Naik: *${starText}* (${player.bintangKorupsi}/5 Bintang)\n` +
                    `⚠️ _Hati-hati! Semakin tinggi bintang, semakin besar kemungkinan terkena OTT KPK di aksi berikutnya!_`,
                'corruptionSuccess'
            );
        } catch (error) {
            console.error('Error in korupsi command:', error);
            await m.reply('❌ Terjadi kesalahan saat memproses aksi.');
        }
    },
};

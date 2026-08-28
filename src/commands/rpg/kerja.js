import { JOBS, addExp, getOrCreatePlayer } from '../../services/rpgService.js';
import RpgInventory from '../../database/models/RpgInventory.js';
import { sendRpgReply } from '../../lib/rpgVisuals.js';
import { recordRpgActivity } from '../../services/rpgProgressService.js';

export default {
    name: 'kerja',
    aliases: ['cariloker', 'lamar', 'resign', 'sogok_ordal', 'loker'],
    description: 'Bekerja mencari nafkah atau mencari lowongan pekerjaan baru',
    category: 'RPG',
    execute: async (sock, m, args, text) => {
        const sender = m.sender;
        const cmd =
            m.command || (m.body ? m.body.slice(1).trim().split(/\s+/)[0].toLowerCase() : 'kerja');

        try {
            const { user, player } = await getOrCreatePlayer(sender, m.pushName);
            const availableJobList = Object.values(JOBS).filter((j) => j.name !== 'Pengangguran');

            // Helper: Tampilkan Papan Loker
            const showLokerBoard = async () => {
                let lokerText =
                    `📋 *PAPAN INFORMASI LOWONGAN KERJA (LOKER 2026)* 📋\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Level kamu saat ini: *Level ${player.level}*\n` +
                    `Pekerjaan saat ini: *${player.job}*\n\n`;

                availableJobList.forEach((info, idx) => {
                    const statusLvl =
                        player.level >= info.minLevel
                            ? '✅ Memenuhi Syarat'
                            : `🔒 Butuh Level ${info.minLevel}`;
                    const reqItemText = info.reqItem ? ` (Wajib punya: \`${info.reqItem}\`)` : '';

                    lokerText +=
                        `*${idx + 1}. ${info.name}*\n` +
                        `   • Syarat: ${statusLvl}${reqItemText}\n` +
                        `   • Estimasi Gaji: Rp ${info.salaryMin.toLocaleString()} - Rp ${info.salaryMax.toLocaleString()}\n` +
                        `   • Konsumsi Stamina: -${info.energyCost}⚡\n` +
                        `   • Info: _${info.desc}_\n\n`;
                });

                lokerText +=
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `📝 *Cara Melamar Kerja:*\n` +
                    `Ketik: */cariloker [Nomor]* atau */lamar [Nomor]*\n` +
                    `Contoh: */cariloker 1* atau */lamar 2*\n\n` +
                    `💵 *Jalur Cepat (Orang Dalam):*\n` +
                    `Ketik: */sogok_ordal [Nomor]* (Biaya pelicin Rp 150.000)`;

                return sendRpgReply(sock, m, lokerText, 'careerJobBoard');
            };

            // Helper: Cari Job Berdasarkan Nomor / Nama
            const findJobByInput = (input) => {
                if (!input) return null;
                const cleanInput = input.trim().toLowerCase();
                const num = parseInt(cleanInput, 10);
                if (!isNaN(num) && num >= 1 && num <= availableJobList.length) {
                    return availableJobList[num - 1];
                }
                return Object.values(JOBS).find((j) => j.name.toLowerCase().includes(cleanInput));
            };

            // Helper: Eksekusi Lamar Kerja
            const handleLamarJob = async (targetInput) => {
                if (!targetInput) {
                    return showLokerBoard();
                }

                const matchedJob = findJobByInput(targetInput);
                if (!matchedJob) {
                    return m.reply(
                        '⚠️ Pekerjaan tidak ditemukan. Ketik */cariloker* untuk melihat nomor loker.\nContoh: */lamar 1* atau */lamar 2*'
                    );
                }

                if (player.job === matchedJob.name) {
                    return m.reply(`ℹ️ Kamu sudah bekerja sebagai *${matchedJob.name}*.`);
                }

                if (player.level < matchedJob.minLevel) {
                    return m.reply(
                        `❌ *LAMARAN DITOLAK!* HRD: "Maaf, kualifikasi Anda belum cukup. Butuh minimal Level ${matchedJob.minLevel}."\n💡 Solusi: Naikkan level lewat minigame atau gunakan jalur */sogok_ordal ${targetInput}*!`
                    );
                }

                if (matchedJob.reqItem) {
                    const hasItem = await RpgInventory.findOne({
                        userId: sender,
                        itemId: matchedJob.reqItem,
                    });
                    if (!hasItem) {
                        return m.reply(
                            `❌ Kamu tidak memiliki syarat kendaraan/alat: \`${matchedJob.reqItem}\`!\nBeli dulu di */kopdes*.`
                        );
                    }
                }

                // Ujian Fisik & Pelatihan Bela Negara Semi-Militer untuk Kopdes Merah Putih (Konteks Aktual 2026)
                const isKopdesJob = matchedJob.name.includes('Kopdes');
                if (isKopdesJob) {
                    if (player.energi < 40 || player.hp < 50) {
                        return sendRpgReply(
                            sock,
                            m,
                            `🎖️ *SELEKSI LATSARMIL KOPDES GAGAL!* 🪖\n\n` +
                                `Sesuai aturan 2026, calon pegawai Kopdes Merah Putih wajib lulus Pelatihan Bela Negara & Fisik Semi-Militer (setara Komcad)!\n\n` +
                                `❌ Fisikmu tidak sanggup:\n` +
                                `• Syarat Stamina: Minimal 40⚡ (Milikmu: ${player.energi}⚡)\n` +
                                `• Syarat HP/Kesehatan: Minimal 50❤️ (Milikmu: ${player.hp}❤️)\n\n` +
                                `_Kamu pingsan saat tes push-up & baris-berbaris di bawah terik matahari._\n` +
                                `💡 Pulihkan fisikmu dengan minum obat / makan di */kopdes* atau gunakan jalur */sogok_ordal ${targetInput}*!`,
                            'careerLatsarmil'
                        );
                    }

                    // Lulus latsarmil dengan konsekuensi fisik
                    player.energi -= 40;
                    player.hp -= 30;
                    player.kewarasan = Math.max(10, player.kewarasan - 15);
                    player.reputasiAparat = Math.min(100, player.reputasiAparat + 15);
                    player.job = matchedJob.name;
                    const { leveledUp, newLevel } = await addExp(player, 35);
                    await player.save();

                    let successLatsarmil =
                        `🎖️ *LULUS PELATIHAN SEMI-MILITER KOPDES MERAH PUTIH!* 🪖🇮🇩\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `Kamu telah menyelesaikan 2 minggu karantina Latsarmil Komcad:\n` +
                        `• Push-up & Sit-up 100x setiap subuh\n` +
                        `• PBB & Baris-berbaris di terik matahari\n` +
                        `• Pembekalan Doktrin Ekonomi Rakyat & Pasal 33 UUD 1945\n\n` +
                        `📉 *Efek Fisik:* Stamina -40⚡ | HP -30❤️ | Kewarasan -15🧠\n` +
                        `📈 *Bonus:* +35 EXP | Reputasi Aparat +15%\n\n` +
                        `🎉 Selamat! Kamu resmi dilantik menjadi *${matchedJob.name}*!\n` +
                        `Ketik */kerja* untuk mulai bertugas.`;

                    if (leveledUp)
                        successLatsarmil += `\n\n🆙 *LEVEL UP!* Selamat, naik ke Level ${newLevel}!`;
                    return sendRpgReply(sock, m, successLatsarmil, 'careerLatsarmil');
                }

                player.job = matchedJob.name;
                await player.save();

                return sendRpgReply(
                    sock,
                    m,
                    `🎉 *SELAMAT! ANDA DITERIMA KERJA!* 🤝\n\n` +
                        `Mulai hari ini Anda resmi bekerja sebagai *${matchedJob.name}*.\n` +
                        `Gunakan perintah */kerja* untuk mulai menghasilkan uang!`,
                    'careerAccepted'
                );
            };

            // Helper: Eksekusi Sogok Ordal
            const handleSogokOrdal = async (targetInput) => {
                if (!targetInput) {
                    return m.reply(
                        '⚠️ Masukkan nomor loker yang ingin disogok.\nContoh: */sogok_ordal 1* atau */sogok_ordal 2*'
                    );
                }

                const matchedJob = findJobByInput(targetInput);
                if (!matchedJob) {
                    return m.reply(
                        '⚠️ Pekerjaan tidak ditemukan. Ketik */cariloker* untuk melihat nomor loker.\nContoh: */sogok_ordal 2*'
                    );
                }

                const suapCost = 150000;
                if ((user.balance || 0) < suapCost) {
                    return m.reply(
                        `💸 Uang pelicinmu kurang! Ordal minta minimal *Rp ${suapCost.toLocaleString()}* cash di amplop cokelat.`
                    );
                }

                user.balance -= suapCost;
                await user.save();

                player.job = matchedJob.name;
                player.bintangKorupsi = Math.min(5, (player.bintangKorupsi || 0) + 1);
                player.reputasiAparat = Math.max(0, player.reputasiAparat - 10);
                await player.save();

                return sendRpgReply(
                    sock,
                    m,
                    `🤫 *JALUR ORANG DALAM BERHASIL!* 💼\n\n` +
                        `Amplop Rp 150.000 sudah diterima oknum HRD. Kamu langsung diterima sebagai *${matchedJob.name}* tanpa syarat level & tes fisik!\n` +
                        `🚨 _Peringatan: Bintang Pantauan KPK bertambah +1 (Sekarang: ⭐${player.bintangKorupsi})_`,
                    'careerInsiderBribe'
                );
            };

            // --- ROUTING LOGIC ---

            // A. Routing .cariloker / .loker
            if (cmd === 'cariloker' || cmd === 'loker') {
                if (args[0]) {
                    if (args[0].toLowerCase() === 'sogok' || args[0].toLowerCase() === 'ordal') {
                        return handleSogokOrdal(args.slice(1).join(' '));
                    }
                    return handleLamarJob(args.join(' '));
                }
                return showLokerBoard();
            }

            // B. Routing .lamar
            if (cmd === 'lamar') {
                return handleLamarJob(args.join(' '));
            }

            // C. Routing .sogok_ordal
            if (cmd === 'sogok_ordal') {
                return handleSogokOrdal(args.join(' '));
            }

            // D. Routing .resign
            if (cmd === 'resign' || (cmd === 'kerja' && args[0]?.toLowerCase() === 'resign')) {
                player.job = 'Pengangguran';
                await player.save();
                return m.reply(
                    '👋 Kamu telah mengundurkan diri dan resmi menjadi *Pengangguran*. Waktunya rebahan!'
                );
            }

            // E. Routing .kerja dengan sub-command
            if (cmd === 'kerja') {
                const sub = args[0]?.toLowerCase();
                if (sub === 'loker' || sub === 'cariloker') {
                    if (args[1]) return handleLamarJob(args.slice(1).join(' '));
                    return showLokerBoard();
                }
                if (sub === 'lamar') {
                    return handleLamarJob(args.slice(1).join(' '));
                }
                if (sub === 'sogok' || sub === 'ordal') {
                    return handleSogokOrdal(args.slice(1).join(' '));
                }
            }

            // F. Default: Eksekusi /kerja mencari uang
            const currentJobInfo = JOBS[player.job] || JOBS['Pengangguran'];
            if (player.job === 'Pengangguran') {
                return m.reply(
                    `💤 Kamu masih berstatus *Pengangguran*!\nCari loker dulu dengan mengetik */cariloker*.`
                );
            }

            if (player.energi < currentJobInfo.energyCost) {
                return m.reply(
                    `⚡ Staminamu habis! (${player.energi}/${player.maxEnergi}⚡)\n` +
                        `Kamu butuh minimal ${currentJobInfo.energyCost}⚡ untuk bekerja.\n` +
                        `Beli *Kopi Saset* di */kopdes* atau tunggu energi terisi besok.`
                );
            }

            if (player.hp < 25) {
                return m.reply(
                    `🤒 Kondisi fisikmu terlalu lemah (HP: ${player.hp}/100)!\nBerobat dulu di */rs* atau minum tolak angin.`
                );
            }

            // Kurangi energi & kewarasan
            player.energi -= currentJobInfo.energyCost;
            player.kewarasan = Math.max(10, player.kewarasan - currentJobInfo.stress);
            player.gizi = Math.max(10, player.gizi - 10);

            // Random Events saat kerja (Kejahatan jalanan, Ormas pungli, dll)
            const eventRoll = Math.random();
            let eventText = '';
            let resultScene = 'workComplete';

            // 15% Chance kena Pungli / Preman
            if (eventRoll < 0.15) {
                const pungliAmount = 15000;
                user.balance = Math.max(0, (user.balance || 0) - pungliAmount);
                eventText = `\n\n⚠️ *EVENT DI JALAN:* Kamu dicegat oknum ormas minta uang keamanan Rp ${pungliAmount.toLocaleString()}! (Kewarasan -10)`;
                resultScene = 'careerExtortion';
                player.kewarasan = Math.max(5, player.kewarasan - 10);
            }
            // 8% Chance kena Begal / Klitih
            else if (eventRoll < 0.23) {
                const helm = await RpgInventory.findOne({
                    userId: sender,
                    itemId: 'helm_sni',
                    isEquipped: true,
                });
                resultScene = 'careerRobbery';
                if (helm) {
                    player.hp = Math.max(15, player.hp - 10);
                    eventText = `\n\n🪖 *EVENT BEGAL:* Kamu sempat diserang orang tak dikenal, tapi beruntung *Helm Bogo SNI* melindungimu! (HP -10)`;
                } else {
                    player.hp = Math.max(10, player.hp - 30);
                    eventText = `\n\n🩸 *EVENT BEGAL:* Kamu kena apes diserang begal jalanan! (HP -30, Kewarasan -20)`;
                    player.kewarasan = Math.max(5, player.kewarasan - 20);
                }
            }

            // Hitung Gaji
            const salary =
                Math.floor(
                    Math.random() * (currentJobInfo.salaryMax - currentJobInfo.salaryMin + 1)
                ) + currentJobInfo.salaryMin;
            user.balance = (user.balance || 0) + salary;
            await user.save();

            const { leveledUp, newLevel } = await addExp(player, currentJobInfo.expGain);
            await player.save();
            await recordRpgActivity(sender, 'work');

            let replyMsg =
                `🔨 *SELESAI BEKERJA HARI INI!* 💼\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Profesi: *${player.job}*\n` +
                `💵 Gaji Diterima: *+Rp ${salary.toLocaleString()}*\n` +
                `✨ EXP Didapat: *+${currentJobInfo.expGain} EXP*\n` +
                `⚡ Sisa Stamina: *${player.energi}/${player.maxEnergi}*\n` +
                `💰 Total Saldo: *Rp ${user.balance.toLocaleString()}*` +
                eventText;

            if (leveledUp) {
                replyMsg += `\n\n🆙 *LEVEL UP!* Selamat, kamu naik ke Level ${newLevel}!`;
            }

            replyMsg += `\n\n📋 Progres misi harian bertambah. Cek */misi*.`;

            await sendRpgReply(sock, m, replyMsg, resultScene);
        } catch (error) {
            console.error('Error in kerja command:', error);
            await m.reply('❌ Terjadi kesalahan saat memproses pekerjaan.');
        }
    },
};

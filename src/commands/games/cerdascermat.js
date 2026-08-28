import { sessionManager } from '../../utils/session.js';
import axios from 'axios';
import { awardMinigameWin } from '../../services/rpgService.js';

const subjects = ['matematika', 'ipa', 'ips', 'pkn', 'bahasa_indonesia', 'sejarah'];

export default {
    name: 'cerdascermat',
    aliases: ['ccsd', 'cc'],
    description: 'Bermain game Cerdas Cermat (Pilihan Ganda)',
    category: 'Games',
    execute: async (sock, m, args, text) => {
        if (sessionManager.get(m.chat)) {
            return m.reply('Selesaikan game yang sedang berlangsung terlebih dahulu di chat ini.');
        }

        // Lock session to prevent race condition (double trigger)
        sessionManager.create(m.chat, { commandName: 'cerdascermat', isStarting: true });

        // Tentukan mata pelajaran (bisa dari argumen atau random)
        let subject = args[0]?.toLowerCase();
        if (!subject || !subjects.includes(subject)) {
            subject = subjects[Math.floor(Math.random() * subjects.length)];
        }

        try {
            const response = await axios.get(
                `https://api.siputzx.my.id/api/games/cc-sd?matapelajaran=${subject}`
            );
            const data = response.data;

            if (!data.status || !data.data || !data.data.soal || data.data.soal.length === 0) {
                sessionManager.delete(m.chat);
                return m.reply(
                    `Maaf, soal untuk mata pelajaran *${subject}* tidak ditemukan atau sedang gangguan.`
                );
            }

            // Ambil 1 soal acak dari 5 soal yang dikembalikan
            const randomIndex = Math.floor(Math.random() * data.data.soal.length);
            const questionData = data.data.soal[randomIndex];

            // Susun opsi pilihan ganda
            let optionsText = '';
            questionData.semua_jawaban.forEach((opt) => {
                const key = Object.keys(opt)[0]; // 'a', 'b', 'c', 'd'
                const val = opt[key];
                optionsText += `${key.toUpperCase()}. ${val}\n`;
            });

            const answer = questionData.jawaban_benar.toLowerCase();

            let sessionData = {
                commandName: 'cerdascermat',
                jawaban: answer, // contoh: 'c'
                attempts: {}, // Tracker nyawa per user
            };

            const caption =
                `*CERDAS CERMAT: ${subject.toUpperCase()}*\n\n` +
                `Soal: ${questionData.pertanyaan}\n\n` +
                `${optionsText}\n` +
                `Balas pesan ini dengan jawaban yang benar (A, B, C, atau D)!`;

            await m.reply(caption);
            sessionManager.create(m.chat, sessionData);
        } catch (error) {
            sessionManager.delete(m.chat);
            console.error(`Error on cerdascermat:`, error.message);
            m.reply('Terjadi kesalahan saat mengambil soal cerdas cermat.');
        }
    },
    handleSession: async (sock, m, session) => {
        // Abaikan jika game masih dalam tahap loading
        if (session.data.isStarting) return;

        // Hanya proses jawaban jika user me-reply pesan dari bot
        if (!m.quoted || !m.quoted.fromMe) return;

        const sender = m.sender;
        const currentAttempts = session.data.attempts[sender] || 0;

        // Karena ini pilihan ganda (hanya 4 opsi), kita beri jatah 1x percobaan saja per user agar tidak spam tebak
        if (currentAttempts >= 1) {
            return m.reply(
                '❌ Kesempatan menebakmu sudah habis untuk soal ini! Berikan kesempatan pada yang lain.'
            );
        }

        const userAnswer = m.body.toLowerCase().trim();
        const correctAnswer = session.data.jawaban;

        // Validasi input user (hanya a, b, c, d)
        if (!['a', 'b', 'c', 'd'].includes(userAnswer)) {
            return m.reply('⚠️ Harap jawab dengan pilihan *A, B, C, atau D* saja!');
        }

        if (userAnswer === correctAnswer) {
            // Cegah race condition saat 2 user menjawab benar di milidetik yang sama
            if (!sessionManager.delete(m.chat)) return;

            let rewardInfo = null;
            try {
                rewardInfo = await awardMinigameWin(sender);
            } catch (err) {
                console.error('Error awarding cerdascermat reward:', err);
            }

            let successMsg = `🎉 *BENAR!*\n\nSelamat @${sender.split('@')[0]}, kamu berhasil memilih jawaban yang tepat (*${correctAnswer.toUpperCase()}*)!`;
            if (rewardInfo) {
                successMsg += rewardInfo.rewardLimitReached
                    ? `\n🏁 _Batas reward harian tercapai; kemenangan tetap masuk statistik._`
                    : rewardInfo.cashLimitReached
                      ? `\n✨ *Hadiah:* +${rewardInfo.earnedExp} EXP _(batas hadiah uang harian tercapai)_`
                      : `\n💰 *Hadiah:* +Rp ${rewardInfo.earnedRupiah.toLocaleString()} | +${rewardInfo.earnedExp} EXP`;
                if (rewardInfo.leveledUp) {
                    successMsg += `\n🆙 *LEVEL UP!* Selamat, kamu naik ke Level ${rewardInfo.newLevel}! Status max HP & Energi bertambah!`;
                }
            }
            await m.reply(successMsg, { mentions: [sender] });
        } else {
            session.data.attempts[sender] = currentAttempts + 1;
            await m.reply(
                `❌ *SALAH!*\n\nKesempatanmu habis! Kamu tidak bisa menebak lagi di soal ini.`
            );
        }
    },
};

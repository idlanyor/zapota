import { sessionManager } from '../../utils/session.js';
import axios from 'axios';
import { awardMinigameWin } from '../../services/rpgService.js';

const DS_BASE_URL = process.env.DS_BASE_URL || 'http://localhost:5050';
const DS_API_KEY = process.env.DS_API_KEY || 'dseeker';

// Skema 15 Nominal Hadiah Resmi Millionaire Indonesia
export const PRIZE_LADDER = [
    { level: 1, prize: 'Rp 50.000', safe: false, amount: 50000 },
    { level: 2, prize: 'Rp 125.000', safe: false, amount: 125000 },
    { level: 3, prize: 'Rp 250.000', safe: false, amount: 250000 },
    { level: 4, prize: 'Rp 500.000', safe: false, amount: 500000 },
    { level: 5, prize: 'Rp 1.000.000', safe: true, amount: 1000000 }, // Safe point 1
    { level: 6, prize: 'Rp 2.000.000', safe: false, amount: 2000000 },
    { level: 7, prize: 'Rp 4.000.000', safe: false, amount: 4000000 },
    { level: 8, prize: 'Rp 8.000.000', safe: false, amount: 8000000 },
    { level: 9, prize: 'Rp 16.000.000', safe: false, amount: 16000000 },
    { level: 10, prize: 'Rp 32.000.000', safe: true, amount: 32000000 }, // Safe point 2
    { level: 11, prize: 'Rp 64.000.000', safe: false, amount: 64000000 },
    { level: 12, prize: 'Rp 125.000.000', safe: false, amount: 125000000 },
    { level: 13, prize: 'Rp 250.000.000', safe: false, amount: 250000000 },
    { level: 14, prize: 'Rp 500.000.000', safe: false, amount: 500000000 },
    { level: 15, prize: 'Rp 1.000.000.000', safe: true, amount: 1000000000 }, // Jackpot
];

/**
 * Generate pertanyaan via DeepSeek engine lokal
 */
async function generateQuestion(level = 1) {
    const ladder = PRIZE_LADDER[level - 1] || PRIZE_LADDER[0];
    let difficultyDesc = 'sangat mudah, seputar pengetahuan umum dasar, fakta populer, atau budaya Indonesia';
    if (level >= 5 && level <= 9) {
        difficultyDesc = 'tingkat menengah, seputar geografi, sejarah Indonesia/dunia, biologi, atau sains umum';
    } else if (level >= 10 && level <= 13) {
        difficultyDesc = 'sulit, fakta mendalam, sejarah spesifik, ilmu pengetahuan lanjut, atau literatur';
    } else if (level >= 14) {
        difficultyDesc = 'sangat sulit / level 1 Miliar, pertanyaan prestisius dengan fakta langka tingkat tinggi';
    }

    const prompt = `Anda adalah host resmi kuis "Who Wants to Be a Millionaire" (Siapa Berani Jadi Miliarder) versi Indonesia.
Buatkan SATU pertanyaan kuis untuk Pertanyaan Ke-${level} bernilai ${ladder.prize} (${difficultyDesc}).

Aturan penting:
1. Soal dan pilihan HARUS dalam Bahasa Indonesia yang baik dan jelas.
2. Sediakan 4 pilihan jawaban yang masuk akal: A, B, C, D.
3. Tentukan satu jawaban yang benar secara mutlak (huruf A, B, C, atau D).
4. Berikan pembahasan singkat (1-2 kalimat).
5. Output HARUS murni JSON valid tanpa markdown, tanpa backtick, format:
{
  "soal": "isi teks pertanyaan",
  "pilihan": {
    "A": "opsi a",
    "B": "opsi b",
    "C": "opsi c",
    "D": "opsi d"
  },
  "jawaban_benar": "A",
  "pembahasan": "penjelasan singkat"
}`;

    const res = await axios.post(
        `${DS_BASE_URL}/v1/chat/completions`,
        {
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
        },
        {
            headers: {
                Authorization: `Bearer ${DS_API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        }
    );

    let content = res.data?.choices?.[0]?.message?.content || '{}';
    content = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    const parsed = JSON.parse(content);
    return {
        level,
        prize: ladder.prize,
        safe: ladder.safe,
        soal: parsed.soal,
        pilihan: parsed.pilihan,
        jawaban_benar: parsed.jawaban_benar.toUpperCase(),
        pembahasan: parsed.pembahasan || '',
    };
}

/**
 * Format tampilan soal WhatsApp
 */
function renderQuestionMessage(sessionData) {
    const q = sessionData.currentQuestion;
    const ladder = PRIZE_LADDER[sessionData.level - 1];
    const playerTag = `@${sessionData.player.split('@')[0]}`;

    let lifelinesText = [];
    if (sessionData.lifelines['5050']) lifelinesText.push('🔘 *5050* (50:50)');
    if (sessionData.lifelines['call']) lifelinesText.push('🔘 *call* (Phone Friend)');
    if (sessionData.lifelines['poll']) lifelinesText.push('🔘 *poll* (Ask Audience)');
    const lifelinesStr = lifelinesText.length ? lifelinesText.join(' | ') : '_Habis_';

    let optionsText = '';
    const hiddenOpts = sessionData.hiddenOptions || [];
    for (const [key, val] of Object.entries(q.pilihan)) {
        if (hiddenOpts.includes(key)) {
            optionsText += `   [ ${key} ]  _-------- (Tereliminasi)_\n`;
        } else {
            optionsText += `   *${key}*: ${val}\n`;
        }
    }

    const safeMilestone = sessionData.level > 10 ? 'Rp 32.000.000' : sessionData.level > 5 ? 'Rp 1.000.000' : 'Rp 0';

    return (
        `💰 *WHO WANTS TO BE A MILLIONAIRE* 💰\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 Pemain: ${playerTag}\n` +
        `🎯 Pertanyaan: *Level ${sessionData.level} / 15*\n` +
        `💵 Hadiah Soal Ini: *${ladder.prize}* ${ladder.safe ? '🛡️ _(Titik Aman)_' : ''}\n` +
        `🔒 Saldo Dijamin: *${safeMilestone}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `❓ *Pertanyaan:*\n${q.soal}\n\n` +
        `${optionsText}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 *Bantuan:* ${lifelinesStr}\n\n` +
        `👉 Balas pesan ini dengan:\n` +
        `• Pilihanmu (*A*, *B*, *C*, atau *D*)\n` +
        `• Atau ketik bantuan: *5050* | *call* | *poll*\n` +
        `• Atau berhenti & bawa pulang hadiah: *stop*`
    );
}

export default {
    name: 'millionaire',
    aliases: ['miliarder', 'kuismiliarder', 'wwtbam'],
    description: 'Game Kuis Who Wants to Be a Millionaire 15 Level Bahasa Indonesia',
    category: 'Games',
    execute: async (sock, m, args, text) => {
        const existingSession = sessionManager.get(m.chat);
        if (existingSession) {
            return m.reply('Masih ada game yang sedang berlangsung di chat ini. Selesaikan dulu atau ketik *.nyerah*!');
        }

        // Lock session awal
        sessionManager.create(m.chat, { commandName: 'millionaire', isStarting: true });

        await m.reply('🎙️ *Tantangan dimulai!* Mempersiapkan kursi panas dan pertanyaan Level 1 untukmu...');

        try {
            const firstQuestion = await generateQuestion(1);

            const sessionData = {
                commandName: 'millionaire',
                player: m.sender,
                level: 1,
                currentQuestion: firstQuestion,
                hiddenOptions: [],
                lifelines: {
                    '5050': true,
                    call: true,
                    poll: true,
                },
                jawaban: firstQuestion.jawaban_benar,
            };

            sessionManager.create(m.chat, sessionData);

            const caption = renderQuestionMessage(sessionData);
            await m.reply(caption, { mentions: [m.sender] });
        } catch (err) {
            sessionManager.delete(m.chat);
            console.error('Error starting millionaire:', err.message);
            m.reply('❌ Terjadi gangguan saat menyiapkan pertanyaan kuis Millionaire. Silakan coba sesaat lagi.');
        }
    },

    handleSession: async (sock, m, session) => {
        if (session.data.isStarting) return;

        // Hanya pemain yang memulai kuis yang bisa menjawab
        if (m.sender !== session.data.player) {
            // Jika orang lain mencoba jawab
            if (['a', 'b', 'c', 'd', '5050', 'call', 'poll', 'stop'].includes(m.body.toLowerCase().trim())) {
                return m.reply(`⚠️ Saat ini giliran @${session.data.player.split('@')[0]} di kursi panas!`, {
                    mentions: [session.data.player],
                });
            }
            return;
        }

        const input = m.body.toLowerCase().trim();
        const currentQ = session.data.currentQuestion;

        // 1. OPSI STOP (Berhenti dan bawa pulang uang sebelumnya)
        if (input === 'stop' || input === 'berhenti') {
            const prevLevel = session.data.level - 1;
            const wonPrize = prevLevel > 0 ? PRIZE_LADDER[prevLevel - 1].prize : 'Rp 0';
            const earnedAmount = prevLevel > 0 ? PRIZE_LADDER[prevLevel - 1].amount : 0;

            sessionManager.delete(m.chat);

            let rewardInfo = null;
            if (earnedAmount > 0) {
                try {
                    rewardInfo = await awardMinigameWin(m.sender, Math.min(earnedAmount, 100000));
                } catch (e) {
                    console.error('Reward error:', e.message);
                }
            }

            let stopMsg =
                `🛑 *KEPUTUSAN BIJAK!*\n\n` +
                `@${m.sender.split('@')[0]} memutuskan untuk berhenti di Level ${session.data.level}.\n` +
                `🏆 *Total Hadiah Dibawa Pulang:* *${wonPrize}*!\n` +
                `Kunci jawaban soal tadi sebenarnya adalah: *${currentQ.jawaban_benar}*.\n` +
                `_${currentQ.pembahasan}_`;

            if (rewardInfo) {
                stopMsg += `\n\n💰 *Saldo Dompet Bot:* +Rp ${rewardInfo.earnedRupiah.toLocaleString()} | +${rewardInfo.earnedExp} EXP`;
            }

            return m.reply(stopMsg, { mentions: [m.sender] });
        }

        // 2. LIFELINE: 50:50
        if (input === '5050' || input === '50:50') {
            if (!session.data.lifelines['5050']) {
                return m.reply('❌ Kamu sudah pernah memakai bantuan *50:50*!');
            }
            if (session.data.hiddenOptions && session.data.hiddenOptions.length > 0) {
                return m.reply('⚠️ Bantuan 50:50 sudah aktif pada soal ini!');
            }

            session.data.lifelines['5050'] = false;
            const correct = currentQ.jawaban_benar;
            const wrongs = ['A', 'B', 'C', 'D'].filter((k) => k !== correct);
            // Acak 2 dari 3 opsi salah untuk dieliminasi
            const shuffledWrongs = wrongs.sort(() => Math.random() - 0.5);
            session.data.hiddenOptions = [shuffledWrongs[0], shuffledWrongs[1]];

            const updatedMsg = renderQuestionMessage(session.data);
            return m.reply(
                `✂️ *BANTUAN 50:50 DIAKTIFKAN!*\n` +
                `Komputer telah mengeliminasi 2 opsi salah (${session.data.hiddenOptions.join(' & ')}).\n\n` +
                updatedMsg,
                { mentions: [m.sender] }
            );
        }

        // 3. LIFELINE: Phone a Friend (Telepon Sahabat Virtual)
        if (input === 'call' || input === 'telepon' || input === 'friend') {
            if (!session.data.lifelines['call']) {
                return m.reply('❌ Kamu sudah pernah memakai bantuan *Phone a Friend*!');
            }
            session.data.lifelines['call'] = false;

            // AI Friends logic: makin tinggi level, akurasi sedikit menurun realistis
            const roll = Math.random();
            const accuracy = session.data.level <= 5 ? 0.95 : session.data.level <= 10 ? 0.8 : 0.65;
            let suggestedOpt = currentQ.jawaban_benar;
            if (roll > accuracy) {
                const wrongs = ['A', 'B', 'C', 'D'].filter((k) => k !== currentQ.jawaban_benar);
                suggestedOpt = wrongs[Math.floor(Math.random() * wrongs.length)];
            }
            const confidence = Math.floor(accuracy * 100 - Math.random() * 10);

            const callText =
                `📞 *PHONE A FRIEND (Telepon Sahabat)*\n\n` +
                `_Halo! Menurutku pertanyaannya cukup menantang, tapi dari pengetahuanku, jawaban yang paling masuk akal adalah *${suggestedOpt}* (${currentQ.pilihan[suggestedOpt]}). Aku sekitar ${confidence}% yakin dengan ini._\n\n` +
                `Silakan tentukan keputusan akhirmu (A, B, C, D)!`;

            return m.reply(callText);
        }

        // 4. LIFELINE: Ask the Audience (Survei Penonton)
        if (input === 'poll' || input === 'audience' || input === 'penonton') {
            if (!session.data.lifelines['poll']) {
                return m.reply('❌ Kamu sudah pernah memakai bantuan *Ask the Audience*!');
            }
            session.data.lifelines['poll'] = false;

            const correct = currentQ.jawaban_benar;
            let correctPct = session.data.level <= 5 ? 70 : session.data.level <= 10 ? 55 : 42;
            let remaining = 100 - correctPct;
            const wrongs = ['A', 'B', 'C', 'D'].filter((k) => k !== correct);
            const r1 = Math.floor(Math.random() * (remaining - 10));
            const r2 = Math.floor(Math.random() * (remaining - r1 - 5));
            const r3 = remaining - r1 - r2;

            const audienceMap = {
                [correct]: correctPct,
                [wrongs[0]]: r1,
                [wrongs[1]]: r2,
                [wrongs[2]]: r3,
            };

            const pollText =
                `📊 *HASIL SURVEI PENONTON (Ask the Audience)*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `• A: ${'█'.repeat(Math.round(audienceMap['A'] / 5))} ${audienceMap['A']}%\n` +
                `• B: ${'█'.repeat(Math.round(audienceMap['B'] / 5))} ${audienceMap['B']}%\n` +
                `• C: ${'█'.repeat(Math.round(audienceMap['C'] / 5))} ${audienceMap['C']}%\n` +
                `• D: ${'█'.repeat(Math.round(audienceMap['D'] / 5))} ${audienceMap['D']}%\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Mayoritas penonton memilih opsi *${Object.keys(audienceMap).reduce((a, b) => (audienceMap[a] > audienceMap[b] ? a : b))}*.\n` +
                `Keputusan tetap di tanganmu! Jawab A, B, C, atau D.`;

            return m.reply(pollText);
        }

        // 5. VALIDASI JAWABAN (A, B, C, D)
        const choice = input.toUpperCase();
        if (!['A', 'B', 'C', 'D'].includes(choice)) {
            return m.reply('⚠️ Harap jawab dengan pilihan *A, B, C, atau D*, pilih bantuan (*5050* / *call* / *poll*), atau *stop*!');
        }

        // Cek jika memilih opsi yang sudah dieliminasi 50:50
        if (session.data.hiddenOptions && session.data.hiddenOptions.includes(choice)) {
            return m.reply(`⚠️ Opsi *${choice}* sudah dieliminasi oleh 50:50! Pilih opsi yang tersisa.`);
        }

        const isCorrect = choice === currentQ.jawaban_benar;

        // JAWABAN BENAR!
        if (isCorrect) {
            const currentLevel = session.data.level;
            const currentPrize = PRIZE_LADDER[currentLevel - 1];

            // JIKA MENANG LEVEL 15 (JACKPOT 1 MILIAR)
            if (currentLevel === 15) {
                sessionManager.delete(m.chat);
                let rewardInfo = null;
                try {
                    rewardInfo = await awardMinigameWin(m.sender, 500000, 2000);
                } catch (e) {}

                let jackpotMsg =
                    `🎆🎉 *LUAR BIASA! KAMU ADALAH SEORANG MILIARDER!* 🎉🎆\n\n` +
                    `Selamat kepada @${m.sender.split('@')[0]} yang berhasil menaklukkan seluruh 15 pertanyaan!\n` +
                    `🏆 *HADIAH UTAMA:* *Rp 1.000.000.000* (SATU MILIAR RUPIAH)!\n\n` +
                    `Jawaban Terakhir: *${currentQ.jawaban_benar}* - ${currentQ.pembahasan}`;
                if (rewardInfo) {
                    jackpotMsg += `\n\n💰 *Bonus Saldo Dompet:* +Rp ${rewardInfo.earnedRupiah.toLocaleString()} | +${rewardInfo.earnedExp} EXP`;
                }
                return m.reply(jackpotMsg, { mentions: [m.sender] });
            }

            // Naik ke level berikutnya
            await m.reply(
                `🎉 *JAWABAN BENAR!* Opsi *${choice}* tepat sekali!\n` +
                `Kamu mengamankan pertanyaan Level ${currentLevel} (*${currentPrize.prize}*).\n` +
                `_${currentQ.pembahasan}_\n\n` +
                `⏳ Menyiapkan pertanyaan Level ${currentLevel + 1}...`
            );

            try {
                const nextQ = await generateQuestion(currentLevel + 1);
                session.data.level = currentLevel + 1;
                session.data.currentQuestion = nextQ;
                session.data.hiddenOptions = [];
                session.data.jawaban = nextQ.jawaban_benar;
                session.lastActivity = Date.now();

                const nextMsg = renderQuestionMessage(session.data);
                return m.reply(nextMsg, { mentions: [m.sender] });
            } catch (err) {
                sessionManager.delete(m.chat);
                console.error('Error next question:', err.message);
                return m.reply('❌ Terjadi gangguan saat mengambil pertanyaan berikutnya. Game dihentikan.');
            }
        } else {
            // JAWABAN SALAH!
            sessionManager.delete(m.chat);

            // Hitung jaminan titik aman
            let safeAmount = 'Rp 0';
            let numericSafe = 0;
            if (session.data.level > 10) {
                safeAmount = 'Rp 32.000.000 (Titik Aman 2)';
                numericSafe = 32000;
            } else if (session.data.level > 5) {
                safeAmount = 'Rp 1.000.000 (Titik Aman 1)';
                numericSafe = 10000;
            }

            let rewardInfo = null;
            if (numericSafe > 0) {
                try {
                    rewardInfo = await awardMinigameWin(m.sender, numericSafe);
                } catch (e) {}
            }

            let loseMsg =
                `❌ *JAWABAN SALAH!*\n\n` +
                `Sayang sekali @${m.sender.split('@')[0]}, pilihanmu (*${choice}*) kurang tepat!\n` +
                `Jawaban yang benar adalah *${currentQ.jawaban_benar}*: ${currentQ.pilihan[currentQ.jawaban_benar]}.\n\n` +
                `📖 *Pembahasan:* ${currentQ.pembahasan}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `🛡️ *Hadiah Dibawa Pulang:* *${safeAmount}*\n` +
                `Terima kasih telah berani duduk di kursi panas Millionaire!`;

            if (rewardInfo) {
                loseMsg += `\n💰 *Saldo Masuk Dompet:* +Rp ${rewardInfo.earnedRupiah.toLocaleString()} | +${rewardInfo.earnedExp} EXP`;
            }

            return m.reply(loseMsg, { mentions: [m.sender] });
        }
    },
};

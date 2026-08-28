import { sessionManager } from '../../utils/session.js';
import axios from 'axios';
import { awardMinigameWin } from '../../services/rpgService.js';

const gameConfigs = [
    // Text Games
    { name: 'tekateki', endpoint: 'tekateki', type: 'text', questKey: 'soal', ansKey: 'jawaban' },
    {
        name: 'tebakkalimat',
        endpoint: 'tebakkalimat',
        type: 'text',
        questKey: 'soal',
        ansKey: 'jawaban',
    },
    {
        name: 'caklontong',
        endpoint: 'caklontong',
        type: 'text',
        questKey: 'soal',
        ansKey: 'jawaban',
        descKey: 'deskripsi',
    },
    { name: 'susunkata', endpoint: 'susunkata', type: 'text', questKey: 'soal', ansKey: 'jawaban' },
    { name: 'asahotak', endpoint: 'asahotak', type: 'text', questKey: 'soal', ansKey: 'jawaban' },
    {
        name: 'tebaklirik',
        endpoint: 'tebaklirik',
        type: 'text',
        questKey: 'soal',
        ansKey: 'jawaban',
    },
    { name: 'maths', endpoint: 'maths', type: 'text', questKey: 'str', ansKey: 'result' },
    { name: 'tebakkata', endpoint: 'tebakkata', type: 'text', questKey: 'soal', ansKey: 'jawaban' },
    {
        name: 'tebakkimia',
        endpoint: 'tebakkimia',
        type: 'text',
        questKey: 'unsur',
        ansKey: 'lambang',
    },
    {
        name: 'siapakahaku',
        endpoint: 'siapakahaku',
        type: 'text',
        questKey: 'soal',
        ansKey: 'jawaban',
    },

    // Image Games
    { name: 'tebakjkt', endpoint: 'tebakjkt', type: 'image', imgKey: 'gambar', ansKey: 'jawaban' },
    {
        name: 'tebakwarna',
        endpoint: 'tebakwarna',
        type: 'image',
        imgKey: 'image',
        ansKey: 'correct',
    },
    {
        name: 'tebakbendera',
        endpoint: 'tebakbendera',
        type: 'image',
        imgKey: 'img',
        ansKey: 'name',
    },
    { name: 'tebakkartun', endpoint: 'tebakkartun', type: 'image', imgKey: 'img', ansKey: 'name' },
    { name: 'tebakgame', endpoint: 'tebakgame', type: 'image', imgKey: 'img', ansKey: 'jawaban' },
    {
        name: 'karakter-freefire',
        endpoint: 'karakter-freefire',
        type: 'image',
        imgKey: 'gambar',
        ansKey: 'name',
    },
    {
        name: 'tebakgambar',
        endpoint: 'tebakgambar',
        type: 'image',
        imgKey: 'img',
        ansKey: 'jawaban',
        descKey: 'deskripsi',
    },

    // Audio Games
    { name: 'tebaklagu', endpoint: 'tebaklagu', type: 'audio', audioKey: 'lagu', ansKey: 'judul' },
    {
        name: 'tebakheroml',
        endpoint: 'tebakheroml',
        type: 'audio',
        audioKey: 'audio',
        ansKey: 'name',
    },
];

function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1, // insertion
                    matrix[i - 1][j] + 1 // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

const commands = gameConfigs.map((config) => {
    return {
        name: config.name,
        aliases: [config.name.replace('tebak', 't')],
        description: `Bermain game ${config.name}`,
        category: 'Games',
        execute: async (sock, m, args, text) => {
            if (sessionManager.get(m.chat)) {
                return m.reply(
                    'Selesaikan game yang sedang berlangsung terlebih dahulu atau biarkan waktunya habis (2 menit).'
                );
            }

            // Lock session to prevent race condition (double trigger)
            sessionManager.create(m.chat, { commandName: config.name, isStarting: true });

            try {
                const response = await axios.get(
                    `https://api.siputzx.my.id/api/games/${config.endpoint}`
                );
                let data = response.data.data;

                // Beberapa endpoint array, beberapa object. Tangani dua-duanya
                if (Array.isArray(data)) data = data[0];

                if (!data) {
                    sessionManager.delete(m.chat);
                    return m.reply(`Maaf, fitur ${config.name} sedang gangguan.`);
                }

                const answerRaw = data[config.ansKey];
                const answer = Array.isArray(answerRaw) ? answerRaw : String(answerRaw);

                let sessionData = {
                    commandName: config.name,
                    jawaban: answer,
                    attempts: {}, // Tracker nyawa per user
                };

                if (config.descKey) sessionData.deskripsi = data[config.descKey];

                let caption = `*GAME: ${config.name.toUpperCase()}*\n\n`;

                if (config.type === 'text') {
                    caption += `Soal: ${data[config.questKey]}\n\nSilakan balas pesan ini dengan jawaban Anda.`;
                    await m.reply(caption);
                } else if (config.type === 'image') {
                    caption += `Silakan tebak gambar ini!\nBalas pesan ini dengan jawaban Anda.`;
                    await sock.sendMessage(
                        m.chat,
                        {
                            image: { url: data[config.imgKey] },
                            caption: caption,
                        },
                        { quoted: m }
                    );
                } else if (config.type === 'audio') {
                    caption += `Silakan tebak audio/lagu ini!\nBalas pesan ini dengan jawaban Anda.`;
                    await m.reply(caption); // Kirim instruksi
                    await sock.sendMessage(
                        m.chat,
                        {
                            audio: { url: data[config.audioKey] },
                            mimetype: 'audio/mpeg',
                            ptt: true,
                        },
                        { quoted: m }
                    ); // Kirim audionya
                }

                sessionManager.create(m.chat, sessionData);
            } catch (error) {
                sessionManager.delete(m.chat);
                console.error(`Error on ${config.name}:`, error.message);
                m.reply(`Terjadi kesalahan saat mengambil data game ${config.name}.`);
            }
        },
        handleSession: async (sock, m, session) => {
            // Abaikan jika game masih dalam tahap loading
            if (session.data.isStarting) return;

            // Hanya proses jawaban jika user me-reply pesan dari bot
            if (!m.quoted || !m.quoted.fromMe) return;

            const sender = m.sender;
            const currentAttempts = session.data.attempts[sender] || 0;

            if (currentAttempts >= 3) {
                return m.reply('❌ Kesempatan menebakmu sudah habis untuk soal ini!');
            }

            const userAnswer = m.body.toLowerCase().trim();

            // Cek apakah jawaban adalah array (seperti pada Family 100)
            let isCorrect = false;
            let isAlmost = false;
            let matchedAnswer = '';
            let correctAnswers = session.data.jawaban;

            if (Array.isArray(correctAnswers)) {
                for (let ans of correctAnswers) {
                    const ansStr = ans.toLowerCase().trim();
                    if (userAnswer === ansStr) {
                        isCorrect = true;
                        matchedAnswer = ans;
                        break;
                    }
                    if (ansStr.length >= 4 && levenshtein(userAnswer, ansStr) <= 2) {
                        isAlmost = true;
                    }
                }
            } else {
                const correctAnswer = String(correctAnswers).toLowerCase().trim();
                if (userAnswer === correctAnswer) {
                    isCorrect = true;
                    matchedAnswer = session.data.jawaban;
                } else if (
                    correctAnswer.length >= 4 &&
                    levenshtein(userAnswer, correctAnswer) <= 2
                ) {
                    isAlmost = true;
                }
            }

            if (isCorrect) {
                // Cegah race condition saat 2 user menjawab benar di milidetik yang sama
                if (!sessionManager.delete(m.chat)) return;

                let rewardInfo = null;
                try {
                    rewardInfo = await awardMinigameWin(sender);
                } catch (err) {
                    console.error('Error awarding minigame reward:', err);
                }

                let successMsg = `🎉 *BENAR!*\n\nJawaban: *${matchedAnswer}*`;
                if (session.data.deskripsi) successMsg += `\nDeskripsi: ${session.data.deskripsi}`;
                successMsg += `\n\nSelamat @${sender.split('@')[0]}, kamu berhasil menebaknya!`;

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
            } else if (isAlmost) {
                // Jangan kurangi nyawa jika hanya typo kecil
                await m.reply(
                    `🤏 *HAMPIR BENAR!*\n\nJawabanmu ada typo sedikit tuh. Yuk perbaiki dan coba lagi! (Nyawa tidak berkurang)`
                );
            } else {
                session.data.attempts[sender] = currentAttempts + 1;
                const newAttempts = session.data.attempts[sender];

                if (newAttempts >= 3) {
                    await m.reply(
                        `❌ *SALAH!*\n\nKesempatanmu habis! Kamu tidak bisa menebak lagi di soal ini.`
                    );
                } else {
                    const sisa = 3 - newAttempts;
                    await m.reply(`❌ *SALAH!*\n\nSisa kesempatanmu: ${sisa}\nCoba lagi!`);
                }
            }
        },
    };
});

export default commands;

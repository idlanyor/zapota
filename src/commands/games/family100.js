import { sessionManager } from '../../utils/session.js';
import axios from 'axios';

function formatFamilyBoard(soal, jawabanList, answeredMap) {
    let text = `*GAME FAMILY 100*\n\n`;
    text += `*Soal:* ${soal}\n\n`;
    text += `*Daftar Jawaban:*\n`;

    jawabanList.forEach((ans, idx) => {
        const num = idx + 1;
        if (answeredMap[idx]) {
            const userTag = answeredMap[idx].sender.split('@')[0];
            text += `${num}. ${ans} (@${userTag})\n`;
        } else {
            text += `${num}. ...\n`;
        }
    });

    const remaining = jawabanList.length - Object.keys(answeredMap).length;
    text += `\n_Tersisa ${remaining} jawaban lagi._`;
    text += `\n_Balas pesan ini untuk menjawab! Ketik .nyerah jika menyerah._`;
    return text;
}

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
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

export default {
    name: 'family100',
    aliases: ['f100', 'family'],
    description: 'Bermain game Family 100 bersama-sama',
    category: 'Games',
    execute: async (sock, m, args, text) => {
        if (sessionManager.get(m.chat)) {
            return m.reply(
                'Selesaikan game yang sedang berlangsung terlebih dahulu atau biarkan waktunya habis (2 menit).'
            );
        }

        sessionManager.create(m.chat, { commandName: 'family100', isStarting: true });

        try {
            const response = await axios.get('https://api.siputzx.my.id/api/games/family100');
            let data = response.data?.data;

            if (Array.isArray(data)) data = data[0];

            if (!data || !data.soal || !Array.isArray(data.jawaban)) {
                sessionManager.delete(m.chat);
                return m.reply('Maaf, fitur family100 sedang gangguan.');
            }

            const sessionData = {
                commandName: 'family100',
                soal: data.soal,
                jawabanList: data.jawaban,
                jawaban: data.jawaban, // backward compatibility untuk .nyerah / .clue
                answered: {}, // index => { sender: string, answer: string }
            };

            const boardText = formatFamilyBoard(data.soal, data.jawaban, {});
            await m.reply(boardText);

            sessionManager.create(m.chat, sessionData);
        } catch (error) {
            sessionManager.delete(m.chat);
            console.error('Error on family100:', error.message);
            m.reply('Terjadi kesalahan saat mengambil data game family100.');
        }
    },
    handleSession: async (sock, m, session) => {
        if (session.data.isStarting) return;
        if (!m.quoted || !m.quoted.fromMe) return;

        const sender = m.sender;
        const userAnswer = m.body.toLowerCase().trim();
        const { soal, jawabanList, answered } = session.data;

        let matchedIndex = -1;
        let matchedAnswer = '';
        let isAlmost = false;

        for (let i = 0; i < jawabanList.length; i++) {
            const ans = jawabanList[i];
            const ansStr = ans.toLowerCase().trim();

            if (userAnswer === ansStr) {
                matchedIndex = i;
                matchedAnswer = ans;
                break;
            }

            if (ansStr.length >= 4 && levenshtein(userAnswer, ansStr) <= 2 && !answered[i]) {
                isAlmost = true;
            }
        }

        if (matchedIndex !== -1) {
            if (answered[matchedIndex]) {
                return m.reply(`⚠️ Jawaban *${matchedAnswer}* sudah pernah dijawab oleh @${answered[matchedIndex].sender.split('@')[0]}!`, {
                    mentions: [answered[matchedIndex].sender],
                });
            }

            // Simpan jawaban
            answered[matchedIndex] = {
                sender,
                answer: matchedAnswer,
            };

            const totalAnswered = Object.keys(answered).length;
            const allMentions = [...new Set(Object.values(answered).map((a) => a.sender))];
            if (!allMentions.includes(sender)) allMentions.push(sender);

            // Cek apakah semua jawaban sudah terisi
            if (totalAnswered >= jawabanList.length) {
                sessionManager.delete(m.chat);

                const finalBoard = formatFamilyBoard(soal, jawabanList, answered);
                const winMsg = `🎉 *SEMUA JAWABAN BERHASIL DITEBAK!*\n\n${finalBoard}\n\nSelamat kepada semua yang ikut menjawab! 🥳`;
                return m.reply(winMsg, { mentions: allMentions });
            }

            // Jika masih ada sisa jawaban
            const updatedBoard = formatFamilyBoard(soal, jawabanList, answered);
            const successMsg = `🎯 *BENAR!* (@${sender.split('@')[0]})\nJawaban *${matchedAnswer}* ada di nomor ${matchedIndex + 1}!\n\n${updatedBoard}`;
            return m.reply(successMsg, { mentions: allMentions });
        }

        if (isAlmost) {
            return m.reply('🤏 *HAMPIR BENAR!*\nJawabanmu ada sedikit typo. Coba ketik lagi dengan benar!');
        }
    },
};

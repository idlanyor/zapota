import { sessionManager } from '../../utils/session.js';

export default [
    {
        name: 'nyerah',
        aliases: ['surrender', 'giveup'],
        description: 'Menyerah dari game yang sedang berlangsung',
        category: 'Games',
        execute: async (sock, m, args, text) => {
            const session = sessionManager.get(m.chat);
            if (!session || session.data.isStarting) {
                return m.reply('Tidak ada game yang sedang berlangsung di chat ini.');
            }

            if (session.data.commandName === 'tictactoe') {
                sessionManager.delete(m.chat);
                return m.reply('🏳️ Game Tic-Tac-Toe dihentikan.');
            }

            let answer = session.data.jawaban;

            // Format jawaban jika itu array (contoh: family100)
            if (Array.isArray(answer)) {
                answer = answer.join(' / ');
            }

            // Cegah double nyerah atau nyerah bersamaan dengan tebakan benar
            if (!sessionManager.delete(m.chat)) return;
            return m.reply(
                `🏳️ *MENYERAH*\n\nSeseorang telah mengibarkan bendera putih!\nJawaban yang benar adalah: *${answer}*\n\nGame dihentikan.`
            );
        },
    },
    {
        name: 'clue',
        aliases: ['hint', 'bantuan'],
        description: 'Minta bantuan clue untuk game yang sedang berlangsung',
        category: 'Games',
        execute: async (sock, m, args, text) => {
            const session = sessionManager.get(m.chat);
            if (!session || session.data.isStarting) {
                return m.reply('Tidak ada game yang sedang berlangsung di chat ini.');
            }

            if (session.data.commandName === 'cerdascermat') {
                return m.reply(
                    'Game cerdas cermat tidak memiliki clue! Silakan tebak A, B, C, atau D 🤔'
                );
            }

            let answer = session.data.jawaban;

            // Jika array (contoh: family100), beri clue untuk jawaban pertama saja
            if (Array.isArray(answer)) {
                answer = String(answer[0]);
            } else {
                answer = String(answer);
            }

            // Jika jawabannya sangat pendek
            if (answer.length <= 2) {
                return m.reply('Jawabannya sangat pendek, masa minta clue? 😂');
            }

            // Masking text: Membuka huruf pertama dan spasi, sisanya di-sensor dengan underscore
            const clueStr = answer.replace(/[a-zA-Z0-9]/g, (char, index) => {
                if (index === 0 || answer[index - 1] === ' ') {
                    return char; // Tampilkan huruf awal kata
                }
                if (index === answer.length - 1) {
                    return char; // Tampilkan huruf paling akhir
                }
                return '_';
            });

            return m.reply(`💡 *CLUE JAWABAN*\n\n${clueStr}\n\nAyo tebak lagi!`);
        },
    },
];

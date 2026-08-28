import { createCanvas } from 'canvas';
import { decodeJid } from '../../utils/serialize.js';
import { sessionManager } from '../../utils/session.js';

const WINNING_LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
];

const LOBBY_TTL_MS = 5 * 60 * 1000;
const lobbies = new Map();

const getLobby = (chatId) => {
    const lobby = lobbies.get(chatId);
    if (!lobby) return null;
    if (Date.now() - lobby.updatedAt > LOBBY_TTL_MS) {
        lobbies.delete(chatId);
        return null;
    }
    lobby.updatedAt = Date.now();
    return lobby;
};

const displayBoard = (board) => {
    const cells = board.map((cell, index) => cell || String(index + 1));
    return [
        `${cells[0]} | ${cells[1]} | ${cells[2]}`,
        '───┼───┼───',
        `${cells[3]} | ${cells[4]} | ${cells[5]}`,
        '───┼───┼───',
        `${cells[6]} | ${cells[7]} | ${cells[8]}`,
    ].join('\n');
};

const roundedRect = (ctx, x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
};

const winningLine = (board) =>
    WINNING_LINES.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]);

const shortPlayerLabel = (jid, displayName = '') => {
    if (jid === 'BOT') return 'BOT';
    const name = displayName?.trim()?.replace(/[\r\n]+/g, ' ');
    if (name) return name.length > 18 ? `${name.slice(0, 17)}…` : name;
    const number = jid.split('@')[0];
    return `@${number.length > 13 ? `${number.slice(0, 5)}...${number.slice(-5)}` : number}`;
};

const renderBoardImage = (game, status = '') => {
    const width = 900;
    const height = 1100;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#07111f');
    background.addColorStop(0.55, '#101d35');
    background.addColorStop(1, '#1d1230');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(61, 225, 255, 0.10)';
    ctx.beginPath();
    ctx.arc(80, 90, 240, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 77, 148, 0.09)';
    ctx.beginPath();
    ctx.arc(840, 1020, 300, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 30px sans-serif';
    ctx.fillStyle = '#87a5c5';
    ctx.fillText('KANATA GAME', width / 2, 55);
    ctx.font = '900 64px sans-serif';
    ctx.fillStyle = '#f7fbff';
    ctx.fillText('TIC TAC TOE', width / 2, 120);

    const drawPlayerCard = (x, mark, label, active, color) => {
        roundedRect(ctx, x, 170, 340, 82, 24);
        ctx.fillStyle = active ? `${color}25` : 'rgba(255,255,255,0.055)';
        ctx.fill();
        ctx.strokeStyle = active ? color : 'rgba(255,255,255,0.10)';
        ctx.lineWidth = active ? 3 : 1;
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.font = '900 42px sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(mark, x + 30, 211);
        ctx.font = '700 25px sans-serif';
        ctx.fillStyle = '#eaf2ff';
        ctx.fillText(label, x + 91, 211);
    };

    drawPlayerCard(
        90,
        'X',
        shortPlayerLabel(game.playerX, game.playerXName),
        game.turn === 'X',
        '#3de1ff'
    );
    drawPlayerCard(
        470,
        'O',
        shortPlayerLabel(game.playerO, game.playerOName),
        game.turn === 'O',
        '#ff4d94'
    );

    const boardX = 90;
    const boardY = 290;
    const boardSize = 720;
    const gap = 15;
    const cellSize = (boardSize - gap * 2) / 3;
    const winningCells = new Set(winningLine(game.board) || []);

    for (let index = 0; index < 9; index++) {
        const row = Math.floor(index / 3);
        const col = index % 3;
        const x = boardX + col * (cellSize + gap);
        const y = boardY + row * (cellSize + gap);
        const isWinningCell = winningCells.has(index);

        roundedRect(ctx, x, y, cellSize, cellSize, 30);
        const cellGradient = ctx.createLinearGradient(x, y, x + cellSize, y + cellSize);
        cellGradient.addColorStop(0, isWinningCell ? '#263e56' : '#15243a');
        cellGradient.addColorStop(1, isWinningCell ? '#382745' : '#10192a');
        ctx.fillStyle = cellGradient;
        ctx.fill();
        ctx.strokeStyle = isWinningCell ? '#ffe66d' : 'rgba(147, 180, 218, 0.18)';
        ctx.lineWidth = isWinningCell ? 5 : 2;
        ctx.stroke();

        const centerX = x + cellSize / 2;
        const centerY = y + cellSize / 2;
        if (game.board[index] === 'X') {
            const offset = cellSize * 0.27;
            ctx.strokeStyle = '#3de1ff';
            ctx.lineWidth = 22;
            ctx.lineCap = 'round';
            ctx.shadowColor = '#3de1ff';
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.moveTo(centerX - offset, centerY - offset);
            ctx.lineTo(centerX + offset, centerY + offset);
            ctx.moveTo(centerX + offset, centerY - offset);
            ctx.lineTo(centerX - offset, centerY + offset);
            ctx.stroke();
        } else if (game.board[index] === 'O') {
            ctx.strokeStyle = '#ff4d94';
            ctx.lineWidth = 22;
            ctx.shadowColor = '#ff4d94';
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(centerX, centerY, cellSize * 0.3, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            ctx.shadowBlur = 0;
            ctx.font = '700 48px sans-serif';
            ctx.fillStyle = '#56708e';
            ctx.fillText(String(index + 1), centerX, centerY);
        }
        ctx.shadowBlur = 0;
    }

    ctx.textAlign = 'center';
    ctx.font = '700 29px sans-serif';
    ctx.fillStyle = status ? '#ffe66d' : '#a9bdd5';
    ctx.fillText(status || 'Pilih kotak 1-9', width / 2, 1055);

    return canvas.toBuffer('image/png');
};

const winner = (board) => {
    for (const [a, b, c] of WINNING_LINES) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return null;
};

const isDraw = (board) => board.every(Boolean);
const availableMoves = (board) => board.flatMap((cell, index) => (cell ? [] : [index]));

const chooseBotMove = (board) => {
    const moves = availableMoves(board);
    if (!moves.length) return null;

    const findWinningMove = (mark) =>
        moves.find((move) => {
            const testBoard = [...board];
            testBoard[move] = mark;
            return winner(testBoard) === mark;
        });

    const winningMove = findWinningMove('O');
    if (winningMove !== undefined) return winningMove;
    const blockingMove = findWinningMove('X');
    if (blockingMove !== undefined) return blockingMove;
    if (!board[4]) return 4;

    const corners = moves.filter((move) => [0, 2, 6, 8].includes(move));
    return corners.length
        ? corners[Math.floor(Math.random() * corners.length)]
        : moves[Math.floor(Math.random() * moves.length)];
};

const playerLabel = (jid) => (jid === 'BOT' ? '🤖 Bot' : `@${jid.split('@')[0]}`);

const renderGame = (game, footer = '') => {
    const turnLabel = game.turn === 'X' ? playerLabel(game.playerX) : playerLabel(game.playerO);
    return [
        '*TIC-TAC-TOE*',
        '',
        `❌ ${playerLabel(game.playerX)}`,
        `⭕ ${playerLabel(game.playerO)}`,
        '',
        displayBoard(game.board),
        '',
        `Giliran: ${turnLabel}`,
        'Balas pesan board ini dengan angka *1-9*. Ketik *nyerah* untuk keluar.',
        footer ? `\n${footer}` : '',
    ]
        .filter(Boolean)
        .join('\n');
};

const renderCaption = (game, footer = '') => {
    const turnLabel = game.turn === 'X' ? playerLabel(game.playerX) : playerLabel(game.playerO);
    return [
        '*TIC-TAC-TOE*',
        `❌ ${playerLabel(game.playerX)}  vs  ⭕ ${playerLabel(game.playerO)}`,
        '',
        `Giliran: ${turnLabel}`,
        'Reply gambar ini dengan angka *1-9*.',
        'Ketik *.nyerah* untuk menghentikan game.',
        footer ? `\n${footer}` : '',
    ]
        .filter(Boolean)
        .join('\n');
};

const sendBoard = async (sock, m, game, footer = '', status = '') => {
    const mentions = [game.playerX, game.playerO].filter((jid) => jid && jid !== 'BOT');
    try {
        return await sock.sendMessage(
            m.chat,
            {
                image: renderBoardImage(game, status),
                caption: renderCaption(game, footer),
                mentions,
            },
            { quoted: m }
        );
    } catch {
        return m.reply(renderGame(game, footer), { mentions });
    }
};

const finishGame = async (sock, m, game, result, imageStatus) => {
    sessionManager.delete(m.chat);
    const mentions = [game.playerX, game.playerO].filter((jid) => jid && jid !== 'BOT');
    try {
        await sock.sendMessage(
            m.chat,
            {
                image: renderBoardImage(game, imageStatus),
                caption: result,
                mentions,
            },
            { quoted: m }
        );
    } catch {
        await m.reply(`${result}\n\n${displayBoard(game.board)}`, { mentions });
    }
};

const renderLobby = (lobby) => {
    const slots = [0, 1].map((index) => {
        const player = lobby.players[index];
        return player
            ? `${index + 1}. ${shortPlayerLabel(player, lobby.names?.[player])}`
            : `${index + 1}. _Kosong_`;
    });
    return [
        '*TIC-TAC-TOE LOBBY*',
        '',
        ...slots,
        '',
        `Host: ${playerLabel(lobby.host)}`,
        '',
        '`.tictactoe join` — masuk lobby',
        '`.tictactoe leave` — keluar lobby',
        '`.tictactoe start` — mulai (host)',
    ].join('\n');
};

const HELP = `*TIC-TAC-TOE MULTIPLAYER*

*.tictactoe join* — buat/masuk lobby
*.tictactoe leave* — keluar lobby/game
*.tictactoe start* — mulai saat 2 pemain siap

Maksimal 2 pemain per chat.`;

export default {
    name: 'tictactoe',
    aliases: ['ttt', 'xo'],
    description: 'Tic-Tac-Toe multiplayer dengan lobby maksimal 2 pemain',
    category: 'Games',
    execute: async (sock, m, args) => {
        const action = args[0]?.toLowerCase();
        const sender = decodeJid(m.sender);
        const session = sessionManager.get(m.chat);
        let lobby = getLobby(m.chat);

        if (session && session.data.commandName !== 'tictactoe') {
            return m.reply('Selesaikan game lain yang sedang berlangsung terlebih dahulu.');
        }

        if (!m.isGroup && action !== 'leave') {
            if (session?.data.phase === 'playing') {
                return m.reply('Game melawan bot sedang berjalan. Reply board dengan angka 1-9.');
            }
            const game = {
                commandName: 'tictactoe',
                phase: 'playing',
                board: Array(9).fill(null),
                playerX: sender,
                playerXName: m.pushName || '',
                playerO: 'BOT',
                playerOName: 'BOT',
                bot: true,
                turn: 'X',
            };
            sessionManager.create(m.chat, game);
            return sendBoard(sock, m, game, 'Kamu bermain melawan bot.', 'GILIRAN X');
        }

        if (action === 'join') {
            if (session?.data.phase === 'playing') {
                return m.reply('Pertandingan sudah dimulai. Tunggu sampai game selesai.');
            }
            if (!lobby) {
                lobby = {
                    commandName: 'tictactoe',
                    host: sender,
                    players: [sender],
                    names: { [sender]: m.pushName || '' },
                    updatedAt: Date.now(),
                };
                lobbies.set(m.chat, lobby);
            } else if (lobby.players.some((jid) => decodeJid(jid) === sender)) {
                return m.reply('Kamu sudah berada di lobby ini.');
            } else if (lobby.players.length >= 2) {
                return m.reply('Lobby sudah penuh. Maksimal 2 pemain.');
            } else {
                lobby.players.push(sender);
                lobby.names ||= {};
                lobby.names[sender] = m.pushName || '';
            }

            return m.reply(renderLobby(lobby), { mentions: lobby.players });
        }

        if (action === 'leave') {
            if (session?.data.phase === 'playing') {
                const game = session.data;
                const isPlayer = [game.playerX, game.playerO].some(
                    (jid) => decodeJid(jid) === sender
                );
                if (!isPlayer) return m.reply('Kamu bukan pemain dalam pertandingan ini.');
                const opponent = decodeJid(game.playerX) === sender ? game.playerO : game.playerX;
                sessionManager.delete(m.chat);
                return m.reply(
                    `🏳️ ${playerLabel(sender)} meninggalkan game. ${playerLabel(opponent)} menang.`,
                    { mentions: [sender, opponent].filter((jid) => jid !== 'BOT') }
                );
            }

            if (!lobby) return m.reply('Tidak ada lobby atau pertandingan aktif.');
            const playerIndex = lobby.players.findIndex((jid) => decodeJid(jid) === sender);
            if (playerIndex === -1) return m.reply('Kamu belum bergabung ke lobby.');
            lobby.players.splice(playerIndex, 1);
            if (lobby.players.length === 0) {
                lobbies.delete(m.chat);
                return m.reply('Lobby Tic-Tac-Toe dibubarkan.');
            }
            if (decodeJid(lobby.host) === sender) lobby.host = lobby.players[0];
            return m.reply(renderLobby(lobby), { mentions: lobby.players });
        }

        if (action === 'start') {
            if (!lobby) {
                return m.reply('Belum ada lobby. Gunakan *.tictactoe join* terlebih dahulu.');
            }
            if (decodeJid(lobby.host) !== sender) return m.reply('Hanya host yang bisa memulai.');
            if (lobby.players.length !== 2) {
                return m.reply(
                    'Butuh tepat 2 pemain. Minta pemain lain memakai *.tictactoe join*.'
                );
            }

            const game = {
                commandName: 'tictactoe',
                phase: 'playing',
                board: Array(9).fill(null),
                playerX: lobby.players[0],
                playerXName: lobby.names?.[lobby.players[0]] || '',
                playerO: lobby.players[1],
                playerOName: lobby.names?.[lobby.players[1]] || '',
                bot: false,
                turn: 'X',
            };
            lobbies.delete(m.chat);
            sessionManager.create(m.chat, game);
            return sendBoard(sock, m, game, 'Pertandingan dimulai!', 'GILIRAN X');
        }

        if (lobby) {
            return m.reply(`${renderLobby(lobby)}\n\n${HELP}`, {
                mentions: lobby.players,
            });
        }
        if (session?.data.phase === 'playing') {
            return m.reply('Pertandingan sedang berjalan. Reply board dengan angka 1-9.');
        }
        return m.reply(HELP);
    },

    handleSession: async (sock, m, session) => {
        const game = session.data;
        if (!game || game.commandName !== 'tictactoe' || game.phase !== 'playing') return;
        if (!m.quoted?.fromMe) return;

        const sender = decodeJid(m.sender);
        const isPlayer = sender === decodeJid(game.playerX) || sender === decodeJid(game.playerO);
        if (!isPlayer) return m.reply('Game ini sedang dimainkan oleh pemain lain.');
        const input = m.body.trim().toLowerCase();
        if (['nyerah', 'menyerah', 'quit', 'stop'].includes(input)) {
            sessionManager.delete(m.chat);
            return m.reply(`🏳️ ${playerLabel(sender)} menyerah. Game selesai.`);
        }

        const expectedPlayer =
            game.turn === 'X' ? decodeJid(game.playerX) : decodeJid(game.playerO);
        if (sender !== expectedPlayer) return m.reply('Belum giliranmu.');

        const move = Number(input) - 1;
        if (!Number.isInteger(move) || move < 0 || move > 8) {
            return m.reply('Pilih kotak dengan angka *1 sampai 9*.');
        }
        if (game.board[move]) return m.reply('Kotak itu sudah terisi. Pilih kotak lain.');

        game.board[move] = game.turn;
        if (winner(game.board)) {
            return finishGame(
                sock,
                m,
                game,
                `🎉 *${playerLabel(sender)} MENANG!*`,
                `${shortPlayerLabel(
                    sender,
                    sender === game.playerX ? game.playerXName : game.playerOName
                )} MENANG`
            );
        }
        if (isDraw(game.board)) {
            return finishGame(sock, m, game, '🤝 *SERI!* Tidak ada pemenang.', 'HASIL SERI');
        }

        if (game.bot) {
            const botMove = chooseBotMove(game.board);
            if (botMove !== null) game.board[botMove] = 'O';
            if (winner(game.board)) {
                return finishGame(sock, m, game, '🤖 *BOT MENANG!*', 'BOT MENANG');
            }
            if (isDraw(game.board)) {
                return finishGame(sock, m, game, '🤝 *SERI!* Tidak ada pemenang.', 'HASIL SERI');
            }
            game.turn = 'X';
            return sendBoard(sock, m, game, `Bot memilih kotak *${botMove + 1}*.`, 'GILIRAN X');
        }

        game.turn = game.turn === 'X' ? 'O' : 'X';
        return sendBoard(sock, m, game, '', `GILIRAN ${game.turn}`);
    },
};

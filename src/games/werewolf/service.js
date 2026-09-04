import logger from '../../utils/logger.js';
import { FACTIONS, PHASES, ROLE_META, ROLES, roleDeckFor } from './constants.js';
import {
    alivePlayers,
    assignRoles,
    claimTransition,
    clearAssignments,
    determineWinner,
    numberedDeadPlayers,
    newNightActions,
    numberedPlayers,
    releaseTransition,
    resolveNight,
    resolveNumberedDeadTarget,
    resolveNumberedTarget,
    roleLabel,
} from './engine.js';
import { identityAliasesFromMessage, normalizeIdentity } from './identity.js';
import { werewolfManager } from './manager.js';
import { getWerewolfImage, WEREWOLF_MEDIA } from './media.js';

const GENERIC_SECRET_ERROR =
    '*Aksi ditolak.*\n_Action role hanya dapat digunakan melalui private chat bot._';

const ROLE_IMAGES = Object.freeze({
    [ROLES.VILLAGER]: WEREWOLF_MEDIA.role.VILLAGER,
    [ROLES.WEREWOLF]: WEREWOLF_MEDIA.role.WEREWOLF,
    [ROLES.SEER]: WEREWOLF_MEDIA.role.SEER,
    [ROLES.GUARDIAN]: WEREWOLF_MEDIA.role.GUARDIAN,
    [ROLES.WITCH]: WEREWOLF_MEDIA.role.WITCH,
    [ROLES.HUNTER]: WEREWOLF_MEDIA.role.HUNTER,
    [ROLES.JESTER]: WEREWOLF_MEDIA.role.JESTER,
    [ROLES.ALPHA_WEREWOLF]: WEREWOLF_MEDIA.role.ALPHA_WEREWOLF,
    [ROLES.SORCERER]: WEREWOLF_MEDIA.role.SORCERER,
    [ROLES.NECROMANCER]: WEREWOLF_MEDIA.role.NECROMANCER,
});

const formatName = (player) => `@${player.jid.split('@')[0]}`;
const command = (value) => `\`${value}\``;
const mentionsOf = (players) => [...new Set(players.filter(Boolean).map((player) => player.jid))];

const playerDataFromMessage = (m) => {
    const aliases = identityAliasesFromMessage(m);
    return {
        jid: aliases[0] || normalizeIdentity(m.sender),
        aliases,
        name: m.pushName || m.sender?.split('@')[0] || 'Player',
    };
};

const isHost = (game, player) => player?.jid === game.hostJid;

const isGroupAdmin = (m, aliases) => {
    if (m.isOwner) return true;
    return (m.metadata?.participants || []).some((participant) => {
        if (!['admin', 'superadmin'].includes(participant.admin)) return false;
        const ids = [participant.id, participant.lid].map(normalizeIdentity).filter(Boolean);
        return aliases.some((alias) => ids.includes(alias));
    });
};

const targetList = (game, predicate = () => true) =>
    numberedPlayers(game, { predicate })
        .map(({ player, number }) => `${number}. ${player.name}`)
        .join('\n');

const deadTargetList = (game, predicate = () => true) =>
    numberedDeadPlayers(game, predicate)
        .map(({ player, number }) => `${number}. ${player.name} — ${roleLabel(player.role)}`)
        .join('\n');

const wolfTeam = (game) =>
    game.players.filter((candidate) => candidate.faction === FACTIONS.WEREWOLF);

const roleCompositionText = (requestedCount = null) => {
    const counts = requestedCount ? [requestedCount] : Array.from({ length: 11 }, (_, i) => i + 5);
    const sections = counts.map((count) => {
        const totals = new Map();
        for (const role of roleDeckFor(count)) totals.set(role, (totals.get(role) || 0) + 1);
        return [
            `*${count} pemain*`,
            ...[...totals.entries()].map(([role, total]) => `• ${roleLabel(role)} × ${total}`),
        ].join('\n');
    });
    return [
        '*⌂ W E R E W O L F — R O L E S*',
        '_Komposisi berdasarkan jumlah pemain._',
        ...sections,
    ].join('\n\n');
};

const roleMessage = (game, player) => {
    const meta = ROLE_META[player.role];
    const lines = [
        '*⌂ W E R E W O L F — R O L E*',
        '',
        `${meta.emoji} Peranmu: *${meta.name.toUpperCase()}*`,
        `Pihak: _${meta.faction}_`,
        '',
    ];

    switch (player.role) {
        case ROLES.WEREWOLF:
        case ROLES.ALPHA_WEREWOLF: {
            const teammates = wolfTeam(game)
                .filter((candidate) => candidate !== player)
                .map((candidate) => `• ${candidate.name}`);
            lines.push('_Saat desa terlelap, pilih satu korban untuk diburu._');
            if (teammates.length) lines.push('', '*Kawananmu:*', ...teammates);
            lines.push('', `Aksi malam: ${command('.ww kill <nomor>')}`);
            if (player.role === ROLES.ALPHA_WEREWOLF) {
                lines.push(
                    '',
                    '_Jika desa mengeksekusimu, wariskan kutukan kepada satu pemain hidup._',
                    command('.ww convert <nomor>')
                );
            }
            break;
        }
        case ROLES.SORCERER: {
            const teammates = wolfTeam(game)
                .filter((candidate) => candidate !== player)
                .map((candidate) => `• ${candidate.name}`);
            lines.push('_Baca aura penduduk dan temukan Seer untuk kawanan Werewolf._');
            if (teammates.length) lines.push('', '*Kawananmu:*', ...teammates);
            lines.push('', `Aksi malam: ${command('.ww scry <nomor>')}`);
            break;
        }
        case ROLES.SEER:
            lines.push(
                '_Terawang satu pemain setiap malam untuk mengetahui auranya._',
                '',
                command('.ww inspect <nomor>')
            );
            break;
        case ROLES.GUARDIAN:
            lines.push(
                '_Kamu memiliki satu perlindungan untuk seluruh permainan._',
                '',
                command('.ww guard <nomor>')
            );
            break;
        case ROLES.WITCH:
            lines.push(
                '_Satu Ramuan Racun, satu Ramuan Ajaib, dan hanya satu pilihan setiap malam._',
                '',
                command('.ww potion poison <nomor>'),
                command('.ww potion magic')
            );
            break;
        case ROLES.HUNTER:
            lines.push(
                '_Saat ajal menjemput, satu peluru terakhir masih menjadi milikmu._',
                '',
                command('.ww shoot <nomor>')
            );
            break;
        case ROLES.NECROMANCER:
            lines.push(
                '_Panggil pulang satu jiwa yang telah mati. Kekuatan ini hanya dapat digunakan sekali._',
                'Pemain yang bangkit kembali membawa role dan pihak lamanya.',
                '',
                command('.ww revive <nomor>')
            );
            break;
        case ROLES.JESTER:
            lines.push('_Buat dirimu dicurigai. Kemenanganmu tiba ketika desa mengeksekusimu._');
            break;
        default:
            lines.push('_Amati setiap ucapan. Temukan dan eliminasi seluruh Werewolf._');
    }

    lines.push('', '*Rahasiakan peranmu.* _Jangan teruskan atau tangkap layar pesan ini._');
    return lines.join('\n');
};

const lobbyText = (game) => {
    const players = game.players.map((player, index) => `${index + 1}. ${formatName(player)}`);
    const host = game.players.find((player) => player.jid === game.hostJid);
    return [
        '*⌂ W E R E W O L F — L O B B Y*',
        '_Desa menunggu para pemain berkumpul._',
        '',
        ...players,
        '',
        `*Pemain:* ${game.players.length}/${game.settings.maxPlayers}`,
        `*Host:* ${host ? formatName(host) : '-'}`,
        `*Timer lobby:* ${Math.max(0, Math.ceil((game.lobbyExpiresAt - Date.now()) / 60_000))} menit`,
        '',
        `${command('.ww join')} — bergabung`,
        `${command('.ww leave')} — keluar dari lobby`,
        `${command('.ww start')} — mulai oleh host`,
        `${command('.ww settings')} — atur waktu permainan`,
        `${command('.ww kick <nomor>')} — keluarkan pemain`,
    ].join('\n');
};

const statusText = (game) => {
    const living = alivePlayers(game);
    return [
        '*⌂ W E R E W O L F — S T A T U S*',
        '',
        `*Fase:* ${game.phase}`,
        `*Ronde:* ${game.round}`,
        `*Pemain hidup:* ${living.length}/${game.players.length}`,
        '',
        ...game.players.map(
            (player, index) =>
                `${index + 1}. ${formatName(player)} — ${player.alive ? 'Hidup' : 'Mati'}`
        ),
    ].join('\n');
};

const helpText = (isGroup) =>
    [
        '*⌂ W E R E W O L F — G A M E*',
        '_Permainan tipu daya antara warga dan kawanan serigala._',
        '',
        isGroup
            ? command(
                  '.ww create / join / leave / start / status / players / timer / settings / kick / delete'
              )
            : command(
                  '.ww ready / role / kill / inspect / scry / guard / potion / revive / convert / shoot'
              ),
        `${command('.ww vote <nomor>')} — voting saat fase voting`,
        `${command('.ww roles [5-15]')} — lihat komposisi role`,
        '',
        '_Semua skill role wajib dilakukan melalui private chat bot._',
        `Panduan lengkap: ${command('.ww tutor')}`,
    ].join('\n');

const tutorialText = () =>
    [
        '*⌂ W E R E W O L F — T U T O R*',
        '_Di desa ini, perkataan dapat menyelamatkan—atau membunuh._',
        '',
        '*A. PERSIAPAN*',
        '_Wajib dilakukan semua pemain sebelum ikut game._',
        'Werewolf dimainkan di dalam grup, dengan *5 sampai 15 pemain*.',
        `1. Buka private chat bot, lalu kirim ${command('.ww ready')}.`,
        '2. Tunggu balasan bot. Ini memastikan bot bisa mengirim role rahasiamu.',
        '3. Satu orang hanya boleh ikut satu game Werewolf yang sedang berjalan.',
        '',
        '*B. MEMBUAT LOBBY — DI GRUP*',
        `• Host kirim ${command('.ww create')} untuk membuat lobby.`,
        `• Pemain lain kirim ${command('.ww join')} untuk ikut.`,
        `• ${command('.ww players')} melihat daftar pemain.`,
        `• ${command('.ww player')} adalah alias singkat untuk melihat daftar pemain.`,
        `• ${command('.ww timer')} melihat sisa timer global lobby (10 menit).`,
        `• ${command('.ww leave')} keluar sebelum game dimulai.`,
        `• ${command('.ww start')} memulai game (khusus host).`,
        `• ${command('.ww roles [5-15]')} melihat role yang mungkin muncul.`,
        '',
        '*Perintah host:*',
        `• ${command('.ww kick <nomor>')} mengeluarkan pemain dari lobby.`,
        `• ${command('.ww delete')} menghapus lobby (alias stop untuk host).`,
        `• ${command('.ww settings')} melihat atau mengubah durasi fase.`,
        '',
        '*C. ROLE RAHASIA*',
        'Saat host memulai game, bot mengirim peranmu melalui private chat. Jangan tunjukkan pesan ini kepada siapa pun.',
        'Jika bot gagal mengirim salah satu role, game otomatis dibatalkan agar tidak ada pemain yang tahu role orang lain.',
        '',
        '*D. MALAM — AKSI DI PRIVATE CHAT*',
        'Setiap malam, role tertentu boleh memakai kemampuan. Ganti `<nomor>` dengan nomor pemain di daftar grup.',
        `🐺 *Werewolf / Alpha:* ${command('.ww kill <nomor>')} memilih korban.`,
        `🔮 *Seer:* ${command('.ww inspect <nomor>')} melihat role target.`,
        `🛡️ *Guardian:* ${command('.ww guard <nomor>')} melindungi satu pemain (1 kali selama game).`,
        `🧙 *Witch:* ${command('.ww potion poison <nomor>')} meracuni, atau ${command('.ww potion magic')} melindungi warga dari kematian malam itu.`,
        `🧙‍♂️ *Sorcerer:* ${command('.ww scry <nomor>')} mencari siapa Seer.`,
        `💀🔮 *Necromancer:* ${command('.ww revive <nomor>')} menghidupkan satu pemain mati (1 kali).`,
        '_Witch punya dua ramuan, tetapi hanya boleh memakai satu ramuan setiap malam._',
        '',
        '*E. PAGI DAN DISKUSI — DI GRUP*',
        'Pagi hari, bot mengumumkan siapa yang mati. Pemain yang masih hidup boleh berdiskusi dan menebak siapa Werewolf.',
        '',
        '*F. VOTING — DI GRUP*',
        `Saat voting dibuka, kirim ${command('.ww vote <nomor>')} untuk memilih orang yang dicurigai.`,
        'Vote masih bisa diganti sebelum waktunya habis.',
        '_Jika jumlah vote seri, tidak ada yang dikeluarkan dan game langsung masuk ke malam berikutnya._',
        '',
        '*G. ROLE KHUSUS*',
        `🏹 *Hunter* yang mati boleh menembak satu pemain: ${command('.ww shoot <nomor>')}.`,
        '🤡 *Jester* menang sendirian jika berhasil membuat desa mengeksekusinya lewat voting.',
        `🐺👑 *Alpha Werewolf* yang dieksekusi boleh mengubah satu pemain menjadi Werewolf: ${command('.ww convert <nomor>')}.`,
        '💀🔮 *Necromancer* mulai tersedia pada game dengan 12 pemain atau lebih.',
        '',
        '*H. CARA MENANG*',
        '• *Village / Warga* menang jika semua Werewolf mati.',
        '• *Werewolf* menang jika jumlah mereka sama atau lebih banyak daripada pihak lain.',
        '• *Jester* menang sendiri jika dieksekusi melalui voting.',
        '',
        '*I. COMMAND TAMBAHAN*',
        `• ${command('.ww role')} melihat role-mu lagi (private chat).`,
        `• ${command('.ww status')} melihat fase dan pemain yang masih hidup.`,
        `• ${command('.ww stop')} lalu ${command('.ww stop confirm')} menghentikan game (host).`,
        `• ${command('.ww force-stop')} menghentikan game secara darurat (admin grup).`,
        '',
        '*Tips untuk pemula:* _Role-mu adalah rahasia. Jangan menyalin pesan private ke grup. Kalau bingung, baca lagi bagian role-mu dan ikuti command yang tertulis di sana._',
    ].join('\n');

export class WerewolfService {
    constructor({ manager = werewolfManager, random = Math.random } = {}) {
        this.manager = manager;
        this.random = random;
    }

    recordPrivateContact(m) {
        if (!m || m.isGroup || !m.sender) return null;
        const aliases = identityAliasesFromMessage(m);
        const privateJid = normalizeIdentity(m.chat) || aliases[0];
        return this.manager.markPrivateContact(aliases, privateJid);
    }

    async send(sock, jid, text, mentions = []) {
        return sock.sendMessage(jid, { text, mentions });
    }

    async safeSend(sock, jid, text, mentions = []) {
        try {
            return await this.send(sock, jid, text, mentions);
        } catch (error) {
            logger.warn(`Werewolf send gagal ke ${jid}: ${error.message}`);
            return null;
        }
    }

    async sendVisual(sock, jid, text, mediaUrl, mentions = [], dimensions = [854, 480]) {
        if (mediaUrl && sock?.user) {
            const mediaLink = /^https?:\/\//i.test(mediaUrl) ? mediaUrl : '';
            const image = await getWerewolfImage(mediaUrl, ...dimensions);
            if (image) {
                try {
                    return await sock.sendMessage(jid, {
                        text,
                        mentions,
                        contextInfo: {
                            externalAdReply: {
                                title: '⌂ W E R E W O L F',
                                body: 'Ultimate Werewolf',
                                mediaType: 1,
                                renderLargerThumbnail: true,
                                thumbnail: image,
                                thumbnailUrl: mediaLink,
                                sourceUrl: '',
                                mediaUrl: mediaLink,
                            },
                        },
                    });
                } catch (error) {
                    logger.warn(`Werewolf thumbnail gagal ke ${jid}: ${error.message}`);
                }
            }
        }
        return this.safeSend(sock, jid, text, mentions);
    }

    async updateLobby(sock, game) {
        const text = lobbyText(game);
        const mentions = mentionsOf(game.players);
        const key = game.runtime.lobbyMessageKey;
        if (key && sock?.sendMessage) {
            try {
                const edited = await sock.sendMessage(game.groupJid, {
                    text,
                    mentions,
                    edit: key,
                });
                game.runtime.lobbyMessageKey = edited?.key || key;
                return edited;
            } catch (error) {
                logger.warn(`Werewolf edit lobby gagal: ${error.message}`);
            }
        }
        const sent = await this.sendVisual(
            sock,
            game.groupJid,
            text,
            WEREWOLF_MEDIA.lobby,
            mentions
        );
        game.runtime.lobbyMessageKey = sent?.key || null;
        return sent;
    }

    async sendRole(sock, player, text) {
        const imageUrl = ROLE_IMAGES[player.role];
        if (!imageUrl || !sock?.user) return this.send(sock, player.privateJid, text);
        const imageLink = /^https?:\/\//i.test(imageUrl) ? imageUrl : '';
        const image = await getWerewolfImage(imageUrl, 640, 640);
        if (image) {
            return sock.sendMessage(player.privateJid, {
                text,
                contextInfo: {
                    externalAdReply: {
                        title: 'Peran Werewolf',
                        body: 'Ultimate Werewolf',
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        thumbnail: image,
                        thumbnailUrl: imageLink,
                        sourceUrl: '',
                        mediaUrl: imageLink,
                    },
                },
            });
        }
        return this.send(sock, player.privateJid, text);
    }

    async reply(m, text, mentions = []) {
        return m.reply(text, { mentions });
    }

    getContext(m) {
        const aliases = identityAliasesFromMessage(m);
        const game = m.isGroup
            ? this.manager.get(m.chat)
            : this.manager.getByPlayerAliases(aliases);
        const player = game ? this.manager.findPlayer(game, aliases) : null;
        if (game && player) this.manager.bindAliases(game, player, aliases);
        return { aliases, game, player };
    }

    enterPhase(game, phase) {
        this.manager.clearTimer(game, 'phase');
        this.manager.clearTimer(game, 'warning');
        game.phase = phase;
        game.phaseStartedAt = Date.now();
        game.phaseVersion += 1;
        return game.phaseVersion;
    }

    setPhaseTimer(game, duration, handler, label = 'Fase') {
        this.manager.clearTimer(game, 'phase');
        this.manager.clearTimer(game, 'warning');
        const expectedPhase = game.phase;
        const expectedVersion = game.phaseVersion;
        if (duration > 10_000) {
            const warning = setTimeout(() => {
                const current = this.manager.get(game.groupJid);
                if (
                    current?.phase === expectedPhase &&
                    current.phaseVersion === expectedVersion &&
                    !current.transitionLock
                ) {
                    this.safeSend(
                        current.runtime.sock,
                        current.groupJid,
                        `⏱️ ${label}: 10 detik tersisa!`
                    );
                }
            }, duration - 10_000);
            warning.unref?.();
            game.timers.warning = warning;
        }
        const timer = setTimeout(() => {
            Promise.resolve(handler(game.groupJid, expectedPhase, expectedVersion)).catch((error) =>
                logger.error(error, 'Werewolf phase timer gagal')
            );
        }, duration);
        timer.unref?.();
        game.timers.phase = timer;
    }

    async execute(sock, m, args) {
        const action = (args[0] || 'help').toLowerCase();
        if (!m.isGroup) this.recordPrivateContact(m);

        switch (action) {
            case 'ready':
                return this.handleReady(m);
            case 'tutor':
                return this.reply(m, tutorialText());
            case 'create':
                return this.handleCreate(sock, m);
            case 'join':
                return this.handleJoin(sock, m);
            case 'leave':
                return this.handleLeave(sock, m);
            case 'start':
                return this.handleStart(sock, m);
            case 'status':
            case 'players':
            case 'player':
                return this.handleStatus(m);
            case 'timer':
                return this.handleTimer(m);
            case 'role':
                return this.handleRole(sock, m);
            case 'roles':
            case 'list':
                return this.handleRoleList(sock, m, args[1]);
            case 'delete':
                return this.handleStop(sock, m, []);
            case 'stop':
                return this.handleStop(sock, m, args.slice(1));
            case 'settings':
                return this.handleSettings(m, args.slice(1));
            case 'kick':
                return this.handleKick(sock, m, args.slice(1));
            case 'force-stop':
                return this.handleForceStop(sock, m);
            case 'vote':
                return this.handleVote(sock, m, args[1]);
            case 'kill':
            case 'inspect':
            case 'guard':
            case 'potion':
            case 'scry':
            case 'revive':
                return this.handleNightAction(sock, m, action, args.slice(1));
            case 'convert':
                return this.handleAlphaConvert(sock, m, args[1]);
            case 'shoot':
                return this.handleHunterShot(sock, m, args[1]);
            default:
                return this.reply(m, helpText(m.isGroup));
        }
    }

    async handleReady(m) {
        if (m.isGroup)
            return this.reply(m, `_Buka private chat bot, lalu kirim_ ${command('.ww ready')}`);
        this.recordPrivateContact(m);
        return this.reply(
            m,
            `*PRIVATE CHAT TERVERIFIKASI*\n_Kamu sekarang dapat membuat atau bergabung ke lobby Werewolf._`
        );
    }

    async handleCreate(sock, m) {
        if (!m.isGroup) return this.reply(m, 'Room Werewolf hanya dapat dibuat di grup.');
        try {
            const game = this.manager.create(m.chat, playerDataFromMessage(m));
            game.runtime.sock = sock;
            this.startLobbyTimer(game);
            const sent = await this.sendVisual(
                sock,
                m.chat,
                lobbyText(game),
                WEREWOLF_MEDIA.lobby,
                mentionsOf(game.players)
            );
            game.runtime.lobbyMessageKey = sent?.key || null;
            return sent;
        } catch (error) {
            return this.reply(m, `❌ ${error.message}`);
        }
    }

    async handleJoin(sock, m) {
        if (!m.isGroup)
            return this.reply(m, `${command('.ww join')} _hanya dapat digunakan di grup._`);
        const game = this.manager.get(m.chat);
        if (!game)
            return this.reply(m, `*Lobby belum tersedia.*\nGunakan ${command('.ww create')}`);
        try {
            this.manager.addPlayer(game, playerDataFromMessage(m));
            await this.updateLobby(sock, game);
            return this.reply(m, '✅ Kamu berhasil bergabung ke lobby.');
        } catch (error) {
            return this.reply(m, `❌ ${error.message}`);
        }
    }

    async handleLeave(sock, m) {
        if (!m.isGroup)
            return this.reply(m, `${command('.ww leave')} _hanya dapat digunakan di grup._`);
        const { game, player } = this.getContext(m);
        if (!game) return this.reply(m, '❌ Tidak ada game Werewolf aktif.');
        if (!player) return this.reply(m, '❌ Kamu bukan pemain dalam lobby ini.');
        if (game.phase !== PHASES.LOBBY) {
            return this.reply(m, '❌ Pemain tidak dapat keluar setelah game dimulai.');
        }
        this.manager.removePlayer(game, player);
        if (!game.players.length) {
            this.manager.delete(game.groupJid);
            return this.reply(m, 'Lobby Werewolf dibubarkan karena tidak ada pemain tersisa.');
        }
        await this.updateLobby(sock, game);
        return this.reply(m, '✅ Kamu keluar dari lobby.');
    }

    async handleStart(sock, m) {
        if (!m.isGroup)
            return this.reply(m, `${command('.ww start')} _hanya dapat digunakan di grup._`);
        const { game, player } = this.getContext(m);
        if (!game || !player) return this.reply(m, '❌ Kamu bukan bagian dari lobby ini.');
        if (!isHost(game, player)) return this.reply(m, '❌ Hanya host yang dapat memulai game.');
        if (game.phase !== PHASES.LOBBY || game.transitionLock) {
            return this.reply(m, '❌ Game sedang dimulai atau sudah berjalan.');
        }
        if (game.players.length < game.settings.minPlayers) {
            return this.reply(
                m,
                `❌ Minimal ${game.settings.minPlayers} pemain untuk memulai game.`
            );
        }
        const unready = game.players.filter(
            (candidate) => !this.manager.getPrivateContact(candidate.aliases)
        );
        if (unready.length) {
            return this.reply(
                m,
                `❌ Pemain berikut belum chat private ke bot:\n${unready
                    .map(formatName)
                    .join(', ')}\n\nKirim ${command('.ww ready')} melalui private chat.`,
                mentionsOf(unready)
            );
        }

        game.transitionLock = true;
        this.manager.clearTimer(game, 'lobby');
        game.phase = PHASES.ROLE_ASSIGNMENT;
        game.runtime.sock = sock;
        assignRoles(game, this.random);

        try {
            const deliveries = await Promise.allSettled(
                game.players.map((candidate) =>
                    this.sendRole(sock, candidate, roleMessage(game, candidate))
                )
            );
            const failed = deliveries
                .map((result, index) => (result.status === 'rejected' ? game.players[index] : null))
                .filter(Boolean);
            if (failed.length) {
                const successful = deliveries
                    .map((result, index) =>
                        result.status === 'fulfilled' ? game.players[index] : null
                    )
                    .filter(Boolean);
                await Promise.allSettled(
                    successful.map((candidate) =>
                        this.send(
                            sock,
                            candidate.privateJid,
                            '⚠️ Start dibatalkan. Role yang baru dikirim tidak berlaku dan akan diacak ulang.'
                        )
                    )
                );
                clearAssignments(game);
                game.phase = PHASES.LOBBY;
                return this.reply(
                    m,
                    `❌ Start dibatalkan karena role gagal dikirim ke:\n${failed
                        .map(formatName)
                        .join(
                            ', '
                        )}\n\nMinta pemain mengirim ${command('.ww ready')} lagi melalui private chat.`,
                    mentionsOf(failed)
                );
            }

            await this.safeSend(
                sock,
                game.groupJid,
                '✅ Semua role berhasil dikirim melalui private chat.'
            );
            await this.beginNight(game);
            return null;
        } finally {
            game.transitionLock = false;
        }
    }

    async handleStatus(m) {
        const { game } = this.getContext(m);
        if (!game) return this.reply(m, '❌ Tidak ada game Werewolf yang terkait denganmu.');
        return this.reply(m, statusText(game), mentionsOf(game.players));
    }

    async handleRole(sock, m) {
        if (m.isGroup) return this.reply(m, GENERIC_SECRET_ERROR);
        const { game, player } = this.getContext(m);
        if (!game || !player || !player.role) {
            return this.reply(m, '❌ Belum ada role aktif untukmu.');
        }
        if (ROLE_IMAGES[player.role]) {
            try {
                return await this.sendRole(sock, player, roleMessage(game, player));
            } catch (error) {
                logger.warn(`Werewolf gambar role gagal dikirim: ${error.message}`);
            }
        }
        return this.reply(m, roleMessage(game, player));
    }

    async handleRoleList(sock, m, value) {
        const count = value == null ? null : Number(value);
        if (count != null && (!Number.isInteger(count) || count < 5 || count > 15)) {
            return this.reply(m, '❌ Jumlah pemain harus antara 5 sampai 15.');
        }
        const text = roleCompositionText(count);
        if (m.isGroup && sock?.user) {
            return this.sendVisual(sock, m.chat, text, WEREWOLF_MEDIA.roles);
        }
        return this.reply(m, text);
    }

    async handleStop(sock, m, args) {
        if (!m.isGroup)
            return this.reply(m, `${command('.ww stop')} _hanya dapat digunakan di grup._`);
        const { game, player } = this.getContext(m);
        if (!game || !player) return this.reply(m, '❌ Tidak ada game Werewolf aktif.');
        if (!isHost(game, player))
            return this.reply(m, '❌ Hanya host yang dapat menghentikan game.');

        if (game.phase === PHASES.LOBBY) {
            this.manager.delete(game.groupJid);
            return this.reply(m, '⚠️ Lobby Werewolf dihentikan oleh host.');
        }

        if (args[0]?.toLowerCase() === 'confirm') {
            const confirmation = game.stopConfirmation;
            if (
                !confirmation ||
                confirmation.hostJid !== player.jid ||
                confirmation.expiresAt < Date.now()
            ) {
                return this.reply(m, '❌ Konfirmasi tidak ada atau sudah kedaluwarsa.');
            }
            await this.safeSend(
                sock,
                game.groupJid,
                '⚠️ *GAME DIHENTIKAN*\n\nPermainan dihentikan oleh host.',
                [player.jid]
            );
            this.manager.delete(game.groupJid);
            return null;
        }

        game.stopConfirmation = {
            hostJid: player.jid,
            expiresAt: Date.now() + game.settings.stopConfirmationDurationMs,
        };
        return this.reply(
            m,
            `*KONFIRMASI PENGHENTIAN*\n_Yakin ingin mengakhiri permainan?_\n\nKetik ${command('.ww stop confirm')} dalam *30 detik*.`
        );
    }

    async handleSettings(m, args) {
        if (!m.isGroup)
            return this.reply(m, `${command('.ww settings')} _hanya dapat digunakan di grup._`);
        const { game, player } = this.getContext(m);
        if (!game || !player) return this.reply(m, '❌ Tidak ada lobby Werewolf aktif.');
        if (!isHost(game, player))
            return this.reply(m, '❌ Hanya host yang dapat mengubah settings.');
        if (game.phase !== PHASES.LOBBY) {
            return this.reply(m, '❌ Settings hanya dapat diubah selama lobby.');
        }

        const setting = args[0]?.toLowerCase();
        const seconds = Number(args[1]);
        const definitions = {
            night: { key: 'nightDurationMs', min: 30, max: 180, label: 'Night' },
            discussion: { key: 'discussionDurationMs', min: 30, max: 300, label: 'Discussion' },
            voting: { key: 'votingDurationMs', min: 15, max: 120, label: 'Voting' },
        };

        if (!setting) {
            return this.reply(
                m,
                [
                    '⚙️ *WEREWOLF SETTINGS*',
                    '',
                    `Night: ${game.settings.nightDurationMs / 1000} detik`,
                    `Discussion: ${game.settings.discussionDurationMs / 1000} detik`,
                    `Voting: ${game.settings.votingDurationMs / 1000} detik`,
                    '',
                    command('.ww settings night <30-180>'),
                    command('.ww settings discussion <30-300>'),
                    command('.ww settings voting <15-120>'),
                ].join('\n')
            );
        }

        const definition = definitions[setting];
        if (
            !definition ||
            !Number.isInteger(seconds) ||
            seconds < definition.min ||
            seconds > definition.max
        ) {
            return this.reply(
                m,
                `*Pengaturan tidak valid.*\nLihat format melalui ${command('.ww settings')}`
            );
        }
        game.settings[definition.key] = seconds * 1000;
        return this.reply(m, `✅ ${definition.label} diubah menjadi *${seconds} detik*.`);
    }

    startLobbyTimer(game) {
        this.manager.clearTimer(game, 'lobby');
        const expectedGameId = game.id;
        const duration = Math.max(1, game.lobbyExpiresAt - Date.now());
        const timer = setTimeout(async () => {
            const current = this.manager.get(game.groupJid);
            if (!current || current.id !== expectedGameId || current.phase !== PHASES.LOBBY) return;
            this.manager.delete(current.groupJid);
            await this.safeSend(
                current.runtime.sock,
                current.groupJid,
                '⏰ *LOBBY KADALUARSA*\n\nLobby Werewolf dibubarkan karena tidak dimulai dalam 10 menit.'
            );
        }, duration);
        timer.unref?.();
        game.timers.lobby = timer;
    }

    async handleTimer(m) {
        if (!m.isGroup)
            return this.reply(m, `${command('.ww timer')} _hanya dapat digunakan di grup._`);
        const { game } = this.getContext(m);
        if (!game || game.phase !== PHASES.LOBBY) {
            return this.reply(m, '❌ Tidak ada lobby Werewolf yang sedang menunggu pemain.');
        }
        const remaining = Math.max(0, Math.ceil((game.lobbyExpiresAt - Date.now()) / 60_000));
        return this.reply(
            m,
            `⏱️ Lobby ini memakai *timer global 10 menit*. Sisa waktu: *${remaining} menit*.`
        );
    }

    async handleKick(sock, m, args) {
        if (!m.isGroup)
            return this.reply(m, `${command('.ww kick')} _hanya dapat digunakan di grup._`);
        const { game, player } = this.getContext(m);
        if (!game || !player) return this.reply(m, '❌ Tidak ada lobby Werewolf aktif.');
        if (!isHost(game, player))
            return this.reply(m, '❌ Hanya host yang dapat mengeluarkan pemain.');
        if (game.phase !== PHASES.LOBBY) {
            return this.reply(m, '❌ Pemain hanya dapat dikeluarkan selama lobby.');
        }

        const number = Number(args[0]);
        let target = Number.isInteger(number) ? game.players[number - 1] : null;
        if (!target && m.mentionedJid?.length) {
            const aliases = m.mentionedJid.map(normalizeIdentity).filter(Boolean);
            target = this.manager.findPlayer(game, aliases);
        }
        if (!target)
            return this.reply(m, '❌ Target tidak valid. Gunakan nomor pada daftar lobby.');
        if (target.jid === game.hostJid) {
            return this.reply(
                m,
                `*Host tidak dapat mengeluarkan dirinya sendiri.*\nGunakan ${command('.ww leave')}`
            );
        }

        this.manager.removePlayer(game, target);
        await this.updateLobby(sock, game);
        return this.reply(m, `🚪 ${formatName(target)} dikeluarkan dari lobby.`);
    }

    async handleForceStop(sock, m) {
        if (!m.isGroup)
            return this.reply(m, `${command('.ww force-stop')} _hanya berlaku di grup._`);
        const aliases = identityAliasesFromMessage(m);
        if (!isGroupAdmin(m, aliases))
            return this.reply(m, '❌ Hanya admin grup yang dapat force-stop.');
        const game = this.manager.get(m.chat);
        if (!game) return this.reply(m, '❌ Tidak ada game Werewolf aktif.');
        await this.safeSend(
            sock,
            game.groupJid,
            '⚠️ *GAME DIHENTIKAN*\n\nPermainan dihentikan oleh administrator.'
        );
        this.manager.delete(game.groupJid);
        return null;
    }

    async beginNight(game) {
        const queuedHunter = this.takeQueuedHunter(game);
        if (queuedHunter) {
            await this.startHunterShot(game, queuedHunter, {
                mode: 'BEGIN',
                phase: PHASES.NIGHT,
            });
            return;
        }
        this.enterPhase(game, PHASES.NIGHT);
        game.round += 1;
        game.nightActions = newNightActions();
        game.votes = new Map();

        await this.sendVisual(
            game.runtime.sock,
            game.groupJid,
            [
                `*⌂ W E R E W O L F — M A L A M ${game.round}*`,
                '',
                '_Matahari tenggelam. Pintu-pintu terkunci dan desa kembali sunyi._',
                'Role aktif, periksa private chat kalian.',
                '',
                `Waktu tersisa: *${Math.round(game.settings.nightDurationMs / 1000)} detik*`,
            ].join('\n'),
            WEREWOLF_MEDIA.night
        );

        await Promise.allSettled(
            alivePlayers(game).map(async (player) => {
                let prompt = null;
                if (player.role === ROLES.WEREWOLF || player.role === ROLES.ALPHA_WEREWOLF) {
                    prompt = `*WEREWOLF — PILIH KORBAN*\n_Buru satu pemain sebelum fajar tiba._\n\n${targetList(
                        game,
                        (target) => target.faction !== FACTIONS.WEREWOLF
                    )}\n\n${command('.ww kill <nomor>')}`;
                } else if (player.role === ROLES.SORCERER) {
                    prompt = `*SORCERER — BACA AURA*\n_Temukan Seer yang bersembunyi di antara warga._\n\n${targetList(
                        game,
                        (target) => target.faction !== FACTIONS.WEREWOLF
                    )}\n\n${command('.ww scry <nomor>')}`;
                } else if (player.role === ROLES.SEER) {
                    prompt = `*SEER — TERAWANG PEMAIN*\n_Buka aura satu pemain malam ini._\n\n${targetList(
                        game,
                        (target) => target.jid !== player.jid
                    )}\n\n${command('.ww inspect <nomor>')}`;
                } else if (player.role === ROLES.GUARDIAN && player.roleState.guardianAvailable) {
                    prompt = `*GUARDIAN — PERLINDUNGAN TERAKHIR*\n_Kekuatan ini hanya dapat digunakan sekali._\n\n${targetList(
                        game
                    )}\n\n${command('.ww guard <nomor>')}`;
                } else if (
                    player.role === ROLES.WITCH &&
                    (player.roleState.witchPoisonAvailable || player.roleState.witchMagicAvailable)
                ) {
                    prompt = [
                        '*WITCH — PILIH RAMUAN*',
                        '_Hanya satu ramuan dapat digunakan malam ini._',
                        '',
                        player.roleState.witchPoisonAvailable
                            ? `${command('.ww potion poison <nomor>')}\n${targetList(
                                  game,
                                  (target) => target.jid !== player.jid
                              )}`
                            : '*Ramuan Racun:* _habis_',
                        '',
                        player.roleState.witchMagicAvailable
                            ? command('.ww potion magic')
                            : '*Ramuan Ajaib:* _habis_',
                    ].join('\n');
                } else if (
                    player.role === ROLES.NECROMANCER &&
                    player.roleState.necromancerAvailable &&
                    numberedDeadPlayers(game).length
                ) {
                    prompt = `*NECROMANCER — PANGGIL JIWA*\n_Pilih satu pemain untuk dibangkitkan._\n\n${deadTargetList(
                        game
                    )}\n\n${command('.ww revive <nomor>')}`;
                }
                if (prompt) await this.safeSend(game.runtime.sock, player.privateJid, prompt);
            })
        );

        this.setPhaseTimer(
            game,
            game.settings.nightDurationMs,
            (groupJid, phase, version) => this.resolveNightPhase(groupJid, phase, version),
            'Malam'
        );
    }

    async notifyWolfTeam(game, actor, text) {
        const teammates = alivePlayers(game).filter(
            (candidate) =>
                candidate !== actor &&
                candidate.faction === FACTIONS.WEREWOLF &&
                candidate.privateJid
        );
        await Promise.allSettled(
            teammates.map((candidate) =>
                this.safeSend(game.runtime.sock, candidate.privateJid, text)
            )
        );
    }

    async handleNightAction(sock, m, action, args) {
        if (m.isGroup) return this.reply(m, GENERIC_SECRET_ERROR);
        const { game, player } = this.getContext(m);
        if (!game || !player || !player.alive || game.phase !== PHASES.NIGHT) {
            return this.reply(m, '⚠️ Action malam tidak dapat digunakan saat ini.');
        }
        if (game.transitionLock) return this.reply(m, '⏳ Fase sedang diproses.');
        game.runtime.sock = sock;

        const rejectRole = () =>
            this.reply(m, '⚠️ Action tersebut tidak tersedia untuk role kamu.');
        const target = (value, options) => resolveNumberedTarget(game, value, options);

        if (action === 'kill') {
            if (![ROLES.WEREWOLF, ROLES.ALPHA_WEREWOLF].includes(player.role)) {
                return rejectRole();
            }
            const victim = target(args[0], {
                predicate: (candidate) => candidate.faction !== FACTIONS.WEREWOLF,
            });
            if (!victim) {
                return this.reply(m, '❌ Target Werewolf tidak valid.');
            }
            game.nightActions.werewolfVotes.set(player.jid, victim.jid);
            await this.notifyWolfTeam(
                game,
                player,
                `🐺 *Aksi Werewolf*\n${formatName(player)} memilih ${formatName(victim)} sebagai target.`
            );
            return this.reply(m, `✅ Vote korban dicatat: *${victim.name}*.`);
        }

        if (action === 'inspect') {
            if (player.role !== ROLES.SEER) return rejectRole();
            const victim = target(args[0], { excludeJid: player.jid });
            if (!victim) return this.reply(m, '❌ Target investigasi tidak valid.');
            game.nightActions.seerTarget = victim.jid;
            return this.reply(m, `✅ Kamu akan memeriksa *${victim.name}* saat malam berakhir.`);
        }

        if (action === 'scry') {
            if (player.role !== ROLES.SORCERER) return rejectRole();
            const victim = target(args[0], {
                predicate: (candidate) => candidate.faction !== FACTIONS.WEREWOLF,
            });
            if (!victim) return this.reply(m, '❌ Target penerawangan tidak valid.');
            game.nightActions.sorcererTarget = victim.jid;
            await this.notifyWolfTeam(
                game,
                player,
                `🔮 *Aksi Sorcerer*\n${formatName(player)} sedang membaca aura ${formatName(victim)}.`
            );
            return this.reply(m, `✅ Aura *${victim.name}* akan dibaca saat malam berakhir.`);
        }

        if (action === 'guard') {
            if (player.role !== ROLES.GUARDIAN || !player.roleState.guardianAvailable) {
                return rejectRole();
            }
            const victim = target(args[0]);
            if (!victim) return this.reply(m, '❌ Target Guardian tidak valid.');
            player.roleState.guardianAvailable = false;
            game.nightActions.guardianTarget = victim.jid;
            return this.reply(
                m,
                `✅ *${victim.name}* dilindungi malam ini. Skill Guardian sekarang habis.`
            );
        }

        if (action === 'potion') {
            if (player.role !== ROLES.WITCH) return rejectRole();
            if (player.roleState.witchPotionUsedRound === game.round) {
                return this.reply(m, '❌ Kamu sudah menggunakan satu ramuan malam ini.');
            }
            const potion = args[0]?.toLowerCase();
            if (potion === 'magic') {
                if (!player.roleState.witchMagicAvailable) {
                    return this.reply(m, '❌ Ramuan Ajaib sudah habis.');
                }
                player.roleState.witchMagicAvailable = false;
                player.roleState.witchPotionUsedRound = game.round;
                game.nightActions.witchAction = { type: 'MAGIC' };
                return this.reply(m, '✅ Ramuan Ajaib akan melindungi seluruh faction Village.');
            }
            if (potion === 'poison') {
                if (!player.roleState.witchPoisonAvailable) {
                    return this.reply(m, '❌ Ramuan Racun sudah habis.');
                }
                const victim = target(args[1], { excludeJid: player.jid });
                if (!victim) return this.reply(m, '❌ Target racun tidak valid.');
                player.roleState.witchPoisonAvailable = false;
                player.roleState.witchPotionUsedRound = game.round;
                game.nightActions.witchAction = { type: 'POISON', targetJid: victim.jid };
                return this.reply(m, `✅ Ramuan Racun diarahkan kepada *${victim.name}*.`);
            }
            return this.reply(
                m,
                `Gunakan ${command('.ww potion poison <nomor>')} atau ${command('.ww potion magic')}`
            );
        }

        if (action === 'revive') {
            if (player.role !== ROLES.NECROMANCER || !player.roleState.necromancerAvailable) {
                return rejectRole();
            }
            const victim = resolveNumberedDeadTarget(game, args[0]);
            if (!victim) return this.reply(m, '❌ Target kebangkitan tidak valid.');
            player.roleState.necromancerAvailable = false;
            game.nightActions.necromancerTarget = victim.jid;
            return this.reply(
                m,
                `✅ Ritual dimulai. *${victim.name}* akan bangkit saat malam berakhir.`
            );
        }

        return rejectRole();
    }

    async resolveNightPhase(groupJid, expectedPhase, expectedVersion) {
        const game = this.manager.get(groupJid);
        if (!game || !claimTransition(game, expectedPhase, expectedVersion)) return false;
        this.manager.clearTimer(game, 'phase');

        try {
            const result = resolveNight(game);
            if (result.seer && result.seerTarget) {
                await this.safeSend(
                    game.runtime.sock,
                    result.seer.privateJid,
                    `*SEER — HASIL TERAWANGAN*\n\nIdentitas *${result.seerTarget.name}* adalah:\n_${roleLabel(
                        result.seerTarget.role
                    )}_`
                );
            }
            if (result.sorcerer && result.sorcererTarget) {
                await this.safeSend(
                    game.runtime.sock,
                    result.sorcerer.privateJid,
                    `*SORCERER — HASIL PENERAWANGAN*\n\nAura *${result.sorcererTarget.name}* ${
                        result.sorcererTarget.role === ROLES.SEER
                            ? 'adalah *SEER*.'
                            : '_bukan Seer._'
                    }`
                );
            }

            this.enterPhase(game, PHASES.MORNING);
            const morning = [
                '*⌂ W E R E W O L F — P A G I*',
                '_Cahaya pertama menyentuh desa. Semua pintu mulai terbuka._',
                '',
                '*PAGI TELAH TIBA*',
                '',
            ];
            if (result.magicUsed) {
                morning.push(
                    '*Witch menggunakan Ramuan Ajaib.* _Seluruh pihak Village terlindungi malam ini._',
                    ''
                );
            }
            if (!result.deaths.length) {
                morning.push('_Tidak ada pemain yang ditemukan mati malam ini._');
            } else {
                morning.push('*Korban malam ini:*');
                for (const player of result.deaths) {
                    morning.push(
                        `💀 ${formatName(player)} — ${
                            game.settings.revealRoleOnDeath
                                ? roleLabel(player.role)
                                : 'Role dirahasiakan'
                        }`
                    );
                }
            }
            if (result.revived) {
                morning.push(
                    '',
                    `*Necromancer membangkitkan ${formatName(result.revived)}.*`,
                    `Role yang kembali: _${roleLabel(result.revived.role)}_`
                );
            }
            morning.push('', `Pemain tersisa: *${alivePlayers(game).length}*`);
            await this.sendVisual(
                game.runtime.sock,
                game.groupJid,
                morning.join('\n'),
                WEREWOLF_MEDIA.morning,
                mentionsOf([...result.deaths, result.revived])
            );

            await this.continueAfterDeaths(game, result.deaths, PHASES.DISCUSSION);
            return true;
        } finally {
            releaseTransition(game);
        }
    }

    async continueAfterDeaths(game, deaths, nextPhase) {
        const hunter =
            deaths.find((player) => player.role === ROLES.HUNTER) || this.takeQueuedHunter(game);
        if (hunter) {
            await this.startHunterShot(game, hunter, { mode: 'BEGIN', phase: nextPhase });
            return;
        }
        if (await this.finishIfWon(game)) return;
        if (nextPhase === PHASES.DISCUSSION) await this.beginDiscussion(game);
        else await this.beginNight(game);
    }

    takeQueuedHunter(game) {
        while (game.queuedHunterJids?.length) {
            const jid = game.queuedHunterJids.shift();
            const hunter = game.players.find(
                (player) => player.jid === jid && player.role === ROLES.HUNTER
            );
            if (hunter) return hunter;
        }
        return null;
    }

    async startHunterShot(game, hunter, afterHunter) {
        if (hunter.roleState.hunterShotAvailable === false) {
            await this.continueAfterHunter(game, afterHunter);
            return;
        }
        hunter.roleState.hunterShotAvailable = false;
        game.queuedHunterJids = (game.queuedHunterJids || []).filter((jid) => jid !== hunter.jid);
        this.enterPhase(game, PHASES.HUNTER_SHOT);
        game.pendingHunterJid = hunter.jid;
        game.afterHunter = afterHunter;
        await this.sendVisual(
            game.runtime.sock,
            game.groupJid,
            `*HUNTER — TEMBAKAN TERAKHIR*\n_Hunter telah mati, tetapi senjatanya belum terdiam._\n\nWaktu: *${Math.round(
                game.settings.hunterShotDurationMs / 1000
            )} detik*`,
            WEREWOLF_MEDIA.hunter
        );
        await this.safeSend(
            game.runtime.sock,
            hunter.privateJid,
            `*HUNTER — TEMBAKAN TERAKHIR*\n_Pilih siapa yang akan ikut bersamamu._\n\n${targetList(
                game,
                (target) => target.jid !== hunter.jid
            )}\n\n${command('.ww shoot <nomor>')}`
        );
        this.setPhaseTimer(
            game,
            game.settings.hunterShotDurationMs,
            (groupJid, phase, version) => this.expireHunterShot(groupJid, phase, version),
            'Hunter'
        );
    }

    captureResumeState(game) {
        const durations = {
            [PHASES.NIGHT]: game.settings.nightDurationMs,
            [PHASES.DISCUSSION]: game.settings.discussionDurationMs,
            [PHASES.VOTING]: game.settings.votingDurationMs,
        };
        const duration = durations[game.phase];
        if (!duration) return { mode: 'BEGIN', phase: PHASES.NIGHT };
        const elapsed = Date.now() - game.phaseStartedAt;
        return {
            mode: 'RESUME',
            phase: game.phase,
            remainingMs: Math.max(1_000, duration - elapsed),
        };
    }

    async continueAfterHunter(game, next) {
        if (await this.finishIfWon(game)) return;
        if (!next || next.mode === 'BEGIN') {
            if (next?.phase === PHASES.DISCUSSION) await this.beginDiscussion(game);
            else if (next?.phase === PHASES.VOTING) await this.beginVoting(game);
            else await this.beginNight(game);
            return;
        }

        this.enterPhase(game, next.phase);
        await this.safeSend(
            game.runtime.sock,
            game.groupJid,
            `▶️ Fase *${next.phase}* dilanjutkan setelah tembakan Hunter.`
        );
        if (next.phase === PHASES.NIGHT) {
            this.setPhaseTimer(
                game,
                next.remainingMs,
                (groupJid, phase, version) => this.resolveNightPhase(groupJid, phase, version),
                'Malam'
            );
        } else if (next.phase === PHASES.DISCUSSION) {
            this.setPhaseTimer(
                game,
                next.remainingMs,
                (groupJid, phase, version) => this.expireDiscussion(groupJid, phase, version),
                'Diskusi'
            );
        } else {
            this.setPhaseTimer(
                game,
                next.remainingMs,
                (groupJid, phase, version) => this.resolveVoting(groupJid, phase, version),
                'Voting'
            );
        }
    }

    async handleHunterShot(sock, m, value) {
        if (m.isGroup) return this.reply(m, GENERIC_SECRET_ERROR);
        const { game, player } = this.getContext(m);
        if (
            !game ||
            !player ||
            game.phase !== PHASES.HUNTER_SHOT ||
            game.pendingHunterJid !== player.jid ||
            game.transitionLock
        ) {
            return this.reply(m, '⚠️ Tembakan Hunter tidak tersedia saat ini.');
        }
        const target = resolveNumberedTarget(game, value, { excludeJid: player.jid });
        if (!target) return this.reply(m, '❌ Target tembakan tidak valid.');
        const expectedVersion = game.phaseVersion;
        if (!claimTransition(game, PHASES.HUNTER_SHOT, expectedVersion)) {
            return this.reply(m, '⏳ Tembakan sedang diproses.');
        }
        this.manager.clearTimer(game, 'phase');
        try {
            target.alive = false;
            target.deathCause = 'HUNTER_SHOT';
            game.runtime.sock = sock;
            await this.safeSend(
                sock,
                game.groupJid,
                `*SATU TEMBAKAN TERDENGAR*\n\nHunter menembak ${formatName(target)}.\nRole korban: _${roleLabel(target.role)}_`,
                [target.jid]
            );
            const nextPhase = game.afterHunter;
            game.pendingHunterJid = null;
            game.afterHunter = null;
            await this.continueAfterHunter(game, nextPhase);
            return null;
        } finally {
            releaseTransition(game);
        }
    }

    async expireHunterShot(groupJid, expectedPhase, expectedVersion) {
        const game = this.manager.get(groupJid);
        if (!game || !claimTransition(game, expectedPhase, expectedVersion)) return false;
        this.manager.clearTimer(game, 'phase');
        try {
            const nextPhase = game.afterHunter;
            game.pendingHunterJid = null;
            game.afterHunter = null;
            await this.safeSend(
                game.runtime.sock,
                game.groupJid,
                '*Tembakan tidak pernah terdengar.*\n_Hunter membiarkan waktunya habis._'
            );
            await this.continueAfterHunter(game, nextPhase);
            return true;
        } finally {
            releaseTransition(game);
        }
    }

    async startAlphaConversion(game, alpha) {
        const candidates = alivePlayers(game).filter(
            (player) => player.faction !== FACTIONS.WEREWOLF
        );
        if (!candidates.length || alpha.roleState.alphaConversionAvailable === false) {
            if (!(await this.finishIfWon(game))) await this.beginNight(game);
            return;
        }

        alpha.roleState.alphaConversionAvailable = false;
        this.enterPhase(game, PHASES.ALPHA_CONVERT);
        game.pendingAlphaJid = alpha.jid;
        await this.sendVisual(
            game.runtime.sock,
            game.groupJid,
            `*ALPHA WEREWOLF TELAH TUMBANG*\n_Kutukannya masih mencari pewaris._\n\nWaktu: *${Math.round(
                game.settings.alphaConvertDurationMs / 1000
            )} detik*`,
            WEREWOLF_MEDIA.night
        );
        await this.safeSend(
            game.runtime.sock,
            alpha.privateJid,
            `*ALPHA — WARISKAN KUTUKAN*\n_Pilih satu pemain hidup untuk menjadi Werewolf._\n\n${targetList(
                game,
                (target) => target.faction !== FACTIONS.WEREWOLF
            )}\n\n${command('.ww convert <nomor>')}`
        );
        this.setPhaseTimer(
            game,
            game.settings.alphaConvertDurationMs,
            (groupJid, phase, version) => this.expireAlphaConversion(groupJid, phase, version),
            'Warisan Alpha'
        );
    }

    async handleAlphaConvert(sock, m, value) {
        if (m.isGroup) return this.reply(m, GENERIC_SECRET_ERROR);
        const { game, player } = this.getContext(m);
        if (
            !game ||
            !player ||
            player.role !== ROLES.ALPHA_WEREWOLF ||
            game.phase !== PHASES.ALPHA_CONVERT ||
            game.pendingAlphaJid !== player.jid ||
            game.transitionLock
        ) {
            return this.reply(m, '⚠️ Warisan Alpha tidak tersedia saat ini.');
        }

        const target = resolveNumberedTarget(game, value, {
            predicate: (candidate) => candidate.faction !== FACTIONS.WEREWOLF,
        });
        if (!target) return this.reply(m, '❌ Target konversi tidak valid.');
        const expectedVersion = game.phaseVersion;
        if (!claimTransition(game, PHASES.ALPHA_CONVERT, expectedVersion)) {
            return this.reply(m, '⏳ Konversi sedang diproses.');
        }
        this.manager.clearTimer(game, 'phase');
        try {
            const converted = {
                ...target,
                role: ROLES.WEREWOLF,
                faction: FACTIONS.WEREWOLF,
            };
            try {
                await this.sendRole(sock, converted, roleMessage(game, converted));
            } catch (error) {
                logger.warn(
                    `Werewolf konversi gagal dikirim ke ${target.privateJid}: ${error.message}`
                );
                game.phase = PHASES.ALPHA_CONVERT;
                game.phaseStartedAt = Date.now();
                game.phaseVersion += 1;
                this.setPhaseTimer(
                    game,
                    game.settings.alphaConvertDurationMs,
                    (groupJid, phase, version) =>
                        this.expireAlphaConversion(groupJid, phase, version),
                    'Warisan Alpha'
                );
                await this.reply(m, '❌ Role baru gagal dikirim. Pilih target lagi.');
                return null;
            }

            target.convertedFrom = target.role;
            target.role = ROLES.WEREWOLF;
            target.faction = FACTIONS.WEREWOLF;
            target.roleState = {
                guardianAvailable: false,
                witchPoisonAvailable: false,
                witchMagicAvailable: false,
                witchPotionUsedRound: null,
                hunterShotAvailable: false,
                alphaConversionAvailable: false,
                necromancerAvailable: false,
            };
            game.pendingAlphaJid = null;
            game.runtime.sock = sock;

            await Promise.allSettled(
                wolfTeam(game)
                    .filter((member) => member !== target && member.alive)
                    .map((member) =>
                        this.send(
                            sock,
                            member.privateJid,
                            `*Kutukan Alpha berhasil.*\n_${target.name} kini menjadi Werewolf._`
                        )
                    )
            );
            await this.safeSend(
                sock,
                game.groupJid,
                '*Kutukan Alpha menemukan pewaris baru.*\n_Namun identitasnya tetap tersembunyi di antara warga._'
            );
            await this.reply(m, `✅ *${target.name}* telah menjadi Werewolf.`);
            if (!(await this.finishIfWon(game))) await this.beginNight(game);
            return null;
        } finally {
            releaseTransition(game);
        }
    }

    async expireAlphaConversion(groupJid, expectedPhase, expectedVersion) {
        const game = this.manager.get(groupJid);
        if (!game || !claimTransition(game, expectedPhase, expectedVersion)) return false;
        this.manager.clearTimer(game, 'phase');
        try {
            game.pendingAlphaJid = null;
            await this.safeSend(
                game.runtime.sock,
                game.groupJid,
                '*Warisan Alpha telah memudar.*\n_Tidak ada pewaris yang dipilih._'
            );
            if (!(await this.finishIfWon(game))) await this.beginNight(game);
            return true;
        } finally {
            releaseTransition(game);
        }
    }

    async beginDiscussion(game) {
        const queuedHunter = this.takeQueuedHunter(game);
        if (queuedHunter) {
            await this.startHunterShot(game, queuedHunter, {
                mode: 'BEGIN',
                phase: PHASES.DISCUSSION,
            });
            return;
        }
        this.enterPhase(game, PHASES.DISCUSSION);
        await this.sendVisual(
            game.runtime.sock,
            game.groupJid,
            `*⌂ W E R E W O L F — D I S K U S I*\n_Dengarkan setiap cerita. Salah satu dari kalian sedang berbohong._\n\nWaktu: *${Math.round(
                game.settings.discussionDurationMs / 1000
            )} detik*`,
            WEREWOLF_MEDIA.discussion
        );
        this.setPhaseTimer(
            game,
            game.settings.discussionDurationMs,
            (groupJid, phase, version) => this.expireDiscussion(groupJid, phase, version),
            'Diskusi'
        );
    }

    async expireDiscussion(groupJid, expectedPhase, expectedVersion) {
        const game = this.manager.get(groupJid);
        if (!game || !claimTransition(game, expectedPhase, expectedVersion)) return false;
        this.manager.clearTimer(game, 'phase');
        try {
            await this.beginVoting(game);
            return true;
        } finally {
            releaseTransition(game);
        }
    }

    async beginVoting(game) {
        const queuedHunter = this.takeQueuedHunter(game);
        if (queuedHunter) {
            await this.startHunterShot(game, queuedHunter, {
                mode: 'BEGIN',
                phase: PHASES.VOTING,
            });
            return;
        }
        this.enterPhase(game, PHASES.VOTING);
        game.votes = new Map();
        const list = targetList(game);
        await this.sendVisual(
            game.runtime.sock,
            game.groupJid,
            `*⌂ W E R E W O L F — V O T I N G*\n_Saatnya desa menentukan siapa yang harus dieliminasi._\n\n${list}\n\nGunakan ${command('.ww vote <nomor>')}\nWaktu: *${Math.round(
                game.settings.votingDurationMs / 1000
            )} detik*`,
            WEREWOLF_MEDIA.voting,
            mentionsOf(alivePlayers(game))
        );
        this.setPhaseTimer(
            game,
            game.settings.votingDurationMs,
            (groupJid, phase, version) => this.resolveVoting(groupJid, phase, version),
            'Voting'
        );
    }

    async handleVote(sock, m, value) {
        if (!m.isGroup)
            return this.reply(m, `${command('.ww vote')} _hanya dapat digunakan di grup game._`);
        const { game, player } = this.getContext(m);
        if (!game || !player || !player.alive || game.phase !== PHASES.VOTING) {
            return this.reply(m, '⚠️ Voting tidak tersedia saat ini.');
        }
        if (game.transitionLock) return this.reply(m, '⏳ Voting sedang diproses.');
        const target = resolveNumberedTarget(game, value);
        if (!target) return this.reply(m, '❌ Target voting tidak valid.');
        game.runtime.sock = sock;
        game.votes.set(player.jid, target.jid);
        await this.reply(m, '✅ Vote kamu berhasil dicatat.');

        if (game.votes.size === alivePlayers(game).length) {
            await this.resolveVoting(game.groupJid, PHASES.VOTING, game.phaseVersion);
        }
        return null;
    }

    async resolveVoting(groupJid, expectedPhase, expectedVersion) {
        const game = this.manager.get(groupJid);
        if (!game || !claimTransition(game, expectedPhase, expectedVersion)) return false;
        this.manager.clearTimer(game, 'phase');
        try {
            const counts = new Map();
            for (const targetJid of game.votes.values()) {
                counts.set(targetJid, (counts.get(targetJid) || 0) + 1);
            }
            const highest = counts.size ? Math.max(...counts.values()) : 0;
            const leaders = [...counts.entries()].filter(([, count]) => count === highest);

            if (!highest || leaders.length !== 1) {
                const tied = leaders
                    .map(([jid, count]) => {
                        const target = game.players.find((candidate) => candidate.jid === jid);
                        return target ? `${formatName(target)} — ${count} vote` : null;
                    })
                    .filter(Boolean);
                await this.safeSend(
                    game.runtime.sock,
                    game.groupJid,
                    [
                        '*⌂ W E R E W O L F — HASIL VOTING*',
                        '',
                        '*VOTING SERI*',
                        ...tied,
                        tied.length ? '' : '_Tidak ada vote yang masuk._',
                        '_Tidak ada pemain yang dieliminasi hari ini. Malam berikutnya segera tiba._',
                    ].join('\n'),
                    mentionsOf(
                        leaders
                            .map(([jid]) => game.players.find((candidate) => candidate.jid === jid))
                            .filter(Boolean)
                    )
                );
                if (await this.finishIfWon(game)) return true;
                await this.beginNight(game);
                return true;
            }

            const eliminated = game.players.find((player) => player.jid === leaders[0][0]);
            if (!eliminated || !eliminated.alive) {
                await this.beginNight(game);
                return true;
            }
            eliminated.alive = false;
            eliminated.deathCause = 'VOTE';
            await this.safeSend(
                game.runtime.sock,
                game.groupJid,
                `*⌂ W E R E W O L F — EKSEKUSI*\n\n${formatName(eliminated)} telah dipilih oleh desa.\nRole: _${roleLabel(
                    eliminated.role
                )}_`,
                [eliminated.jid]
            );

            if (eliminated.role === ROLES.JESTER) {
                await this.finishGame(
                    game,
                    '*JESTER MENANG!*\n_Desa memenuhi satu-satunya keinginan Jester: dieksekusi melalui voting._'
                );
                return true;
            }
            if (
                eliminated.role === ROLES.ALPHA_WEREWOLF &&
                eliminated.roleState.alphaConversionAvailable !== false
            ) {
                await this.startAlphaConversion(game, eliminated);
                return true;
            }
            await this.continueAfterDeaths(game, [eliminated], PHASES.NIGHT);
            return true;
        } finally {
            releaseTransition(game);
        }
    }

    async finishIfWon(game) {
        if (game.pendingAlphaJid) return false;
        const winner = determineWinner(game);
        if (!winner) return false;
        const text =
            winner === FACTIONS.VILLAGE
                ? '*VILLAGE MENANG!*\n_Seluruh pihak Werewolf berhasil dieliminasi. Desa kembali aman._'
                : '*WEREWOLF MENANG!*\n_Jumlah mereka tak lagi dapat dilawan. Desa telah dikuasai._';
        await this.finishGame(game, text);
        return true;
    }

    async finishGame(game, headline) {
        const duration = Math.max(1, Math.round((Date.now() - game.createdAt) / 60_000));
        const media = headline.includes('VILLAGE')
            ? WEREWOLF_MEDIA.villageWin
            : headline.includes('JESTER')
              ? WEREWOLF_MEDIA.jesterWin
              : WEREWOLF_MEDIA.wolfWin;
        const roles = game.players.map(
            (player) =>
                `${ROLE_META[player.role]?.emoji || '•'} ${player.name} — ${roleLabel(player.role)}`
        );
        await this.sendVisual(
            game.runtime.sock,
            game.groupJid,
            [
                '*⌂ W E R E W O L F — G A M E  O V E R*',
                '',
                headline,
                '',
                '*Seluruh Role:*',
                ...roles,
                '',
                `*Durasi:* ${duration} menit`,
                `*Ronde:* ${game.round}`,
            ].join('\n'),
            media,
            mentionsOf(game.players)
        );
        this.manager.delete(game.groupJid);
    }

    async handleParticipantRemoval(sock, groupJid, rawJids) {
        const game = this.manager.get(groupJid);
        if (!game) return false;
        game.runtime.sock = sock;
        const resumeState = this.captureResumeState(game);
        let removedHunter = null;
        const previousHostJid = game.hostJid;
        for (const participant of rawJids) {
            const aliases = [
                typeof participant === 'string' ? participant : participant?.id,
                typeof participant === 'object' ? participant?.jid : null,
                typeof participant === 'object' ? participant?.lid : null,
            ]
                .map(normalizeIdentity)
                .filter(Boolean);
            if (!aliases.length) continue;
            const player = this.manager.findPlayer(game, aliases);
            if (!player) continue;

            if (game.phase === PHASES.LOBBY) {
                this.manager.removePlayer(game, player);
                await this.safeSend(
                    sock,
                    groupJid,
                    `${formatName(player)} keluar dari lobby Werewolf.`,
                    [player.jid]
                );
                continue;
            }

            if (player.alive) {
                player.alive = false;
                player.deathCause = 'LEFT_GROUP';
                game.votes?.delete(player.jid);
                game.nightActions?.werewolfVotes?.delete(player.jid);
                if (player.role === ROLES.HUNTER) removedHunter = player;
                await this.safeSend(
                    sock,
                    groupJid,
                    `${formatName(player)} keluar dari grup dan dieliminasi dari permainan.`,
                    [player.jid]
                );
            }
        }

        if (!game.players.length) {
            this.manager.delete(groupJid);
            return true;
        }
        const currentHost = game.players.find((player) => player.jid === game.hostJid);
        if (!currentHost || (game.phase !== PHASES.LOBBY && !currentHost.alive)) {
            const replacement =
                game.players.find((player) => player.alive) || game.players[0] || null;
            if (replacement) game.hostJid = replacement.jid;
        }
        if (game.hostJid !== previousHostJid) {
            const replacement = game.players.find((player) => player.jid === game.hostJid);
            await this.safeSend(
                sock,
                groupJid,
                `👑 Host Werewolf dipindahkan ke ${formatName(replacement)}.`,
                [replacement.jid]
            );
        }

        if (removedHunter) {
            if (game.transitionLock) {
                if (!game.queuedHunterJids.includes(removedHunter.jid)) {
                    game.queuedHunterJids.push(removedHunter.jid);
                }
            } else {
                await this.startHunterShot(game, removedHunter, resumeState);
                return true;
            }
        }
        if (game.phase !== PHASES.LOBBY && !game.transitionLock) await this.finishIfWon(game);
        return true;
    }
}

export const werewolfService = new WerewolfService();

export const recordWerewolfPrivateContact = (m) => werewolfService.recordPrivateContact(m);

export const handleWerewolfParticipantRemoval = (sock, groupJid, participants) =>
    werewolfService.handleParticipantRemoval(sock, groupJid, participants);

import { FACTIONS, PHASES, ROLES } from '../constants.js';
import { newNightActions } from '../engine.js';
import { WerewolfGameManager } from '../manager.js';
import { WerewolfService } from '../service.js';

const jid = (number) => `${number}@s.whatsapp.net`;

const privateMessage = (number, body = '.ww ready') => {
    const sender = jid(number);
    const replies = [];
    return {
        chat: sender,
        sender,
        pushName: `Player ${number}`,
        isGroup: false,
        key: { remoteJid: sender },
        body,
        replies,
        reply: async (text, options = {}) => {
            replies.push({ text, options });
            return { text };
        },
    };
};

const groupMessage = (number, groupJid, body) => {
    const sender = jid(number);
    const replies = [];
    return {
        chat: groupJid,
        sender,
        pushName: `Player ${number}`,
        isGroup: true,
        isOwner: false,
        metadata: { participants: [] },
        key: { remoteJid: groupJid, participant: sender },
        body,
        replies,
        reply: async (text, options = {}) => {
            replies.push({ text, options });
            return { text };
        },
    };
};

const fakeSocket = ({ failJid = null } = {}) => {
    const sent = [];
    return {
        sent,
        sendMessage: async (target, content) => {
            if (target === failJid) throw new Error('simulated delivery failure');
            sent.push({ target, content });
            return { key: { id: String(sent.length) } };
        },
    };
};

const buildManagedGame = (manager, groupJid, count, sock) => {
    for (let number = 1; number <= count; number += 1) {
        manager.markPrivateContact([jid(number)], jid(number));
    }
    const game = manager.create(groupJid, {
        jid: jid(1),
        aliases: [jid(1)],
        name: 'Player 1',
    });
    for (let number = 2; number <= count; number += 1) {
        manager.addPlayer(game, {
            jid: jid(number),
            aliases: [jid(number)],
            name: `Player ${number}`,
        });
    }
    game.runtime.sock = sock;
    for (const candidate of game.players) {
        candidate.role = ROLES.VILLAGER;
        candidate.faction = FACTIONS.VILLAGE;
        candidate.alive = true;
        candidate.roleState = {};
    }
    return game;
};

const waitFor = async (predicate, timeoutMs = 500) => {
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt > timeoutMs) throw new Error('waitFor timeout');
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
};

describe('Werewolf service', () => {
    let manager;
    let service;
    const groupJid = '12345@g.us';

    beforeEach(() => {
        manager = new WerewolfGameManager();
        service = new WerewolfService({ manager, random: () => 0.25 });
    });

    afterEach(() => manager.reset());

    test('private ready, create, join, lalu start mengirim semua role', async () => {
        const sock = fakeSocket();
        for (let number = 1; number <= 5; number += 1) {
            await service.execute(sock, privateMessage(number), ['ready']);
        }
        await service.execute(sock, groupMessage(1, groupJid, '.ww create'), ['create']);
        for (let number = 2; number <= 5; number += 1) {
            await service.execute(sock, groupMessage(number, groupJid, '.ww join'), ['join']);
        }

        const game = manager.get(groupJid);
        game.settings.nightDurationMs = 60_000;
        await service.execute(sock, groupMessage(1, groupJid, '.ww start'), ['start']);

        expect(game.phase).toBe(PHASES.NIGHT);
        expect(game.players.every((candidate) => candidate.role)).toBe(true);
        for (let number = 1; number <= 5; number += 1) {
            expect(sock.sent.some((message) => message.target === jid(number))).toBe(true);
        }
    });

    test('.ww tutor menampilkan alur dan seluruh command role', async () => {
        const sock = fakeSocket();
        const message = groupMessage(1, groupJid, '.ww tutor');

        await service.execute(sock, message, ['tutor']);

        const tutorial = message.replies.at(-1).text;
        expect(tutorial).toContain('W E R E W O L F — T U T O R');
        expect(tutorial).toContain('.ww ready');
        expect(tutorial).toContain('.ww kill <nomor>');
        expect(tutorial).toContain('.ww potion magic');
        expect(tutorial).toContain('.ww vote <nomor>');
        expect(tutorial).toContain('`.ww ready`');
        expect(tutorial).toContain('*A. PERSIAPAN*');
        expect(tutorial).toContain('_Di desa ini');
        expect(tutorial).not.toContain('*.ww');
        expect(tutorial).not.toMatch(/(^|\s)\.(kill|heal|guard|vote)\b/);
    });

    test('.ww roles menampilkan Necromancer pada komposisi 12 pemain', async () => {
        const sock = fakeSocket();
        const message = groupMessage(1, groupJid, '.ww roles 12');

        await service.execute(sock, message, ['roles', '12']);

        const composition = message.replies.at(-1).text;
        expect(composition).toContain('12 pemain');
        expect(composition).toContain('Necromancer');
    });

    test('satu pemain tidak bisa mengikuti dua game aktif', async () => {
        const sock = fakeSocket();
        await service.execute(sock, privateMessage(1), ['ready']);
        await service.execute(sock, groupMessage(1, groupJid, '.ww create'), ['create']);
        const other = groupMessage(1, 'other@g.us', '.ww create');

        await service.execute(sock, other, ['create']);

        expect(manager.get('other@g.us')).toBeNull();
        expect(other.replies.at(-1).text).toContain('game Werewolf lain');
    });

    test('identitas LID dan nomor telepon diarahkan ke pemain yang sama', async () => {
        const sock = fakeSocket();
        const privateReady = privateMessage(1);
        privateReady.sender = '90001@lid';
        privateReady.chat = '90001@lid';
        privateReady.key = {
            remoteJid: '90001@lid',
            remoteJidAlt: jid(1),
        };
        await service.execute(sock, privateReady, ['ready']);

        const create = groupMessage(1, groupJid, '.ww create');
        create.key.participantAlt = '90001@lid';
        await service.execute(sock, create, ['create']);

        const game = manager.get(groupJid);
        expect(game).not.toBeNull();
        expect(manager.getByPlayerAliases(['90001@lid'])).toBe(game);
        expect(manager.getByPlayerAliases([jid(1)])).toBe(game);
        expect(game.players[0].privateJid).toBe('90001@lid');
    });

    test('alias JID bot tidak membuat action Werewolf memakai role pemain lain', async () => {
        const sock = fakeSocket();
        const game = buildManagedGame(manager, groupJid, 5, sock);
        const villager = game.players[0];
        const wolf = game.players[1];
        const sharedBotJid = '628157695152@s.whatsapp.net';
        manager.bindAliases(game, villager, [sharedBotJid]);
        wolf.role = ROLES.WEREWOLF;
        wolf.faction = FACTIONS.WEREWOLF;
        game.phase = PHASES.NIGHT;
        game.nightActions = newNightActions();

        expect(manager.findPlayer(game, [wolf.jid, sharedBotJid])).toBe(wolf);

        const message = privateMessage(2, '.ww kill 1');
        message.key.remoteJidAlt = sharedBotJid;
        await service.execute(sock, message, ['kill', '1']);

        expect(game.nightActions.werewolfVotes.get(wolf.jid)).toBe(villager.jid);
        expect(message.replies.at(-1).text).toContain('Vote korban dicatat');
    });

    test('start dibatalkan dan assignment dibersihkan jika satu PM gagal', async () => {
        const readySock = fakeSocket();
        for (let number = 1; number <= 5; number += 1) {
            await service.execute(readySock, privateMessage(number), ['ready']);
        }
        await service.execute(readySock, groupMessage(1, groupJid, '.ww create'), ['create']);
        for (let number = 2; number <= 5; number += 1) {
            await service.execute(readySock, groupMessage(number, groupJid, '.ww join'), ['join']);
        }

        const failedSock = fakeSocket({ failJid: jid(3) });
        const startMessage = groupMessage(1, groupJid, '.ww start');
        await service.execute(failedSock, startMessage, ['start']);
        const game = manager.get(groupJid);

        expect(game.phase).toBe(PHASES.LOBBY);
        expect(game.players.every((candidate) => candidate.role === null)).toBe(true);
        expect(startMessage.replies.at(-1).text).toContain('Start dibatalkan');
    });

    test('Guardian sekali pakai dan Witch maksimal satu ramuan per malam', async () => {
        const sock = fakeSocket();
        for (let number = 1; number <= 11; number += 1) {
            await service.execute(sock, privateMessage(number), ['ready']);
        }
        await service.execute(sock, groupMessage(1, groupJid, '.ww create'), ['create']);
        for (let number = 2; number <= 11; number += 1) {
            await service.execute(sock, groupMessage(number, groupJid, '.ww join'), ['join']);
        }
        await service.execute(sock, groupMessage(1, groupJid, '.ww start'), ['start']);

        const game = manager.get(groupJid);
        const guardian = game.players.find((candidate) => candidate.role === ROLES.GUARDIAN);
        const witch = game.players.find((candidate) => candidate.role === ROLES.WITCH);

        const guardMessage = privateMessage(guardian.jid.split('@')[0], '.ww guard 1');
        await service.execute(sock, guardMessage, ['guard', '1']);
        await service.execute(sock, guardMessage, ['guard', '2']);
        expect(guardian.roleState.guardianAvailable).toBe(false);
        expect(guardMessage.replies.at(-1).text).toContain('tidak tersedia');

        const magicMessage = privateMessage(witch.jid.split('@')[0], '.ww potion magic');
        await service.execute(sock, magicMessage, ['potion', 'magic']);
        await service.execute(sock, magicMessage, ['potion', 'poison', '1']);
        expect(witch.roleState.witchMagicAvailable).toBe(false);
        expect(witch.roleState.witchPoisonAvailable).toBe(true);
        expect(magicMessage.replies.at(-1).text).toContain('sudah menggunakan satu ramuan');
    });

    test('host harus mengonfirmasi stop ketika game sudah berjalan', async () => {
        const sock = fakeSocket();
        await service.execute(sock, privateMessage(1), ['ready']);
        await service.execute(sock, groupMessage(1, groupJid, '.ww create'), ['create']);
        const game = manager.get(groupJid);
        game.phase = PHASES.NIGHT;

        await service.execute(sock, groupMessage(1, groupJid, '.ww stop'), ['stop']);
        expect(manager.get(groupJid)).toBe(game);

        await service.execute(sock, groupMessage(1, groupJid, '.ww stop confirm'), [
            'stop',
            'confirm',
        ]);
        expect(manager.get(groupJid)).toBeNull();
    });

    test('host dapat mengubah timer dan mengeluarkan pemain selama lobby', async () => {
        const sock = fakeSocket();
        await service.execute(sock, privateMessage(1), ['ready']);
        await service.execute(sock, privateMessage(2), ['ready']);
        await service.execute(sock, groupMessage(1, groupJid, '.ww create'), ['create']);
        await service.execute(sock, groupMessage(2, groupJid, '.ww join'), ['join']);

        await service.execute(sock, groupMessage(1, groupJid, '.ww settings night 45'), [
            'settings',
            'night',
            '45',
        ]);
        const game = manager.get(groupJid);
        expect(game.settings.nightDurationMs).toBe(45_000);

        await service.execute(sock, groupMessage(1, groupJid, '.ww kick 2'), ['kick', '2']);
        expect(game.players).toHaveLength(1);
        expect(manager.getByPlayerAliases([jid(2)])).toBeNull();
    });

    test('voting seri tidak membunuh pemain dan langsung lanjut malam', async () => {
        const sock = fakeSocket();
        const game = buildManagedGame(manager, groupJid, 5, sock);
        game.players[0].role = ROLES.WEREWOLF;
        game.players[0].faction = FACTIONS.WEREWOLF;
        game.phase = PHASES.VOTING;
        game.phaseVersion = 4;
        game.votes = new Map([
            [game.players[0].jid, game.players[1].jid],
            [game.players[1].jid, game.players[2].jid],
        ]);

        await service.resolveVoting(groupJid, PHASES.VOTING, 4);

        expect(game.players.every((candidate) => candidate.alive)).toBe(true);
        expect(game.phase).toBe(PHASES.NIGHT);
        expect(sock.sent.some((message) => message.content.text.includes('VOTING SERI'))).toBe(
            true
        );
    });

    test('Hunter yang dieksekusi masuk fase tembakan terakhir', async () => {
        const sock = fakeSocket();
        const game = buildManagedGame(manager, groupJid, 6, sock);
        game.players[0].role = ROLES.WEREWOLF;
        game.players[0].faction = FACTIONS.WEREWOLF;
        const hunter = game.players[1];
        hunter.role = ROLES.HUNTER;
        game.phase = PHASES.VOTING;
        game.phaseVersion = 2;
        game.votes = new Map([
            [game.players[0].jid, hunter.jid],
            [game.players[2].jid, hunter.jid],
        ]);

        await service.resolveVoting(groupJid, PHASES.VOTING, 2);

        expect(game.phase).toBe(PHASES.HUNTER_SHOT);
        expect(game.pendingHunterJid).toBe(hunter.jid);
    });

    test('Jester yang dieksekusi langsung memenangkan game', async () => {
        const sock = fakeSocket();
        const game = buildManagedGame(manager, groupJid, 8, sock);
        game.players[0].role = ROLES.WEREWOLF;
        game.players[0].faction = FACTIONS.WEREWOLF;
        const jester = game.players[1];
        jester.role = ROLES.JESTER;
        jester.faction = FACTIONS.NEUTRAL;
        game.phase = PHASES.VOTING;
        game.phaseVersion = 3;
        game.votes = new Map([
            [game.players[0].jid, jester.jid],
            [game.players[2].jid, jester.jid],
        ]);

        await service.resolveVoting(groupJid, PHASES.VOTING, 3);

        expect(manager.get(groupJid)).toBeNull();
        expect(sock.sent.some((message) => message.content.text.includes('JESTER MENANG'))).toBe(
            true
        );
    });

    test('Alpha Werewolf yang divote dapat mengubah satu pemain menjadi Werewolf', async () => {
        const sock = fakeSocket();
        const game = buildManagedGame(manager, groupJid, 9, sock);
        const alpha = game.players[0];
        const wolf = game.players[1];
        const target = game.players[2];
        alpha.role = ROLES.ALPHA_WEREWOLF;
        alpha.faction = FACTIONS.WEREWOLF;
        alpha.roleState = { alphaConversionAvailable: true };
        wolf.role = ROLES.WEREWOLF;
        wolf.faction = FACTIONS.WEREWOLF;
        game.phase = PHASES.VOTING;
        game.phaseVersion = 6;
        game.votes = new Map([
            [wolf.jid, alpha.jid],
            [target.jid, alpha.jid],
        ]);

        await service.resolveVoting(groupJid, PHASES.VOTING, 6);
        expect(game.phase).toBe(PHASES.ALPHA_CONVERT);

        const conversion = privateMessage(1, '.ww convert 1');
        await service.execute(sock, conversion, ['convert', '1']);

        expect(target.role).toBe(ROLES.WEREWOLF);
        expect(target.convertedFrom).toBe(ROLES.VILLAGER);
        expect(game.pendingAlphaJid).toBeNull();
        expect(game.phase).toBe(PHASES.NIGHT);
    });

    test('Sorcerer dapat mencari Seer tetapi tidak dapat melakukan kill', async () => {
        const sock = fakeSocket();
        const game = buildManagedGame(manager, groupJid, 10, sock);
        const sorcerer = game.players[0];
        const seer = game.players[1];
        sorcerer.role = ROLES.SORCERER;
        sorcerer.faction = FACTIONS.WEREWOLF;
        seer.role = ROLES.SEER;
        game.phase = PHASES.NIGHT;
        game.phaseVersion = 2;
        game.nightActions = newNightActions();

        const scry = privateMessage(1, '.ww scry 1');
        await service.execute(sock, scry, ['scry', '1']);
        expect(game.nightActions.sorcererTarget).toBe(seer.jid);

        const kill = privateMessage(1, '.ww kill 1');
        await service.execute(sock, kill, ['kill', '1']);
        expect(kill.replies.at(-1).text).toContain('tidak tersedia');

        await service.resolveNightPhase(groupJid, PHASES.NIGHT, 2);
        expect(
            sock.sent.some(
                (message) =>
                    message.target === sorcerer.privateJid &&
                    message.content.text?.includes('adalah *SEER*')
            )
        ).toBe(true);
    });

    test('Seer menerima role target secara langsung saat target bukan Werewolf', async () => {
        const sock = fakeSocket();
        const game = buildManagedGame(manager, groupJid, 5, sock);
        const seer = game.players[0];
        const target = game.players[1];
        seer.role = ROLES.SEER;
        target.role = ROLES.GUARDIAN;
        target.faction = FACTIONS.VILLAGE;
        game.phase = PHASES.NIGHT;
        game.phaseVersion = 8;
        game.nightActions = newNightActions();

        await service.execute(sock, privateMessage(1, '.ww inspect 1'), ['inspect', '1']);
        await service.resolveNightPhase(groupJid, PHASES.NIGHT, 8);

        const result = sock.sent.find(
            (message) =>
                message.target === seer.privateJid &&
                message.content.text?.includes('*SEER — HASIL TERAWANGAN*')
        );
        expect(result?.content.text).toContain('Guardian');
        expect(result?.content.text).not.toContain('bukan Werewolf');
    });

    test('Necromancer membangkitkan satu pemain mati', async () => {
        const sock = fakeSocket();
        const game = buildManagedGame(manager, groupJid, 12, sock);
        const necromancer = game.players[0];
        const dead = game.players[1];
        const wolf = game.players[2];
        necromancer.role = ROLES.NECROMANCER;
        necromancer.roleState = { necromancerAvailable: true };
        dead.alive = false;
        dead.deathCause = 'WEREWOLF';
        wolf.role = ROLES.WEREWOLF;
        wolf.faction = FACTIONS.WEREWOLF;
        game.phase = PHASES.NIGHT;
        game.phaseVersion = 3;
        game.nightActions = newNightActions();

        const revive = privateMessage(1, '.ww revive 1');
        await service.execute(sock, revive, ['revive', '1']);
        expect(game.nightActions.necromancerTarget).toBe(dead.jid);

        await service.resolveNightPhase(groupJid, PHASES.NIGHT, 3);
        expect(dead.alive).toBe(true);
        expect(necromancer.roleState.necromancerAvailable).toBe(false);
        expect(sock.sent.some((message) => message.content.text?.includes('membangkitkan'))).toBe(
            true
        );
    });

    test('Hunter yang keluar grup mendapat last shot dan fase sebelumnya dipause', async () => {
        const sock = fakeSocket();
        const game = buildManagedGame(manager, groupJid, 6, sock);
        game.players[0].role = ROLES.WEREWOLF;
        game.players[0].faction = FACTIONS.WEREWOLF;
        const hunter = game.players[1];
        hunter.role = ROLES.HUNTER;
        game.phase = PHASES.DISCUSSION;
        game.phaseStartedAt = Date.now();
        game.phaseVersion = 2;

        await service.handleParticipantRemoval(sock, groupJid, [hunter.jid]);

        expect(game.phase).toBe(PHASES.HUNTER_SHOT);
        expect(game.pendingHunterJid).toBe(hunter.jid);
        expect(game.afterHunter).toMatchObject({ mode: 'RESUME', phase: PHASES.DISCUSSION });
    });

    test('host aktif yang keluar grup dipindahkan ke pemain hidup berikutnya', async () => {
        const sock = fakeSocket();
        const game = buildManagedGame(manager, groupJid, 5, sock);
        game.players[1].role = ROLES.WEREWOLF;
        game.players[1].faction = FACTIONS.WEREWOLF;
        game.phase = PHASES.DISCUSSION;
        game.phaseStartedAt = Date.now();

        await service.handleParticipantRemoval(sock, groupJid, [game.players[0].jid]);

        expect(game.hostJid).toBe(game.players[1].jid);
        expect(sock.sent.some((message) => message.content.text.includes('Host Werewolf'))).toBe(
            true
        );
    });

    test('timer nyata menjalankan Night ke Morning, Discussion, Voting, lalu Night berikutnya', async () => {
        const sock = fakeSocket();
        const game = buildManagedGame(manager, groupJid, 5, sock);
        game.players[0].role = ROLES.WEREWOLF;
        game.players[0].faction = FACTIONS.WEREWOLF;
        game.settings.nightDurationMs = 20;
        game.settings.discussionDurationMs = 20;
        game.settings.votingDurationMs = 20;
        let sawMorningState = false;
        const originalSend = sock.sendMessage;
        sock.sendMessage = async (target, content) => {
            if (content.text?.includes('PAGI TELAH TIBA')) {
                sawMorningState = game.phase === PHASES.MORNING;
            }
            return originalSend(target, content);
        };

        await service.beginNight(game);
        await waitFor(() => game.round >= 2);

        expect(sawMorningState).toBe(true);
        expect(game.phase).toBe(PHASES.NIGHT);
        expect(game.players.every((candidate) => candidate.alive)).toBe(true);
    });
});

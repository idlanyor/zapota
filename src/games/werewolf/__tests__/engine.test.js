import { FACTIONS, PHASES, ROLES, roleDeckFor } from '../constants.js';
import {
    claimTransition,
    determineWinner,
    newNightActions,
    releaseTransition,
    resolveNight,
} from '../engine.js';

const player = (jid, role, faction) => ({
    jid,
    name: jid,
    role,
    faction,
    alive: true,
    roleState: {},
});

describe('Werewolf engine', () => {
    test.each([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])(
        'distribusi role berjumlah tepat %i pemain',
        (count) => {
            expect(roleDeckFor(count)).toHaveLength(count);
        }
    );

    test('Necromancer mulai muncul pada komposisi 12 pemain', () => {
        for (const count of [12, 13, 14, 15]) {
            const deck = roleDeckFor(count);
            expect(deck).toContain(ROLES.NECROMANCER);
        }
    });

    test('ramuan ajaib melindungi seluruh faction Village dari serangan Werewolf', () => {
        const villager = player('v', ROLES.VILLAGER, FACTIONS.VILLAGE);
        const wolf = player('w', ROLES.WEREWOLF, FACTIONS.WEREWOLF);
        const witch = player('x', ROLES.WITCH, FACTIONS.VILLAGE);
        const game = {
            players: [villager, wolf, witch],
            nightActions: newNightActions(),
        };
        game.nightActions.werewolfVotes.set(wolf.jid, villager.jid);
        game.nightActions.witchAction = { type: 'MAGIC' };

        const result = resolveNight(game);

        expect(result.magicUsed).toBe(true);
        expect(result.deaths).toHaveLength(0);
        expect(villager.alive).toBe(true);
    });

    test('Guardian menahan racun dan charge tidak dikelola oleh resolver', () => {
        const target = player('v', ROLES.VILLAGER, FACTIONS.VILLAGE);
        const witch = player('x', ROLES.WITCH, FACTIONS.VILLAGE);
        const game = {
            players: [target, witch],
            nightActions: newNightActions(),
        };
        game.nightActions.guardianTarget = target.jid;
        game.nightActions.witchAction = { type: 'POISON', targetJid: target.jid };

        const result = resolveNight(game);

        expect(result.deaths).toHaveLength(0);
        expect(target.alive).toBe(true);
    });

    test('Necromancer membangkitkan pemain mati saat malam selesai', () => {
        const necromancer = player('n', ROLES.NECROMANCER, FACTIONS.VILLAGE);
        const target = player('v', ROLES.VILLAGER, FACTIONS.VILLAGE);
        target.alive = false;
        target.deathCause = 'WEREWOLF';
        const game = {
            players: [necromancer, target],
            nightActions: newNightActions(),
        };
        game.nightActions.necromancerTarget = target.jid;

        const result = resolveNight(game);

        expect(result.revived).toBe(target);
        expect(target.alive).toBe(true);
        expect(target.deathCause).toBeNull();
    });

    test('phase transition hanya dapat diklaim satu kali', () => {
        const game = { phase: PHASES.VOTING, phaseVersion: 4, transitionLock: false };
        expect(claimTransition(game, PHASES.VOTING, 4)).toBe(true);
        expect(claimTransition(game, PHASES.VOTING, 4)).toBe(false);
        releaseTransition(game);
        expect(claimTransition(game, PHASES.VOTING, 4)).toBe(false);
    });

    test('Werewolf menang saat jumlahnya sama dengan semua non-Werewolf hidup', () => {
        const game = {
            players: [
                player('w', ROLES.WEREWOLF, FACTIONS.WEREWOLF),
                player('v', ROLES.VILLAGER, FACTIONS.VILLAGE),
            ],
        };
        expect(determineWinner(game)).toBe(FACTIONS.WEREWOLF);
    });
});

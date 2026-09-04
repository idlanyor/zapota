import { FACTIONS, PHASES, ROLE_META, ROLES, roleDeckFor, shuffle } from './constants.js';

export const alivePlayers = (game) => game.players.filter((player) => player.alive);

export const roleLabel = (role) => {
    const meta = ROLE_META[role];
    return meta ? `${meta.emoji} ${meta.name}` : role;
};

export const assignRoles = (game, random = Math.random) => {
    const deck = shuffle(roleDeckFor(game.players.length), random);
    game.players.forEach((player, index) => {
        const role = deck[index];
        player.role = role;
        player.faction = ROLE_META[role].faction;
        player.alive = true;
        player.voteTarget = null;
        player.nightAction = null;
        player.deathCause = null;
        player.roleState = {
            guardianAvailable: role === ROLES.GUARDIAN,
            witchPoisonAvailable: role === ROLES.WITCH,
            witchMagicAvailable: role === ROLES.WITCH,
            witchPotionUsedRound: null,
            hunterShotAvailable: role === ROLES.HUNTER,
            alphaConversionAvailable: role === ROLES.ALPHA_WEREWOLF,
            necromancerAvailable: role === ROLES.NECROMANCER,
        };
    });
    return game.players;
};

export const clearAssignments = (game) => {
    for (const player of game.players) {
        player.role = null;
        player.faction = null;
        player.alive = true;
        player.voteTarget = null;
        player.nightAction = null;
        player.deathCause = null;
        player.roleState = {};
    }
};

export const newNightActions = () => ({
    werewolfVotes: new Map(),
    seerTarget: null,
    guardianTarget: null,
    witchAction: null,
    sorcererTarget: null,
    necromancerTarget: null,
});

export const resolveNumberedTarget = (
    game,
    value,
    { excludeJid = null, predicate = () => true } = {}
) => {
    const candidates = alivePlayers(game).filter(
        (player) => player.jid !== excludeJid && predicate(player)
    );
    const index = Number(value) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= candidates.length) return null;
    return candidates[index];
};

export const numberedPlayers = (game, { excludeJid = null, predicate = () => true } = {}) =>
    alivePlayers(game)
        .filter((player) => player.jid !== excludeJid && predicate(player))
        .map((player, index) => ({ player, number: index + 1 }));

export const deadPlayers = (game) => game.players.filter((player) => !player.alive);

export const numberedDeadPlayers = (game, predicate = () => true) =>
    deadPlayers(game)
        .filter(predicate)
        .map((player, index) => ({ player, number: index + 1 }));

export const resolveNumberedDeadTarget = (game, value, predicate = () => true) => {
    const candidates = deadPlayers(game).filter(predicate);
    const index = Number(value) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= candidates.length) return null;
    return candidates[index];
};

export const selectWerewolfTarget = (game) => {
    const counts = new Map();
    for (const targetJid of game.nightActions.werewolfVotes.values()) {
        counts.set(targetJid, (counts.get(targetJid) || 0) + 1);
    }
    if (!counts.size) return null;
    const highest = Math.max(...counts.values());
    const leaders = [...counts.entries()].filter(([, count]) => count === highest);
    if (leaders.length !== 1) return null;
    return game.players.find((player) => player.jid === leaders[0][0] && player.alive) || null;
};

export const resolveNight = (game) => {
    const deaths = [];
    const saved = new Set();
    const wolfTarget = selectWerewolfTarget(game);
    const guardianTarget = game.nightActions.guardianTarget;
    const witchAction = game.nightActions.witchAction;
    const magicUsed = witchAction?.type === 'MAGIC';

    if (wolfTarget) {
        const protectedByMagic = magicUsed && wolfTarget.faction === FACTIONS.VILLAGE;
        const protectedIndividually = wolfTarget.jid === guardianTarget;
        if (protectedByMagic || protectedIndividually) {
            saved.add(wolfTarget.jid);
        } else {
            wolfTarget.alive = false;
            wolfTarget.deathCause = 'WEREWOLF';
            deaths.push(wolfTarget);
        }
    }

    if (witchAction?.type === 'POISON') {
        const poisonTarget = game.players.find(
            (player) => player.jid === witchAction.targetJid && player.alive
        );
        if (poisonTarget) {
            if (poisonTarget.jid === guardianTarget) {
                saved.add(poisonTarget.jid);
            } else {
                poisonTarget.alive = false;
                poisonTarget.deathCause = 'WITCH_POISON';
                deaths.push(poisonTarget);
            }
        }
    }

    const seer = game.players.find((player) => player.role === ROLES.SEER);
    const seerTarget = game.players.find((player) => player.jid === game.nightActions.seerTarget);
    const sorcerer = game.players.find((player) => player.role === ROLES.SORCERER);
    const sorcererTarget = game.players.find(
        (player) => player.jid === game.nightActions.sorcererTarget
    );
    const revived = game.players.find(
        (player) => player.jid === game.nightActions.necromancerTarget && !player.alive
    );
    if (revived) {
        revived.alive = true;
        revived.deathCause = null;
    }

    return {
        deaths,
        saved: [...saved],
        magicUsed,
        wolfTarget,
        seer,
        seerTarget,
        sorcerer,
        sorcererTarget,
        revived,
    };
};

export const determineWinner = (game) => {
    const living = alivePlayers(game);
    const wolves = living.filter((player) => player.faction === FACTIONS.WEREWOLF).length;
    if (wolves === 0) return FACTIONS.VILLAGE;
    if (wolves >= living.length - wolves) return FACTIONS.WEREWOLF;
    return null;
};

export const claimTransition = (game, expectedPhase, expectedVersion) => {
    if (
        game.phase !== expectedPhase ||
        game.phaseVersion !== expectedVersion ||
        game.transitionLock
    ) {
        return false;
    }
    game.transitionLock = true;
    game.phaseVersion += 1;
    game.phase = PHASES.RESOLUTION;
    return true;
};

export const releaseTransition = (game) => {
    game.transitionLock = false;
};

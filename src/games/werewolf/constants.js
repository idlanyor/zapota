export const PHASES = Object.freeze({
    LOBBY: 'LOBBY',
    ROLE_ASSIGNMENT: 'ROLE_ASSIGNMENT',
    NIGHT: 'NIGHT',
    MORNING: 'MORNING',
    RESOLUTION: 'RESOLUTION',
    DISCUSSION: 'DISCUSSION',
    VOTING: 'VOTING',
    HUNTER_SHOT: 'HUNTER_SHOT',
    ALPHA_CONVERT: 'ALPHA_CONVERT',
    ENDED: 'ENDED',
});

export const ROLES = Object.freeze({
    VILLAGER: 'VILLAGER',
    WEREWOLF: 'WEREWOLF',
    SEER: 'SEER',
    HUNTER: 'HUNTER',
    JESTER: 'JESTER',
    GUARDIAN: 'GUARDIAN',
    WITCH: 'WITCH',
    ALPHA_WEREWOLF: 'ALPHA_WEREWOLF',
    SORCERER: 'SORCERER',
    NECROMANCER: 'NECROMANCER',
});

export const FACTIONS = Object.freeze({
    VILLAGE: 'VILLAGE',
    WEREWOLF: 'WEREWOLF',
    NEUTRAL: 'NEUTRAL',
});

export const ROLE_META = Object.freeze({
    [ROLES.VILLAGER]: { name: 'Villager', emoji: '👨‍🌾', faction: FACTIONS.VILLAGE },
    [ROLES.WEREWOLF]: { name: 'Werewolf', emoji: '🐺', faction: FACTIONS.WEREWOLF },
    [ROLES.SEER]: { name: 'Seer', emoji: '🔮', faction: FACTIONS.VILLAGE },
    [ROLES.HUNTER]: { name: 'Hunter', emoji: '🏹', faction: FACTIONS.VILLAGE },
    [ROLES.JESTER]: { name: 'Jester', emoji: '🤡', faction: FACTIONS.NEUTRAL },
    [ROLES.GUARDIAN]: { name: 'Guardian', emoji: '🛡️', faction: FACTIONS.VILLAGE },
    [ROLES.WITCH]: { name: 'Witch', emoji: '🧙', faction: FACTIONS.VILLAGE },
    [ROLES.ALPHA_WEREWOLF]: {
        name: 'Alpha Werewolf',
        emoji: '🐺👑',
        faction: FACTIONS.WEREWOLF,
    },
    [ROLES.SORCERER]: { name: 'Sorcerer', emoji: '🧙‍♂️', faction: FACTIONS.WEREWOLF },
    [ROLES.NECROMANCER]: { name: 'Necromancer', emoji: '💀🔮', faction: FACTIONS.VILLAGE },
});

export const DEFAULT_SETTINGS = Object.freeze({
    minPlayers: 5,
    maxPlayers: 15,
    // Satu timer lobby global berlaku untuk semua room baru.
    lobbyDurationMs: 10 * 60_000,
    nightDurationMs: 60_000,
    discussionDurationMs: 90_000,
    votingDurationMs: 45_000,
    hunterShotDurationMs: 30_000,
    alphaConvertDurationMs: 30_000,
    stopConfirmationDurationMs: 30_000,
    revealRoleOnDeath: true,
});

const DISTRIBUTION = Object.freeze({
    5: {
        werewolf: 1,
        alpha: 0,
        sorcerer: 0,
        seer: 1,
        hunter: 0,
        jester: 0,
        guardian: 0,
        witch: 0,
        necromancer: 0,
    },
    6: {
        werewolf: 1,
        alpha: 0,
        sorcerer: 0,
        seer: 1,
        hunter: 1,
        jester: 0,
        guardian: 0,
        witch: 0,
        necromancer: 0,
    },
    7: {
        werewolf: 2,
        alpha: 0,
        sorcerer: 0,
        seer: 1,
        hunter: 1,
        jester: 0,
        guardian: 0,
        witch: 0,
        necromancer: 0,
    },
    8: {
        werewolf: 2,
        alpha: 0,
        sorcerer: 0,
        seer: 1,
        hunter: 1,
        jester: 1,
        guardian: 0,
        witch: 0,
        necromancer: 0,
    },
    9: {
        werewolf: 1,
        alpha: 1,
        sorcerer: 0,
        seer: 1,
        hunter: 1,
        jester: 1,
        guardian: 1,
        witch: 0,
        necromancer: 0,
    },
    10: {
        werewolf: 1,
        alpha: 1,
        sorcerer: 1,
        seer: 1,
        hunter: 1,
        jester: 1,
        guardian: 1,
        witch: 0,
        necromancer: 0,
    },
    11: {
        werewolf: 1,
        alpha: 1,
        sorcerer: 1,
        seer: 1,
        hunter: 1,
        jester: 1,
        guardian: 1,
        witch: 1,
        necromancer: 0,
    },
    12: {
        werewolf: 1,
        alpha: 1,
        sorcerer: 1,
        seer: 1,
        hunter: 1,
        jester: 1,
        guardian: 1,
        witch: 1,
        necromancer: 1,
    },
    13: {
        werewolf: 2,
        alpha: 1,
        sorcerer: 1,
        seer: 1,
        hunter: 1,
        jester: 1,
        guardian: 1,
        witch: 1,
        necromancer: 1,
    },
    14: {
        werewolf: 2,
        alpha: 1,
        sorcerer: 1,
        seer: 1,
        hunter: 1,
        jester: 1,
        guardian: 1,
        witch: 1,
        necromancer: 1,
    },
    15: {
        werewolf: 2,
        alpha: 1,
        sorcerer: 1,
        seer: 1,
        hunter: 1,
        jester: 1,
        guardian: 1,
        witch: 1,
        necromancer: 1,
    },
});

export const roleDeckFor = (playerCount) => {
    const config = DISTRIBUTION[playerCount];
    if (!config) throw new Error('Jumlah pemain harus antara 5 sampai 15.');

    const roles = [];
    const append = (role, count) => {
        for (let index = 0; index < count; index += 1) roles.push(role);
    };

    append(ROLES.WEREWOLF, config.werewolf);
    append(ROLES.ALPHA_WEREWOLF, config.alpha);
    append(ROLES.SORCERER, config.sorcerer);
    append(ROLES.SEER, config.seer);
    append(ROLES.HUNTER, config.hunter);
    append(ROLES.JESTER, config.jester);
    append(ROLES.GUARDIAN, config.guardian);
    append(ROLES.WITCH, config.witch);
    append(ROLES.NECROMANCER, config.necromancer);
    append(ROLES.VILLAGER, playerCount - roles.length);
    return roles;
};

export const shuffle = (items, random = Math.random) => {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const target = Math.floor(random() * (index + 1));
        [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
};

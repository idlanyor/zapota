import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DEFAULT_SETTINGS, PHASES } from './constants.js';

class WerewolfGameManager {
    constructor({ persistencePath } = {}) {
        this.games = new Map();
        this.playerGames = new Map();
        this.privateContacts = new Map();
        this.persistencePath =
            persistencePath === undefined
                ? process.env.NODE_ENV === 'test'
                    ? null
                    : resolve(process.env.WEREWOLF_READY_FILE || './data/werewolf-ready.json')
                : persistencePath;
        this.loadPrivateContacts();
    }

    loadPrivateContacts() {
        if (!this.persistencePath) return;
        try {
            const raw = JSON.parse(readFileSync(this.persistencePath, 'utf8'));
            for (const [alias, record] of Object.entries(raw)) {
                if (record?.privateJid && record.timestamp) {
                    this.privateContacts.set(alias, {
                        privateJid: record.privateJid,
                        timestamp: Number(record.timestamp),
                    });
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn(`[werewolf] gagal memuat status ready: ${error.message}`);
            }
        }
    }

    persistPrivateContacts() {
        if (!this.persistencePath) return;
        try {
            mkdirSync(dirname(this.persistencePath), { recursive: true });
            const records = Object.fromEntries(this.privateContacts.entries());
            writeFileSync(this.persistencePath, JSON.stringify(records, null, 2));
        } catch (error) {
            console.warn(`[werewolf] gagal menyimpan status ready: ${error.message}`);
        }
    }

    markPrivateContact(aliases, privateJid, timestamp = Date.now()) {
        const record = { privateJid, timestamp };
        for (const alias of aliases) this.privateContacts.set(alias, record);
        this.persistPrivateContacts();

        const game = this.getByPlayerAliases(aliases);
        const player = game ? this.findPlayer(game, aliases) : null;
        if (player) {
            player.dmReadyAt = timestamp;
            player.privateJid = privateJid;
            this.bindAliases(game, player, aliases);
        }
        return record;
    }

    getPrivateContact(aliases) {
        for (const alias of aliases) {
            const record = this.privateContacts.get(alias);
            if (record) return record;
        }
        return null;
    }

    create(groupJid, host, settings = {}) {
        if (this.games.has(groupJid)) throw new Error('Game Werewolf sudah ada di grup ini.');
        if (this.getByPlayerAliases(host.aliases)) {
            throw new Error('Kamu masih terdaftar dalam game Werewolf lain.');
        }
        if (!this.getPrivateContact(host.aliases)) {
            throw new Error('Kirim *.ww ready* melalui private chat ke bot terlebih dahulu.');
        }

        const game = {
            id: randomUUID(),
            groupJid,
            hostJid: host.jid,
            phase: PHASES.LOBBY,
            round: 0,
            players: [],
            createdAt: Date.now(),
            phaseStartedAt: Date.now(),
            phaseVersion: 0,
            transitionLock: false,
            timers: {},
            settings: { ...DEFAULT_SETTINGS, ...settings },
            nightActions: null,
            votes: new Map(),
            stopConfirmation: null,
            pendingHunterJid: null,
            afterHunter: null,
            queuedHunterJids: [],
            pendingAlphaJid: null,
            runtime: {},
        };
        game.lobbyExpiresAt = game.createdAt + game.settings.lobbyDurationMs;
        this.games.set(groupJid, game);
        this.addPlayer(game, host);
        return game;
    }

    get(groupJid) {
        return this.games.get(groupJid) || null;
    }

    getByPlayerAliases(aliases) {
        for (const alias of aliases) {
            const groupJid = this.playerGames.get(alias);
            if (groupJid) return this.games.get(groupJid) || null;
        }
        return null;
    }

    findPlayer(game, aliases) {
        // Prioritaskan alias sesuai urutan input (m.sender selalu paling awal).
        // Ini mencegah alias sekunder yang kebetulan shared memilih player pertama.
        for (const alias of aliases) {
            const player = game.players.find((candidate) => candidate.aliases.includes(alias));
            if (player) return player;
        }
        return null;
    }

    addPlayer(game, data) {
        if (game.phase !== PHASES.LOBBY) throw new Error('Game sudah dimulai.');
        if (game.players.length >= game.settings.maxPlayers) throw new Error('Lobby sudah penuh.');
        if (this.findPlayer(game, data.aliases)) throw new Error('Kamu sudah bergabung ke lobby.');

        const existingGame = this.getByPlayerAliases(data.aliases);
        if (existingGame && existingGame.groupJid !== game.groupJid) {
            throw new Error('Kamu masih terdaftar dalam game Werewolf lain.');
        }

        const contact = this.getPrivateContact(data.aliases);
        if (!contact) {
            throw new Error('Kirim *.ww ready* melalui private chat ke bot terlebih dahulu.');
        }

        const player = {
            jid: data.jid,
            aliases: [...new Set(data.aliases)],
            privateJid: contact.privateJid,
            dmReadyAt: contact.timestamp,
            name: data.name || data.jid.split('@')[0],
            joinedAt: Date.now(),
            role: null,
            faction: null,
            alive: true,
            voteTarget: null,
            nightAction: null,
            deathCause: null,
            roleState: {},
        };
        game.players.push(player);
        this.bindAliases(game, player, player.aliases);
        return player;
    }

    bindAliases(game, player, aliases) {
        for (const alias of aliases) {
            const owner = game.players.find(
                (candidate) => candidate !== player && candidate.aliases.includes(alias)
            );
            if (owner) continue;
            if (!player.aliases.includes(alias)) player.aliases.push(alias);
            this.playerGames.set(alias, game.groupJid);
            const contact = this.privateContacts.get(alias);
            if (contact) {
                for (const playerAlias of player.aliases) {
                    if (!this.privateContacts.has(playerAlias)) {
                        this.privateContacts.set(playerAlias, contact);
                    }
                }
            }
        }
    }

    removePlayer(game, player) {
        const index = game.players.indexOf(player);
        if (index >= 0) game.players.splice(index, 1);
        for (const alias of player.aliases) {
            if (this.playerGames.get(alias) === game.groupJid) this.playerGames.delete(alias);
        }
        if (game.hostJid === player.jid && game.players.length) game.hostJid = game.players[0].jid;
        return index >= 0;
    }

    clearTimer(game, key = 'phase') {
        const timer = game.timers[key];
        if (timer) clearTimeout(timer);
        delete game.timers[key];
    }

    clearAllTimers(game) {
        for (const timer of Object.values(game.timers)) clearTimeout(timer);
        game.timers = {};
    }

    delete(groupJid) {
        const game = this.games.get(groupJid);
        if (!game) return false;
        this.clearAllTimers(game);
        for (const player of game.players) {
            for (const alias of player.aliases) {
                if (this.playerGames.get(alias) === groupJid) this.playerGames.delete(alias);
            }
        }
        game.phase = PHASES.ENDED;
        this.games.delete(groupJid);
        return true;
    }

    reset() {
        for (const game of this.games.values()) this.clearAllTimers(game);
        this.games.clear();
        this.playerGames.clear();
        this.privateContacts.clear();
        this.persistPrivateContacts();
    }
}

export const werewolfManager = new WerewolfGameManager();
export { WerewolfGameManager };

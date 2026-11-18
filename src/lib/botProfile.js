/**
 * Which bot a socket belongs to: the main bot, or a user's sub-bot (jadibot).
 *
 * The message pipeline is shared by every socket; it asks this registry how
 * to treat a message instead of assuming there is only one bot. Sockets that
 * were never registered are the main bot.
 *
 * Kept free of heavy imports so pipeline steps and guards can use it.
 */

/**
 * @typedef {object} SubBotProfile
 * @property {'sub'} kind
 * @property {string} id         stable id used in caches (`sub:<number>`)
 * @property {string} number     linked phone number (digits)
 * @property {'free'|'premium'} tier
 * @property {Set<string>} sentIds  ids of messages this socket sent itself
 * @property {(ts?: number) => void} [onActivity]
 */

export const MAIN_PROFILE = Object.freeze({ kind: 'main', id: 'main' });

/** Cap on remembered outgoing ids per sub-bot (oldest are forgotten first). */
const SENT_ID_LIMIT = 500;

const profiles = new WeakMap();
let getMainSocket = () => null;

/** @param {() => object | null} getter current main-bot socket */
export const setMainSocketGetter = (getter) => {
    getMainSocket = getter;
};

/** The main bot's socket, or null while it is disconnected. */
export const mainSocket = () => getMainSocket() || null;

/**
 * Mark `sock` as a sub-bot. Its outgoing messages are recorded so the
 * pipeline can tell the bot's own replies apart from messages its owner
 * typed on their phone (both arrive with `fromMe`).
 *
 * @param {object} sock
 * @param {{ number: string, tier?: 'free'|'premium', onActivity?: (ts?: number) => void }} info
 * @returns {SubBotProfile}
 */
export const registerSubBot = (sock, { number, tier = 'free', onActivity }) => {
    /** @type {SubBotProfile} */
    const profile = {
        kind: 'sub',
        id: `sub:${number}`,
        number,
        tier,
        sentIds: new Set(),
        onActivity,
    };
    profiles.set(sock, profile);

    const remember = (result) => {
        const id = result?.key?.id;
        if (id) {
            profile.sentIds.add(id);
            if (profile.sentIds.size > SENT_ID_LIMIT) {
                profile.sentIds.delete(profile.sentIds.values().next().value);
            }
        }
        return result;
    };
    for (const method of ['sendMessage', 'relayMessage']) {
        const original = sock[method];
        if (typeof original !== 'function') continue;
        sock[method] = async (...args) => remember(await original.apply(sock, args));
    }
    return profile;
};

/** @returns {SubBotProfile | typeof MAIN_PROFILE} */
export const getBotProfile = (sock) => (sock && profiles.get(sock)) || MAIN_PROFILE;

export const isSubBot = (sock) => getBotProfile(sock).kind === 'sub';

/** True when `id` is a message this sub-bot sent itself (not its owner). */
export const sentBySubBot = (sock, id) => {
    const profile = getBotProfile(sock);
    return profile.kind === 'sub' && Boolean(id) && profile.sentIds.has(id);
};

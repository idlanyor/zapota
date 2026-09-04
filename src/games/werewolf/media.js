import { Jimp, JimpMime } from 'jimp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const localImage = (name) =>
    fileURLToPath(new URL(`../../assets/werewolf/local/${name}`, import.meta.url));
const localRoleImage = (name) => localImage(`role/${name}`);

export const WEREWOLF_MEDIA = Object.freeze({
    lobby: localImage('lobby.jpg'),
    night: localImage('night.jpg'),
    morning: localImage('morning.jpg'),
    discussion: localImage('discussion.jpg'),
    voting: localImage('voting.jpg'),
    hunter: localImage('hunter.jpg'),
    villageWin: localImage('village-win.jpg'),
    wolfWin: localImage('wolf-win.jpg'),
    jesterWin: localImage('jester-win.jpg'),
    roles: localImage('roles.jpg'),
    role: Object.freeze({
        VILLAGER: localRoleImage('villager.jpg'),
        WEREWOLF: localRoleImage('werewolf.jpg'),
        SEER: localRoleImage('seer.jpg'),
        GUARDIAN: localRoleImage('guardian.jpg'),
        WITCH: localRoleImage('witch.jpg'),
        HUNTER: localRoleImage('hunter.jpg'),
        JESTER: localRoleImage('jester.jpg'),
        ALPHA_WEREWOLF: localRoleImage('alpha-werewolf.jpg'),
        SORCERER: localRoleImage('sorcerer.jpg'),
        NECROMANCER: localRoleImage('necromancer.jpg'),
    }),
});

const cache = new Map();

const fetchImage = async (source) => {
    if (source.startsWith('/') || source.startsWith('file://')) {
        return readFile(source.startsWith('file://') ? fileURLToPath(source) : source);
    }
    const response = await fetch(source, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
};

export const getWerewolfImage = async (url, width = 640, height = 360) => {
    const key = `${url}|${width}x${height}`;
    if (!cache.has(key)) {
        cache.set(
            key,
            (async () => {
                const image = await Jimp.read(await fetchImage(url));
                image.resize({ w: width, h: height });
                return image.getBuffer(JimpMime.jpeg, { quality: 82 });
            })().catch(() => null)
        );
    }
    return cache.get(key);
};

export const clearWerewolfMediaCache = () => cache.clear();

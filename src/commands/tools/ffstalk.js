const formatValue = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
};

const pick = (obj, keys = []) => {
    for (const key of keys) {
        if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
            return obj[key];
        }
    }
    return null;
};

const resolveFunctionCandidates = (mod) => {
    const candidates = [];
    const pushIfFn = (owner, fn) => {
        if (typeof fn === 'function') {
            candidates.push(owner ? fn.bind(owner) : fn);
        }
    };

    pushIfFn(mod, mod?.ffstalk);
    pushIfFn(mod, mod?.stalk);
    pushIfFn(mod, mod?.getPlayerInfo);
    pushIfFn(mod, mod?.getPlayer);
    pushIfFn(mod, mod?.getInfo);
    pushIfFn(mod, mod?.search);
    pushIfFn(mod, mod?.lookup);
    pushIfFn(mod, mod?.getPlayerProfile);
    pushIfFn(mod, mod?.searchAccount);

    pushIfFn(mod?.default, mod?.default?.ffstalk);
    pushIfFn(mod?.default, mod?.default?.stalk);
    pushIfFn(mod?.default, mod?.default?.getPlayerInfo);
    pushIfFn(mod?.default, mod?.default?.getPlayer);
    pushIfFn(mod?.default, mod?.default?.getInfo);
    pushIfFn(mod?.default, mod?.default?.search);
    pushIfFn(mod?.default, mod?.default?.lookup);
    pushIfFn(mod?.default, mod?.default?.getPlayerProfile);
    pushIfFn(mod?.default, mod?.default?.searchAccount);

    return candidates;
};

const executeCandidate = async (fn, uid, region) => {
    const attempts = [
        () => fn(uid, region),
        () => fn({ uid, region }),
        () => fn({ playerId: uid, uid, region }),
        () => fn(uid),
    ];

    for (const call of attempts) {
        try {
            const result = await call();
            if (result) return result;
        } catch {
            // Try next signature.
        }
    }
    return null;
};

const formatRawDataBlock = (data, maxChars) => {
    try {
        const rawJson = JSON.stringify(data, null, 2);
        const header = '\n\n*Raw Data (JSON):*\n```json\n';
        const footer = '\n```';
        const minRoom = header.length + footer.length + 20;
        if (maxChars <= minRoom) return '';

        const allowedJsonChars = maxChars - header.length - footer.length;
        if (rawJson.length <= allowedJsonChars) {
            return `${header}${rawJson}${footer}`;
        }

        const ellipsis = '\n... (truncated)';
        const cutLimit = Math.max(0, allowedJsonChars - ellipsis.length);
        const truncated = rawJson.slice(0, cutLimit);
        return `${header}${truncated}${ellipsis}${footer}`;
    } catch {
        return '';
    }
};

export default {
    name: 'ffstalk',
    aliases: ['ffinfo', 'freefirestalk', 'stalkff'],
    description: 'Cek data akun Free Fire berdasarkan UID',
    category: 'Tools',
    execute: async (sock, m, args) => {
        const uid = (args[0] || '').trim();
        const region = (args[1] || 'sg').trim().toLowerCase();

        if (!uid) {
            return m.reply('Usage: .ffstalk <uid> [region]\nContoh: .ffstalk 123456789 id');
        }

        if (!/^\d+$/.test(uid)) {
            return m.reply('UID harus berupa angka.\nContoh: .ffstalk 123456789 id');
        }

        await m.react('⏳');

        try {
            const ffModule = await import('@spinzaf/freefire-api');
            const FreeFireAPI = ffModule?.default || ffModule;
            let api = null;
            if (typeof FreeFireAPI === 'function') {
                api = new FreeFireAPI();
                await api.login(process.env.FFSTALK_ID, process.env.FFSTALK_ACCOUNT);
            }

            const fnCandidates = [
                ...resolveFunctionCandidates(api || {}),
                ...resolveFunctionCandidates(ffModule),
            ];

            let result = null;
            for (const fn of fnCandidates) {
                result = await executeCandidate(fn, uid, region);
                if (result) break;
            }

            if (!result || typeof result !== 'object') {
                await m.react('❌');
                return m.reply('Gagal mengambil data Free Fire. Coba UID/region lain.');
            }

            const data = result.data && typeof result.data === 'object' ? result.data : result;
            const basicInfo =
                data?.basicinfo && typeof data.basicinfo === 'object' ? data.basicinfo : {};
            const socialInfo =
                data?.socialinfo && typeof data.socialinfo === 'object' ? data.socialinfo : {};
            const clanInfo =
                data?.clanbasicinfo && typeof data.clanbasicinfo === 'object'
                    ? data.clanbasicinfo
                    : {};

            const nickname =
                pick(data, ['nickname', 'name', 'playerName', 'username']) ||
                pick(basicInfo, ['nickname', 'name']);
            const level =
                pick(data, ['level', 'lvl', 'accountLevel']) || pick(basicInfo, ['level']);
            const likes =
                pick(data, ['likes', 'like', 'liked']) ||
                pick(basicInfo, ['liked']) ||
                pick(socialInfo, ['likes', 'liked']);
            const playerRegion =
                pick(data, ['region', 'server']) || pick(basicInfo, ['region']) || region;
            const guild =
                pick(data, ['guildName', 'guild', 'clanName']) ||
                pick(clanInfo, ['clanname', 'name']);
            const uidField =
                pick(data, ['uid', 'playerId', 'id']) || pick(basicInfo, ['accountid']) || uid;

            let msg = '*FREE FIRE STALK*\n\n';
            msg += `UID: ${formatValue(uidField)}\n`;
            msg += `Nickname: ${formatValue(nickname)}\n`;
            msg += `Region: ${formatValue(playerRegion)}\n`;
            msg += `Level: ${formatValue(level)}\n`;
            msg += `Likes: ${formatValue(likes)}\n`;
            msg += `Guild: ${formatValue(guild)}\n`;
            msg += formatRawDataBlock(data, 3900 - msg.length);

            await m.reply(msg.slice(0, 3900));
            await m.react('✅');
            return;
        } catch (error) {
            console.error('[DEBUG] ffstalk error:', error);

            if (String(error.message || '').includes('Cannot find package')) {
                await m.react('❌');
                return m.reply('Dependency belum terpasang: @spinzaf/freefire-api');
            }

            await m.react('❌');
            return m.reply(`Gagal cek Free Fire: ${error.message || 'Unknown error'}`);
        }
    },
};

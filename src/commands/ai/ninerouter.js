const BASE_URL = 'https://router.irengcloud.com';
const ADMIN_PASS = 'sakurazaka46';
const API_KEY = 'sk-1ee0ea9b1557e97f-30ikoa-4f356d01';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAdminToken() {
    const now = Date.now();
    if (cachedToken && tokenExpiresAt > now) {
        return cachedToken;
    }

    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: ADMIN_PASS }),
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Login failed (${res.status}): ${txt}`);
    }

    const cookies = res.headers.get('set-cookie');
    let token = null;
    if (cookies) {
        const match = cookies.match(/auth_token=([^;]+)/);
        if (match) token = match[1];
    }

    if (!token) {
        const json = await res.json().catch(() => ({}));
        token = json.token || json.authToken || json.accessToken;
    }

    if (!token) {
        throw new Error('Gagal ambil auth_token 9Router');
    }

    cachedToken = token;
    tokenExpiresAt = now + 23 * 60 * 60 * 1000;
    return cachedToken;
}

async function fetchAdmin(endpoint) {
    const token = await getAdminToken();
    const res = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
            Cookie: `auth_token=${token}`,
            Authorization: `Bearer ${token}`,
        },
    });

    if (res.status === 401) {
        cachedToken = null;
        const retryToken = await getAdminToken();
        const retryRes = await fetch(`${BASE_URL}${endpoint}`, {
            headers: {
                Cookie: `auth_token=${retryToken}`,
                Authorization: `Bearer ${retryToken}`,
            },
        });
        return retryRes.json();
    }

    return res.json();
}

export default {
    name: 'ninerouter',
    aliases: ['router', '9router'],
    description: '9Router Manager Dashboard (Stats, Usage, Providers, Combos, Keys, Chat)',
    category: 'AI',
    execute: async (sock, m, args) => {
        const sub = (args[0] || '').toLowerCase();
        const query = args.slice(1).join(' ').trim();

        try {
            if (sub === 'usage' || sub === 'stats') {
                const stats = await fetchAdmin('/api/usage/stats');
                const summary = stats.summary || stats;

                let out = `*9ROUTER USAGE & STATS*\n`;
                out += `*Host:* ${BASE_URL}\n\n`;
                out += `*Total Requests:* ${Number(summary.totalRequests || 0).toLocaleString()}\n`;
                out += `*Prompt Tokens:* ${Number(summary.totalPromptTokens || 0).toLocaleString()}\n`;
                out += `*Completion Tokens:* ${Number(summary.totalCompletionTokens || 0).toLocaleString()}\n`;
                out += `*Total Tokens:* ${Number(summary.totalTokens || 0).toLocaleString()}\n`;
                if (summary.totalCost !== undefined) {
                    out += `*Estimated Cost:* $${Number(summary.totalCost || 0).toFixed(4)}\n`;
                }

                if (Array.isArray(stats.providers) && stats.providers.length > 0) {
                    out += `\n*Top Providers:*\n`;
                    stats.providers.slice(0, 8).forEach((p, idx) => {
                        out += `${idx + 1}. *${p.provider || p.name}*: ${Number(p.requests || 0).toLocaleString()} reqs (${Number(p.tokens || 0).toLocaleString()} tok)\n`;
                    });
                }

                return m.reply(out.trim());
            }

            if (sub === 'providers' || sub === 'prov') {
                const provs = await fetchAdmin('/api/providers');
                const list = Array.isArray(provs) ? provs : provs.providers || [];

                if (list.length === 0) return m.reply('*9Router:* Tidak ada provider terpasang.');

                let out = `*9ROUTER PROVIDERS (${list.length})*\n\n`;
                list.forEach((p, idx) => {
                    const status = p.status === 'active' || p.enabled !== false ? 'AKTIF' : 'NONAKTIF';
                    const name = p.name || p.id || p.provider;
                    const type = p.type || p.model || 'direct';
                    out += `${idx + 1}. *${name}* [${status}]\n   Type: \`${type}\`\n`;
                });

                return m.reply(out.trim());
            }

            if (sub === 'combos' || sub === 'combo') {
                const combos = await fetchAdmin('/api/combos');
                const list = Array.isArray(combos) ? combos : combos.combos || [];

                if (list.length === 0) return m.reply('*9Router:* Tidak ada combo router terpasang.');

                let out = `*9ROUTER COMBOS / CHAINS*\n\n`;
                list.forEach((c, idx) => {
                    const name = c.name || c.id;
                    const models = Array.isArray(c.models) ? c.models.join(' -> ') : (c.targets || '-');
                    out += `${idx + 1}. *${name}*\n   Chain: \`${models}\`\n`;
                });

                return m.reply(out.trim());
            }

            if (sub === 'keys' || sub === 'key') {
                const keys = await fetchAdmin('/api/keys');
                const list = Array.isArray(keys) ? keys : keys.keys || [];

                let out = `*9ROUTER API KEYS (${list.length})*\n\n`;
                list.forEach((k, idx) => {
                    const name = k.name || `Key #${idx + 1}`;
                    const prefix = k.key ? `${k.key.substring(0, 10)}...` : (k.prefix || 'sk-***');
                    const enabled = k.enabled !== false ? 'AKTIF' : 'NONAKTIF';
                    out += `${idx + 1}. *${name}* [${enabled}]\n   Key: \`${prefix}\`\n`;
                });

                return m.reply(out.trim());
            }

            if (sub === 'ask' || sub === 'chat') {
                if (!query) return m.reply('*Format:* `.router ask <pertanyaan>`');

                const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${API_KEY}`,
                    },
                    body: JSON.stringify({
                        model: 'Kanata',
                        messages: [{ role: 'user', content: query }],
                        stream: false,
                    }),
                });

                if (!res.ok) {
                    const err = await res.text();
                    return m.reply(`*Error 9Router (${res.status}):* ${err}`);
                }

                const data = await res.json();
                const replyText = data.choices?.[0]?.message?.content || 'Tidak ada balasan dari model.';
                return m.reply(replyText.trim());
            }

            const health = await fetch(`${BASE_URL}/api/health`)
                .then((r) => r.json())
                .catch(() => ({ status: 'unreachable' }));

            const version = await fetch(`${BASE_URL}/api/version`)
                .then((r) => r.json())
                .catch(() => ({ version: 'unknown' }));

            let help = `*9ROUTER MANAGER DASHBOARD*\n\n`;
            help += `*Host:* ${BASE_URL}\n`;
            help += `*Engine Version:* \`${version.version || '0.5.69'}\`\n`;
            help += `*Status:* \`${health.status || 'online'}\`\n\n`;
            help += `*Commands:*\n`;
            help += `• \`.router usage\` : Statistik token & requests\n`;
            help += `• \`.router providers\` : Daftar provider & status\n`;
            help += `• \`.router combos\` : Routing chain fallback\n`;
            help += `• \`.router keys\` : Daftar API keys\n`;
            help += `• \`.router ask <teks>\` : Test chat inference\n`;

            return m.reply(help.trim());
        } catch (err) {
            return m.reply(`*Error 9Router Manager:* ${err.message}`);
        }
    },
};

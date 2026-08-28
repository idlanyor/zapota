import { settings } from '../../config/settings.js';

const BASE = 'https://ai.kanata.web.id';
const KEY = process.env.KANATA_API_KEY;
const MODEL = 'ag/claude-sonnet-4-6';

const HELP = `Translate teks via AI.

${settings.prefix}translate <teks> — terjemahkan ke bahasa Indonesia
${settings.prefix}translate --from <source> <teks> — setel bahasa sumber
${settings.prefix}translate --to <target> <teks> — setel bahasa target
${settings.prefix}translate --lang <source>-<target> <teks> — shortcut

Contoh: ${settings.prefix}translate --from en The weather is nice today

Atau reply pesan teks lalu ketik ${settings.prefix}translate [flags]

Bahasa: id, en, ja, ko, zh, ar, ru, es, fr, de, pt, tr, hi, th, vi, ms, fil

Response dari AI dikirim apa adanya (tanpa modifikasi).`;

// Fast lookup from common names → ISO 639-1
const resolveLang = (name) => {
    const map = {
        indonesia: 'id', indonesian: 'id', indo: 'id', bhs: 'id',
        english: 'en', inggris: 'en', ing: 'en',
        japanese: 'ja', jepang: 'ja',
        korean: 'ko', korea: 'ko',
        chinese: 'zh', cina: 'zh', mandarin: 'zh',
        arab: 'ar', arabic: 'ar',
        russian: 'ru',
        spanish: 'es', spanyol: 'es',
        french: 'fr',
        german: 'de', jerman: 'de',
        portuguese: 'pt',
        turkish: 'tr', turki: 'tr',
        hindi: 'hi',
        thai: 'th',
        vietnamese: 'vi', viett: 'vi',
        malay: 'ms',
        filipino: 'fil', tagalog: 'fil',
    };
    return map[name.toLowerCase()] || name.toLowerCase();
};

const parseArgs = (text) => {
    const flags = { from: null, to: 'id', text: '' };
    const tokens = text.split(/\s+/);
    let i = 0;

    while (i < tokens.length) {
        if (tokens[i] === '--from' && i + 1 < tokens.length) {
            flags.from = resolveLang(tokens[i + 1]);
            i += 2;
        } else if (tokens[i] === '--to' && i + 1 < tokens.length) {
            flags.to = resolveLang(tokens[i + 1]);
            i += 2;
        } else if (tokens[i] === '--lang' && i + 1 < tokens.length) {
            const parts = tokens[i + 1].split('-');
            if (parts.length === 2) {
                flags.from = resolveLang(parts[0]);
                flags.to = resolveLang(parts[1]);
            }
            i += 2;
        } else {
            flags.text += (flags.text ? ' ' : '') + tokens[i];
            i++;
        }
    }
    return flags;
};

export default {
    name: 'translate',
    aliases: ['terjemahkan', 'tl', 'trans', 'tr'],
    description: 'AI-powered translate (kanata). Reply teks atau inline: .translate <teks> atau --from <source> <teks>',
    category: 'AI',
    execute: async (sock, m, args, text) => {
        if (text === '' && !m.quoted) {
            return m.reply(HELP);
        }
        if (text === 'help') {
            return m.reply(HELP);
        }

        const input = m.quoted?.text || text;
        if (!input || !input.trim()) {
            return m.reply(HELP);
        }

        const parsed = parseArgs(input);
        if (!parsed.text.trim()) {
            return m.reply('Teks apa yang mau diterjemahkan?');
        }

        const fromHint = parsed.from ? ` from ${parsed.from}` : '';

        try {
            await m.react('⏳');
            const res = await fetch(`${BASE}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: MODEL,
                    max_tokens: 4096,
                    stream: false,
                    messages: [
                        {
                            role: 'system',
                            content: `You are a precise translator. Translate the user's message to ${parsed.to}${fromHint ? ' (source: ' + parsed.from + ')' : ''}. Output ONLY the translated text — no explanation, no quotes, no "Here is the translation:". If source and target are the same language, return the text as-is with only grammar/style improvements applied.`,
                        },
                        { role: 'user', content: parsed.text.trim() },
                    ],
                }),
            });

            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`API ${res.status}: ${errBody.slice(0, 300)}`);
            }

            const json = await res.json();
            const translated = json?.choices?.[0]?.message?.content?.trim();

            if (!translated) {
                throw new Error('Response kosong dari AI.');
            }

            await m.reply(`*[ Translate (${parsed.from || 'auto'} → ${parsed.to}) ]*\n\n${translated}`);
            await m.react('✅');
        } catch (err) {
            console.error('translate error:', err);
            await m.react('❌');
            await m.reply(`Gagal translate: ${err.message || err}`);
        }
    },
};

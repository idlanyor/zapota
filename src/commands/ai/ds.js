import axios from 'axios';
import os from 'os';
import { execSync } from 'child_process';
import { settings } from '../../config/settings.js';
import { resolveLocationToAdm4, searchWilayah } from '../../services/wilayahResolver.js';

const DS_BASE_URL = process.env.DS_BASE_URL || 'http://localhost:5050';
const DS_API_KEY = process.env.DS_API_KEY || 'dseeker';
const DEFAULT_MODEL = 'deepseek-chat-instant';
const IRENG_BASE_URL = 'https://apiku.irengcloud.com';

/**
 * Format markdown standar & artifak AI ke tipografi WhatsApp
 */
const formatToWhatsApp = (text = '') => {
    if (!text) return '';

    let res = text.trim();

    // 1. Bersihkan prefix artifak deepseek search (cth: FINISHEDSEARCH)
    res = res.replace(/^FINISHED\s*SEARCH\s*/i, '');

    // 2. Bersihkan citation tags seperti [citation:1], [citation: 12]
    res = res.replace(/\[citation:\s*\d+\]/gi, '');

    // 3. Konversi format tabel markdown menjadi daftar poin terstruktur
    const lines = res.split('\n');
    const newLines = [];
    let inTable = false;
    let tableRows = [];

    const flushTable = (rows) => {
        if (!rows.length) return [];
        const validRows = rows
            .map((r) => r.trim())
            .filter((r) => !/^\|?(\s*:?-+:?\s*\|?)+$/.test(r))
            .map((r) => {
                const parts = r.split('|').map((c) => c.trim());
                if (parts[0] === '') parts.shift();
                if (parts[parts.length - 1] === '') parts.pop();
                return parts;
            })
            .filter((row) => row.length > 0);

        if (validRows.length === 0) return [];
        if (validRows.length === 1) return validRows[0].map((c) => `• ${c}`);

        const header = validRows[0];
        const body = validRows.slice(1);
        const formatted = [];

        for (const row of body) {
            const rowFields = [];
            row.forEach((col, idx) => {
                const colLabel = header[idx] ? `*${header[idx]}*: ` : '';
                rowFields.push(`  ${colLabel}${col}`);
            });
            formatted.push(`• ${rowFields.join('\n  ').trim()}`);
        }
        return formatted;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
            inTable = true;
            tableRows.push(line);
        } else {
            if (inTable) {
                newLines.push(...flushTable(tableRows));
                tableRows = [];
                inTable = false;
            }
            newLines.push(line);
        }
    }
    if (inTable) {
        newLines.push(...flushTable(tableRows));
    }

    res = newLines.join('\n');

    // 4. Header Markdown (# Heading) -> Bold WhatsApp (*Heading*)
    res = res.replace(/^#{1,6}\s*(.+)$/gm, '*$1*');

    // 5. Bold: **text** atau __text__ -> *text*
    res = res.replace(/\*\*(.*?)\*\*/g, '*$1*');
    res = res.replace(/__(.*?)__/g, '*$1*');

    // 6. Strikethrough: ~~text~~ -> ~text~
    res = res.replace(/~~(.*?)~~/g, '~$1~');

    // 7. Garis pemisah horizontal (--- atau ***) -> divider visual rapi
    res = res.replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, '──────────────');

    // 8. Bullet list: * item atau + item atau - item -> • item
    res = res.replace(/^[ \t]*[*\-+]\s+/gm, '• ');

    // 9. Rapikan spasi berlebih
    res = res.replace(/[ \t]{2,}/g, ' ');
    res = res.replace(/\n{3,}/g, '\n\n');

    return res.trim();
};

/**
 * Definisi Tools IrengCloud API Suite untuk Function Calling
 */
const IRENG_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'bmkg_cuaca',
            description: 'Mendapatkan prakiraan cuaca BMKG untuk desa, kelurahan, kecamatan, kota, kabupaten, atau daerah di Indonesia',
            parameters: {
                type: 'object',
                properties: {
                    lokasi: {
                        type: 'string',
                        description: 'Nama desa, kecamatan, kota atau daerah di Indonesia (contoh: "Sirandu Karangjambu Purbalingga", "Bandung", "Surabaya", "Sleman", "Makassar")',
                    },
                    adm4: {
                        type: 'string',
                        description: 'Kode wilayah ADM4 10-digit BMKG (opsional jika lokasi diisi)',
                    },
                },
                required: ['lokasi'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'sholat_jadwal',
            description: 'Mendapatkan jadwal waktu sholat kota/kabupaten di Indonesia',
            parameters: {
                type: 'object',
                properties: {
                    kota: {
                        type: 'string',
                        description: 'Nama kota atau kabupaten, misal: "Jakarta Pusat", "Surabaya", "Bandung"',
                    },
                    bulan: {
                        type: 'number',
                        description: 'Nomor bulan 1-12 (opsional)',
                    },
                    tahun: {
                        type: 'number',
                        description: 'Tahun (opsional)',
                    },
                },
                required: ['kota'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'hadits_search',
            description: 'Pencarian teks lengkap Hadits 9 Imam (Bukhari, Muslim, Abu Daud, dll) dengan kata kunci',
            parameters: {
                type: 'object',
                properties: {
                    q: {
                        type: 'string',
                        description: 'Kata kunci pencarian hadits, misal: "niat", "sedekah", "shalat"',
                    },
                    limit: {
                        type: 'number',
                        description: 'Jumlah hasil (default 5)',
                    },
                },
                required: ['q'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'hadits_detail',
            description: 'Mendapatkan teks hadits lengkap (Arab & Terjemahan) berdasarkan perawi dan nomor',
            parameters: {
                type: 'object',
                properties: {
                    perawi: {
                        type: 'string',
                        description: 'Nama perawi: bukhari, muslim, abudaud, tirmidzi, nasai, ibnumajah, ahmad, malik, darimi',
                    },
                    nomor: {
                        type: 'number',
                        description: 'Nomor hadits',
                    },
                },
                required: ['perawi', 'nomor'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'layanan_islami',
            description: 'Mengakses Khutbah MUI, Doa Keseharian, Wirid/Ratib/Hizib, atau Arsip NU Online',
            parameters: {
                type: 'object',
                properties: {
                    service: {
                        type: 'string',
                        enum: ['khutbah', 'doa', 'wirid', 'nu_download'],
                        description: 'Layanan Islami yang diinginkan',
                    },
                    query: {
                        type: 'string',
                        description: 'Kategori (misal: "ratib", "doa-keseharian") atau kata kunci pencarian',
                    },
                },
                required: ['service'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'aksara_jawa',
            description: 'Konversi teks Latin ke Aksara Jawa native atau sebaliknya',
            parameters: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'Teks yang ingin dikonversi',
                    },
                    direction: {
                        type: 'string',
                        enum: ['latin_to_jawa', 'jawa_to_latin'],
                        description: 'Arah konversi teks',
                    },
                },
                required: ['text', 'direction'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'tv_jadwal',
            description: 'Mendapatkan jadwal siaran televisi nasional saat ini atau live sepak bola',
            parameters: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['now', 'football', 'channels', 'schedule'],
                        description: 'Jenis jadwal TV',
                    },
                    channel: {
                        type: 'string',
                        description: 'Nama channel (wajib jika type="schedule", misal: "rcti", "sctv")',
                    },
                },
                required: ['type'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'lirik_lagu',
            description: 'Mencari lirik lagu berdasarkan judul lagu atau keyword',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Judul atau keyword lagu yang dicari',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'pddikti_search',
            description: 'Pencarian data mahasiswa, dosen, atau perguruan tinggi di PDDIKTI',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Nama mahasiswa, dosen, atau universitas',
                    },
                    type: {
                        type: 'string',
                        enum: ['all', 'mahasiswa', 'dosen', 'pt', 'prodi'],
                        description: 'Tipe pencarian',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'checkhost_network',
            description: 'Lookup informasi IP / Host (lokasi, ISP, ASN, hostname), ping global, atau WHOIS domain menggunakan CheckHost',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['ip_info', 'ping', 'whois'],
                        description: 'Tindakan: "ip_info" untuk info IP/lokasi/ISP, "ping" untuk ping latency, "whois" untuk info domain',
                    },
                    target: {
                        type: 'string',
                        description: 'IP address atau nama host/domain (contoh: "64.235.45.179", "google.com")',
                    },
                },
                required: ['action', 'target'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'host_server_info',
            description:
                'Mendapatkan status spesifikasi host server lokal, penggunaan CPU & RAM, kapasitas disk storage, proses dengan pemakaian CPU/Memory tertinggi untuk diagnosa sistem, serta status service PM2',
            parameters: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['all', 'processes', 'summary', 'pm2'],
                        description:
                            'Jenis data diagnosa: "all" untuk data lengkap host, "processes" untuk diagnosa top proses CPU/RAM, "summary" untuk ringkasan hardware/load/disk/memori, "pm2" untuk status service proses PM2',
                    },
                },
                required: [],
            },
        },
    },
];

/**
 * Eksekusi Tool IrengCloud
 */
async function executeIrengTool(name, args) {
    try {
        if (name === 'sholat_jadwal') {
            const now = new Date();
            const res = await axios.get(`${IRENG_BASE_URL}/api/v1/sholat/jadwal`, {
                params: {
                    kota: args.kota,
                    bulan: args.bulan || now.getMonth() + 1,
                    tahun: args.tahun || now.getFullYear(),
                },
                timeout: 15000,
            });
            return JSON.stringify(res.data);
        }
        if (name === 'bmkg_cuaca') {
            let targetAdm4 = args.adm4;
            let locInfo = null;
            if (!targetAdm4 && args.lokasi) {
                const resolved = await resolveLocationToAdm4(args.lokasi);
                if (resolved) {
                    targetAdm4 = resolved.adm4;
                    locInfo = resolved;
                }
            }
            if (!targetAdm4) targetAdm4 = '31.71.01.1001';
            const res = await axios.get(`${IRENG_BASE_URL}/api/v1/bmkg/cuaca`, {
                params: { adm4: targetAdm4 },
                timeout: 15000,
            });
            let cuacaRaw = [];
            if (res.data?.data?.data?.[0]?.cuaca) {
                const c = res.data.data.data[0].cuaca;
                cuacaRaw = Array.isArray(c[0]) ? c.flat() : c;
            } else if (res.data?.data?.[0]?.cuaca) {
                const c = res.data.data[0].cuaca;
                cuacaRaw = Array.isArray(c[0]) ? c.flat() : c;
            }
            const ringkasan = cuacaRaw.slice(0, 5).map((c) => ({
                waktu: c.local_datetime,
                cuaca: c.weather_desc,
                suhu: `${c.t}°C`,
                kelembapan: `${c.hu}%`,
                angin: `${c.ws} km/jam (${c.wd})`,
            }));
            return JSON.stringify({
                lokasi: locInfo?.detail || res.data?.data?.lokasi?.kotkab || res.data?.lokasi?.kotkab || 'Indonesia',
                adm4: targetAdm4,
                prakiraan: ringkasan,
            });
        }
        if (name === 'hadits_search') {
            const res = await axios.get(`${IRENG_BASE_URL}/api/v1/hadits/search`, {
                params: { q: args.q, page: 1, limit: args.limit || 5 },
                timeout: 15000,
            });
            return JSON.stringify(res.data);
        }
        if (name === 'hadits_detail') {
            const res = await axios.get(`${IRENG_BASE_URL}/api/v1/hadits/${args.perawi.toLowerCase()}/${args.nomor}`, {
                timeout: 15000,
            });
            return JSON.stringify(res.data);
        }
        if (name === 'layanan_islami') {
            let endpoint = `/api/v1/${args.service}`;
            let params = {};
            if (args.service === 'doa') params.category = args.query || 'doa-keseharian';
            else if (args.service === 'wirid') params.category = args.query || 'ratib';
            else if (args.service === 'nu_download') params.q = args.query || '';
            else if (args.service === 'khutbah') params = { page: 1, limit: 5 };
            const res = await axios.get(`${IRENG_BASE_URL}${endpoint}`, { params, timeout: 15000 });
            return JSON.stringify(res.data);
        }
        if (name === 'aksara_jawa') {
            const endpoint = args.direction === 'latin_to_jawa' ? '/api/v1/aksara/latin-to-jawa' : '/api/v1/aksara/jawa-to-latin';
            const res = await axios.get(`${IRENG_BASE_URL}${endpoint}`, {
                params: { text: args.text },
                timeout: 15000,
            });
            return JSON.stringify(res.data);
        }
        if (name === 'tv_jadwal') {
            let endpoint = `/api/v1/tv/${args.type}`;
            let params = {};
            if (args.type === 'schedule') {
                endpoint = '/api/v1/tv/schedule';
                params = { channel: args.channel || 'rcti' };
            }
            const res = await axios.get(`${IRENG_BASE_URL}${endpoint}`, { params, timeout: 15000 });
            return JSON.stringify(res.data);
        }
        if (name === 'lirik_lagu') {
            const res = await axios.get(`${IRENG_BASE_URL}/api/v1/lirik/search`, {
                params: { q: args.query },
                timeout: 15000,
            });
            return JSON.stringify(res.data);
        }
        if (name === 'pddikti_search') {
            const res = await axios.get(`${IRENG_BASE_URL}/api/v1/pddikti/search`, {
                params: { q: args.query, tipe: args.type || 'all' },
                timeout: 15000,
            });
            return JSON.stringify(res.data);
        }
        if (name === 'checkhost_network') {
            const endpoint = `/api/v1/checkhost/${args.action === 'ip_info' ? 'ip-info' : args.action}`;
            const paramKey = args.action === 'whois' ? 'domain' : 'host';
            const res = await axios.get(`${IRENG_BASE_URL}${endpoint}`, {
                params: { [paramKey]: args.target },
                timeout: 15000,
            });
            if (args.action === 'ip_info' && res.data?.data?.primary_info) {
                const p = res.data.data.primary_info;
                return JSON.stringify({
                    ip: p.ip_address,
                    hostname: p.host_name,
                    isp: p.isp_org,
                    asn: p.asn,
                    negara: p.country?.replace(/\n/g, ' ').trim(),
                    kota: p.city,
                    timezone: p.time_zone,
                    local_time: p.local_time,
                });
            }
            return JSON.stringify(res.data);
        }
        if (name === 'host_server_info') {
            const diagType = args?.type || 'all';
            const sysUptime = os.uptime();
            const days = Math.floor(sysUptime / 86400);
            const hours = Math.floor((sysUptime % 86400) / 3600);
            const mins = Math.floor((sysUptime % 3600) / 60);

            const totalMemMb = Math.round(os.totalmem() / 1024 / 1024);
            const freeMemMb = Math.round(os.freemem() / 1024 / 1024);
            const usedMemMb = totalMemMb - freeMemMb;
            const memUsagePct = ((usedMemMb / totalMemMb) * 100).toFixed(1);

            const loadAvg = os.loadavg().map((v) => v.toFixed(2));

            let diskUsage = 'N/A';
            try {
                const df = execSync('df -h / | tail -n 1').toString().trim().split(/\s+/);
                diskUsage = `${df[2]} used / ${df[1]} total (${df[4]} used, ${df[3]} avail)`;
            } catch {}

            let topCpu = [];
            let topMem = [];
            if (diagType === 'all' || diagType === 'processes') {
                try {
                    const cpuOut = execSync('ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu | head -n 6')
                        .toString()
                        .trim()
                        .split('\n');
                    topCpu = cpuOut.slice(1).map((l) => {
                        const parts = l.trim().split(/\s+/);
                        return {
                            pid: parts[0],
                            user: parts[1],
                            cpu_percent: `${parts[2]}%`,
                            mem_percent: `${parts[3]}%`,
                            command: parts.slice(4).join(' '),
                        };
                    });
                } catch {}

                try {
                    const memOut = execSync('ps -eo pid,user,%cpu,%mem,comm --sort=-%mem | head -n 6')
                        .toString()
                        .trim()
                        .split('\n');
                    topMem = memOut.slice(1).map((l) => {
                        const parts = l.trim().split(/\s+/);
                        return {
                            pid: parts[0],
                            user: parts[1],
                            cpu_percent: `${parts[2]}%`,
                            mem_percent: `${parts[3]}%`,
                            command: parts.slice(4).join(' '),
                        };
                    });
                } catch {}
            }

            let pm2List = [];
            if (diagType === 'all' || diagType === 'pm2') {
                try {
                    const pm2Json = JSON.parse(execSync('npx pm2 jlist').toString());
                    pm2List = pm2Json.map((p) => ({
                        id: p.pm_id,
                        name: p.name,
                        status: p.pm2_env?.status,
                        cpu: `${p.monit?.cpu || 0}%`,
                        memory: `${Math.round((p.monit?.memory || 0) / 1024 / 1024)} MB`,
                        restarts: p.pm2_env?.restart_time || 0,
                    }));
                } catch {}
            }

            const responsePayload = {
                hostname: os.hostname(),
                os: `${os.type()} (${os.release()})`,
                platform: os.platform(),
                arch: os.arch(),
                uptime: `${days}d ${hours}h ${mins}m`,
                cpu: {
                    model: os.cpus()[0]?.model,
                    cores: os.cpus().length,
                    load_average_1_5_15m: loadAvg,
                },
                memory: {
                    total: `${(totalMemMb / 1024).toFixed(2)} GB (${totalMemMb} MB)`,
                    used: `${(usedMemMb / 1024).toFixed(2)} GB (${usedMemMb} MB)`,
                    free: `${(freeMemMb / 1024).toFixed(2)} GB (${freeMemMb} MB)`,
                    usage_percent: `${memUsagePct}%`,
                },
                disk_root: diskUsage,
            };

            if (topCpu.length) responsePayload.top_cpu_processes = topCpu;
            if (topMem.length) responsePayload.top_memory_processes = topMem;
            if (pm2List.length) responsePayload.pm2_services = pm2List;

            return JSON.stringify(responsePayload);
        }
        if (name === 'search_web' || name === 'web_search') {
            const query = args.query || args.q || '';
            // Jika query mencari hadits, alihkan ke hadits_search internal
            if (/hadits|hadis|bukhari|muslim|tirmidzi|sunan|shahih/i.test(query)) {
                const cleanQ = query.replace(/hadits|hadis|shahih|riwayat|tentang|mengenai/gi, '').trim() || query;
                const res = await axios.get(`${IRENG_BASE_URL}/api/v1/hadits/search`, {
                    params: { q: cleanQ, page: 1, limit: args.max_results || args.limit || 5 },
                    timeout: 15000,
                });
                return JSON.stringify({
                    info: 'Dialihkan ke pencarian database Hadits Digital 9 Imam',
                    result: res.data,
                });
            }
            return JSON.stringify({
                error: `Tool ${name} tidak tersedia. Gunakan tool hadits_search, bmkg_cuaca, sholat_jadwal, dll yang tersedia di daftar tools, atau jawab secara langsung.`,
            });
        }
        return JSON.stringify({ error: `Tool ${name} tidak dikenali. Gunakan tool yang ada di daftar.` });
    } catch (err) {
        return JSON.stringify({ error: err.message });
    }
}

const DS_SESSION_TTL_MS = 30 * 60 * 1000; // 30 menit
const MAX_DS_SESSION_MSGS = 20; // 10 pasang percakapan user-assistant
const dsSessions = new Map();

export const getDsSession = (chatId) => {
    const s = dsSessions.get(chatId);
    if (!s) return [];
    if (Date.now() - s.timestamp > DS_SESSION_TTL_MS) {
        dsSessions.delete(chatId);
        return [];
    }
    return s.messages;
};

export const appendDsSession = (chatId, newMessages = []) => {
    const current = getDsSession(chatId);
    const updated = [...current, ...newMessages].slice(-MAX_DS_SESSION_MSGS);
    dsSessions.set(chatId, {
        messages: updated,
        timestamp: Date.now(),
    });
};

export const clearDsSession = (chatId) => {
    dsSessions.delete(chatId);
};

/**
 * Validasi apakah pengirim adalah owner dan pesan berada di private chat
 */
function isOwnerPrivateChat(sock, m) {
    if (m?.isGroup) return false;

    const sender = m?.sender || '';
    const cleanSender = sender.split('@')[0].split(':')[0];

    const ownerJid = settings.ownerNumber || '';
    const ownerLid = settings.ownerLid || '';
    const cleanOwnerJid = ownerJid.split('@')[0].split(':')[0];
    const cleanOwnerLid = ownerLid.split('@')[0].split(':')[0];

    const botJid = sock?.user?.id || '';
    const cleanBotJid = botJid.split('@')[0].split(':')[0];

    return (
        cleanSender === cleanOwnerJid ||
        cleanSender === cleanOwnerLid ||
        (cleanBotJid && cleanSender === cleanBotJid) ||
        sender === ownerJid ||
        sender === ownerLid
    );
}

/**
 * Eksekusi prompt DeepSeek dengan memelihara session percakapan
 */
export async function handleDsChat(sock, m, promptText) {
    const inputPrompt = (promptText || '').trim();
    if (!inputPrompt) return;

    let progressKey = null;

    try {
        await m.react('⏳');

        const progressMsg = await m.reply('🔍 Sedang memproses dengan DeepSeek AI...');
        progressKey = progressMsg?.key || null;

        const isAuthorizedOwner = isOwnerPrivateChat(sock, m);

        // Filter tools: tool sensitif seperti host_server_info hanya diizinkan untuk owner di private chat
        const allowedTools = isAuthorizedOwner
            ? IRENG_TOOLS
            : IRENG_TOOLS.filter((t) => t.function?.name !== 'host_server_info');

        const history = getDsSession(m.chat);
        const systemPromptContent = isAuthorizedOwner
            ? 'Kamu adalah asisten pintar WhatsApp yang terhubung dengan API IrengCloud dan tools server lokal. ' +
              'Jika pengguna bertanya tentang kondisi server, status VPS/host, spesifikasi hardware, penggunaan CPU/RAM/disk, proses yang memakan resource banyak, atau diagnosa server, gunakan tool `host_server_info`. ' +
              'Jika pengguna bertanya tentang hadits, gunakan tool `hadits_search` atau `hadits_detail`. ' +
              'Hanya panggil tool yang terdaftar di daftar tools yang diberikan. ' +
              'Jika tool tidak tersedia, berikan jawaban terbaikmu secara langsung.'
            : 'Kamu adalah asisten pintar WhatsApp yang terhubung dengan API IrengCloud. ' +
              'Jika pengguna bertanya tentang hadits, gunakan tool `hadits_search` atau `hadits_detail`. ' +
              'Hanya panggil tool yang terdaftar di daftar tools yang diberikan. ' +
              'Jika tool tidak tersedia, berikan jawaban terbaikmu secara langsung.';

        const messages = [
            {
                role: 'system',
                content: systemPromptContent,
            },
            ...history,
            {
                role: 'user',
                content: inputPrompt,
            },
        ];

        // Panggilan pertama ke DeepSeek
        let response = await axios.post(
            `${DS_BASE_URL.replace(/\/+$/, '')}/v1/chat/completions`,
            {
                model: DEFAULT_MODEL,
                messages: messages,
                tools: allowedTools,
            },
            {
                headers: {
                    Authorization: `Bearer ${DS_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: 60000,
            }
        );

        // Loop interaksi tool call hingga menghasilkan jawaban final (maksimal 3 iterasi)
        let iterations = 0;
        const MAX_TOOL_ITERATIONS = 3;

        while (response.data?.choices?.[0]?.message?.tool_calls?.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
            iterations++;
            const assistantMsg = response.data.choices[0].message;
            messages.push(assistantMsg);

            for (const toolCall of assistantMsg.tool_calls) {
                const fnName = toolCall.function?.name;
                let fnArgs = {};
                try {
                    fnArgs = JSON.parse(toolCall.function?.arguments || '{}');
                } catch {}

                let toolResult;
                if (fnName === 'host_server_info' && !isAuthorizedOwner) {
                    toolResult = JSON.stringify({
                        error: 'Akses ditolak. Tool informasi server host hanya dapat diakses oleh Owner melalui Private Chat.',
                    });
                } else {
                    toolResult = await executeIrengTool(fnName, fnArgs);
                }

                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: toolResult,
                });
            }

            // Kirim kembali hasil tool ke DeepSeek
            response = await axios.post(
                `${DS_BASE_URL.replace(/\/+$/, '')}/v1/chat/completions`,
                {
                    model: DEFAULT_MODEL,
                    messages: messages,
                    tools: allowedTools,
                },
                {
                    headers: {
                        Authorization: `Bearer ${DS_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 60000,
                }
            );
        }

        const finalChoice = response.data?.choices?.[0];
        const finalAssistantMsg = finalChoice?.message;
        const rawAnswer = finalAssistantMsg?.content || '';
        const formattedAnswer = formatToWhatsApp(rawAnswer);

        if (!formattedAnswer) {
            throw new Error('Tidak ada jawaban dari DeepSeek API.');
        }

        // Simpan riwayat percakapan user & assistant ke session
        appendDsSession(m.chat, [
            { role: 'user', content: inputPrompt },
            { role: 'assistant', content: rawAnswer },
        ]);

        if (progressKey) {
            await sock.sendMessage(m.chat, {
                text: formattedAnswer,
                edit: progressKey,
            });
        } else {
            await m.reply(formattedAnswer);
        }

        await m.react('✅');
    } catch (error) {
        console.error('DS Command Error:', error?.response?.data || error.message);
        await m.react('❌');

        const errorMsg =
            error?.response?.data?.error?.message ||
            error?.response?.data?.message ||
            error.message ||
            'Terjadi kesalahan saat memproses permintaan.';

        const replyText = `❌ *Error*: ${errorMsg}`;

        if (progressKey) {
            await sock
                .sendMessage(m.chat, { text: replyText, edit: progressKey })
                .catch(() => m.reply(replyText));
        } else {
            await m.reply(replyText);
        }
    }
}

export default {
    name: 'ds',
    aliases: ['deepseek', 'dseeker'],
    description: 'Tanya DeepSeek AI dengan Web Search & Tool Suite IrengCloud (.ds <pertanyaan>)',
    category: 'AI',
    execute: async (sock, m, args, text) => {
        const inputPrompt = (text || m.quoted?.text || '').trim();

        if (!inputPrompt) {
            return m.reply(
                `*DeepSeek AI + IrengCloud Tools*\n\n` +
                `Format: *${settings.prefix}ds <pertanyaan>*\n` +
                `Atau reply pesan bot / tag bot untuk ngobrol langsung bersambung!\n\n` +
                `_Contoh:_\n` +
                `• ${settings.prefix}ds Info gempa terbaru BMKG dong\n` +
                `• ${settings.prefix}ds Jadwal sholat Surabaya hari ini\n` +
                `• ${settings.prefix}ds Cari hadits tentang menuntut ilmu\n` +
                `• ${settings.prefix}ds Tulis aksara jawa: Sugeng Rawuh\n` +
                `• ${settings.prefix}ds Lirik lagu Bohemian Rhapsody Queen`
            );
        }

        await handleDsChat(sock, m, inputPrompt);
    },
};

import { exec } from 'child_process';
import { promisify } from 'util';
import { performance } from 'perf_hooks';
import axios from 'axios';

const execAsync = promisify(exec);
const CLI_TIMEOUT_MS = 60000;
const HTTP_TIMEOUT_MS = 60000;

const formatMbps = (value) => {
    if (!Number.isFinite(value) || value <= 0) return '-';
    if (value >= 1000) return `${(value / 1000).toFixed(2)} Gbps`;
    return `${value.toFixed(2)} Mbps`;
};

const formatMs = (value) => {
    if (!Number.isFinite(value) || value <= 0) return '-';
    return `${value.toFixed(2)} ms`;
};

const runCliSpeedtest = async () => {
    const commands = ['speedtest --accept-license --accept-gdpr -f json', 'speedtest-cli --json'];

    for (const command of commands) {
        try {
            const { stdout } = await execAsync(command, {
                timeout: CLI_TIMEOUT_MS,
                maxBuffer: 5 * 1024 * 1024,
            });
            const raw = stdout?.trim();
            if (!raw) continue;

            const data = JSON.parse(raw);

            if (command.startsWith('speedtest ')) {
                return {
                    source: 'Ookla CLI',
                    ping: Number(data?.ping?.latency),
                    download: (Number(data?.download?.bandwidth) * 8) / 1_000_000,
                    upload: (Number(data?.upload?.bandwidth) * 8) / 1_000_000,
                    serverName: data?.server?.name || null,
                    isp: data?.isp || null,
                };
            }

            return {
                source: 'speedtest-cli',
                ping: Number(data?.ping),
                download: Number(data?.download) / 1_000_000,
                upload: Number(data?.upload) / 1_000_000,
                serverName: data?.server?.name || data?.server?.sponsor || (typeof data?.server === 'string' ? data.server : null),
                isp: data?.client?.isp || null,
            };
        } catch (error) {
            continue;
        }
    }

    throw new Error('Speedtest CLI tidak dapat dijalankan');
};

const measureLatency = async () => {
    const tries = 5;
    const pings = [];
    for (let i = 0; i < tries; i++) {
        const start = performance.now();
        await axios.head('https://speed.cloudflare.com/__down?bytes=0', {
            timeout: 5000,
        });
        pings.push(performance.now() - start);
    }
    pings.sort((a, b) => a - b);
    const trimmed = pings.slice(1, -1);
    return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
};

const measureDownload = async () => {
    const sizes = [10_000_000, 25_000_000];
    const results = [];

    for (const size of sizes) {
        try {
            const start = performance.now();
            const response = await axios.get(`https://speed.cloudflare.com/__down?bytes=${size}`, {
                timeout: HTTP_TIMEOUT_MS,
                responseType: 'arraybuffer',
                maxContentLength: 50_000_000,
            });
            const elapsed = (performance.now() - start) / 1000;
            const bytes = response.data.byteLength || size;
            results.push((bytes * 8) / elapsed / 1_000_000);
        } catch {
            continue;
        }
    }

    if (results.length === 0) throw new Error('Download test gagal');
    return Math.max(...results);
};

const measureUpload = async () => {
    const sizes = [2_000_000, 5_000_000];
    const results = [];

    for (const size of sizes) {
        try {
            const data = Buffer.alloc(size);
            const start = performance.now();
            await axios.post('https://speed.cloudflare.com/__up', data, {
                timeout: HTTP_TIMEOUT_MS,
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': size,
                },
                maxBodyLength: 10_000_000,
            });
            const elapsed = (performance.now() - start) / 1000;
            results.push((size * 8) / elapsed / 1_000_000);
        } catch {
            continue;
        }
    }

    if (results.length === 0) return null;
    return Math.max(...results);
};

const runFallbackSpeedtest = async () => {
    const pingMs = await measureLatency();
    const downloadMbps = await measureDownload();
    const uploadMbps = await measureUpload();

    return {
        source: 'HTTP fallback',
        ping: pingMs,
        download: downloadMbps,
        upload: uploadMbps,
        serverName: 'Cloudflare',
        isp: null,
    };
};

export default {
    name: 'speedtest',
    aliases: ['speed'],
    description: 'Tes kecepatan internet server bot.',
    category: 'Tools',
    execute: async (sock, m) => {
        await m.react('⏳');
        await m.reply('⏱️ Mengukur kecepatan server, mohon tunggu...');

        try {
            let result;
            try {
                result = await runCliSpeedtest();
            } catch (cliErr) {
                result = await runFallbackSpeedtest();
            }

            const lines = [
                '🌐 *SPEEDTEST HASIL*',
                '',
                `• 🏓 Ping: ${formatMs(result.ping)}`,
                `• ⬇️ Download: ${formatMbps(result.download)}`,
                `• ⬆️ Upload: ${formatMbps(result.upload)}`,
                `• 📡 Server: ${result.serverName || '-'}`,
                `• 🔧 Metode: ${result.source}`,
            ];

            if (result.isp) lines.push(`• 🏢 ISP: ${result.isp}`);

            await sock.sendMessage(m.chat, { text: lines.join('\n') }, { quoted: m });
            await m.react('✅');
        } catch (err) {
            await m.react('❌');
            await m.reply(`❌ Speedtest gagal: ${err.message}`);
        }
    },
};

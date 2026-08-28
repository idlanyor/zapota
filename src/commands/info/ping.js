import os from 'os';
import { performance } from 'perf_hooks';

/**
 * Format milliseconds to a readable string (HH:MM:SS)
 */
function clockString(ms) {
    let h = Math.floor(ms / 3600000);
    let m = Math.floor(ms / 60000) % 60;
    let s = Math.floor(ms / 1000) % 60;
    return [h, m, s].map((v) => v.toString().padStart(2, 0)).join(':');
}

export default {
    name: 'ping',
    aliases: ['p', 'stats'],
    description: 'Check bot status and performance.',
    category: 'Info',
    execute: async (sock, m, args) => {
        const start = performance.now();

        // Stats Logic
        const uptime = clockString(process.uptime() * 1000);
        const usedMem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const cpuModel = os.cpus()[0].model.split(' ')[0]; // Ambil brand CPU-nya aja biar gak kepanjangan

        // Hitung speed respon (dummy ping)
        const end = performance.now();
        const latensi = (end - start).toFixed(4);

        const statsText =
            `*P O N G !* \n\n` +
            `➛ *Respon:* ${latensi} ms\n` +
            `➛ *Uptime:* ${uptime}\n` +
            `➛ *RAM:* ${usedMem} MB / ${totalMem} GB\n` +
            `➛ *OS:* ${os.platform()} (${cpuModel})\n\n` +
            `_Kanata System is active._`;

        const payload = {
            text: statsText,
            footer: 'Aksi cepat',
            title: 'KANATA BOT PERFORMANCE',
            interactiveButtons: [
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: 'Speedtest',
                        id: '.speedtest',
                    }),
                },
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: 'System Info',
                        id: '.is',
                    }),
                },
            ],
        };

        if (typeof sock.sendInteractiveButtons === 'function') {
            try {
                await sock.sendInteractiveButtons(m.chat, payload, { quoted: m });
                return;
            } catch {}
        }

        await sock.sendMessage(
            m.chat,
            {
                text: statsText,
            },
            { quoted: m }
        );
    },
};

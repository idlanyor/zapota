import os from 'os';
import fs from 'fs';
import { prepareWAMessageMedia } from 'baileys';
import { settings } from '../../config/settings.js';

export default {
    name: 'is',
    aliases: ['system', 'status', 'botstat'],
    description: 'Menampilkan informasi sistem bot',
    category: 'Info',
    execute: async (sock, m, args, text) => {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        const uptimeString = `${hours}j ${minutes}m ${seconds}d`;

        // System Uptime
        const sysUptime = os.uptime();
        const sysDays = Math.floor(sysUptime / 86400);
        const sysHours = Math.floor((sysUptime % 86400) / 3600);
        const sysMinutes = Math.floor((sysUptime % 3600) / 60);
        const sysUptimeString = `${sysDays}d ${sysHours}j ${sysMinutes}m`;

        const ramUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
        const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeRam = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);

        const sourceUrl = 'https://github.com/idlanyor/my-kanata';
        let info = `*── 「 SYSTEM STATUS 」 ──*\n\n`;
        info += `➛ *OS:* ${os.type()} (${os.release()})\n`;
        info += `➛ *Architecture:* ${os.arch()}\n`;
        info += `➛ *Platform:* ${os.platform()}\n`;
        info += `➛ *Node.js:* ${process.version}\n`;
        info += `➛ *Bot Uptime:* ${uptimeString}\n`;
        info += `➛ *System Uptime:* ${sysUptimeString}\n`;
        info += `➛ *Memory Usage:* ${ramUsage} MB\n`;
        info += `➛ *Total RAM:* ${totalRam} GB\n`;
        info += `➛ *Free RAM:* ${freeRam} GB\n`;
        info += `➛ *CPU:* ${os.cpus()[0].model} (${os.cpus().length} Cores)\n\n`;
        info += `*© ${settings.botName}*\n\n`;
        info += `${sourceUrl}`;

        let thumbnail;
        try {
            thumbnail = fs.readFileSync('./src/assets/sysstatus.png');
        } catch (e) {
            thumbnail = null;
        }

        if (thumbnail) {
            try {
                const media = await prepareWAMessageMedia(
                    { image: thumbnail },
                    {
                        upload: sock.waUploadToServer,
                        mediaTypeOverride: 'thumbnail-link',
                    }
                );

                const { imageMessage: thumb } = media;

                const content = {
                    extendedTextMessage: {
                        text: info,
                        matchedText: sourceUrl,
                        title: `System Monitoring: ${settings.botName}`,
                        description: `Platform: ${os.platform()} | Node: ${process.version}`,
                        previewType: 0,
                        jpegThumbnail: thumb.jpegThumbnail,
                        thumbnailDirectPath: thumb.directPath,
                        thumbnailSha256: thumb.fileSha256,
                        thumbnailEncSha256: thumb.fileEncSha256,
                        mediaKey: thumb.mediaKey,
                        mediaKeyTimestamp: thumb.mediaKeyTimestamp,
                        thumbnailHeight: thumb.height,
                        thumbnailWidth: thumb.width,
                        contextInfo: {
                            forwardingScore: 999,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363315101220471@newsletter',
                                serverMessageId: null,
                                newsletterName: `System Status: ${settings.botName}`,
                            },
                            stanzaId: m.key.id,
                            participant: m.sender,
                            quotedMessage: m.message,
                        },
                    },
                };

                return await sock.relayMessage(m.chat, content, {});
            } catch (err) {
                console.error('Failed to prepare spoofed link preview:', err);
            }
        }

        // Fallback to normal message if anything fails
        await sock.sendMessage(
            m.chat,
            {
                text: info,
                contextInfo: {
                    externalAdReply: {
                        title: `System Monitoring: ${settings.botName}`,
                        body: `Platform: ${os.platform()} | Node: ${process.version}`,
                        mediaType: 1,
                        renderLargerThumbnail: false,
                        showAdAttribution: true,
                        thumbnailUrl: 'https://s3.ireng.uk/13800c0f064f58af8d97c5ce065c00b4.png',
                        sourceUrl: sourceUrl,
                    },
                },
            },
            {
                quoted: m,
            }
        );
    },
};

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prepareWAMessageMedia } from 'baileys';
import sharp from 'sharp';
import { commands } from '../../lib/commands.js';
import { settings } from '../../config/settings.js';
import Settings from '../../database/models/Settings.js';

const MAIN_MENU_IMAGE_PATH = fileURLToPath(
    new URL('../../assets/kanata-mascot-banner-v4-clay.png', import.meta.url)
);
const SUBMENU_IMAGE_PATH = fileURLToPath(
    new URL('../../assets/kanata-mascot-banner-v3.png', import.meta.url)
);
const KANATA_SITE_URL = 'https://kanata.irengcloud.com';
let mainMenuThumbnailPromise;
let submenuThumbnailPromise;
const menuHeaderImageCache = new WeakMap();

const prepareThumbnail = (imagePath, quality = 76) =>
    readFile(imagePath)
        .then((image) =>
            sharp(image)
                .flatten({ background: '#ffffff' })
                .resize(600, 400, { fit: 'cover' })
                .jpeg({ quality, mozjpeg: true })
                .toBuffer()
        )
        .catch(() => null);

const getMainMenuThumbnail = () => {
    mainMenuThumbnailPromise ??= prepareThumbnail(MAIN_MENU_IMAGE_PATH);
    return mainMenuThumbnailPromise;
};

const getSubmenuThumbnail = () => {
    submenuThumbnailPromise ??= prepareThumbnail(SUBMENU_IMAGE_PATH, 80);
    return submenuThumbnailPromise;
};

const getMenuHeaderImage = (sock, thumbnail) => {
    if (!thumbnail || !sock || typeof sock !== 'object') return Promise.resolve(null);
    if (menuHeaderImageCache.has(sock)) return menuHeaderImageCache.get(sock);

    const prepared = (async () => {
        try {
            if (sock.__zapo?.message?.upload) {
                const media = await sock.__zapo.message.upload(thumbnail, {
                    type: 'image',
                    mimetype: 'image/jpeg',
                });
                return {
                    url: media.url,
                    directPath: media.directPath,
                    mediaKey: media.mediaKey,
                    fileSha256: media.fileSha256,
                    fileEncSha256: media.fileEncSha256,
                    fileLength: media.fileLength,
                    mediaKeyTimestamp: media.mediaKeyTimestamp,
                    mimetype: 'image/jpeg',
                    height: 400,
                    width: 600,
                    jpegThumbnail: thumbnail,
                };
            }

            if (typeof sock.waUploadToServer === 'function') {
                const media = await prepareWAMessageMedia(
                    { image: thumbnail },
                    { upload: sock.waUploadToServer }
                );
                return media.imageMessage || null;
            }
        } catch {
            return null;
        }
        return null;
    })();

    menuHeaderImageCache.set(sock, prepared);
    return prepared;
};

// Category mapping for better organization
const categoryOrder = [
    'AI',
    'Downloader',
    'Sticker',
    'Tools',
    'Islamic',
    'Culture',
    'Group',
    'Finance',
    'Blog',
    'Utility',
    'Panel',
    'Cloudflare',
    'Users',
    'General',
    'Info',
    'RPG',
    'Games',
    'Owner',
];

const categoryIcons = {
    AI: '✦',
    Downloader: '↓',
    Sticker: '◇',
    Tools: '⌁',
    Islamic: '☾',
    Culture: '◉',
    Group: '♟',
    Finance: '₿',
    Blog: '✎',
    Utility: '◆',
    Panel: '▦',
    Cloudflare: '☁',
    Users: '♙',
    General: '●',
    Info: 'ⓘ',
    RPG: '⚔',
    Games: '♜',
    Owner: '♛',
};

const categoryGroups = [
    { title: 'Kreasi & Konten', categories: ['AI', 'Downloader', 'Sticker', 'Tools'] },
    {
        title: 'Komunitas & Layanan',
        categories: ['Islamic', 'Culture', 'Group', 'Finance', 'Blog', 'Utility'],
    },
    {
        title: 'Sistem & Akun',
        categories: ['Panel', 'Cloudflare', 'Users', 'General', 'Info'],
    },
    { title: 'Hiburan & Akses', categories: ['RPG', 'Games', 'Owner'] },
];

export default {
    name: 'menu',
    aliases: ['help', 'cmd'],
    description: 'Show available commands in text format',
    category: 'Info',
    execute: async (sock, m, args, text) => {
        let botSettings = await Settings.findOne({ id: 'bot_settings' });
        const disabledList = botSettings ? botSettings.disabledCommands : [];

        const uniqueCommands = Array.from(new Set(commands.values()));
        const categories = {};

        uniqueCommands.forEach((cmd) => {
            if (disabledList.includes(cmd.name)) return;
            if (cmd.name === 'menu') return;

            const cat = cmd.category || 'General';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(cmd);
        });

        const sortedCategories = Object.keys(categories).sort((a, b) => {
            const aIndex = categoryOrder.indexOf(a);
            const bIndex = categoryOrder.indexOf(b);
            return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
        });

        const now = new Date();
        const date = now.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'Asia/Jakarta',
        });
        const time = now.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Jakarta',
        });

        const getWeton = (currentDate) => {
            const pasaran = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon'];
            const hari = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
            const dayName = hari[currentDate.getDay()];
            const baseDate = new Date('1900-01-01');
            const diffDays = Math.floor((currentDate - baseDate) / (1000 * 60 * 60 * 24));
            const pasaranName = pasaran[(diffDays + 1) % 5];
            return `${dayName} ${pasaranName}`;
        };

        const weton = getWeton(now);
        let inputCategory = args[0]?.toLowerCase();
        if (inputCategory === 'game') inputCategory = 'games';

        const botName = settings.botName.replaceAll('_', ' ').toUpperCase();
        const header = [
            `╭─ *${botName}*`,
            `│ Halo, @${m.sender.split('@')[0]}`,
            `│ ${weton} · ${date}`,
            `│ ${time} WIB · Prefix \`${settings.prefix}\``,
            '╰──────────────────',
        ].join('\n');

        if (!inputCategory) {
            const thumbnail = await getMainMenuThumbnail();
            const imageMessage = await getMenuHeaderImage(sock, thumbnail);
            const categoryRows = sortedCategories.map((cat) => {
                const icon = categoryIcons[cat] || '•';
                const command = `${settings.prefix}menu ${cat.toLowerCase()}`;
                return `${icon} *${cat}* · ${categories[cat].length}  \`${command}\``;
            });

            const menuText = [
                header,
                '',
                '*DIREKTORI MENU*',
                'Pilih kategori untuk melihat perintahnya.',
                '',
                ...categoryRows,
                '',
                `└ Mulai dari \`${settings.prefix}menu rpg\``,
            ].join('\n');

            const listedCategories = new Set(categoryGroups.flatMap((group) => group.categories));
            const sectionSpecs = [
                ...categoryGroups,
                {
                    title: 'Lainnya',
                    categories: sortedCategories.filter((cat) => !listedCategories.has(cat)),
                },
            ];
            const sections = sectionSpecs
                .map((group) => ({
                    title: group.title,
                    rows: group.categories
                        .filter((cat) => categories[cat])
                        .map((cat) => ({
                            title: `${categoryIcons[cat] || '•'} ${cat}`,
                            description: `${categories[cat].length} perintah tersedia`,
                            id: `${settings.prefix}menu ${cat.toLowerCase()}`,
                        })),
                }))
                .filter((section) => section.rows.length > 0);

            try {
                return await sock.sendMessage(
                    m.chat,
                    {
                        interactiveMessage: {
                            ...(imageMessage
                                ? {
                                      header: {
                                          hasMediaAttachment: true,
                                          imageMessage,
                                      },
                                  }
                                : {}),
                            body: {
                                text: `${header}\n\nPilih kategori yang ingin kamu buka.`,
                            },
                            contextInfo: {
                                mentionedJid: [m.sender],
                            },
                            footer: {
                                text: `${botName} · ${sortedCategories.length} kategori`,
                            },
                            nativeFlowMessage: {
                                messageVersion: 1,
                                buttons: [
                                    {
                                        name: 'single_select',
                                        buttonParamsJson: JSON.stringify({
                                            title: 'Buka direktori',
                                            sections,
                                        }),
                                    },
                                ],
                            },
                        },
                    },
                    { quoted: m }
                );
            } catch {
                // Fall through to the readable text directory for unsupported clients/transports.
            }

            return sock.sendMessage(
                m.chat,
                {
                    text: menuText,
                    mentions: [m.sender],
                },
                { quoted: m }
            );
        }

        const selectedCat = sortedCategories.find((c) => c.toLowerCase() === inputCategory);
        if (!selectedCat) {
            return m.reply(`Kategori *${args[0]}* tidak ditemukan.\nKetik \`${settings.prefix}menu\` untuk melihat daftar kategori.`);
        }

        categories[selectedCat].sort((a, b) => a.name.localeCompare(b.name));
        const icon = categoryIcons[selectedCat] || '•';
        const commandRows = categories[selectedCat].map(
            (cmd) => `│  \`${settings.prefix}${cmd.name}\``
        );
        const menuText = [
            `╭─ ${icon} *${selectedCat.toUpperCase()}*`,
            `│  ${categories[selectedCat].length} perintah tersedia`,
            '├──────────────────',
            ...commandRows,
            '╰──────────────────',
            `Kembali ke direktori: \`${settings.prefix}menu\``,
        ].join('\n');
        const submenuThumbnail = await getSubmenuThumbnail();

        await sock.sendMessage(
            m.chat,
            {
                text: menuText,
                ...(submenuThumbnail
                    ? {
                          contextInfo: {
                              externalAdReply: {
                                  title: `${icon} MENU ${selectedCat.toUpperCase()}`,
                                  body: `${botName} · ${categories[selectedCat].length} perintah`,
                                  mediaType: 1,
                                  renderLargerThumbnail: true,
                                  thumbnail: submenuThumbnail,
                                  sourceUrl: KANATA_SITE_URL,
                                  mediaUrl: KANATA_SITE_URL,
                              },
                          },
                      }
                    : {}),
            },
            { quoted: m }
        );
    },
};

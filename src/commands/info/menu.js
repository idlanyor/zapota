import { getBotSettings } from '../../services/settingsService.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { commands } from '../../lib/commands.js';
import { settings } from '../../config/settings.js';
import { sendLinkPreviewText } from '../../wa/linkPreview.js';

const MAIN_MENU_IMAGE_PATH = fileURLToPath(
    new URL('../../assets/kanata-mascot-banner-v4-clay.png', import.meta.url)
);
const SUBMENU_IMAGE_PATH = fileURLToPath(
    new URL('../../assets/kanata-mascot-banner-v3.png', import.meta.url)
);
const KANATA_SITE_URL = 'https://kanata.irengcloud.com';
let mainMenuThumbnailPromise;
let submenuThumbnailPromise;

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

/**
 * Menu as a link-preview text (the `.is` style, which regular WhatsApp shows).
 * Falls back to banner image + caption, then plain text.
 */
const sendMenu = async (sock, m, { text, thumbnail, title, description, mentions = [] }) => {
    if (thumbnail) {
        try {
            return await sendLinkPreviewText(sock, m, {
                text: `${text}\n\n${KANATA_SITE_URL}`,
                url: KANATA_SITE_URL,
                title,
                description,
                image: thumbnail,
                mentions,
            });
        } catch (err) {
            console.error('Menu link preview failed, sending image instead:', err.message);
        }
    }
    return sock.sendMessage(
        m.chat,
        thumbnail ? { image: thumbnail, caption: text, mentions } : { text, mentions },
        { quoted: m }
    );
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

export default {
    name: 'menu',
    aliases: ['help', 'cmd'],
    description: 'Show available commands in text format',
    category: 'Info',
    execute: async (sock, m, args, text) => {
        let botSettings = await getBotSettings();
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

            return sendMenu(sock, m, {
                text: menuText,
                thumbnail,
                title: botName,
                description: `${sortedCategories.length} kategori · ${date}`,
                mentions: [m.sender],
            });
        }

        const selectedCat = sortedCategories.find((c) => c.toLowerCase() === inputCategory);
        if (!selectedCat) {
            return m.reply(
                `Kategori *${args[0]}* tidak ditemukan.\nKetik \`${settings.prefix}menu\` untuk melihat daftar kategori.`
            );
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

        await sendMenu(sock, m, {
            text: menuText,
            thumbnail: submenuThumbnail,
            title: `${icon} MENU ${selectedCat.toUpperCase()}`,
            description: `${botName} · ${categories[selectedCat].length} perintah`,
        });
    },
};

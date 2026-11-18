import axios from 'axios';
import { settings } from '../../config/settings.js';
import { getMessage } from '../../lib/msgStore.js';
import { renderQuote, quoteTextLength, MAX_QUOTE_LENGTH } from '../../lib/quoteRenderer.js';
import { Sticker, StickerTypes } from '../../lib/stickerFormatter.js';

const getAvatar = async (sock, sender) => {
    let timer;
    try {
        const url = await Promise.race([
            sock.profilePictureUrl(sender, 'preview', 3000),
            new Promise((resolve) => { timer = setTimeout(() => resolve(null), 3000); }),
        ]);
        if (!url) return null;
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 3000,
            maxContentLength: 2 * 1024 * 1024,
        });
        return Buffer.from(response.data);
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
};

const getSenderName = async (sock, m, source, sender) => {
    const stored = source.id ? getMessage(source.id) : null;
    const knownName = source.pushName || stored?.pushName ||
        (sender === m.sender ? m.pushName : null);
    if (knownName) return knownName;
    if (source.fromMe) return settings.botName;
    try {
        const contactName = await sock.getName?.(sender);
        if (contactName) return contactName;
    } catch {}
    return sender?.split('@')[0] || 'Pengguna';
};

export default {
    name: 'qc',
    aliases: ['quotly', 'quotesticker'],
    description: 'Buat stiker kutipan: reply pesan dengan .qc atau .qc <teks>',
    category: 'Sticker',
    execute: async (sock, m, args, text = '') => {
        const inline = text.trim();
        const source = inline ? m : m.quoted;
        const quote = inline || source?.text?.trim() || '';
        if (!quote) {
            return m.reply(`Balas pesan teks dengan *${settings.prefix}qc*, atau ketik *${settings.prefix}qc <teks>*.`);
        }
        if (quoteTextLength(quote) > MAX_QUOTE_LENGTH) {
            return m.reply(`Teks kutipan maksimal ${MAX_QUOTE_LENGTH} karakter. Pendekkan teksnya dulu.`);
        }
        const sender = source.sender || m.sender;
        const react = async (emoji) => {
            try { await m.react(emoji); } catch {}
        };
        await react('⏳');
        try {
            const [name, avatarBuffer] = await Promise.all([
                getSenderName(sock, m, source, sender),
                getAvatar(sock, sender),
            ]);
            const image = await renderQuote({ text: quote, name, avatarBuffer });
            const sticker = await new Sticker(image, {
                pack: settings.botName,
                author: name,
                type: StickerTypes.FULL,
                quality: 90,
            }).toBuffer();
            await sock.sendMessage(m.chat, { sticker }, { quoted: m });
            await react('✅');
        } catch (error) {
            console.error('QC error:', error.message);
            await react('❌');
            await m.reply('Gagal membuat stiker kutipan. Coba teks yang lebih pendek dan sedikit baris.');
        }
    },
};

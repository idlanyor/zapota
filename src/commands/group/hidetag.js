import { isParticipantAdmin } from '../../lib/groupRoles.js';

/** Re-send a replied image/video/audio/sticker/document with everyone mentioned. */
const mediaMessage = (quoted, buffer, caption, mentions) => {
    if (quoted.isImage) return { image: buffer, caption, mentions };
    if (quoted.isVideo) return { video: buffer, caption, mentions };
    if (quoted.isAudio) {
        return { audio: buffer, mimetype: quoted.msg?.mimetype || 'audio/mp4', mentions };
    }
    if (quoted.isSticker) return { sticker: buffer, mentions };
    if (quoted.isDocument) {
        return {
            document: buffer,
            mimetype: quoted.msg?.mimetype || 'application/octet-stream',
            fileName: quoted.msg?.fileName || 'document',
            caption,
            mentions,
        };
    }
    return null;
};

export default {
    name: 'hidetag',
    aliases: ['ht', 'tagall'],
    description: 'Tag semua anggota grup (teks, atau reply media untuk mengirim ulang)',
    category: 'Group',
    // Admins of the group, or the bot owner (who need not be an admin there).
    guards: ['group'],
    execute: async (sock, m, args, text) => {
        let participants = [];
        try {
            participants = (await sock.groupMetadata(m.chat)).participants || [];
        } catch {
            participants = m.metadata?.participants || [];
        }
        if (!participants.length) return m.reply('Gagal mengambil daftar anggota grup.');

        if (!m.isOwner && !isParticipantAdmin(participants, m.sender)) {
            return m.reply('Perintah ini khusus admin grup.');
        }

        const mentions = participants.map((p) => p.id);
        const content = text || m.quoted?.text || (m.quoted ? '' : 'Attention everyone!');

        const quoted = m.quoted;
        if (quoted && typeof quoted.download === 'function') {
            const hasMedia =
                quoted.isImage ||
                quoted.isVideo ||
                quoted.isAudio ||
                quoted.isSticker ||
                quoted.isDocument;
            if (hasMedia) {
                const message = mediaMessage(quoted, await quoted.download(), content, mentions);
                if (message) return sock.sendMessage(m.chat, message);
            }
        }

        await sock.sendMessage(m.chat, { text: content || 'Attention everyone!', mentions });
    },
};

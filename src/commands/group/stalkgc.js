const extractInviteCode = (input = '') => {
    const text = String(input).trim();
    if (!text) return null;

    const patterns = [
        /chat\.whatsapp\.com\/(?:invite\/)?([0-9A-Za-z]{20,})/i,
        /whatsapp\.com\/(?:invite\/)?([0-9A-Za-z]{20,})/i,
        /^([0-9A-Za-z]{20,})$/,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return match[1];
    }

    return null;
};

const formatList = (items = [], limit = 5) => {
    if (!Array.isArray(items) || items.length === 0) return '-';
    return items
        .slice(0, limit)
        .map((item) => {
            if (typeof item === 'string') return item;
            if (item?.id) return item.id;
            if (item?.jid) return item.jid;
            if (item?.name) return item.name;
            return String(item);
        })
        .join(', ');
};

export default {
    name: 'stalkgc',
    aliases: ['gcstalk', 'stalkgroup'],
    description: 'Cek info grup dari link invite WhatsApp',
    category: 'Group',
    execute: async (sock, m, args, text) => {
        const input = text || args[0];
        if (!input) {
            return m.reply(`Usage: .stalkgc <link invite grup>`);
        }

        const inviteCode = extractInviteCode(input);
        if (!inviteCode) {
            return m.reply('Link invite grup tidak valid.');
        }

        await m.react('⏳');

        try {
            const info = await sock.groupGetInviteInfo(inviteCode);
            const participants = Array.isArray(info.participants) ? info.participants : [];
            const admins = participants.filter(
                (p) => p?.admin === 'admin' || p?.admin === 'superadmin'
            );

            const subject = info.subject || info.name || '-';
            const desc = info.desc || info.description || '-';
            const descText = String(desc).trim() || '-';
            const groupId = info.id || info.jid || '-';

            let msg = `*── 「 STALK GC 」 ──*\n\n`;
            msg += `➛ *Nama:* ${subject}\n`;
            msg += `➛ *ID:* ${groupId}\n`;
            msg += `➛ *Member:* ${info.size || participants.length || '-'}\n`;
            msg += `➛ *Admin:* ${admins.length || '-'}\n`;
            msg += `➛ *Desc:* ${descText}\n`;
            msg += `➛ *Invite Code:* ${inviteCode}\n`;

            if (participants.length > 0) {
                msg += `➛ *Sample Member:* ${formatList(participants, 5)}\n`;
            }

            await m.reply(msg.trim());
            await m.react('✅');
        } catch (error) {
            console.error('StalkGC Error:', error);
            await m.react('❌');
            await m.reply(`Gagal mengambil info grup: ${error.message}`);
        }
    },
};

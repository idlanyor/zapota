import { jadibotService } from '../../services/jadibotService.js';
import { settings } from '../../config/settings.js';

const LIVE = { open: '🟢', connecting: '🟡', close: '🟠', offline: '⚫' };

const tanggal = (d) =>
    d
        ? new Date(d).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
          })
        : '-';

export default {
    name: 'listjadibot',
    aliases: ['listsubbot'],
    description: 'Daftar semua jadibot (Owner)',
    category: 'Jadibot',
    guards: ['owner'],
    execute: async (sock, m) => {
        const bots = await jadibotService.listAll();
        if (!bots.length) return m.reply('Belum ada jadibot.');

        const free = bots.filter((b) => b.tier !== 'premium' && b.status !== 'stopped').length;
        const lines = bots.map(
            (b, i) =>
                `${i + 1}. ${LIVE[b.live] || '⚫'} ${b.number} — ` +
                (b.tier === 'premium' ? `💎 s/d ${tanggal(b.premiumUntil)}` : 'Free') +
                (b.status === 'pending' ? ' (menunggu pairing)' : '') +
                (b.status === 'stopped' ? ' (dihentikan)' : '')
        );
        return m.reply(
            `🤖 *DAFTAR JADIBOT* (${bots.length})\n` +
                `Slot Free: ${free}/${settings.jadibotMax}\n\n` +
                lines.join('\n')
        );
    },
};

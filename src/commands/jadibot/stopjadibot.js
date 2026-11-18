import { jadibotService, normalizeNumber } from '../../services/jadibotService.js';
import { resolveSenderInfo } from '../../utils/phoneLookup.js';

export default {
    name: 'stopjadibot',
    aliases: ['stopsubbot'],
    description: 'Hentikan jadibot kamu (Owner: .stopjadibot <nomor>)',
    category: 'Jadibot',
    execute: async (sock, m, args) => {
        let number;
        if (args[0]) {
            if (!m.isOwner)
                return m.reply('❌ Kamu hanya bisa menghentikan jadibot milikmu sendiri.');
            number = normalizeNumber(args[0]);
        } else {
            const { canonicalJid, phoneNumber } = await resolveSenderInfo(m);
            if (!canonicalJid?.endsWith('@s.whatsapp.net')) {
                return m.reply('❌ Nomor WhatsApp kamu tidak terbaca. Coba lagi nanti.');
            }
            number = phoneNumber;
        }

        const bot = await jadibotService.describe(number);
        if (!bot || (bot.status === 'stopped' && bot.live === 'offline')) {
            return m.reply(
                args[0]
                    ? `Tidak ada jadibot aktif untuk ${number}.`
                    : 'Kamu tidak punya jadibot aktif.'
            );
        }

        await jadibotService.stopSession(number);
        return m.reply(
            `🛑 Jadibot ${number} dihentikan dan perangkatnya sudah dilepas.` +
                (bot.tier === 'premium' ? '\nMasa Premium tetap tersimpan.' : '')
        );
    },
};

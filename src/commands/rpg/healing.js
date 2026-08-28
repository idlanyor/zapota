import { getOrCreatePlayer } from '../../services/rpgService.js';
import { sendRpgReply } from '../../lib/rpgVisuals.js';

export default {
    name: 'healing',
    aliases: ['warkop', 'rs', 'puskesmas', 'ngopi', 'berobat'],
    description: 'Memulihkan HP dan Kewarasan melalui Warkop, Rumah Sakit, atau Liburan',
    category: 'RPG',
    execute: async (sock, m, args, text) => {
        const sender = m.sender;
        const cmd =
            m.command ||
            (m.body ? m.body.slice(1).trim().split(/\s+/)[0].toLowerCase() : 'healing');

        try {
            const { user, player } = await getOrCreatePlayer(sender, m.pushName);

            // Action: Nongkrong di Warkop
            const doWarkop = async () => {
                const cost = 5000;
                if ((user.balance || 0) < cost) {
                    return m.reply('💸 Uangmu kurang untuk bayar kopi! (Butuh Rp 5.000)');
                }

                user.balance -= cost;
                await user.save();

                player.kewarasan = Math.min(100, player.kewarasan + 20);
                player.gizi = Math.min(100, player.gizi + 5);
                player.energi = Math.min(player.maxEnergi, player.energi + 15);
                await player.save();

                return sendRpgReply(
                    sock,
                    m,
                    `☕ *NGOPI SANTAI DI WARKOP 24 JAM* ☕\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `Kamu duduk di warkop sambil ngobrol politik dan main kartu sama bapak-bapak.\n\n` +
                        `📈 *Efek:* Kewarasan +20 | Energi +15 | Gizi +5\n` +
                        `💵 Biaya: Rp 5.000\n` +
                        `🧠 Kewarasan saat ini: ${player.kewarasan}/100`,
                    'recoveryWarkop'
                );
            };

            // Action: Berobat di RS / Puskesmas
            const doRS = async () => {
                const cost = 30000;
                if ((user.balance || 0) < cost) {
                    return m.reply(
                        '💸 Uangmu tidak cukup untuk biaya pendaftaran RS! (Butuh Rp 30.000)'
                    );
                }

                if (player.hp >= player.maxHp) {
                    return m.reply('❤️ Kondisi badanmu masih prima dan sehat walafiat!');
                }

                user.balance -= cost;
                await user.save();

                player.hp = player.maxHp;
                player.kewarasan = Math.min(100, player.kewarasan + 10);
                await player.save();

                return sendRpgReply(
                    sock,
                    m,
                    `🏥 *BEROBAT DI PUSKESMAS / RS DAERAH* 🏥\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `Setelah mengantre dan diperiksa dokter, kamu diberikan obat & infus vitamin.\n\n` +
                        `❤️ *Efek:* HP Pulih Maksimal (100%)\n` +
                        `💵 Biaya Dokter: Rp 30.000`,
                    'recoveryHospital'
                );
            };

            // Action: Liburan / Healing Penuh
            const doLiburan = async () => {
                const healingCost = 50000;
                if ((user.balance || 0) < healingCost) {
                    return m.reply(
                        `💸 Saldo kurang untuk liburan! Butuh *Rp ${healingCost.toLocaleString()}*.\nNongkrong di warkop aja murah (Rp 5k): */warkop*`
                    );
                }

                user.balance -= healingCost;
                await user.save();

                player.kewarasan = 100;
                player.energi = Math.min(player.maxEnergi, player.energi + 30);
                await player.save();

                return sendRpgReply(
                    sock,
                    m,
                    `🏖️ *HEALING KE PANTAI / PUNCAK!* 🚗💨\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `Kamu sejenak kabur dari bisingnya kota dan tuntutan hidup.\n\n` +
                        `🧠 *Efek:* Kewarasan Pulih Penuh (100%) | Energi +30\n` +
                        `💵 Biaya Healing: Rp ${healingCost.toLocaleString()}`,
                    'recoveryVacation'
                );
            };

            // ROUTING:
            if (cmd === 'warkop' || cmd === 'ngopi') return doWarkop();
            if (cmd === 'rs' || cmd === 'puskesmas' || cmd === 'berobat') return doRS();

            const sub = args[0]?.toLowerCase();
            if (sub === '1' || sub === 'warkop' || sub === 'ngopi') return doWarkop();
            if (sub === '2' || sub === 'rs' || sub === 'puskesmas' || sub === 'berobat')
                return doRS();
            if (sub === '3' || sub === 'liburan' || sub === 'pantai') return doLiburan();

            // Default .healing
            return doLiburan();
        } catch (error) {
            console.error('Error in healing command:', error);
            await m.reply('❌ Terjadi kesalahan saat memproses pemulihan.');
        }
    },
};

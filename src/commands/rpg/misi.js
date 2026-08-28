import { addExp, getOrCreatePlayer } from '../../services/rpgService.js';
import {
    DAILY_MISSIONS,
    getMissionState,
    getOrCreateRpgProgress,
} from '../../services/rpgProgressService.js';

const formatReward = (mission) =>
    `Rp ${mission.rupiah.toLocaleString('id-ID')} + ${mission.exp} EXP`;

export default {
    name: 'misi',
    aliases: ['misiharian', 'daily', 'klaimmisi'],
    description: 'Melihat dan mengambil hadiah misi harian RPG',
    category: 'RPG',
    execute: async (sock, m, args) => {
        try {
            const sender = m.sender;
            const cmd =
                m.command ||
                (m.body ? m.body.slice(1).trim().split(/\s+/)[0].toLowerCase() : 'misi');
            const { user, player } = await getOrCreatePlayer(sender, m.pushName);
            const progress = await getOrCreateRpgProgress(sender);
            const wantsClaim = cmd === 'klaimmisi' || args[0]?.toLowerCase() === 'klaim';

            if (wantsClaim) {
                const input = cmd === 'klaimmisi' ? args[0] : args[1];
                const claimAll = !input || ['all', 'semua'].includes(input.toLowerCase());
                const mission = DAILY_MISSIONS[input?.toLowerCase()];
                const candidates = claimAll
                    ? Object.values(DAILY_MISSIONS)
                    : mission
                      ? [mission]
                      : [];

                if (candidates.length === 0) {
                    return m.reply(
                        '⚠️ Misi tidak ditemukan. Gunakan */misi* untuk melihat ID misi yang tersedia.'
                    );
                }

                const claimable = candidates.filter((item) => {
                    const state = getMissionState(progress, item);
                    return state.complete && !state.claimed;
                });
                if (claimable.length === 0) {
                    return m.reply(
                        'ℹ️ Belum ada hadiah misi yang bisa diambil. Cek progres dengan */misi*.'
                    );
                }

                const rupiah = claimable.reduce((sum, item) => sum + item.rupiah, 0);
                const exp = claimable.reduce((sum, item) => sum + item.exp, 0);
                user.balance = (user.balance || 0) + rupiah;
                await user.save();
                const { leveledUp, newLevel } = await addExp(player, exp);

                progress.claimedMissions = [
                    ...(progress.claimedMissions || []),
                    ...claimable.map((item) => item.id),
                ];
                await progress.save();

                let reply =
                    `🎁 *HADIAH MISI DIAMBIL!*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `${claimable.map((item) => `✅ ${item.name}`).join('\n')}\n\n` +
                    `💵 Uang: +Rp ${rupiah.toLocaleString('id-ID')}\n` +
                    `✨ EXP: +${exp}\n` +
                    `💰 Saldo: Rp ${user.balance.toLocaleString('id-ID')}`;
                if (leveledUp) reply += `\n🆙 Naik ke Level ${newLevel}!`;
                return m.reply(reply);
            }

            const rows = Object.values(DAILY_MISSIONS).map((mission) => {
                const state = getMissionState(progress, mission);
                const status = state.claimed
                    ? '🎁 Sudah diambil'
                    : state.complete
                      ? '✅ Siap diklaim'
                      : '⏳ Berjalan';
                return (
                    `*${mission.name}*  \`${mission.id}\`\n` +
                    `${mission.description}: ${state.current}/${mission.target}\n` +
                    `Hadiah: ${formatReward(mission)} · ${status}`
                );
            });

            return m.reply(
                `📋 *MISI HARIAN · ${progress.dailyDate}*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `${rows.join('\n\n')}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Ambil hadiah: */klaimmisi [id]*\n` +
                    `Ambil semua: */klaimmisi semua*`
            );
        } catch (error) {
            console.error('Error in misi command:', error);
            return m.reply('❌ Terjadi kesalahan saat membuka misi harian.');
        }
    },
};

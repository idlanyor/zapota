import { getOrCreatePlayer } from '../../services/rpgService.js';
import {
    ACHIEVEMENTS,
    getOrCreateRpgProgress,
    syncAchievements,
} from '../../services/rpgProgressService.js';

export default {
    name: 'achievement',
    aliases: ['achievements', 'prestasi', 'gelar'],
    description: 'Melihat achievement dan memasang gelar karakter',
    category: 'RPG',
    execute: async (sock, m, args) => {
        try {
            const sender = m.sender;
            const cmd =
                m.command ||
                (m.body ? m.body.slice(1).trim().split(/\s+/)[0].toLowerCase() : 'achievement');
            const { user, player } = await getOrCreatePlayer(sender, m.pushName);
            const progress = await getOrCreateRpgProgress(sender);
            const newlyUnlocked = await syncAchievements(progress, player, user);
            const input = (
                cmd === 'gelar' ? args[0] : args[0] === 'pasang' ? args[1] : null
            )?.toLowerCase();

            if (cmd === 'gelar' && ['lepas', 'hapus', 'none'].includes(input)) {
                progress.equippedTitle = '';
                await progress.save();
                return m.reply('✅ Gelar berhasil dilepas.');
            }

            if (input) {
                const achievement = ACHIEVEMENTS[input];
                if (!achievement) {
                    return m.reply(
                        '⚠️ ID gelar tidak ditemukan. Lihat daftar dengan */achievement*.'
                    );
                }
                if (!(progress.unlockedAchievements || []).includes(achievement.id)) {
                    return m.reply(`🔒 Achievement *${achievement.name}* belum terbuka.`);
                }
                progress.equippedTitle = achievement.title;
                await progress.save();
                return m.reply(`🏷️ Gelar *${achievement.title}* berhasil dipasang di profilmu.`);
            }

            const unlocked = new Set(progress.unlockedAchievements || []);
            const rows = Object.values(ACHIEVEMENTS).map((achievement) => {
                const isUnlocked = unlocked.has(achievement.id);
                return (
                    `${isUnlocked ? '✅' : '🔒'} ${achievement.icon} *${achievement.name}*  \`${achievement.id}\`\n` +
                    `_${achievement.description}_${isUnlocked ? `\nGelar: “${achievement.title}”` : ''}`
                );
            });
            const unlockNotice = newlyUnlocked.length
                ? `\n\n🎉 Baru terbuka: ${newlyUnlocked.map((item) => item.name).join(', ')}`
                : '';

            return m.reply(
                `🏆 *ACHIEVEMENT RPG*\n` +
                    `Gelar aktif: *${progress.equippedTitle || 'Belum dipasang'}*\n` +
                    `Terbuka: ${unlocked.size}/${Object.keys(ACHIEVEMENTS).length}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `${rows.join('\n\n')}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Pasang: */gelar [id]* · Lepas: */gelar lepas*` +
                    unlockNotice
            );
        } catch (error) {
            console.error('Error in achievement command:', error);
            return m.reply('❌ Terjadi kesalahan saat membuka achievement.');
        }
    },
};

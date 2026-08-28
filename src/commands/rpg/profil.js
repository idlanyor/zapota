import axios from 'axios';
import { renderKtp } from '../../lib/ktpRenderer.js';
import { getOrCreatePlayer } from '../../services/rpgService.js';
import { getOrCreateRpgProgress, syncAchievements } from '../../services/rpgProgressService.js';
import logger from '../../utils/logger.js';

const AVATAR_TIMEOUT_MS = 2000;

const getAvatar = async (sock, jid) => {
    try {
        const url = await sock.profilePictureUrl(jid, 'preview', AVATAR_TIMEOUT_MS);
        if (!url) return null;
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: AVATAR_TIMEOUT_MS,
        });
        return Buffer.from(response.data);
    } catch {
        return null;
    }
};

export default {
    name: 'profil',
    aliases: ['profilrpg', 'status', 'ktp', 'rpg'],
    description: 'Melihat status karakter RPG kehidupan Indonesia 2026',
    category: 'RPG',
    execute: async (sock, m, args, text) => {
        const sender = m.sender;
        const pushName = m.pushName || sender.split('@')[0];

        m.react('⏳').catch(() => {});
        try {
            const { user, player } = await getOrCreatePlayer(sender, pushName);
            const progress = await getOrCreateRpgProgress(sender);
            await syncAchievements(progress, player, user);
            const avatarBuffer = await getAvatar(sock, sender);
            const image = await renderKtp({
                name: user.name || pushName,
                job: progress.equippedTitle
                    ? `${progress.equippedTitle} · ${player.job}`
                    : player.job,
                level: player.level,
                exp: player.exp,
                requiredExp: player.level * 100,
                balance: user.balance,
                hp: player.hp,
                maxHp: player.maxHp,
                gizi: player.gizi,
                kewarasan: player.kewarasan,
                energi: player.energi,
                maxEnergi: player.maxEnergi,
                reputasiWarga: player.reputasiWarga,
                reputasiPreman: player.reputasiPreman,
                reputasiAparat: player.reputasiAparat,
                bintangKorupsi: player.bintangKorupsi,
                avatarBuffer,
            });
            await sock.sendMessage(m.chat, { image }, { quoted: m });
            await m.react('✅');
        } catch (error) {
            logger.error(error, 'Failed to render RPG profile card');
            await m.react('❌').catch(() => {});
            await m.reply('❌ Terjadi kesalahan saat memuat profil RPG.');
        }
    },
};

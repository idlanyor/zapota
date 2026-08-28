import { jidNormalizedUser } from '../wa/helpers.js';
import axios from 'axios';
import { getGroupSettings } from './messageFlow.js';
import { getMessage } from '../lib/msgStore.js';
import logger from '../utils/logger.js';
import { handleWerewolfParticipantRemoval } from '../games/werewolf/service.js';

const WELCOME_API = 'https://api.siputzx.my.id/api/canvas/welcomev1';
const GOODBYE_API = 'https://api.siputzx.my.id/api/canvas/goodbyev1';
const DEFAULT_BG = 'https://i.ibb.co/4YBNyvP/images-76.jpg';
const DEFAULT_AVATAR = 'https://i.ibb.co/1s8T3sY/48f7ce63c7aa.jpg';
const DEFAULT_GUILD_ICON = DEFAULT_AVATAR;
const QUALITY = 80;

const buildCanvasImage = async (sock, { id, userJid, groupData, endpoint }) => {
    let meta = null;
    try {
        meta = await sock.groupMetadata(id);
    } catch {
        /* fallback ke data group tersimpan */
    }
    const groupName = meta?.subject || groupData.name || 'this group';
    const memberCount = meta?.participants?.length || 0;

    let avatar = DEFAULT_AVATAR;
    try {
        const a = await sock.profilePictureUrl(userJid, 'image');
        if (a) avatar = a;
    } catch {
        /* profil privat / tanpa PP → default */
    }

    let guildIcon = DEFAULT_GUILD_ICON;
    try {
        const gi = await sock.profilePictureUrl(id, 'image');
        if (gi) guildIcon = gi;
    } catch {
        /* icon grup tidak ada → default */
    }

    let username = userJid.split('@')[0];
    try {
        if (typeof sock.getName === 'function') {
            const name = sock.getName(userJid);
            if (name && typeof name === 'string' && name.trim()) username = name;
        }
    } catch {
        /* getName tidak tersedia → pakai nomor */
    }

    const background = groupData.welcomeBg || DEFAULT_BG;

    const { data } = await axios.get(endpoint, {
        params: {
            username,
            guildName: groupName,
            guildIcon,
            memberCount,
            avatar,
            background,
            quality: QUALITY,
        },
        responseType: 'arraybuffer',
        timeout: 15000,
    });

    return Buffer.from(data);
};

export const groupParticipantsUpdate = async (sock, { id, participants, action }) => {
    try {
        logger.debug(
            `Group Update - ID: ${id}, Action: ${action}, Participants: ${participants.join(', ')}`,
            'GROUP-EVENT'
        );

        if (action === 'remove') {
            await handleWerewolfParticipantRemoval(sock, id, participants);
        }
        const groupData = await getGroupSettings(id);
        if (!groupData) {
            logger.warn(`No settings found for group: ${id}`, 'GROUP-EVENT');
            return;
        }

        // Ambil metadata tambahan jika deskripsi dibutuhkan
        let groupDesc = groupData.desc || '';
        if (
            !groupDesc &&
            (groupData.welcomeMsg.includes('@desc') || groupData.leaveMsg.includes('@desc'))
        ) {
            try {
                const meta = await sock.groupMetadata(id);
                groupDesc = meta.desc || '-';
            } catch {
                groupDesc = '-';
            }
        }

        logger.debug(
            `Group Settings for ${id} - Welcome: ${groupData.welcome}, Left: ${groupData.left}`,
            'GROUP-EVENT'
        );

        for (const participant of participants) {
            // Baileys can send string JID or object with id property
            const rawJid =
                typeof participant === 'string' ? participant : participant.id || participant.jid;
            if (!rawJid) continue;

            const userJid = jidNormalizedUser(rawJid);
            const userTag = `@${userJid.split('@')[0]}`;

            if (action === 'add' && groupData.welcome) {
                const message = groupData.welcomeMsg
                    .replace(/@user/g, userTag)
                    .replace(/@group/g, groupData.name || 'this group')
                    .replace(/@desc/g, groupDesc);

                try {
                    const image = await buildCanvasImage(sock, {
                        id,
                        userJid,
                        groupData,
                        endpoint: WELCOME_API,
                    });
                    await sock.sendMessage(id, {
                        image,
                        caption: message,
                        mentions: [userJid],
                    });
                } catch (err) {
                    logger.warn(
                        `Gagal generate gambar welcome, fallback ke teks: ${err?.message || err}`,
                        'GROUP-EVENT'
                    );
                    await sock.sendMessage(id, {
                        text: message,
                        mentions: [userJid],
                    });
                }
            } else if (action === 'remove' && groupData.left) {
                const message = groupData.leaveMsg
                    .replace(/@user/g, userTag)
                    .replace(/@group/g, groupData.name || 'this group')
                    .replace(/@desc/g, groupDesc);

                try {
                    const image = await buildCanvasImage(sock, {
                        id,
                        userJid,
                        groupData,
                        endpoint: GOODBYE_API,
                    });
                    await sock.sendMessage(id, {
                        image,
                        caption: message,
                        mentions: [userJid],
                    });
                } catch (err) {
                    logger.warn(
                        `Gagal generate gambar goodbye, fallback ke teks: ${err?.message || err}`,
                        'GROUP-EVENT'
                    );
                    await sock.sendMessage(id, {
                        text: message,
                        mentions: [userJid],
                    });
                }
            }
        }
    } catch (err) {
        logger.error(err, 'Error in groupParticipantsUpdate handler');
    }
};

export const handleMessagesUpdate = async (sock, events) => {
    if (!Array.isArray(events)) return;
    for (const evt of events) {
        try {
            const key = evt?.key;
            const update = evt?.update;
            if (!key?.id || !key.remoteJid) continue;
            if (!key.remoteJid.endsWith('@g.us')) continue;

            const isDeleted =
                update?.status === 'deleted' ||
                update?.message?.protocolMessage?.type === 0 ||
                update?.pollUpdates === null;
            if (!isDeleted) continue;

            const stored = getMessage(key.id);
            if (!stored || !stored.body) continue;

            const groupData = await getGroupSettings(key.remoteJid);
            if (!groupData?.antidelete) continue;

            const senderTag = stored.sender ? `@${stored.sender.split('@')[0]}` : 'seseorang';
            await sock.sendMessage(key.remoteJid, {
                text: `*Antidelete* • ${senderTag}\n\n${stored.body}`,
                mentions: stored.sender ? [stored.sender] : [],
            });
        } catch (err) {
            logger.warn(`Antidelete handler error: ${err?.message || err}`, 'GROUP-EVENT');
        }
    }
};

import Group from '../database/models/Group.js';
import logger from '../utils/logger.js';

const TIMEZONE = 'Asia/Jakarta';
let groupTask = null;

const nowInJakarta = () => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', {
        timeZone: TIMEZONE,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
    });
    const stamp = now.toLocaleString('sv-SE', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    return { time, stamp };
};

const applyGroupState = async (sock, group, type, desiredState, stamp) => {
    const key = type === 'open' ? 'lastAutoOpenAt' : 'lastAutoCloseAt';
    if (group[key] === stamp) return;

    try {
        await sock.groupSettingUpdate(group.jid, desiredState);
        group[key] = stamp;
        await group.save();
        logger.info(`[GROUP-SCHEDULER] ${type.toUpperCase()} executed for ${group.jid}`);
    } catch (err) {
        const reason = err?.message || String(err);
        logger.error(
            `[GROUP-SCHEDULER] ${type.toUpperCase()} failed for ${group.jid}: ${reason}`
        );
        if (/not-authorized/i.test(reason)) {
            try {
                await sock.sendMessage(group.jid, {
                    text: `⚠️ Auto ${type} gagal dijalankan karena bot *bukan admin* di grup ini.\n\nJadikan bot sebagai admin agar fitur jadwal open/close otomatis berfungsi.`,
                });
            } catch {
                /* grup announcement-mode / bot tidak bisa kirim → log sudah mencatat */
            }
        }
    }
};

export const startGroupScheduler = (getSocket) => {
    if (groupTask) return;

    groupTask = setInterval(async () => {
        try {
            const sock = getSocket?.();
            if (!sock?.user) return;

            const now = nowInJakarta();

            const groups = await Group.find({
                $or: [{ autoOpen: true }, { autoClose: true }],
            });

            if (!groups.length) return;

            for (const group of groups) {
                if (group.autoOpen && group.autoOpenTime === now.time) {
                    await applyGroupState(sock, group, 'open', 'not_announcement', now.stamp);
                }

                if (group.autoClose && group.autoCloseTime === now.time) {
                    await applyGroupState(sock, group, 'close', 'announcement', now.stamp);
                }
            }
        } catch (err) {
            logger.error(`[GROUP-SCHEDULER] Task error: ${err.message}`);
        }
    }, 60 * 1000);

    logger.info('Group auto open/close scheduler started');
};

export const stopGroupScheduler = () => {
    if (groupTask) {
        clearInterval(groupTask);
        groupTask = null;
    }
};

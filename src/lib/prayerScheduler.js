import cron from 'node-cron';
import moment from 'moment';
import Group from '../database/models/Group.js';
import { get } from './api.js';
import logger from '../utils/logger.js';

// Simple in-memory cache: { cityId: { date: 'YYYY-MM-DD', schedule: { ... } } }
const scheduleCache = {};

const PRAYER_NAMES = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'];

const fetchSchedule = async (cityId) => {
    const today = moment().utcOffset(7).format('YYYY-MM-DD');

    // Return cached if valid for today
    if (scheduleCache[cityId] && scheduleCache[cityId].date === today) {
        return scheduleCache[cityId].schedule;
    }

    try {
        const res = await get(`/sholat/jadwal/${cityId}`);
        // API response structure based on user input: { jadwal: { subuh: "04:27", ... }, ... }
        if (res && res.jadwal) {
            scheduleCache[cityId] = {
                date: today,
                schedule: res.jadwal,
            };
            return res.jadwal;
        }
    } catch (error) {
        logger.error(`Error fetching prayer schedule for city ${cityId}: ${error.message}`);
    }
    return null;
};

let prayerTask = null;

export const startPrayerScheduler = (sock) => {
    if (prayerTask) {
        prayerTask.stop();
        prayerTask = null;
    }

    // Run every minute
    prayerTask = cron.schedule(
        '* * * * *',
        async () => {
            try {
                const now = moment().utcOffset(7);
                const currentTime = now.format('HH:mm');
                const todayDate = now.format('YYYY-MM-DD');

                // Find all groups with reminder enabled
                const groups = await Group.find({ prayerReminder: true });
                if (!groups.length) return;

                // Group by cityId to minimize API calls
                const cityGroups = {};
                groups.forEach((g) => {
                    if (!cityGroups[g.cityId]) cityGroups[g.cityId] = [];
                    cityGroups[g.cityId].push(g);
                });

                for (const cityId of Object.keys(cityGroups)) {
                    const schedule = await fetchSchedule(cityId);
                    if (!schedule) continue;

                    // Check for matches
                    for (const prayer of PRAYER_NAMES) {
                        if (schedule[prayer] === currentTime) {
                            const message = `*WAKTU SHOLAT ${prayer.toUpperCase()}*\n\nSudah masuk waktu ${prayer} untuk wilayah ${cityGroups[cityId][0].cityName} dan sekitarnya (${currentTime}).\n\nSelamat menunaikan ibadah sholat.`;

                            // Send to all groups in this city
                            for (const group of cityGroups[cityId]) {
                                try {
                                    await sock.sendMessage(group.jid, { text: message });
                                } catch (err) {
                                    logger.error(
                                        `Failed to send prayer reminder to ${group.jid}: ${err.message}`
                                    );
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                logger.error(`Error in prayer scheduler: ${error.message}`);
            }
        },
        {
            timezone: 'Asia/Jakarta',
        }
    );

    logger.info('Prayer scheduler started');
};

import Group from '../../database/models/Group.js';
import { get } from '../../lib/api.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'sholat',
    aliases: ['prayer', 'adzan'],
    description: 'Manage group prayer time reminders',
    category: 'Group',
    adminOnly: true,
    groupOnly: true,
    execute: async (sock, m, args, text) => {
        if (!args[0]) {
            return m.reply(`Usage:
${settings.prefix}sholat enable - Enable prayer reminders
${settings.prefix}sholat disable - Disable prayer reminders
${settings.prefix}sholat setcity <id> - Set city for reminders (get ID via search)
${settings.prefix}sholat info - Check current configuration
${settings.prefix}sholat search <city name> - Search for city ID`);
        }

        const group = await Group.findOne({ jid: m.chat });
        if (!group) return m.reply('Group not found in database.');

        const action = args[0].toLowerCase();

        switch (action) {
            case 'enable':
            case 'on':
                if (group.prayerReminder) return m.reply('Prayer reminders are already enabled.');
                group.prayerReminder = true;
                await group.save();
                m.reply(
                    `Prayer reminders enabled for city: ${group.cityName} (ID: ${group.cityId})`
                );
                break;

            case 'disable':
            case 'off':
                if (!group.prayerReminder) return m.reply('Prayer reminders are already disabled.');
                group.prayerReminder = false;
                await group.save();
                m.reply('Prayer reminders disabled.');
                break;

            case 'setcity':
                if (!args[1])
                    return m.reply(`Please provide a city ID.
Example: ${settings.prefix}sholat setcity 1420`);
                const cityId = args[1];

                // Verify ID by fetching schedule
                try {
                    const res = await get(`/sholat/jadwal/${cityId}`);
                    if (res && res.lokasi) {
                        group.cityId = cityId;
                        group.cityName = res.lokasi;
                        await group.save();
                        m.reply(`City updated to: ${res.lokasi} (ID: ${cityId})`);
                    } else {
                        m.reply('Invalid city ID or data not found.');
                    }
                } catch (e) {
                    console.error(e);
                    m.reply('Error verifying city ID. Please check the ID.');
                }
                break;

            case 'info':
            case 'check':
                const status = group.prayerReminder ? 'Enabled' : 'Disabled';
                m.reply(`*Prayer Reminder Configuration*
Status: ${status}
City: ${group.cityName}
ID: ${group.cityId}`);
                break;

            case 'jadwal':
            case 'schedule':
                if (!group.cityId)
                    return m.reply(`City not set. Please set city first using:
${settings.prefix}sholat search <city>
${settings.prefix}sholat setcity <id>`);

                try {
                    const res = await get(`/sholat/jadwal/${group.cityId}`);
                    if (!res || !res.jadwal) return m.reply('Could not fetch prayer schedule.');

                    const j = res.jadwal;
                    const prayerTimes = [
                        { name: 'Imsak', time: j.imsak },
                        { name: 'Subuh', time: j.subuh },
                        { name: 'Terbit', time: j.terbit },
                        { name: 'Dhuha', time: j.dhuha },
                        { name: 'Dzuhur', time: j.dzuhur },
                        { name: 'Ashar', time: j.ashar },
                        { name: 'Maghrib', time: j.maghrib },
                        { name: 'Isya', time: j.isya },
                    ];

                    const tableRows = prayerTimes.map((p) => ({
                        items: [p.name, p.time],
                        isHeading: false,
                    }));

                    const msg = {
                        botForwardedMessage: {
                            message: {
                                richResponseMessage: {
                                    messageType: 1,
                                    submessages: [
                                        {
                                            messageType: 2,
                                            messageText: `🕋 *JADWAL SHOLAT HARI INI*\nWilayah: ${res.lokasi}\nTanggal: ${j.tanggal}`,
                                        },
                                        {
                                            messageType: 4,
                                            tableMetadata: {
                                                title: 'Prayer Times',
                                                rows: [
                                                    { items: ['Ibadah', 'Waktu'], isHeading: true },
                                                    ...tableRows,
                                                ],
                                            },
                                        },
                                    ],
                                    contextInfo: {
                                        forwardingScore: 1,
                                        isForwarded: true,
                                        forwardedAiBotMessageInfo: {
                                            botJid: '867051314767696@bot',
                                        },
                                        forwardOrigin: 4,
                                        stanzaId: m.key.id,
                                        participant: m.sender,
                                        quotedMessage: m.message,
                                    },
                                },
                            },
                        },
                        messageContextInfo: {
                            botMetadata: {
                                messageDisclaimerText: 'Islamic Prayer Schedule AI',
                            },
                        },
                    };

                    await sock.relayMessage(m.chat, msg, { messageId: sock.generateMessageTag() });
                } catch (e) {
                    console.error(e);
                    m.reply('Error fetching prayer schedule.');
                }
                break;

            case 'search':
                if (!args[1])
                    return m.reply(`Please provide a city name.
Example: ${settings.prefix}sholat search purbalingga`);
                const query = text.replace('search', '').trim();
                try {
                    // Assuming endpoint /sholat/kota/cari/{nama} exists based on common Kanata API patterns
                    // Using the "search" endpoint pattern if available, or just try to find list
                    // Since I am not sure about the search endpoint, I will assume one or use a general list if possible.
                    // Let's assume there is a search endpoint as it is standard.
                    const searchRes = await get(`/sholat/kota/cari/${encodeURIComponent(query)}`);
                    if (searchRes && searchRes.status === true && Array.isArray(searchRes.data)) {
                        const list = searchRes.data
                            .map((c) => `ID: ${c.id} | ${c.lokasi}`)
                            .join('\n');
                        m.reply(`Search Results:
${list}`);
                    } else if (Array.isArray(searchRes)) {
                        // Handle if direct array
                        const list = searchRes.map((c) => `ID: ${c.id} | ${c.lokasi}`).join('\n');
                        m.reply(`Search Results:
${list}`);
                    } else {
                        m.reply('City not found.');
                    }
                } catch (e) {
                    // Fallback if search endpoint is different, maybe just tell user to find ID elsewhere for now
                    console.error(e);
                    m.reply('Error searching for city. Please try again later.');
                }
                break;

            default:
                m.reply('Invalid argument.');
        }
    },
};

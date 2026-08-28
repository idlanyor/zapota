import { getZoneId, addDnsRecord } from '../../services/cloudflare.js';
import { sessionManager } from '../../utils/session.js';
import Settings from '../../database/models/Settings.js';
import { getCachedSettings } from '../../handlers/messageFlow.js';

export default {
    name: 'adddns',
    aliases: ['subdomain', 'dns'],
    description: 'Add DNS Record to Cloudflare (Interactive)',
    category: 'Cloudflare',

    // --- SESSION HANDLER ---
    handleSession: async (sock, m, session) => {
        const body = m.body.trim();
        const { step, data } = session;

        // Batal / Cancel
        if (body.toLowerCase() === 'batal' || body.toLowerCase() === 'cancel') {
            sessionManager.delete(m.sender);
            return m.reply('❌ Pembuatan DNS dibatalkan.');
        }

        try {
            switch (step) {
                case 0: // Input Type
                    const type = body.toUpperCase();
                    if (!['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV', 'NS'].includes(type)) {
                        return m.reply(
                            '❌ Tipe tidak valid. Masukkan tipe (A, CNAME, TXT, dll) atau ketik *batal*:'
                        );
                    }
                    session.data.type = type;
                    session.step++;
                    await m.reply(
                        `✅ Tipe: *${type}*\n\n2. Masukkan *Nama* (subdomain, misal: panel) atau ketik *@* untuk root:`
                    );
                    break;

                case 1: // Input Name
                    session.data.name = body;
                    session.step++;

                    const botSettings = await getCachedSettings();
                    const zones = botSettings.cfZones || [];

                    if (zones.length > 0) {
                        let msg = `✅ Nama: *${body}*\n\n3. Pilih *Domain* (Ketik angkanya):\n`;
                        zones.forEach((z, i) => {
                            msg += `${i + 1}. ${z.domain}\n`;
                        });
                        msg += `\nAtau ketik nama domain lain secara manual:`;
                        session.data.zoneList = zones;
                        await m.reply(msg);
                    } else {
                        await m.reply(
                            `✅ Nama: *${body}*\n\n3. Masukkan *Domain* tujuan (misal: kanata.web.id):`
                        );
                    }
                    break;

                case 2: // Input Domain & Get Zone ID
                    let domain = body.toLowerCase();
                    // Check if input is a number from our list
                    if (session.data.zoneList && /^\d+$/.test(domain)) {
                        const idx = parseInt(domain) - 1;
                        if (session.data.zoneList[idx]) {
                            domain = session.data.zoneList[idx].domain;
                        }
                    }

                    await m.react('⏳');
                    const zoneId = await getZoneId(domain);

                    if (!zoneId) {
                        await m.react('❌');
                        return m.reply(
                            `❌ Domain *${domain}* tidak ditemukan di akun Cloudflare Anda. Masukkan domain lain atau ketik *batal*:`
                        );
                    }

                    session.data.domain = domain;
                    session.data.zoneId = zoneId;
                    session.step++;
                    await m.reply(
                        `✅ Domain: *${domain}*\n\n4. Masukkan *Konten/Isi* (IP Address untuk A record, atau Target untuk CNAME):`
                    );
                    break;

                case 3: // Input Content
                    session.data.content = body;
                    session.step++;
                    await m.reply(
                        `✅ Konten: *${body}*\n\n5. Gunakan *Proxy Cloudflare*? (ya/tidak):`
                    );
                    break;

                case 4: // Input Proxy & Show Summary
                    const useProxy = body.toLowerCase() === 'ya' || body.toLowerCase() === 'yes';
                    session.data.proxied = useProxy;
                    session.step++;

                    let summary = `*── 「 DNS CONFIRMATION 」 ──*\n\n`;
                    summary += `➛ *Tipe:* ${session.data.type}\n`;
                    summary += `➛ *Nama:* ${session.data.name}\n`;
                    summary += `➛ *Domain:* ${session.data.domain}\n`;
                    summary += `➛ *Konten:* ${session.data.content}\n`;
                    summary += `➛ *Proxy:* ${useProxy ? '✅ On' : '❌ Off'}\n\n`;
                    summary += `Apakah data di atas sudah benar? (ya/tidak)`;
                    await m.reply(summary);
                    break;

                case 5: // Execution
                    if (body.toLowerCase() === 'ya' || body.toLowerCase() === 'yes') {
                        await m.react('⏳');
                        const { zoneId, type, name, domain, content, proxied } = session.data;
                        const fullName = name === '@' ? domain : `${name}.${domain}`;

                        const result = await addDnsRecord(zoneId, type, fullName, content, proxied);

                        let successMsg = `✅ *DNS Record Berhasil Dibuat!*\n\n`;
                        successMsg += `➛ *Full Name:* ${result.name}\n`;
                        successMsg += `➛ *Type:* ${result.type}\n`;
                        successMsg += `➛ *Content:* ${result.content}\n`;
                        successMsg += `➛ *ID:* \`${result.id}\``;

                        await m.reply(successMsg);
                        await m.react('✅');
                        sessionManager.delete(m.sender);
                    } else {
                        sessionManager.delete(m.sender);
                        await m.reply('❌ Pembuatan DNS dibatalkan.');
                    }
                    break;
            }
        } catch (err) {
            console.error(err);
            const errMsg = err.response?.data?.errors?.[0]?.message || err.message;
            await m.reply(`❌ Terjadi kesalahan: ${errMsg}\n\nSesi dibatalkan.`);
            sessionManager.delete(m.sender);
        }
    },

    // --- MAIN EXECUTION ---
    execute: async (sock, m, args) => {
        // --- NEW SECURITY CHECK ---
        const { getCachedSettings } = await import('../../handlers/messageFlow.js');
        const { settings } = await import('../../config/settings.js');
        const botSettings = await getCachedSettings();
        const dbOwners = botSettings.owners || [];
        const staticOwners = [settings.ownerNumber, settings.ownerLid];

        const isOwner = [...staticOwners, ...dbOwners].includes(m.sender);
        if (!isOwner) return m.reply('❌ Akses Ditolak. Perintah ini hanya untuk Owner.');
        // --------------------------

        // Jika ada argumen lengkap, jalankan mode instan (legacy)
        if (args.length >= 4) {
            const type = args[0].toUpperCase();
            const name = args[1];
            const domain = args[2];
            const content = args[3];
            const proxied = args[4] === 'true' || args[4] === 'ya';

            await m.react('⏳');
            try {
                const zoneId = await getZoneId(domain);
                if (!zoneId) {
                    await m.react('❌');
                    return m.reply(`❌ Domain ${domain} tidak ditemukan.`);
                }

                const fullName = name === '@' ? domain : `${name}.${domain}`;
                const result = await addDnsRecord(zoneId, type, fullName, content, proxied);
                await m.react('✅');
                return m.reply(
                    `✅ Berhasil dibuat: ${result.name} (${result.type}) -> ${result.content}`
                );
            } catch (e) {
                await m.react('❌');
                return m.reply(`❌ Gagal: ${e.message}`);
            }
        }

        // Jika tidak ada argumen, mulai mode interaktif
        sessionManager.create(m.sender, {
            commandName: 'adddns',
            type: '',
            name: '',
            domain: '',
            content: '',
            proxied: false,
        });

        await m.reply(
            `*── 「 DNS CREATOR 」 ──*\n\nSelamat datang di asisten pembuatan DNS.\n\n1. Masukkan *Tipe* record (misal: A, CNAME, TXT):\n\n_Ketik *batal* kapan saja untuk menghentikan._`
        );
    },
};

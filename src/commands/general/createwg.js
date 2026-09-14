import QRCode from 'qrcode';

const SAKURA_URL = process.env.SAKURA_API_URL || 'https://sakura.irengcloud.com';

export default {
    name: 'createwg',
    aliases: ['registerwg', 'reqwg', 'wgcreate'],
    description: 'Minta akses WireGuard Sakura (butuh konfirmasi owner)',
    category: 'General',
    execute: async (sock, m, args) => {
        const senderJid = m.sender || m.key?.remoteJid;
        let rawNumber = senderJid ? senderJid.split('@')[0].replace(/\D/g, '') : '';
        const pushName = m.pushName || args.join(' ') || rawNumber || 'User';

        // Jika dipanggil dari LID (@lid), coba gunakan nomor dari m.key.participant / user alt jika ada
        if (senderJid && senderJid.endsWith('@lid') && m.key?.participant) {
            const partNum = m.key.participant.split('@')[0].replace(/\D/g, '');
            if (partNum && !partNum.startsWith('7944')) {
                rawNumber = partNum;
            }
        }

        if (!rawNumber) {
            return m.reply('❌ Gagal mendeteksi nomor WhatsApp Anda.');
        }

        try {
            const res = await fetch(`${SAKURA_URL}/api/wg/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: pushName, whatsapp: rawNumber, userJid: senderJid })
            });

            const data = await res.json();
            if (!res.ok || !data.ok) {
                return m.reply(`❌ Gagal membuat permintaan WireGuard: ${data.error || 'Terjadi kesalahan'}`);
            }

            const reqId = data.id;

            const ownerNum = process.env.OWNER_NUMBER || '62895395590009';
            const cleanOwner = ownerNum.replace(/\D/g, '');
            const ownerJid = `${cleanOwner}@s.whatsapp.net`;

            const payload = {
                interactiveMessage: {
                    body: { 
                        text: `📌 *Permintaan Akses WireGuard Sakura*\n\nNama: *${pushName}*\nNo WA / JID: *${rawNumber}*\nID Permintaan: *${reqId}*` 
                    },
                    footer: { text: 'Sakura WireGuard System' },
                    header: {
                        title: '⚠️ Konfirmasi Pendaftaran WireGuard',
                        subtitle: 'APPROVAL REQUIRED',
                        hasMediaAttachment: false,
                    },
                    nativeFlowMessage: {
                        messageVersion: 1,
                        buttons: [
                            {
                                name: 'quick_reply',
                                buttonParamsJson: JSON.stringify({
                                    display_text: '✅ ACC / Approve',
                                    id: `.accwg ${reqId}`,
                                }),
                            },
                            {
                                name: 'quick_reply',
                                buttonParamsJson: JSON.stringify({
                                    display_text: '❌ Reject / Tolak',
                                    id: `.rejectwg ${reqId}`,
                                }),
                            }
                        ],
                    },
                },
            };

            await sock.sendMessage(ownerJid, payload);

            return m.reply(`✅ *Permintaan Diterima!*\n\nID Permintaan: *${reqId}*\nPermintaan akses WireGuard Sakura kamu sudah dikirim ke Owner untuk dikonfirmasi.\nHarap tunggu notifikasi selanjutnya di WhatsApp ini.`);

        } catch (err) {
            console.error('Error in createwg command:', err);
            return m.reply(`❌ Gagal menghubungi server Sakura: ${err.message}`);
        }
    }
};

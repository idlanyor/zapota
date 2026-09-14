const SAKURA_URL = process.env.SAKURA_API_URL || 'https://sakura.irengcloud.com';

export default {
    name: 'rejectwg',
    aliases: ['denywg', 'wgreject'],
    description: 'Tolak Pendaftaran WireGuard Sakura (Khusus Owner)',
    category: 'Owner',
    execute: async (sock, m, args) => {
        const reqId = args[0];
        if (!reqId) {
            return m.reply('❌ Harap sertakan ID permintaan WireGuard.');
        }

        try {
            const res = await fetch(`${SAKURA_URL}/api/wg/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: reqId })
            });

            const data = await res.json();
            if (!res.ok || !data.ok) {
                return m.reply(`❌ Gagal menolak permintaan: ${data.error || 'Terjadi kesalahan'}`);
            }

            const { name, whatsapp } = data;
            const targetJid = `${whatsapp.replace(/\D/g, '')}@s.whatsapp.net`;

            await sock.sendMessage(targetJid, {
                text: `❌ *Permintaan WireGuard Ditolak*\n\nMohon maaf, permintaan pendaftaran WireGuard Sakura Anda (${reqId}) ditolak oleh Owner.`
            });

            return m.reply(`❌ *Permintaan WireGuard Ditolak!*\n\nID: *${reqId}*\nNama: *${name}*\nNo WA: *${whatsapp}*`);

        } catch (err) {
            console.error('Error in rejectwg command:', err);
            return m.reply(`❌ Gagal memproses penolakan: ${err.message}`);
        }
    }
};

import QRCode from 'qrcode';

const SAKURA_URL = process.env.SAKURA_API_URL || 'https://sakura.irengcloud.com';

export default {
    name: 'accwg',
    aliases: ['approvewg', 'wgacc'],
    description: 'ACC Pendaftaran WireGuard Sakura (Khusus Owner)',
    category: 'Owner',
    execute: async (sock, m, args) => {
        const reqId = args[0];
        if (!reqId) {
            return m.reply('❌ Harap sertakan ID permintaan WireGuard. Contoh: .accwg WG-A1B2C3');
        }

        try {
            await m.reply(`⏳ Memproses konfirmasi WireGuard untuk ID *${reqId}*...`);

            const res = await fetch(`${SAKURA_URL}/api/wg/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: reqId })
            });

            const data = await res.json();
            if (!res.ok || !data.ok) {
                return m.reply(`❌ Gagal mengkonfirmasi WireGuard: ${data.error || 'Terjadi kesalahan'}`);
            }

            const { name, whatsapp, userJid, ip, config: wgConfig } = data;
            
            // Prioritaskan userJid (LID / JID asli), jika tidak ada fallback ke whatsapp @s.whatsapp.net
            const targetJid = userJid && userJid.trim() ? userJid.trim() : `${whatsapp.replace(/\D/g, '')}@s.whatsapp.net`;

            const qrBuffer = await QRCode.toBuffer(wgConfig, {
                errorCorrectionLevel: 'H',
                margin: 2,
                width: 512,
            });

            const captionUser = `🎉 *Selamat! Akses WireGuard Sakura Anda Telah Disetujui!*\n\n👤 Nama: *${name}*\n🌐 IP WireGuard: *${ip}*\n\n📱 *Cara Connect:*\n1. Download & Buka aplikasi *WireGuard* di HP.\n2. Klik tombol (+), lalu pilih *Scan from QR Code* dan scan gambar di atas.\n3. Atau import file sakura-wg.conf di bawah ini.\n\nSelamat menikmati koneksi privat Sakura!`;

            await sock.sendMessage(targetJid, {
                image: qrBuffer,
                caption: captionUser
            });

            const confBuffer = Buffer.from(wgConfig, 'utf-8');
            await sock.sendMessage(targetJid, {
                document: confBuffer,
                fileName: 'sakura-wg.conf',
                mimetype: 'application/x-wireguard',
                caption: '📄 File konfigurasi WireGuard Sakura (Import jika tidak menggunakan QR Code)'
            });

            return m.reply(`✅ *WireGuard Berhasil Di-ACC!*\n\n👤 Nama: *${name}*\n📞 Target: *${targetJid}*\n🌐 IP: *${ip}*\n\nConfig & QR Code telah dikirimkan ke WhatsApp user.`);

        } catch (err) {
            console.error('Error in accwg command:', err);
            return m.reply(`❌ Gagal memproses ACC WireGuard: ${err.message}`);
        }
    }
};

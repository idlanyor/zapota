import {
    fetchMlLeaksPosts,
    getPostByIdentifier,
    loadHistory,
    saveHistory,
    setTargetChannel,
    DEFAULT_CHANNEL_JID,
} from '../../services/repostService.js';
import logger from '../../utils/logger.js';

export default {
    name: 'repost',
    aliases: ['fbrepost', 'mlleak', 'repostch'],
    description: 'Lihat dan repost postingan ML Leaks Facebook ke Saluran WhatsApp',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        const subCmd = (args[0] || '').toLowerCase();
        const history = loadHistory();
        const targetChannel = history.channel_jid || DEFAULT_CHANNEL_JID;

        // Subcommand: setch <channel_jid>
        if (subCmd === 'setch') {
            const newJid = args[1]?.trim();
            if (!newJid || !newJid.includes('@newsletter')) {
                return m.reply(
                    '⚠️ Masukkan JID Saluran yang valid.\nContoh: .repost setch 120363410414831916@newsletter'
                );
            }
            setTargetChannel(newJid);
            return m.reply(`✅ Target Saluran berhasil diubah ke:\n*${newJid}*`);
        }

        // Subcommand: list (atau jika tanpa argumen)
        if (!subCmd || subCmd === 'list') {
            await m.reply('🔍 Mengambil postingan terbaru dari Facebook ML Leaks...');
            try {
                const posts = await fetchMlLeaksPosts(true);

                if (!posts || posts.length === 0) {
                    return m.reply(
                        '❌ Tidak ditemukan postingan yang bisa diekstrak dari profil Facebook ML Leaks.'
                    );
                }

                let response = `📢 *DAFTAR POSTINGAN ML LEAKS*\n`;
                response += `🎯 Target Saluran: *${targetChannel}*\n`;
                response += `📊 Total Ditemukan: *${posts.length} Postingan*\n`;
                response += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

                for (const post of posts) {
                    const statusIcon = post.isPosted ? '✅ [SUDAH DIPOST]' : '⏳ [BELUM DIPOST]';
                    const dateFormatted = post.date
                        ? new Date(post.date).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
                        : '-';
                    const captionSnippet =
                        post.caption.length > 90
                            ? post.caption.slice(0, 90) + '...'
                            : post.caption;

                    response += `*ID:* [ *${post.index}* ] ${statusIcon}\n`;
                    response += `📅 *Tanggal:* ${dateFormatted}\n`;
                    response += `❤️ *Likes:* ${post.likes}  |  💬 *Comments:* ${post.comments}  |  🔄 *Shares:* ${post.shares}\n`;
                    response += `🖼️ *Gambar:* ${post.images.length > 0 ? `${post.images.length} Foto` : 'Tidak ada'}\n`;
                    response += `📝 *Caption:*\n${captionSnippet}\n`;
                    response += `🔗 *Link:* ${post.url || '-'}\n\n`;
                    response += `─────────────────────\n`;
                }

                response += `\n👉 *Cara Repost ke Saluran:*\n`;
                response += `Ketik *.repost <nomor>*\n`;
                response += `Contoh: *.repost 1* (Posting item no 1)`;

                return await m.reply(response);
            } catch (err) {
                logger.error('[REPOST] Gagal fetch list:', err);
                return m.reply(`❌ Gagal mengambil daftar postingan: ${err.message}`);
            }
        }

        // Subcommand: repost <nomor/id> [force]
        const targetId = subCmd;
        const isForce = (args[1] || '').toLowerCase() === 'force';

        await m.reply(`⏳ Menyiapkan postingan [${targetId}] untuk dikirim ke Saluran...`);

        try {
            const post = await getPostByIdentifier(targetId);

            if (!post) {
                return m.reply(
                    `❌ Postingan dengan nomor/ID "${targetId}" tidak ditemukan.\nKetik *.repost list* untuk melihat daftar nomor yang tersedia.`
                );
            }

            if (post.isPosted && !isForce) {
                return m.reply(
                    `⚠️ Postingan [${post.index}] sudah *pernah diposting* ke Saluran sebelumnya!\n\nKetik *.repost ${post.index} force* jika ingin tetap memposting ulang ke Saluran.`
                );
            }

            const dateFormatted = post.date
                ? new Date(post.date).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
                : 'Baru saja';

            // Susun caption rapi untuk Saluran
            const channelCaption =
                `🎮 *MLBB LEAKS & UPDATES*\n\n` +
                `${post.caption}\n\n` +
                `───────────────────\n` +
                `📅 *Waktu:* ${dateFormatted}\n` +
                `🔗 *Sumber:* ${post.url || 'Facebook'}`;

            // Kirim ke saluran WhatsApp
            if (post.images && post.images.length > 0) {
                // Fetch buffer gambar pertama
                const imgRes = await fetch(post.images[0]);
                if (!imgRes.ok) {
                    throw new Error(`Gagal mengunduh gambar: HTTP ${imgRes.status}`);
                }
                const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
                const detectedMime =
                    imgRes.headers.get('content-type')?.split(';')[0].trim() || 'image/jpeg';

                // Kirim gambar pertama beserta caption & mimetype eksplisit
                await sock.sendMessage(targetChannel, {
                    image: imgBuffer,
                    mimetype: detectedMime,
                    caption: channelCaption,
                });

                // Jika ada gambar tambahan, kirim gambar berikutnya
                for (let i = 1; i < post.images.length; i++) {
                    try {
                        const extraRes = await fetch(post.images[i]);
                        if (extraRes.ok) {
                            const extraBuf = Buffer.from(await extraRes.arrayBuffer());
                            const extraMime =
                                extraRes.headers.get('content-type')?.split(';')[0].trim() ||
                                'image/jpeg';
                            await sock.sendMessage(targetChannel, {
                                image: extraBuf,
                                mimetype: extraMime,
                            });
                        }
                    } catch (e) {
                        logger.warn(`[REPOST] Gagal mengirim gambar tambahan ke-${i}:`, e.message);
                    }
                }
            } else {
                // Post teks saja
                await sock.sendMessage(targetChannel, {
                    text: channelCaption,
                });
            }

            // Simpan riwayat agar tidak duplikat
            saveHistory(post, targetChannel);

            return m.reply(
                `✅ *Berhasil memposting ke Saluran!*\n\n` +
                    `📢 *Saluran:* ${targetChannel}\n` +
                    `🆔 *Post ID:* ${post.post_id || post.index}\n` +
                    `📝 *Pratinjau:*\n${post.caption.slice(0, 100)}...`
            );
        } catch (err) {
            logger.error('[REPOST] Gagal memposting ke saluran:', err);
            return m.reply(
                `❌ Gagal mengirim ke Saluran:\n*${err.message}*\n\n💡 _Tips: Pastikan bot sudah bergabung dan dijadikan Admin di Saluran tersebut._`
            );
        }
    },
};

import axios from 'axios';
import { uploadBufferToKanata } from '../../lib/mediaUpload.js';
import { getBlogFromSession } from '../../lib/blogSession.js';
import dotenv from 'dotenv';
dotenv.config();

export default {
    name: 'editpost',
    aliases: ['updatepost'],
    description: 'Edit postingan blog',
    category: 'Blog',
    execute: async (sock, m, args, text) => {
        try {
            if (!text) {
                return m.reply(
                    'Format: .editpost Nomor/ID | Judul | Kategori | Konten\n\nTips: Gunakan `.listposts` untuk melihat nomor.'
                );
            }

            const parts = text.split('|').map((p) => p.trim());
            if (parts.length < 4) {
                return m.reply(
                    'Format salah! Pastikan menggunakan: Nomor/ID | Judul | Kategori | Konten'
                );
            }

            let [id, title, category, content] = parts;
            const sessionPost = getBlogFromSession(m.sender, id);
            if (sessionPost) {
                id = sessionPost.id;
            }

            await m.react('⏳');

            let updateData = {
                title,
                category,
                content,
                excerpt: content.substring(0, 150) + '...',
            };

            // Handle thumbnail update if media provided
            const target = m.quoted || m;
            const mime = target?.msg?.mimetype || '';
            if (target.isImage || /image/i.test(mime)) {
                try {
                    const buffer = await target.download();
                    const uploadResult = await uploadBufferToKanata(buffer, {
                        filename: `update_${id}.jpg`,
                        mimeType: 'image/jpeg',
                    });
                    updateData.image = uploadResult.url;
                } catch (uploadErr) {
                    console.error('Upload failed:', uploadErr);
                }
            }

            const response = await axios.put(
                `${process.env.BLOG_API_URL}/posts/${id}`,
                updateData,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': process.env.BLOG_API_KEY,
                    },
                }
            );

            if (response.status === 200) {
                await m.react('✅');
                m.reply(
                    `✅ *Berhasil Update!*\n\n*Judul:* ${title}\n*Slug:* ${response.data.slug}`
                );
            }
        } catch (err) {
            console.error('Edit post error:', err);
            await m.react('❌');
            const errorMsg = err.response?.data?.message || err.message;
            m.reply(`❌ Gagal update postingan.\nError: ${errorMsg}`);
        }
    },
};

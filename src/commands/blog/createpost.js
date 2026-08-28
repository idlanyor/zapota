import axios from 'axios';
import { uploadBufferToKanata } from '../../lib/mediaUpload.js';
import dotenv from 'dotenv';
dotenv.config();

export default {
    name: 'createpost',
    aliases: ['postblog', 'addpost'],
    description: 'Buat postingan blog baru dari WhatsApp',
    category: 'Blog',
    execute: async (sock, m, args, text) => {
        try {
            if (!text) {
                return m.reply(
                    'Format: .createpost Judul | Kategori | Konten\n\nContoh: .createpost Belajar React | Tutorial | Ini adalah konten artikel...'
                );
            }

            const parts = text.split('|').map((p) => p.trim());
            if (parts.length < 3) {
                return m.reply(
                    'Format salah! Pastikan menggunakan pemisah | (Judul | Kategori | Konten)'
                );
            }

            const [title, category, content] = parts;
            const slug = title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');

            await m.react('⏳');

            let imageUrl = '';
            const target = m.quoted || m;
            const mime = target?.msg?.mimetype || '';

            if (target.isImage || /image/i.test(mime)) {
                try {
                    const buffer = await target.download();
                    const uploadResult = await uploadBufferToKanata(buffer, {
                        filename: `${slug}.jpg`,
                        mimeType: 'image/jpeg',
                    });
                    imageUrl = uploadResult.url;
                } catch (uploadErr) {
                    console.error('Upload failed:', uploadErr);
                    return m.reply('Gagal mengunggah thumbnail ke server uploader.');
                }
            }

            const postData = {
                title,
                slug,
                category,
                content,
                excerpt: content.substring(0, 150) + '...',
                image:
                    imageUrl ||
                    'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800', // default if no image
            };

            const response = await axios.post(`${process.env.BLOG_API_URL}/posts`, postData, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.BLOG_API_KEY,
                },
            });

            if (response.status === 201) {
                await m.react('✅');
                m.reply(
                    `✅ *Berhasil Posting!*\n\n*Judul:* ${title}\n*Kategori:* ${category}\n*Slug:* ${slug}\n*Thumbnail:* ${imageUrl ? 'Berhasil diunggah' : 'Menggunakan default'}\n\nLihat di: https://roy.github.io/portfolio/#/blog/${slug}`
                );
            } else {
                throw new Error('Gagal membuat postingan.');
            }
        } catch (err) {
            console.error('Create post error:', err);
            await m.react('❌');
            m.reply(`❌ *Gagal Posting!*\nError: ${err.message}`);
        }
    },
};

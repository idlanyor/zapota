import axios from 'axios';
import { setBlogSession } from '../../lib/blogSession.js';
import dotenv from 'dotenv';
dotenv.config();

export default {
    name: 'listposts',
    aliases: ['listblog', 'allposts'],
    description: 'Lihat semua daftar postingan blog',
    category: 'Blog',
    execute: async (sock, m, args, text) => {
        try {
            await m.react('⏳');
            const response = await axios.get(`${process.env.BLOG_API_URL}/posts`);
            const posts = response.data;

            if (posts.length === 0) {
                return m.reply('Belum ada postingan blog.');
            }

            // Save to session for easy access
            setBlogSession(m.sender, posts);

            let message = '📝 *Daftar Postingan Blog*\n\n';
            posts.forEach((post, i) => {
                message += `${i + 1}. *${post.title}*\n`;
                message += `   Slug: \`${post.slug}\`\n\n`;
            });

            message += '💡 *Tips:* Gunakan nomor urut untuk edit/hapus.\n';
            message += 'Contoh: `.delpost 1` atau `.editpost 1 | Judul | ...`';

            await m.react('✅');
            m.reply(message);
        } catch (err) {
            console.error('List posts error:', err);
            await m.react('❌');
            m.reply(`❌ Gagal mengambil daftar postingan.\nError: ${err.message}`);
        }
    },
};

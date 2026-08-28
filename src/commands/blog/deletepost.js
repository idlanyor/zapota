import axios from 'axios';
import { getBlogFromSession } from '../../lib/blogSession.js';
import dotenv from 'dotenv';
dotenv.config();

export default {
    name: 'deletepost',
    aliases: ['delpost', 'removepost'],
    description: 'Hapus postingan blog berdasarkan ID atau Nomor',
    category: 'Blog',
    execute: async (sock, m, args, text) => {
        try {
            if (!args[0]) {
                return m.reply('Format: .deletepost <ID atau Nomor>\nContoh: .deletepost 1');
            }

            let id = args[0];
            const sessionPost = getBlogFromSession(m.sender, id);
            if (sessionPost) {
                id = sessionPost.id;
            }
            await m.react('⏳');

            const response = await axios.delete(`${process.env.BLOG_API_URL}/posts/${id}`, {
                headers: {
                    'x-api-key': process.env.BLOG_API_KEY,
                },
            });

            if (response.status === 200) {
                await m.react('✅');
                m.reply(`✅ Berhasil menghapus postingan dengan ID: \`${id}\``);
            }
        } catch (err) {
            console.error('Delete post error:', err);
            await m.react('❌');
            const errorMsg = err.response?.data?.message || err.message;
            m.reply(`❌ Gagal menghapus postingan.\nError: ${errorMsg}`);
        }
    },
};

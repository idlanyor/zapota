import axios from 'axios';
import FormData from 'form-data';
import { settings } from '../../config/settings.js';

const SCALES = ['2', '4'];

const HEADERS = {
    Origin: 'https://www.iloveimg.com',
    Referer: 'https://www.iloveimg.com/',
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function getToken() {
    const res = await axios.get('https://www.iloveimg.com/upscale-image', { headers: HEADERS });
    const html = res.data;
    const token = html.match(/"token":"(eyJ[^"]+)"/)?.[1];
    const task = html.match(/ilovepdfConfig\.taskId\s*=\s*'([^']+)'/)?.[1];
    if (!token || !task) throw new Error('Gagal mengambil token/task dari iloveimg');
    return { token, task };
}

async function uploadImage(buffer, token, task) {
    const form = new FormData();
    form.append('name', 'image.jpg');
    form.append('chunk', '0');
    form.append('chunks', '1');
    form.append('task', task);
    form.append('preview', '1');
    form.append('v', 'web.0');
    form.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

    const r = await axios.post('https://api29g.iloveimg.com/v1/upload', form, {
        headers: {
            Authorization: `Bearer ${token}`,
            ...form.getHeaders(),
            ...HEADERS,
        },
    });

    const json = r.data;
    if (!json.server_filename) throw new Error('Upload gagal: server_filename kosong');
    return json.server_filename;
}

async function doUpscale(serverFilename, token, task, scale) {
    const form = new FormData();
    form.append('task', task);
    form.append('server_filename', serverFilename);
    form.append('scale', scale);

    const r = await axios.post('https://api29g.iloveimg.com/v1/upscale', form, {
        headers: {
            Authorization: `Bearer ${token}`,
            ...form.getHeaders(),
            ...HEADERS,
        },
        responseType: 'arraybuffer',
    });

    const buffer = Buffer.from(r.data);
    if (buffer.subarray(0, 3).toString('hex') !== 'ffd8ff') {
        throw new Error('Upscale gagal: ' + buffer.toString('utf8').slice(0, 200));
    }
    return buffer;
}

async function upscale(buffer, scale) {
    const { token, task } = await getToken();
    const serverFilename = await uploadImage(buffer, token, task);
    return doUpscale(serverFilename, token, task, scale);
}

export default {
    name: 'upscale',
    aliases: ['hd', 'uphd', 'imgup'],
    description: 'Upscale gambar via iLoveIMG (tanpa API Key, 2x atau 4x)',
    category: 'Tools',
    execute: async (sock, m, args) => {
        try {
            const quoted = m.quoted ? m.quoted : m;
            const msg = quoted.msg || quoted;
            const mime = msg.mimetype || '';

            if (!/^image\//i.test(mime) && !/sticker/i.test(mime)) {
                return m.reply(`Reply gambar/sticker dengan *${settings.prefix}hd* [2/4]`);
            }

            let scale = '4';
            if (args && args[0]) {
                const requestedScale = args[0].trim();
                if (SCALES.includes(requestedScale)) {
                    scale = requestedScale;
                } else {
                    return m.reply(`Skala tidak valid. Pilih: ${SCALES.join(', ')}`);
                }
            }

            await m.react('⏳');
            const mediaBuffer = await m.downloadMediaMessage(quoted);
            if (!mediaBuffer || !mediaBuffer.length) {
                return m.reply('Gagal membaca media. Coba kirim ulang gambarnya.');
            }

            await m.react('⚙️');
            const outBuffer = await upscale(mediaBuffer, scale);

            await sock.sendMessage(
                m.chat,
                {
                    image: outBuffer,
                    caption: `*Upscale ${scale}x berhasil*`,
                },
                { quoted: m }
            );
            await m.react('✅');
        } catch (error) {
            console.error('[upscale] error:', error);
            await m.react('❌');
            return m.reply(`Gagal upscale gambar: ${error.message || 'Unknown error'}`);
        }
    },
};

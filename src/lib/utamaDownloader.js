import { collectMedia, findValue, utamaGet } from '../services/utamaApi.js';

export async function downloadFromUtama(endpoint, url) {
    const response = await utamaGet(endpoint, { url });
    // Downloader APIs commonly echo the source page in a generic `url` field.
    // It is not downloadable media and must not be passed to Baileys as video.
    const media = collectMedia(response).filter((item) => item.url !== url);
    if (!media.length) throw new Error(response?.message || 'Media tidak ditemukan pada respons API');
    return {
        media,
        title: findValue(response, ['title', 'judul', 'caption', 'description']) || '',
        author: findValue(response, ['author', 'username', 'user', 'uploader']) || '',
        fileName: findValue(response, ['filename', 'file_name', 'name']) || '',
        size: findValue(response, ['size', 'filesize', 'file_size']) || '',
        raw: response,
    };
}

export async function sendUtamaMedia(sock, m, data, heading) {
    const caption = [heading, data.title && `*Judul:* ${String(data.title).slice(0, 500)}`, data.author && `*Pengunggah:* ${data.author}`]
        .filter(Boolean)
        .join('\n');
    for (let index = 0; index < data.media.length; index += 1) {
        const item = data.media[index];
        const withCaption = index === 0 ? caption : undefined;
        if (item.type === 'image') {
            await sock.sendMessage(m.chat, { image: { url: item.url }, caption: withCaption }, { quoted: m });
        } else if (item.type === 'audio') {
            await sock.sendMessage(m.chat, { audio: { url: item.url }, mimetype: 'audio/mpeg' }, { quoted: m });
        } else {
            await sock.sendMessage(m.chat, { video: { url: item.url }, caption: withCaption, mimetype: 'video/mp4' }, { quoted: m });
        }
    }
}

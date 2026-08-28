import crypto from 'crypto';

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HEADERS = {
    'user-agent': UA,
    'content-type': 'application/json',
    origin: 'https://y2mate.net.co',
    referer: 'https://y2mate.net.co/',
};
// Key AES-128-CBC milik savetube.vip
const KEY = Buffer.from('C5D58EF67A7584E4A29F6C35BBC4EB12', 'hex');

function decryptInfo(b64) {
    const raw = Buffer.from(b64, 'base64');
    const iv = raw.subarray(0, 16);
    const data = raw.subarray(16);
    const decipher = crypto.createDecipheriv('aes-128-cbc', KEY, iv);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(out.toString('utf8'));
}

async function getRandomCdn() {
    const r = await fetch('https://media.savetube.vip/api/random-cdn', {
        headers: { 'user-agent': UA },
    });
    if (!r.ok) throw new Error('Gagal mengambil CDN savetube');
    const j = await r.json();
    return j.cdn;
}

async function getInfo(cdn, url) {
    const r = await fetch(`https://${cdn}/v2/info`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ url }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.status || typeof j.data !== 'string') {
        throw new Error(j.message || 'Gagal mengambil info video');
    }
    return decryptInfo(j.data);
}

async function getDownloadUrl(cdn, key, quality, downloadType) {
    const r = await fetch(`https://${cdn}/download`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ downloadType, quality, key }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.status || !j.data?.downloadUrl)
        throw new Error(j.message || 'Gagal membuat link unduhan');
    return j.data.downloadUrl;
}

export function chooseVideoFormat(formats, requestedQuality = null) {
    const available = (Array.isArray(formats) ? formats : [])
        .map((format, index) => ({
            format,
            index,
            quality: Number.parseInt(format?.quality ?? format?.height, 10),
        }))
        .filter(({ quality }) => Number.isFinite(quality) && quality > 0);

    if (!available.length) return null;

    const requested = Number.parseInt(requestedQuality, 10);
    if (Number.isFinite(requested) && requested > 0) {
        const exact = available
            .filter(({ quality }) => quality === requested)
            .sort(
                (a, b) =>
                    Number(Boolean(b.format.default_selected)) -
                        Number(Boolean(a.format.default_selected)) ||
                    a.index - b.index
            )[0];
        if (exact) return exact.format;

        const lowerOrEqual = available
            .filter(({ quality }) => quality <= requested)
            .sort(
                (a, b) =>
                    b.quality - a.quality ||
                    Number(Boolean(b.format.default_selected)) -
                        Number(Boolean(a.format.default_selected)) ||
                    a.index - b.index
            )[0];
        if (lowerOrEqual) return lowerOrEqual.format;

        return available.sort(
            (a, b) =>
                a.quality - b.quality ||
                Number(Boolean(b.format.default_selected)) -
                    Number(Boolean(a.format.default_selected)) ||
                a.index - b.index
        )[0].format;
    }

    return (
        available.find(({ quality }) => quality === 720)?.format ||
        available.find(({ format }) => format.default_selected)?.format ||
        available.sort((a, b) => b.quality - a.quality || a.index - b.index)[0].format
    );
}

export async function savetube(url, type = 'video', quality = null) {
    const cdn = await getRandomCdn();
    const info = await getInfo(cdn, url);
    const videoFormats = (info.video_formats || [])
        .map((f) => String(f.quality || f.height))
        .filter(Boolean);
    const audioFormats = (info.audio_formats || [])
        .map((f) => String(f.quality || f.abr || '128'))
        .filter(Boolean);

    let downloadUrl, finalQuality;
    if (type === 'audio') {
        finalQuality = quality || audioFormats[0] || '128';
        downloadUrl = await getDownloadUrl(cdn, info.key, finalQuality, 'audio');
    } else {
        const fmts = info.video_formats || [];
        const chosen = chooseVideoFormat(fmts, quality);
        if (!chosen) throw new Error('Tidak ada format video tersedia');
        finalQuality = String(chosen.quality || chosen.height);
        downloadUrl = await getDownloadUrl(cdn, info.key, finalQuality, 'video');
    }

    return {
        title: info.title || null,
        duration: info.durationLabel || info.duration || null,
        thumbnail: info.thumbnail || null,
        type,
        quality: finalQuality,
        downloadUrl,
        availableFormats: { video: videoFormats, audio: audioFormats },
    };
}

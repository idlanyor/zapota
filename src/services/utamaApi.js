import axios from 'axios';

export const UTAMA_API_BASE = 'https://apiku.irengcloud.com/api/v1';

const client = axios.create({
    baseURL: UTAMA_API_BASE,
    timeout: 60000,
    headers: { Accept: 'application/json' },
});

export async function utamaGet(path, params = {}) {
    try {
        const { data } = await client.get(path, { params });
        if (data?.success === false) throw new Error(data.message || data.error || 'Request gagal');
        return data;
    } catch (error) {
        const detail = error.response?.data?.message || error.response?.data?.error;
        throw new Error(detail || error.message || 'API Utama tidak dapat dihubungi');
    }
}

const URL_KEYS = /^(url|urls|media|medias|download|download_url|direct_url|video|videos|video_url|video_hd|video_hd_url|audio|audios|audio_url|image|images|image_url|photo|photos|src|hd|sd)$/i;

const normalizeMediaKey = (key) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

export function collectMedia(value, key = '', result = [], hintedType = '') {
    const normalizedKey = normalizeMediaKey(key);
    if (
        typeof value === 'string' &&
        /^https?:\/\//i.test(value) &&
        URL_KEYS.test(normalizedKey)
    ) {
        const lower = value.toLowerCase();
        const type = hintedType || (/audio|\.mp3(?:\?|$)|\.m4a(?:\?|$)/i.test(normalizedKey + lower)
            ? 'audio'
            : /image|photo|thumbnail|\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.test(normalizedKey + lower)
              ? 'image'
              : 'video');
        result.push({ url: value, type, quality: normalizedKey });
    } else if (Array.isArray(value)) {
        value.forEach((item) => collectMedia(item, key, result, hintedType));
    } else if (value && typeof value === 'object') {
        const objectType = String(value.type || value.media_type || '').toLowerCase();
        const contextType = /image|photo/.test(objectType)
            ? 'image'
            : /audio|music/.test(objectType)
              ? 'audio'
              : /video/.test(objectType)
                ? 'video'
                : hintedType;
        Object.entries(value).forEach(([childKey, child]) => collectMedia(child, childKey, result, contextType));
    }
    return [...new Map(result.map((item) => [item.url, item])).values()];
}

export function findValue(value, keys) {
    if (!value || typeof value !== 'object') return null;
    for (const [key, child] of Object.entries(value)) {
        if (keys.includes(key.toLowerCase()) && child != null && typeof child !== 'object') return child;
    }
    for (const child of Object.values(value)) {
        const found = findValue(child, keys);
        if (found != null) return found;
    }
    return null;
}

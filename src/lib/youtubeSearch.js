import { search as searchWithoutApiKey } from 'youtube-search-without-api-key';

const extractVideoId = (value) => {
    try {
        const parsed = new URL(value);
        const hostname = parsed.hostname.replace(/^www\./, '');

        if (hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || '';
        if (hostname.endsWith('youtube.com')) {
            if (parsed.pathname === '/watch') return parsed.searchParams.get('v') || '';
            const [type, id] = parsed.pathname.split('/').filter(Boolean);
            if (['shorts', 'embed', 'live'].includes(type)) return id || '';
        }
    } catch {
        // A normal search query is expected to fail URL parsing.
    }

    return '';
};

export const normalizeYouTubeResult = (video) => {
    const videoId = video?.id?.videoId || '';
    const url = video?.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');

    return {
        videoId,
        url,
        title: String(video?.title || 'Video YouTube').trim(),
        description: String(video?.description || ''),
        thumbnail:
            video?.snippet?.thumbnails?.url ||
            (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
        timestamp: String(video?.duration_raw || video?.snippet?.duration || 'LIVE'),
        ago: String(video?.snippet?.publishedAt || '-'),
        views: Number(video?.views) || 0,
        author: {
            name: String(video?.author?.name || video?.channelTitle || 'YouTube'),
            url: String(video?.author?.url || ''),
        },
    };
};

export const searchYouTube = async (query, limit = 10) => {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return [];

    const searchQuery = extractVideoId(cleanQuery) || cleanQuery;
    const results = await searchWithoutApiKey(searchQuery);

    return results
        .map(normalizeYouTubeResult)
        .filter((video) => video.videoId && video.url && video.thumbnail)
        .slice(0, limit);
};

export default searchYouTube;

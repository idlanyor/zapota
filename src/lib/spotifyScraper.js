import axios from 'axios';

/**
 * Scraper download lagu Spotify via MusicFab API
 * @param {string} spotifyUrl - URL track Spotify
 */
export const downloadSpotify = async (spotifyUrl) => {
    if (!spotifyUrl) throw new Error('Harap masukkan URL Spotify track.');

    // Ekstrak Track ID dari format:
    // https://open.spotify.com/intl-id/track/4R9G7azXaZe93KTX65P9fU?si=...
    // https://open.spotify.com/track/4R9G7azXaZe93KTX65P9fU
    // spotify:track:4R9G7azXaZe93KTX65P9fU
    const match = spotifyUrl.match(/track[/:]([A-Za-z0-9]+)/i);
    if (!match) {
        throw new Error('URL Spotify tidak valid. Pastikan link mengarah ke track/lagu Spotify.');
    }

    const trackId = match[1];
    const canonicalUrl = `https://open.spotify.com/track/${trackId}`;

    const { data } = await axios.post(
        'https://musicfab.io/api/spotify',
        { url: canonicalUrl },
        {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Referer: 'https://musicfab.io/',
                Origin: 'https://musicfab.io',
            },
            timeout: 30000,
        }
    );

    if (data?.error) {
        throw new Error(data.error.message || data.error.code || 'Gagal memproses lagu dari Spotify.');
    }

    const metadata = data?.data?.metadata;
    if (!metadata || !metadata.download) {
        throw new Error('Tidak dapat menemukan link download dari server Spotify.');
    }

    return {
        trackId,
        title: metadata.name || 'Unknown Track',
        artist: metadata.artist || 'Unknown Artist',
        album: metadata.album || '',
        duration: metadata.duration || '0:00',
        coverUrl: metadata.image || null,
        downloadUrl: metadata.download,
    };
};

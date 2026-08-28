import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeYouTubeResult } from '../youtubeSearch.js';

test('normalizes results from youtube-search-without-api-key', () => {
    const result = normalizeYouTubeResult({
        id: { videoId: 'abcdefghijk' },
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        title: ' Example Video ',
        description: 'Description',
        duration_raw: '4:21',
        snippet: {
            publishedAt: '2 days ago',
            thumbnails: { url: 'https://i.ytimg.com/vi/abcdefghijk/hq720.jpg' },
        },
        views: 1234,
    });

    assert.deepEqual(result, {
        videoId: 'abcdefghijk',
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        title: 'Example Video',
        description: 'Description',
        thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/hq720.jpg',
        timestamp: '4:21',
        ago: '2 days ago',
        views: 1234,
        author: { name: 'YouTube', url: '' },
    });
});

test('provides safe fallbacks for optional result fields', () => {
    const result = normalizeYouTubeResult({ id: { videoId: 'abcdefghijk' } });

    assert.equal(result.title, 'Video YouTube');
    assert.equal(result.thumbnail, 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
    assert.equal(result.timestamp, 'LIVE');
    assert.equal(result.author.name, 'YouTube');
});

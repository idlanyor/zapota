import assert from 'node:assert/strict';
import test from 'node:test';

import { collectMedia } from '../utamaApi.js';

test('collectMedia recognizes camelCase video and audio URL keys', () => {
    const media = collectMedia({
        videoUrl: 'https://cdn.example.com/video.mp4',
        audioUrl: 'https://cdn.example.com/audio.mp3',
    });

    assert.deepEqual(media, [
        {
            url: 'https://cdn.example.com/video.mp4',
            type: 'video',
            quality: 'video_url',
        },
        {
            url: 'https://cdn.example.com/audio.mp3',
            type: 'audio',
            quality: 'audio_url',
        },
    ]);
});

test('collectMedia keeps existing snake_case behavior and removes duplicate URLs', () => {
    const media = collectMedia({
        video_url: 'https://cdn.example.com/video.mp4',
        nested: { videoUrl: 'https://cdn.example.com/video.mp4' },
        image_url: 'https://cdn.example.com/cover.jpg',
    });

    assert.deepEqual(media, [
        {
            url: 'https://cdn.example.com/video.mp4',
            type: 'video',
            quality: 'video_url',
        },
        {
            url: 'https://cdn.example.com/cover.jpg',
            type: 'image',
            quality: 'image_url',
        },
    ]);
});

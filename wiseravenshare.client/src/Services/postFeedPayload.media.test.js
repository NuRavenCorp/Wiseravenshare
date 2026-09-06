import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFeedPost } from './postFeedPayload.js';

test('normalizes audio posts and keeps playable media url', () => {
    const post = normalizeFeedPost({
        id: 'p-audio-1',
        type: 'Audio',
        mediaUrl: 'https://cdn.example.com/tracks/demo.mp3',
        content: 'Audio drop'
    });

    assert.equal(post.mediaType, 'audio');
    assert.equal(post.mediaUrl, 'https://cdn.example.com/tracks/demo.mp3');
});

test('infers photo type from image extension', () => {
    const post = normalizeFeedPost({
        id: 'p-photo-1',
        type: 'Text',
        mediaUrl: 'https://cdn.example.com/images/sample.webp',
        content: 'Photo post'
    });

    assert.equal(post.mediaType, 'photo');
});

test('accepts data audio urls for local preview fallback', () => {
    const post = normalizeFeedPost({
        id: 'p-audio-2',
        type: 'Audio',
        mediaUrl: 'data:audio/mp3;base64,ZmFrZQ==',
        content: 'Inline audio'
    });

    assert.equal(post.mediaType, 'audio');
    assert.equal(post.mediaUrl, 'data:audio/mp3;base64,ZmFrZQ==');
});

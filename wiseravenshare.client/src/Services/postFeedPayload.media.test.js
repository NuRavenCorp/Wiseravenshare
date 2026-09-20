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

test('prefers the signed-in username over placeholder backend handles', () => {
    const post = normalizeFeedPost({
        id: 'p-user-1',
        content: 'Signed in post',
        user: {
            id: 'server-user-id',
            username: 'userf0826ffb',
            handle: '@userf0826ffb',
            name: 'Arnold Spence'
        }
    }, {
        id: 'auth-user-id',
        username: 'arnoldspence',
        handle: '@arnoldspence',
        name: 'Arnold Spence',
        displayName: 'Arnold Spence'
    });

    assert.equal(post.user.username, 'arnoldspence');
    assert.equal(post.user.handle, '@arnoldspence');
    assert.equal(post.user.name, 'Arnold Spence');
});

test('mirrors like and repost counters across feed fields', () => {
    const post = normalizeFeedPost({
        id: 'p-counts-1',
        content: 'Counted post',
        likesCount: 7,
        repostsCount: 3,
        commentsCount: 2,
        bookmarksCount: 4,
        sharesCount: 1,
        viewsCount: 99
    });

    assert.equal(post.likes, 7);
    assert.equal(post.likesCount, 7);
    assert.equal(post.reposts, 3);
    assert.equal(post.repostsCount, 3);
    assert.equal(post.commentsCount, 2);
    assert.equal(post.bookmarksCount, 4);
    assert.equal(post.sharesCount, 1);
    assert.equal(post.viewsCount, 99);
});

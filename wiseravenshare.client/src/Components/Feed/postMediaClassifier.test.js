import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPostMedia } from './postMediaClassifier.js';

test('classifies audio posts by mediaType and extension', () => {
    const flags = classifyPostMedia(
        { mediaType: 'music', type: 'Text' },
        'https://cdn.example.com/audio/track.m4a'
    );

    assert.equal(flags.isAudioPost, true);
    assert.equal(flags.isVideoPost, false);
    assert.equal(flags.isImagePost, false);
});

test('classifies video posts by route and extension', () => {
    const byRoute = classifyPostMedia({ type: 'Text' }, 'https://wise-ravens.com/api/videostreaming/stream?fileName=abc');
    assert.equal(byRoute.isVideoPost, true);

    const byExt = classifyPostMedia({ type: 'Text' }, 'https://cdn.example.com/clips/cut.webm');
    assert.equal(byExt.isVideoPost, true);
});

test('classifies images correctly and avoids false audio/video flags', () => {
    const flags = classifyPostMedia(
        { mediaType: 'photo', type: 'Image' },
        'https://cdn.example.com/images/scene.jpg'
    );

    assert.equal(flags.isImagePost, true);
    assert.equal(flags.isAudioPost, false);
    assert.equal(flags.isVideoPost, false);
});

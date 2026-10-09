import test from 'node:test';
import assert from 'node:assert/strict';
import { toBlobStreamUrl } from './mediaStreamUrl.js';

// Test empty or falsy inputs
test('toBlobStreamUrl returns an empty string for falsy or empty inputs', () => {
  assert.equal(toBlobStreamUrl(''), '');
  assert.equal(toBlobStreamUrl(null), '');
  assert.equal(toBlobStreamUrl(undefined), '');
  assert.equal(toBlobStreamUrl('   '), '');
});

// Test standard path handling
test('toBlobStreamUrl formats a standard relative path correctly', () => {
  assert.equal(
    toBlobStreamUrl('folder/subfolder/video.mp4'),
    '/api/videostreaming/blob/folder/subfolder/video.mp4'
  );
});

// Test edge case slashes
test('toBlobStreamUrl strips leading and trailing slashes and removes duplicates', () => {
  assert.equal(
    toBlobStreamUrl('///folder/subfolder/video.mp4'),
    '/api/videostreaming/blob/folder/subfolder/video.mp4'
  );
  assert.equal(
    toBlobStreamUrl('folder//subfolder//video.mp4/'),
    '/api/videostreaming/blob/folder/subfolder/video.mp4'
  );
});

// Test Windows backslashes
test('toBlobStreamUrl converts Windows backslashes to forward slashes', () => {
  assert.equal(
    toBlobStreamUrl('folder\\subfolder\\video.mp4'),
    '/api/videostreaming/blob/folder/subfolder/video.mp4'
  );
});

// Test URL encoding
test('toBlobStreamUrl URL encodes special characters in path segments', () => {
  assert.equal(
    toBlobStreamUrl('my folder/movie & show #1.mp4'),
    '/api/videostreaming/blob/my%20folder/movie%20%26%20show%20%231.mp4'
  );
});

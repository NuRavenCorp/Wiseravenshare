import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInteractionState, readBooleanField } from './reactionState.js';

test('readBooleanField accepts string and numeric values', () => {
  assert.equal(readBooleanField({ isLiked: 'true' }, 'isLiked', 'IsLiked'), true);
  assert.equal(readBooleanField({ isReposted: 1 }, 'isReposted', 'IsReposted'), true);
  assert.equal(readBooleanField({ isLiked: 'false' }, 'isLiked', 'IsLiked'), false);
});

test('normalizeInteractionState keeps reaction state when backend sends string or numeric values', () => {
  const state = normalizeInteractionState({
    postId: 'abc',
    likesCount: '12',
    repostsCount: '5',
    commentsCount: 2,
    bookmarksCount: 1,
    isLiked: 'true',
    isReposted: 'false',
    isBookmarked: 1
  });

  assert.equal(state.likesCount, 12);
  assert.equal(state.repostsCount, 5);
  assert.equal(state.isLiked, true);
  assert.equal(state.isReposted, false);
  assert.equal(state.isBookmarked, true);
});

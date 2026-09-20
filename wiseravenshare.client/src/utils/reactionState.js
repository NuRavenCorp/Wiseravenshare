/**
 * Normalizes reaction state payloads from the backend to ensure consistent
 * handling of likes, reposts, bookmarks, and their state flags (isLiked, isReposted, isBookmarked).
 * Accounts for server responses with string or numeric values.
 */

const readNumericField = (source, ...keys) => {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null) {
      const value = Number(source[key]);
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }
  return undefined;
};

export const readBooleanField = (source, ...keys) => {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null) {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true' || value === '1';
      }
      if (typeof value === 'number') {
        return value !== 0;
      }
    }
  }
  return false;
};

export const normalizeInteractionState = (payload) => {
  const source = payload && typeof payload === 'object' ? payload : {};

  return {
    ...source,
    postId: source.postId ?? source.PostId,
    likesCount: readNumericField(source, 'likesCount', 'LikesCount', 'likes', 'Likes') ?? 0,
    repostsCount: readNumericField(source, 'repostsCount', 'RepostsCount', 'reposts', 'Reposts') ?? 0,
    commentsCount: readNumericField(source, 'commentsCount', 'CommentsCount', 'comments', 'Comments') ?? 0,
    bookmarksCount: readNumericField(source, 'bookmarksCount', 'BookmarksCount', 'bookmarks', 'Bookmarks') ?? 0,
    isLiked: readBooleanField(source, 'isLiked', 'IsLiked'),
    isReposted: readBooleanField(source, 'isReposted', 'IsReposted'),
    isBookmarked: readBooleanField(source, 'isBookmarked', 'IsBookmarked')
  };
};

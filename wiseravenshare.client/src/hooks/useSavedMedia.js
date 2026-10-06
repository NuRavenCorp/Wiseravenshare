import { useCallback, useState } from 'react';
import api from '../Services/api.js';

const SAVED_MEDIA_BASE = '/SavedMedia';

const MEDIA_TYPE_LOOKUP = {
  0: 'photo',
  1: 'video',
  2: 'music',
  3: 'audio',
  4: 'podcast',
  5: 'document',
};

const normalizeMediaType = (value) => {
  if (typeof value === 'number' && MEDIA_TYPE_LOOKUP[value]) {
    return MEDIA_TYPE_LOOKUP[value];
  }

  return String(value || '').trim().toLowerCase();
};

const toSavedMediaType = (value) => {
  switch (normalizeMediaType(value)) {
    case 'photo':
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    case 'music':
      return 'Music';
    case 'audio':
      return 'Audio';
    case 'podcast':
      return 'Podcast';
    case 'document':
      return 'Document';
    default:
      return '';
  }
};

const normalizeSavedMediaItem = (item) => {
  const metadata = item?.mediaMetadata || {};
  const mediaType = normalizeMediaType(item?.mediaType);

  return {
    ...item,
    id: item?.id,
    title: item?.title || '',
    name: item?.title || '',
    description: item?.description || '',
    mediaType,
    type: mediaType,
    mediaUrl: item?.mediaUrl || '',
    thumbnailUrl: item?.thumbnailUrl || '',
    isVisibleInFeed: Boolean(item?.isVisibleInFeed),
    status: item?.scheduledPublishAt
      ? 'scheduled'
      : item?.isPublished
        ? 'published'
        : 'saved',
    fileSizeBytes: Number(item?.fileSizeBytes || 0),
    sizeBytes: Number(item?.fileSizeBytes || 0),
    durationSeconds: Number(item?.durationSeconds || 0),
    width: Number(metadata?.width || 0) || null,
    height: Number(metadata?.height || 0) || null,
    tags: Array.isArray(item?.tags) ? item.tags : [],
    createdAt: item?.createdAt || null,
    updatedAt: item?.updatedAt || null,
    scheduledPublishAt: item?.scheduledPublishAt || null,
  };
};

const sortItems = (items, sortBy = 'createdAt', sortDir = 'desc') => {
  const direction = String(sortDir || 'desc').toLowerCase() === 'asc' ? 1 : -1;
  const list = Array.isArray(items) ? [...items] : [];

  list.sort((left, right) => {
    if (sortBy === 'title') {
      return String(left?.title || '').localeCompare(String(right?.title || '')) * direction;
    }

    if (sortBy === 'sizeBytes' || sortBy === 'fileSizeBytes') {
      return (Number(left?.sizeBytes || left?.fileSizeBytes || 0) - Number(right?.sizeBytes || right?.fileSizeBytes || 0)) * direction;
    }

    const leftDate = left?.[sortBy] ? new Date(left[sortBy]).getTime() : 0;
    const rightDate = right?.[sortBy] ? new Date(right[sortBy]).getTime() : 0;
    return (leftDate - rightDate) * direction;
  });

  return list;
};

export const useSavedMedia = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const apiCall = useCallback(async (method, endpoint, data = null) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api({
        method,
        url: `${SAVED_MEDIA_BASE}${endpoint}`,
        data,
      });
      return response?.data;
    } catch (err) {
      const errorMessage = err?.response?.data?.message || err?.message || 'An error occurred';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const saveMedia = useCallback(async (mediaData) => {
    const mediaUrl = String(mediaData?.mediaUrl || '').trim().toLowerCase();
    if (mediaUrl.startsWith('blob:') || mediaUrl.startsWith('file:')) {
      const err = new Error('Temporary local media URLs cannot be saved. Please upload the file first.');
      setError(err.message);
      throw err;
    }

    const response = await apiCall('POST', '/save', {
      title: mediaData?.title || mediaData?.name || 'Untitled media',
      description: mediaData?.description || null,
      mediaType: toSavedMediaType(mediaData?.mediaType || mediaData?.type),
      mediaUrl: mediaData?.mediaUrl || '',
      thumbnailUrl: mediaData?.thumbnailUrl || null,
      mediaMetadata: mediaData?.mediaMetadata || null,
      isVisibleInFeed: Boolean(mediaData?.isVisibleInFeed),
      tags: Array.isArray(mediaData?.tags) ? mediaData.tags : [],
      fileSizeBytes: Number(mediaData?.fileSizeBytes || mediaData?.sizeBytes || 0) || null,
      durationSeconds: Number(mediaData?.durationSeconds || 0) || null,
      scheduledPublishAt: mediaData?.scheduledPublishAt || null,
      sourcePostId: mediaData?.sourcePostId || null,
    });

    return normalizeSavedMediaItem(response);
  }, [apiCall]);

  const getMedia = useCallback(async (mediaId) => {
    const response = await apiCall('GET', `/${mediaId}`);
    return normalizeSavedMediaItem(response);
  }, [apiCall]);

  const getLibrary = useCallback(async (page = 1, pageSize = 20, filters = {}) => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });

    const mediaType = toSavedMediaType(filters?.mediaType);
    if (mediaType) {
      params.set('mediaType', mediaType);
    }

    let endpoint = `/library?${params.toString()}`;
    if (filters?.scheduledOnly) {
      endpoint = `/library/scheduled?${params.toString()}`;
    } else if (filters?.onlyVisible === true) {
      endpoint = `/library/visible?${params.toString()}`;
    } else if (filters?.onlyVisible === false) {
      endpoint = `/library/hidden?${params.toString()}`;
    } else if (filters?.tag) {
      endpoint = `/library/tag/${encodeURIComponent(filters.tag)}?${params.toString()}`;
    }

    const response = await apiCall('GET', endpoint);
    const items = Array.isArray(response?.items) ? response.items.map(normalizeSavedMediaItem) : [];
    const sortedItems = sortItems(items, filters?.sortBy, filters?.sortDir);
    const totalCount = response?.totalCount ?? sortedItems.length;

    return {
      ...response,
      items: sortedItems,
      data: sortedItems,
      totalCount,
      total: totalCount,
    };
  }, [apiCall]);

  const getHiddenMedia = useCallback((page = 1, pageSize = 20) => {
    return getLibrary(page, pageSize, { onlyVisible: false });
  }, [getLibrary]);

  const getVisibleMedia = useCallback((page = 1, pageSize = 20) => {
    return getLibrary(page, pageSize, { onlyVisible: true });
  }, [getLibrary]);

  const getTaggedMedia = useCallback((tag, page = 1, pageSize = 20) => {
    return getLibrary(page, pageSize, { tag });
  }, [getLibrary]);

  const getScheduledMedia = useCallback((page = 1, pageSize = 20) => {
    return getLibrary(page, pageSize, { scheduledOnly: true });
  }, [getLibrary]);

  const updateMedia = useCallback(async (mediaId, updateData) => {
    const response = await apiCall('PUT', `/${mediaId}`, {
      title: updateData?.title,
      description: updateData?.description,
      thumbnailUrl: updateData?.thumbnailUrl,
      isVisibleInFeed: updateData?.isVisibleInFeed,
      tags: Array.isArray(updateData?.tags) ? updateData.tags : undefined,
      scheduledPublishAt: updateData?.scheduledPublishAt,
      mediaMetadata: updateData?.mediaMetadata,
    });

    return normalizeSavedMediaItem(response);
  }, [apiCall]);

  const toggleVisibility = useCallback((mediaId, isVisible) => {
    return apiCall('PATCH', `/${mediaId}/toggle-visibility`, {
      mediaId,
      isVisibleInFeed: isVisible,
    });
  }, [apiCall]);

  const bulkToggleVisibility = useCallback((mediaIds, isVisible) => {
    return apiCall('PATCH', '/bulk/toggle-visibility', {
      mediaIds: Array.isArray(mediaIds) ? mediaIds : [],
      isVisibleInFeed: isVisible,
    });
  }, [apiCall]);

  const deleteMedia = useCallback((mediaId) => {
    return apiCall('DELETE', `/${mediaId}`);
  }, [apiCall]);

  const publishMedia = useCallback((publishData) => {
    return apiCall('POST', '/publish', publishData);
  }, [apiCall]);

  const getLibraryStats = useCallback(() => {
    return apiCall('GET', '/library/stats');
  }, [apiCall]);

  const addTag = useCallback((mediaId, tag) => {
    return apiCall('POST', `/${mediaId}/tags/${encodeURIComponent(tag)}`);
  }, [apiCall]);

  const removeTag = useCallback((mediaId, tag) => {
    return apiCall('DELETE', `/${mediaId}/tags/${encodeURIComponent(tag)}`);
  }, [apiCall]);

  return {
    loading,
    error,
    saveMedia,
    getMedia,
    getLibrary,
    getHiddenMedia,
    getVisibleMedia,
    getTaggedMedia,
    getScheduledMedia,
    updateMedia,
    toggleVisibility,
    bulkToggleVisibility,
    deleteMedia,
    publishMedia,
    getLibraryStats,
    addTag,
    removeTag,
  };
};

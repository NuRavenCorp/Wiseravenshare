// wiseravenshare.client/src/hooks/useSavedMedia.js
import { useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = (import.meta?.env?.VITE_API_URL || '').trim().replace(/\/+$/, '') || '/api';
const MEDIA_LIBRARY_BASE = `${API_BASE_URL}/media-library`;

/**
 * Custom hook for managing saved media operations
 */
export const useSavedMedia = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getAuthToken = useCallback(() => {
    const accessToken = localStorage.getItem('accessToken');
    const legacyToken = localStorage.getItem('token');
    return accessToken || legacyToken || '';
  }, []);

  const apiCall = useCallback(async (method, endpoint, data = null) => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const config = {
        method,
        url: `${MEDIA_LIBRARY_BASE}${endpoint}`,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'An error occurred';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthToken]);

  const saveMedia = useCallback(async (mediaData) => {
    const mediaUrl = String(mediaData?.mediaUrl || '').trim().toLowerCase();
    if (mediaUrl.startsWith('blob:') || mediaUrl.startsWith('file:')) {
      const err = new Error('Temporary local media URLs cannot be saved. Please upload the file first.');
      setError(err.message);
      throw err;
    }

    return apiCall('POST', '/save', mediaData);
  }, [apiCall]);

  const getMedia = useCallback(async (mediaId) => {
    return apiCall('GET', `/${mediaId}`);
  }, [apiCall]);

  const getLibrary = useCallback(async (page = 1, pageSize = 20, filters = {}) => {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize)
    });

    // The server owns filtering through the search endpoint; apply it when requested.
    if (filters && Object.keys(filters).length > 0) {
      return apiCall('POST', '/search', {
        ...filters,
        page,
        pageSize
      });
    }

    return apiCall('GET', `/mine?${query.toString()}`);
  }, [apiCall]);

  const getHiddenMedia = useCallback(async (page = 1, pageSize = 20) => {
    return apiCall('POST', '/search', { isVisibleInFeed: false, page, pageSize });
  }, [apiCall]);

  const getVisibleMedia = useCallback(async (page = 1, pageSize = 20) => {
    return apiCall('POST', '/search', { isVisibleInFeed: true, page, pageSize });
  }, [apiCall]);

  const getTaggedMedia = useCallback(async (tag, page = 1, pageSize = 20) => {
    return apiCall('POST', '/search', { tag, page, pageSize });
  }, [apiCall]);

  const getScheduledMedia = useCallback(async (page = 1, pageSize = 20) => {
    return apiCall('POST', '/search', { scheduledOnly: true, page, pageSize });
  }, [apiCall]);

  const updateMedia = useCallback(async (mediaId, updateData) => {
    return apiCall('PUT', `/${mediaId}`, updateData);
  }, [apiCall]);

  const toggleVisibility = useCallback(async (mediaId, isVisible) => {
    return apiCall('PUT', `/${mediaId}`, { isVisibleInFeed: isVisible });
  }, [apiCall]);

  const bulkToggleVisibility = useCallback(async (mediaIds, isVisible) => {
    const ids = Array.isArray(mediaIds) ? mediaIds : [];
    return Promise.all(ids.map((id) => apiCall('PUT', `/${id}`, { isVisibleInFeed: isVisible })));
  }, [apiCall]);

  const deleteMedia = useCallback(async (mediaId) => {
    return apiCall('DELETE', `/${mediaId}`);
  }, [apiCall]);

  const publishMedia = useCallback(async (publishData) => {
    return apiCall('POST', '/search', { ...publishData, publishedOnly: true });
  }, [apiCall]);

  const getLibraryStats = useCallback(async () => {
    const items = await getLibrary(1, 1000);
    const list = Array.isArray(items) ? items : (items?.items || items?.data || []);
    return {
      total: list.length,
      visible: list.filter((item) => item?.isVisibleInFeed === true).length,
      hidden: list.filter((item) => item?.isVisibleInFeed === false).length
    };
  }, [getLibrary]);

  const addTag = useCallback(async (mediaId, tag) => {
    return apiCall('PUT', `/${mediaId}`, { addTag: tag });
  }, [apiCall]);

  const removeTag = useCallback(async (mediaId, tag) => {
    return apiCall('PUT', `/${mediaId}`, { removeTag: tag });
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
    removeTag
  };
};

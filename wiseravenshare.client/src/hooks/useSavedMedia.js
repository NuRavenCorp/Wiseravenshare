// wiseravenshare.client/src/hooks/useSavedMedia.js
import { useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = (import.meta?.env?.VITE_API_URL || '').trim().replace(/\/+$/, '') || '/api';

/**
 * Custom hook for managing saved media operations
 */
export const useSavedMedia = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const apiCall = useCallback(async (method, endpoint, data = null) => {
    setLoading(true);
    setError(null);
    try {
      const config = {
        method,
        url: `${API_BASE_URL}/SavedMedia${endpoint}`,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
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
  }, []);

  const saveMedia = useCallback(async (mediaData) => {
    return apiCall('POST', '/save', mediaData);
  }, [apiCall]);

  const getMedia = useCallback(async (mediaId) => {
    return apiCall('GET', `/${mediaId}`);
  }, [apiCall]);

  const getLibrary = useCallback(async (page = 1, pageSize = 20, filters = {}) => {
    const params = new URLSearchParams({
      page,
      pageSize,
      ...filters
    });
    return apiCall('GET', `/library?${params.toString()}`);
  }, [apiCall]);

  const getHiddenMedia = useCallback(async (page = 1, pageSize = 20) => {
    return apiCall('GET', `/library/hidden?page=${page}&pageSize=${pageSize}`);
  }, [apiCall]);

  const getVisibleMedia = useCallback(async (page = 1, pageSize = 20) => {
    return apiCall('GET', `/library/visible?page=${page}&pageSize=${pageSize}`);
  }, [apiCall]);

  const getTaggedMedia = useCallback(async (tag, page = 1, pageSize = 20) => {
    return apiCall('GET', `/library/tag/${encodeURIComponent(tag)}?page=${page}&pageSize=${pageSize}`);
  }, [apiCall]);

  const getScheduledMedia = useCallback(async (page = 1, pageSize = 20) => {
    return apiCall('GET', `/library/scheduled?page=${page}&pageSize=${pageSize}`);
  }, [apiCall]);

  const updateMedia = useCallback(async (mediaId, updateData) => {
    return apiCall('PUT', `/${mediaId}`, updateData);
  }, [apiCall]);

  const toggleVisibility = useCallback(async (mediaId, isVisible) => {
    return apiCall('PATCH', `/${mediaId}/toggle-visibility`, {
      mediaId,
      isVisibleInFeed: isVisible
    });
  }, [apiCall]);

  const bulkToggleVisibility = useCallback(async (mediaIds, isVisible) => {
    return apiCall('PATCH', '/bulk/toggle-visibility', {
      mediaIds,
      isVisibleInFeed: isVisible
    });
  }, [apiCall]);

  const deleteMedia = useCallback(async (mediaId) => {
    return apiCall('DELETE', `/${mediaId}`);
  }, [apiCall]);

  const publishMedia = useCallback(async (publishData) => {
    return apiCall('POST', '/publish', publishData);
  }, [apiCall]);

  const getLibraryStats = useCallback(async () => {
    return apiCall('GET', '/library/stats');
  }, [apiCall]);

  const addTag = useCallback(async (mediaId, tag) => {
    return apiCall('POST', `/${mediaId}/tags/${encodeURIComponent(tag)}`);
  }, [apiCall]);

  const removeTag = useCallback(async (mediaId, tag) => {
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
    removeTag
  };
};

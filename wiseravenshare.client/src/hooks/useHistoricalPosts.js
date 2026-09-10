// wiseravenshare.client/src/hooks/useHistoricalPosts.js
import { useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = (import.meta?.env?.VITE_API_URL || '').trim().replace(/\/+$/, '') || '/api';

/**
 * Custom hook for accessing historical posts and archives
 */
export const useHistoricalPosts = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const apiCall = useCallback(async (method, endpoint, params = null) => {
    setLoading(true);
    setError(null);
    try {
      const config = {
        method,
        url: `${API_BASE_URL}/HistoricalPosts${endpoint}`,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      };

      if (params) {
        config.params = params;
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

  const getPostsByDate = useCallback(async (date, page = 1, pageSize = 20) => {
    return apiCall('GET', '/by-date', { date, page, pageSize });
  }, [apiCall]);

  const getPostsByDateRange = useCallback(async (startDate, endDate, page = 1, pageSize = 20) => {
    return apiCall('GET', '/by-date-range', { startDate, endDate, page, pageSize });
  }, [apiCall]);

  const getMonthSummary = useCallback(async (year, month) => {
    return apiCall('GET', `/month/${year}/${month}`);
  }, [apiCall]);

  const getYearSummary = useCallback(async (year) => {
    return apiCall('GET', `/year/${year}`);
  }, [apiCall]);

  const getPostsByWeek = useCallback(async (weekStartDate, page = 1, pageSize = 20) => {
    return apiCall('GET', '/by-week', { weekStartDate, page, pageSize });
  }, [apiCall]);

  const getHistoricalTimeline = useCallback(async (daysBack = 30) => {
    return apiCall('GET', '/timeline', { daysBack });
  }, [apiCall]);

  const getPostStatistics = useCallback(async (startDate, endDate) => {
    return apiCall('GET', '/statistics', { startDate, endDate });
  }, [apiCall]);

  const hasPostsForDate = useCallback(async (date) => {
    return apiCall('GET', '/has-posts', { date });
  }, [apiCall]);

  const getTodaysPosts = useCallback(async (page = 1, pageSize = 20) => {
    return apiCall('GET', '/today', { page, pageSize });
  }, [apiCall]);

  const getYesterdaysPosts = useCallback(async (page = 1, pageSize = 20) => {
    return apiCall('GET', '/yesterday', { page, pageSize });
  }, [apiCall]);

  const getThisWeeksPosts = useCallback(async (page = 1, pageSize = 20) => {
    return apiCall('GET', '/this-week', { page, pageSize });
  }, [apiCall]);

  const getThisMonthsPosts = useCallback(async () => {
    return apiCall('GET', '/this-month');
  }, [apiCall]);

  return {
    loading,
    error,
    getPostsByDate,
    getPostsByDateRange,
    getMonthSummary,
    getYearSummary,
    getPostsByWeek,
    getHistoricalTimeline,
    getPostStatistics,
    hasPostsForDate,
    getTodaysPosts,
    getYesterdaysPosts,
    getThisWeeksPosts,
    getThisMonthsPosts
  };
};

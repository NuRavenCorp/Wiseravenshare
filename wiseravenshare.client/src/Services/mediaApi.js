import api from '../Services/api';

export async function fetchMediaPage({
  page = 1,
  pageSize = 20,
  tab = 'all',
  filterType = null,
  visibilityFilter = null,
  sortBy = 'createdAt',
  sortDir = 'desc',
  signal,
} = {}) {
  const params = { page, pageSize, sortBy, sortDir };
  if (filterType) params.mediaType = filterType;
  if (visibilityFilter != null) params.onlyVisible = visibilityFilter;

  const endpoint = '/media-library/mine';
  if (tab === 'visible') params.onlyVisible = true;
  if (tab === 'hidden') params.onlyVisible = false;
  if (tab === 'scheduled') params.scheduledOnly = true;

  const attempt = async () => api.get(endpoint, { params, signal });

  let response;
  try {
    response = await attempt();
  } catch (error) {
    if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') throw error;
    response = await attempt();
  }

  const data = response?.data ?? response ?? {};
  const items = Array.isArray(data) ? data : (data.items || data.data || []);
  const totalCount = data.totalCount ?? data.total ?? items.length;

  return { items, totalCount, page, pageSize };
}

export async function fetchMediaStats({ signal } = {}) {
  const response = await api.get('/SavedMedia/stats', { signal });
  return response?.data ?? response;
}

export async function deleteMediaItem(mediaId) {
  return api.delete(`/media-library/${mediaId}`);
}

export async function setMediaVisibility(mediaId, isVisible) {
  return api.put(`/media-library/${mediaId}`, { isVisibleInFeed: isVisible });
}

export async function bulkSetVisibility(mediaIds, isVisible) {
  const ids = Array.isArray(mediaIds) ? mediaIds : [];
  return Promise.all(ids.map((id) => setMediaVisibility(id, isVisible)));
}


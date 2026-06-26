import apiClient from './client';

export async function searchCosmetics(q, limit = 20, category = null) {
  const trimmed = typeof q === 'string' ? q.trim() : '';
  const params = { limit };
  if (trimmed) params.q = trimmed;
  if (category) params.category = category;
  const response = await apiClient.get('/cosmetics/search', { params });
  return response.data;
}

export async function getCosmeticDetail(cosmeticId) {
  const response = await apiClient.get(`/cosmetics/${cosmeticId}`);
  return response.data;
}

export async function getCosmeticAnalysis(cosmeticId) {
  const response = await apiClient.get(`/cosmetics/${cosmeticId}/analyze`);
  return response.data;
}

export async function getMyCosmetics(isCurrentOrParams) {
  let params = {};
  if (typeof isCurrentOrParams === 'object' && isCurrentOrParams !== null) {
    params = { ...isCurrentOrParams };
    delete params.limit;
    delete params.skip;
  } else if (isCurrentOrParams !== undefined && isCurrentOrParams !== null) {
    params.is_current = isCurrentOrParams ? 'true' : 'false';
  }
  const response = await apiClient.get('/users/me/cosmetics', { params });
  return response.data;
}

function sortPastCosmetics(items) {
  return [...items].sort((a, b) => {
    const aKey = a.ended_at || a.started_at || '';
    const bKey = b.ended_at || b.started_at || '';
    return bKey.localeCompare(aKey);
  });
}

function normalizeMyCosmeticsPage(data, { skip, limit, is_current }) {
  if (data && Array.isArray(data.items)) {
    const total = typeof data.total === 'number' ? data.total : data.items.length;
    const pageLimit = typeof data.limit === 'number' ? data.limit : limit;
    const pageSkip = typeof data.skip === 'number' ? data.skip : skip;
    const hasMore =
      typeof data.has_more === 'boolean' ? data.has_more : pageSkip + data.items.length < total;

    return {
      items: data.items,
      total,
      skip: pageSkip,
      limit: pageLimit,
      has_more: hasMore,
    };
  }

  if (Array.isArray(data)) {
    const sorted = is_current === false ? sortPastCosmetics(data) : data;
    const items = sorted.slice(skip, skip + limit);
    return {
      items,
      total: sorted.length,
      skip,
      limit,
      has_more: skip + items.length < sorted.length,
    };
  }

  return {
    items: [],
    total: 0,
    skip,
    limit,
    has_more: false,
  };
}

export async function getMyCosmeticsPage({ is_current = false, skip = 0, limit = 10 } = {}) {
  const response = await apiClient.get('/users/me/cosmetics', {
    params: {
      skip,
      limit,
      // axios에서 false가 누락되는 경우 방지
      is_current: is_current ? 'true' : 'false',
    },
  });
  return normalizeMyCosmeticsPage(response.data, { skip, limit, is_current });
}

export async function addMyCosmetic(productIdOrPayload, isCurrent = true, startedAt = null) {
  let payload;
  if (typeof productIdOrPayload === 'object' && productIdOrPayload !== null) {
    payload = productIdOrPayload;
  } else {
    payload = {
      product_id: productIdOrPayload,
      is_current: isCurrent,
    };
    if (startedAt) payload.started_at = startedAt;
  }
  const response = await apiClient.post('/users/me/cosmetics', payload);
  return response.data;
}

export async function updateMyCosmetic(userCosmeticId, payload) {
  const response = await apiClient.put(`/users/me/cosmetics/${userCosmeticId}`, payload);
  return response.data;
}

export async function deleteMyCosmetic(userCosmeticId) {
  const response = await apiClient.delete(`/users/me/cosmetics/${userCosmeticId}`);
  return response.data;
}

export const cosmeticsAPI = {
  searchCosmetics,
  getCosmeticDetail,
  getCosmeticAnalysis,
  getMyCosmetics,
  getMyCosmeticsPage,
  addMyCosmetic,
  updateMyCosmetic,
  deleteMyCosmetic,
};

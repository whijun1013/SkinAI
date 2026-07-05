import apiClient from './client';

export async function searchMedications(q, limit = 20) {
  const response = await apiClient.get('/medications/search', {
    params: { q, limit },
  });
  return response.data;
}

export async function getMedicationDetail(medicationId) {
  const response = await apiClient.get(`/medications/${medicationId}`);
  return response.data;
}

export async function getMyMedications(isCurrentOrParams) {
  let params = {};
  if (typeof isCurrentOrParams === 'object' && isCurrentOrParams !== null) {
    params = { ...isCurrentOrParams };
    delete params.limit;
    delete params.skip;
  } else if (isCurrentOrParams !== undefined && isCurrentOrParams !== null) {
    params.is_current = isCurrentOrParams;
  }
  const response = await apiClient.get('/users/me/medications', { params });
  return response.data;
}

function sortPastMedications(items) {
  return [...items].sort((a, b) => {
    const aKey = a.ended_at || a.started_at || '';
    const bKey = b.ended_at || b.started_at || '';
    return bKey.localeCompare(aKey);
  });
}

function normalizeMyMedicationsPage(data, { skip, limit, is_current }) {
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
    const sorted = is_current === false ? sortPastMedications(data) : data;
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

export async function getMyMedicationsPage({ is_current = false, skip = 0, limit = 10 } = {}) {
  const response = await apiClient.get('/users/me/medications', {
    params: {
      skip,
      limit,
      is_current: is_current ? 'true' : 'false',
    },
  });
  return normalizeMyMedicationsPage(response.data, { skip, limit, is_current });
}

export async function addMyMedication(
  medicationIdOrPayload,
  isCurrent = true,
  startedAt = null,
  expectedEndAt = null
) {
  let payload;
  if (typeof medicationIdOrPayload === 'object' && medicationIdOrPayload !== null) {
    payload = medicationIdOrPayload;
  } else {
    payload = {
      medication_id: medicationIdOrPayload,
      is_current: isCurrent,
    };
    if (startedAt) payload.started_at = startedAt;
    if (expectedEndAt) payload.expected_end_at = expectedEndAt;
  }
  const response = await apiClient.post('/users/me/medications', payload);
  return response.data;
}

export async function updateMyMedication(userMedId, payload) {
  const response = await apiClient.put(`/users/me/medications/${userMedId}`, payload);
  return response.data;
}

export async function deleteMyMedication(userMedId) {
  const response = await apiClient.delete(`/users/me/medications/${userMedId}`);
  return response.data;
}

export const medicationsAPI = {
  searchMedications,
  getMedicationDetail,
  getMyMedications,
  getMyMedicationsPage,
  addMyMedication,
  updateMyMedication,
  deleteMyMedication,
};

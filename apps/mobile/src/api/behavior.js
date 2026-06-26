import apiClient from './client';

export async function getTodayBehavior() {
  const response = await apiClient.get('/users/me/behavior/today');
  return response.data;
}

/** dateStr: "YYYY-MM-DD" */
export async function getBehaviorByDate(dateStr) {
  const response = await apiClient.get('/users/me/behavior/by-date', {
    params: { date: dateStr },
  });
  return response.data;
}

export async function createBehaviorLog(payload) {
  const response = await apiClient.post('/users/me/behavior', payload);
  return response.data;
}

export async function updateBehaviorLog(id, payload) {
  const response = await apiClient.put(`/users/me/behavior/${id}`, payload);
  return response.data;
}

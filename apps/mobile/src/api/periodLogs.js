import apiClient from './client';

export async function createPeriodLog(startedAt) {
  const response = await apiClient.post('/users/me/period-logs', {
    started_at: startedAt,
  });
  return response.data;
}

export async function getPeriodLogs() {
  const response = await apiClient.get('/users/me/period-logs');
  return response.data;
}

export async function deletePeriodLog(logId) {
  await apiClient.delete(`/users/me/period-logs/${logId}`);
}

export async function getPeriodCycle(dateStr) {
  const response = await apiClient.get('/users/me/period-cycle', {
    params: dateStr ? { date: dateStr } : undefined,
  });
  return response.data;
}

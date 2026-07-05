import apiClient from './client';

export async function getEnvironmentLogs(skip = 0, limit = 20, dateStr = null) {
  const params = { skip, limit };
  if (dateStr) params.date = dateStr;
  const response = await apiClient.get('/users/me/environment-logs', { params });
  return response.data;
}

export async function getEnvironmentLogsByDate(dateStr, limit = 50) {
  return getEnvironmentLogs(0, limit, dateStr);
}

export async function createEnvironmentLog(payload) {
  const response = await apiClient.post('/users/me/environment-logs', payload);
  return response.data;
}

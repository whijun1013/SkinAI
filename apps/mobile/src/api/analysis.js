import apiClient from './client';

const ANALYSIS_TIMEOUT_MS = 60000;

export async function getAnalysisList(limit = 10) {
  const response = await apiClient.get('/users/me/analysis', {
    params: { limit },
    timeout: ANALYSIS_TIMEOUT_MS,
  });
  return response.data;
}

export async function getAnalysisDetail(id) {
  const response = await apiClient.get(`/users/me/analysis/${id}`, {
    timeout: ANALYSIS_TIMEOUT_MS,
  });
  return response.data;
}

export async function getAnalysisProgress(id) {
  const response = await apiClient.get(`/users/me/analysis/${id}/progress`);
  return response.data;
}

export async function createAnalysisRequest(payload) {
  const response = await apiClient.post("/users/me/analysis", payload, {
    timeout: ANALYSIS_TIMEOUT_MS,
  });
  return response.data;
}

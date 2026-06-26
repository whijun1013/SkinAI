import apiClient from './client';

export async function getTodaySkinLog() {
  const response = await apiClient.get('/users/me/skin-log/today');
  return response.data;
}

export async function getSkinLogs(limit = 30, { includeMedgemma = true, fromDate = null } = {}) {
  const response = await apiClient.get('/users/me/skin-log', {
    params: {
      limit,
      ...(includeMedgemma === false ? { include_medgemma: false } : {}),
      ...(fromDate ? { from_date: fromDate } : {}),
    },
  });
  return response.data;
}

/** dateStr: "YYYY-MM-DD" */
export async function getSkinLogByDate(dateStr) {
  const response = await apiClient.get('/users/me/skin-log', {
    params: { date: dateStr, limit: 1 },
  });
  return response.data?.[0] ?? null;
}

export async function createSkinLog(payload) {
  if (__DEV__) console.log('[Skin] ② DB 저장 요청', {
    logged_at: payload.logged_at,
    overall_score: payload.overall_score,
    tags_count: payload.condition_tags?.length ?? 0,
    has_photo: !!payload.photo_url,
  });
  const response = await apiClient.post('/users/me/skin-log', payload);
  if (__DEV__) console.log('[Skin] ② DB 저장 완료', { id: response.data?.id });
  return response.data;
}

export async function updateSkinLog(id, payload) {
  if (__DEV__) console.log('[Skin] ② DB 수정 요청', { logId: id, overall_score: payload.overall_score });
  const response = await apiClient.put(`/users/me/skin-log/${id}`, payload);
  if (__DEV__) console.log('[Skin] ② DB 수정 완료', { id: response.data?.id });
  return response.data;
}

export async function analyzeTodaySkinPhoto() {
  if (__DEV__) console.log('[Skin] ③ MedGemma 분석 큐 등록 요청');
  const response = await apiClient.post('/skin/logs/analyze-photo');
  if (__DEV__) console.log('[Skin] ③ MedGemma 분석 큐 등록 완료');
  return response.data;
}

/** 특정 log_id 기반 분석 큐 등록 — 날짜/점수 무관 (과거 기록 포함) */
export async function analyzeSkinPhotoByLogId(logId) {
  if (__DEV__) console.log('[Skin] ③ MedGemma 분석 큐 등록 요청 (logId)', logId);
  const response = await apiClient.post(`/skin/logs/${logId}/analyze-photo`);
  if (__DEV__) console.log('[Skin] ③ MedGemma 분석 큐 등록 완료 (logId)', logId);
  return response.data;
}

export async function getSkinLogMedgemmaStatus(logId) {
  const response = await apiClient.get(`/skin/logs/${logId}/medgemma-status`);
  return response.data;
}

export async function deleteSkinLog(id) {
  await apiClient.delete(`/skin/logs/${id}`);
}

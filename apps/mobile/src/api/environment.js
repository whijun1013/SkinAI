import apiClient from './client';
import useRecordCacheStore from '../stores/recordCacheStore';

export async function getEnvironmentLogs(skip = 0, limit = 20, dateStr = null) {
  const params = { skip, limit };
  if (dateStr) params.date = dateStr;
  const response = await apiClient.get('/users/me/environment-logs', { params });
  return response.data;
}

export async function getEnvironmentLogsByDate(dateStr, limit = 50) {
  return getEnvironmentLogs(0, limit, dateStr);
}

/**
 * 날짜별 환경 로그 캐시를 서버 값으로 직접 갱신한다.
 * 식단 저장 후 환경 로그는 백엔드 BackgroundTask에서 생성되므로
 * 단순 invalidate만으로는 생성 전 빈 결과가 캐시에 고정될 수 있다.
 */
export async function refreshEnvironmentLogsCache(dateStr, limit = 50) {
  if (!dateStr) return false;
  try {
    const result = await getEnvironmentLogsByDate(dateStr, limit);
    useRecordCacheStore.getState().setEnvironment(dateStr, Array.isArray(result) ? result : []);
    return true;
  } catch {
    return false;
  }
}

/**
 * 백그라운드 환경 로그 생성 시간을 고려해 여러 번 재조회한다.
 * KMA/Kakao/AirKorea 외부 API 호출이 포함되어 수 초 이상 걸릴 수 있다.
 */
export function scheduleEnvironmentLogsRefresh(dateStr, delays = [0, 3000, 10000, 25000]) {
  if (!dateStr) return [];
  useRecordCacheStore.getState().invalidateEnvironment(dateStr);
  return delays.map((delay) =>
    setTimeout(() => {
      refreshEnvironmentLogsCache(dateStr);
    }, delay)
  );
}

export async function createEnvironmentLog(payload) {
  const response = await apiClient.post('/users/me/environment-logs', payload);
  return response.data;
}

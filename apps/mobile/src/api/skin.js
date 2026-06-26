import apiClient from './client';
import useAuthStore from '../stores/authStore';

/**
 * Azure Blob에 피부 사진 업로드 (기본: DB 저장 없음).
 *
 * @param {string} imageUri - 로컬 file URI
 * @param {{ createLog?: boolean }} [options]
 * @returns {Promise<{ imageUrl: string, filename: string, skinLogId?: number, qualityWarning?: string }>}
 */
export async function uploadSkinPhoto(imageUri, { createLog = false } = {}) {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    throw new Error('로그인 정보가 없습니다.');
  }

  console.log('[Skin] ① Blob 업로드 시작', { userId, createLog });

  const formData = new FormData();
  formData.append('file', {
    uri: imageUri,
    name: 'skin_photo.jpg',
    type: 'image/jpeg',
  });

  const response = await apiClient.post(
    `/upload/skin-log/image?user_id=${userId}&create_log=${createLog}`,
    formData,
    {
      timeout: 60000,
      transformRequest: (data, headers) => {
        // RN/axios: Content-Type을 직접 지정하면 boundary 누락으로 업로드 실패
        if (data instanceof FormData) {
          delete headers['Content-Type'];
        }
        return data;
      },
    }
  );
  console.log('[Skin] ① Blob 업로드 완료', { imageUrl: response.data?.imageUrl });
  return response.data;
}

/**
 * 오늘 피부 기록 조회.
 * @returns {Promise<object|null>}
 */
export async function getTodaySkinLog() {
  const response = await apiClient.get('/users/me/skin-log/today');
  return response.data;
}

/**
 * 피부 기록 생성.
 * @param {object} payload - SkinLogCreate
 */
export async function createSkinLog(payload) {
  console.log('[Skin] ② DB 저장 요청', {
    overall_score: payload.overall_score,
    tags_count: payload.condition_tags?.length ?? 0,
    has_photo: !!payload.photo_url,
  });
  const response = await apiClient.post('/users/me/skin-log', payload);
  console.log('[Skin] ② DB 저장 완료', { id: response.data?.id });
  return response.data;
}

/**
 * 피부 기록 수정.
 * @param {number} logId
 * @param {object} payload - SkinLogUpdate
 */
export async function updateSkinLog(logId, payload) {
  console.log('[Skin] ② DB 수정 요청', { logId, overall_score: payload.overall_score });
  const response = await apiClient.put(`/users/me/skin-log/${logId}`, payload);
  console.log('[Skin] ② DB 수정 완료', { id: response.data?.id });
  return response.data;
}

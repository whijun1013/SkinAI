import apiClient from './client';
import useAuthStore from '../stores/authStore';
import useRecordCacheStore from '../stores/recordCacheStore';
import * as ImageManipulator from 'expo-image-manipulator';

/** analyze-photo 전송용 — 긴 변 768px 이하로 리사이즈 */
export async function prepareAnalyzeImageUri(imageUri) {
  try {
    const result = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 768 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch (e) {
    console.warn('[Diet] analyze 이미지 리사이즈 실패, 원본 사용:', e?.message);
    return imageUri;
  }
}

/** 한글 끼니 → upload API용 영어 코드 */
export const MEAL_TYPE_TO_EN = {
  아침: 'breakfast',
  점심: 'lunch',
  저녁: 'dinner',
  간식: 'snack',
};

export const MEAL_TYPES_KR = ['아침', '점심', '저녁', '간식'];

/**
 * Azure Blob food-img에 식단 사진 업로드 (기본: DB 저장 없음).
 *
 * @param {string} imageUri
 * @param {"breakfast"|"lunch"|"dinner"|"snack"} mealTypeEn
 * @param {{ createLog?: boolean }} [options]
 */
const ANALYZE_TIMEOUT_MS = 60000;
const ANALYZE_QUICK_TIMEOUT_MS = 15000;
/** DB 저장 + 환경 API(역지오코딩·날씨) 포함 — 기본 10초면 타임아웃 남 */
const SAVE_TIMEOUT_MS = 60000;

async function postAnalyzeForm(analyzeUri, path, { signal, timeout }) {
  const formData = new FormData();
  formData.append('file', {
    uri: analyzeUri,
    name: 'diet_analyze.jpg',
    type: 'image/jpeg',
  });

  const response = await apiClient.post(path, formData, {
    timeout,
    signal,
    transformRequest: (data, headers) => {
      if (data instanceof FormData) {
        delete headers['Content-Type'];
      }
      return data;
    },
  });
  return response.data ?? {};
}

/**
 * 1단계: GPT만 — 음식명만 빠르게 (~2~3초). CV·DB lookup 없음.
 *
 * @param {string} imageUri
 * @param {{ signal?: AbortSignal, preparedUri?: string }} [options]
 */
export async function analyzeDietPhotoQuick(imageUri, { signal, preparedUri } = {}) {
  const analyzeUri = preparedUri || (await prepareAnalyzeImageUri(imageUri));
  if (__DEV__) console.log('[Diet] AI 빠른 분석 시작', { uri: analyzeUri?.slice?.(0, 60) + '...' });

  const data = await postAnalyzeForm(
    analyzeUri,
    '/users/me/diet-logs/analyze-photo/quick',
    { signal, timeout: ANALYZE_QUICK_TIMEOUT_MS }
  );

  const food_name = data.food_name ?? '';
  if (__DEV__) console.log('[Diet] AI 빠른 분석 완료', { food_name });
  return { food_name };
}

/**
 * GPT/CV 식단 사진 분석 (DB·Blob 저장 없음). analyze 응답의 photo_url은 사용하지 않음.
 *
 * @param {string} imageUri
 * @param {{ signal?: AbortSignal, preparedUri?: string }} [options]
 * @returns {Promise<{ food_name: string, match_type: string, nutrition: object|null }>}
 */
export async function analyzeDietPhoto(imageUri, { signal, preparedUri } = {}) {
  const analyzeUri = preparedUri || (await prepareAnalyzeImageUri(imageUri));
  if (__DEV__) console.log('[Diet] AI 정밀 분석 시작', { uri: analyzeUri?.slice?.(0, 60) + '...' });

  const data = await postAnalyzeForm(
    analyzeUri,
    '/users/me/diet-logs/analyze-photo',
    { signal, timeout: ANALYZE_TIMEOUT_MS }
  );

  const { food_name, match_type, nutrition, food_item_id, food_item_source, skin_factors } = data;
  if (__DEV__) console.log('[Diet] AI 정밀 분석 완료', {
    food_name,
    match_type,
    has_nutrition: !!nutrition,
    food_item_id: food_item_id ?? null,
    has_skin_factors: Array.isArray(skin_factors) && skin_factors.length > 0,
  });

  return {
    food_name: food_name ?? '',
    match_type: match_type ?? '',
    nutrition: nutrition ?? null,
    food_item_id: food_item_id ?? null,
    food_item_source: food_item_source ?? null,
    skin_factors: skin_factors ?? null,
  };
}

export async function uploadDietPhoto(imageUri, mealTypeEn, { createLog = false } = {}) {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    throw new Error('로그인 정보가 없습니다.');
  }

  if (__DEV__) console.log('[Diet] ① Blob 업로드 시작', {
    userId,
    mealTypeEn,
    createLog,
    uri: imageUri?.slice?.(0, 60) + '...',
  });

  const formData = new FormData();
  formData.append('file', {
    uri: imageUri,
    name: `${mealTypeEn}_photo.jpg`,
    type: 'image/jpeg',
  });

  const response = await apiClient.post(
    `/upload/diet-log/image?user_id=${userId}&meal_type=${mealTypeEn}&create_log=${createLog}`,
    formData,
    {
      timeout: 60000,
      transformRequest: (data, headers) => {
        if (data instanceof FormData) {
          delete headers['Content-Type'];
        }
        return data;
      },
    }
  );
  if (__DEV__) console.log('[Diet] ① Blob 업로드 완료', {
    imageUrl: response.data?.imageUrl,
    filename: response.data?.filename,
  });
  return response.data;
}

/**
 * Creates a diet log entry on the backend.
 *
 * @param {object} payload - DietLogCreate schema
 * @param {string} [payload.logged_at] - ISO string
 * @param {string} [payload.captured_at] - ISO string
 * @param {"아침"|"점심"|"저녁"|"간식"} payload.meal_type
 * @param {"photo"|"manual"} [payload.input_method]
 * @param {string} [payload.photo_url]
 * @param {number} [payload.captured_lat]
 * @param {number} [payload.captured_lng]
 * @param {string} [payload.captured_location_name] - Usually null, set by backend geocoding
 * @param {string} [payload.note]
 * @param {object[]} [payload.items]
 * @returns {Promise<object>} DietLogResponse
 */
export async function createDietLog(payload) {
  if (__DEV__) console.log('[Diet] ② DB 저장 요청', {
    meal_type: payload.meal_type,
    photo_url: payload.photo_url ? `${payload.photo_url.slice(0, 60)}...` : null,
    captured_at: payload.captured_at,
    captured_lat: payload.captured_lat,
    captured_lng: payload.captured_lng,
    items_count: payload.items?.length ?? 0,
  });
  const response = await apiClient.post('/users/me/diet-logs', payload, {
    timeout: SAVE_TIMEOUT_MS,
  });
  if (__DEV__) console.log('[Diet] ② DB 저장 완료', {
    id: response.data?.id,
    logged_at: response.data?.logged_at,
  });
  return response.data;
}

/**
 * Retrieves a list of diet logs for the current user.
 *
 * @param {number} [skip=0]
 * @param {number} [limit=100]
 * @returns {Promise<object[]>} DietLogListItemResponse[]
 */
export async function getDietLogs(skip = 0, limit = 100) {
  const response = await apiClient.get('/users/me/diet-logs', {
    params: { skip, limit },
  });
  return response.data;
}

/** dateStr: "YYYY-MM-DD" */
export async function getDietLogsByDate(dateStr) {
  const response = await apiClient.get('/users/me/diet-logs', {
    params: { date: dateStr, limit: 10 },
  });
  return response.data;
}

/**
 * 식별 키: 로그 id + food_names 조합. 이게 같으면 store 업데이트 생략 → 리렌더 방지.
 */
function dietLogsFingerprint(logs) {
  if (!Array.isArray(logs)) return '';
  return logs
    .map((l) => {
      const names = (l.food_names ?? []).join(',');
      const hasNutrition = l.nutrition ? '1' : '0';
      const sfCount = Array.isArray(l.skin_factors) ? l.skin_factors.length : 0;
      return `${l.id}:${names}:${hasNutrition}:${l.match_type ?? ''}:sf${sfCount}`;
    })
    .join('|');
}

/**
 * 캐시를 비우지 않고 식단 목록만 갱신 (폴링·저장 후용).
 * 실제 데이터가 바뀌지 않았으면 store 업데이트를 생략해 리렌더를 막는다.
 * @returns {Promise<boolean>} 성공 여부
 */
export async function refreshDietLogsCache(dateStr) {
  try {
    const result = await getDietLogsByDate(dateStr);
    const newData = Array.isArray(result) ? result : [];
    const cached = useRecordCacheStore.getState().getDiet(dateStr);
    if (Array.isArray(cached) && dietLogsFingerprint(cached) === dietLogsFingerprint(newData)) {
      return true;
    }
    useRecordCacheStore.getState().setDiet(dateStr, newData);
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieves a specific diet log by ID.
 *
 * @param {number} logId
 * @returns {Promise<object>} DietLogResponse
 */
export async function getDietLog(logId) {
  const response = await apiClient.get(`/users/me/diet-logs/${logId}`);
  return response.data;
}

/**
 * Deletes a specific diet log by ID.
 *
 * @param {number} logId
 * @returns {Promise<void>}
 */
export async function deleteDietLog(logId) {
  await apiClient.delete(`/users/me/diet-logs/${logId}`);
}

/**
 * 음식명으로 DB lookup — nutrition + match_type 반환 (GPT 추정 없음, 빠름).
 * analyze-photo 1단계 후 2단계로 호출.
 *
 * @param {string} name
 * @returns {Promise<{ found_name: string|null, match_type: string, nutrition: object|null, food_item_id: number|null, food_item_source: string|null }>}
 */
export async function lookupFoodItem(name) {
  const response = await apiClient.get('/food-items/lookup', { params: { name } });
  const { found_name, match_type, nutrition, food_item_id, food_item_source, skin_factors } = response.data ?? {};
  return {
    found_name: found_name ?? null,
    match_type: match_type ?? '없음',
    nutrition: nutrition ?? null,
    food_item_id: food_item_id ?? null,
    food_item_source: food_item_source ?? null,
    skin_factors: skin_factors ?? null,
  };
}

/**
 * Searches food items by query string.
 *
 * @param {string} q
 * @param {string} [category]
 * @param {number} [skip=0]
 * @param {number} [limit=20]
 * @returns {Promise<object[]>} FoodItemResponse[]
 */
export async function searchFoodItems(q, category = null, skip = 0, limit = 8) { // limit 기본값 8 (UI 최대 5개 표시)
  const params = { q, skip, limit };
  if (category) {
    params.category = category;
  }
  const response = await apiClient.get('/food-items/search', { params });
  return response.data;
}

/**
 * Updates a specific diet log.
 *
 * @param {number} logId
 * @param {object} payload - DietLogUpdate schema
 * @returns {Promise<object>} DietLogResponse
 */
export async function updateDietLog(logId, payload) {
  const response = await apiClient.put(`/users/me/diet-logs/${logId}`, payload);
  return response.data;
}

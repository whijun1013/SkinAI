import { Image } from 'react-native';
import { create } from 'zustand';

import { toDateStr } from '../nuvo/screens/record/components/DateNavigator';

// SAS URL은 서버 기본 24h 만료 — 23h 후 캐시 무효화해 재서명된 URL로 갱신
const SAS_CACHE_TTL_MS = 23 * 60 * 60 * 1000;

function blobBase(url) {
  if (!url) return '';
  return url.split('?')[0];
}

/** 같은 Blob은 TTL 내 첫 SAS URL을 재사용. 만료 시 새 URL로 교체 */
function resolveStablePhotoUri(photoUriByBlob, url) {
  if (!url) return url;
  const base = blobBase(url);
  if (!base) return url;
  const entry = photoUriByBlob[base];
  if (!entry) return url;
  if (Date.now() > entry.expiresAt) return url; // 만료 시 새 URL 사용
  return entry.url;
}

function registerPhotoUri(photoUriByBlob, url) {
  if (!url) return photoUriByBlob;
  const base = blobBase(url);
  if (!base) return photoUriByBlob;
  const existing = photoUriByBlob[base];
  // 캐시가 유효하면 유지, 없거나 만료됐으면 새 URL 등록
  if (existing && Date.now() <= existing.expiresAt) return photoUriByBlob;
  return { ...photoUriByBlob, [base]: { url, expiresAt: Date.now() + SAS_CACHE_TTL_MS } };
}

function stabilizeSkinData(photoUriByBlob, previous, next) {
  if (!next) return { data: next, photoUriByBlob };
  let nextBlobMap = photoUriByBlob;
  if (next.photo_url) {
    nextBlobMap = registerPhotoUri(nextBlobMap, next.photo_url);
    const stableUrl = resolveStablePhotoUri(nextBlobMap, next.photo_url);
    return {
      data: { ...next, photo_url: stableUrl },
      photoUriByBlob: nextBlobMap,
    };
  }
  return { data: next, photoUriByBlob: nextBlobMap };
}

function stabilizeDietData(photoUriByBlob, previous, next) {
  if (!Array.isArray(next)) return { data: next, photoUriByBlob };
  let nextBlobMap = photoUriByBlob;
  const data = next.map((log) => {
    if (!log.photo_url) return log;
    nextBlobMap = registerPhotoUri(nextBlobMap, log.photo_url);
    return {
      ...log,
      photo_url: resolveStablePhotoUri(nextBlobMap, log.photo_url),
    };
  });
  return { data, photoUriByBlob: nextBlobMap };
}

function prefetchPhotoUrls(urls) {
  urls.filter(Boolean).forEach((uri) => {
    Image.prefetch(uri).catch(() => {});
  });
}

function extractSkinPhotoUrls(log) {
  return log?.photo_url ? [log.photo_url] : [];
}

function extractDietPhotoUrls(logs) {
  if (!Array.isArray(logs)) return [];
  return logs.map((log) => log.photo_url).filter(Boolean);
}

/**
 * 날짜별 기록 메모리 캐시.
 * invalidate된 항목만 다시 불러오고, 이미지 URL은 Blob 기준으로 세션 동안 유지한다.
 */
const useRecordCacheStore = create((set, get) => ({
  cacheEpoch: 0,
  skinByDate: {},
  dietByDate: {},
  behaviorByDate: {},
  environmentByDate: {},
  cosmeticsByTab: {},
  medicationsByTab: {},
  photoUriByBlob: {},
  /** AI 분석 완료(성공·실패 무관)된 diet log id 세트 — 스피너 해제용 */
  aiDoneLogIds: new Set(),
  /** MedGemma 분석 완료 상태 캐시 — logId별 terminal status 저장 (재진입 시 폴링 스킵) */
  medgemmaStatusByLogId: {},

  getCacheEpoch: () => get().cacheEpoch,

  markAiDone: (logId) =>
    set((state) => ({
      aiDoneLogIds: new Set([...state.aiDoneLogIds, logId]),
    })),

  setMedgemmaStatus: (logId, statusData) =>
    set((state) => ({
      medgemmaStatusByLogId: { ...state.medgemmaStatusByLogId, [logId]: statusData },
    })),

  getMedgemmaStatus: (logId) => get().medgemmaStatusByLogId[logId] ?? null,

  clearMedgemmaStatus: (logId) =>
    set((state) => {
      const next = { ...state.medgemmaStatusByLogId };
      delete next[logId];
      return { medgemmaStatusByLogId: next };
    }),

  getStablePhotoUri: (url) => {
    if (!url) return url;
    const state = get();
    const stable = resolveStablePhotoUri(state.photoUriByBlob, url);
    if (stable !== url) return stable;
    const nextMap = registerPhotoUri(state.photoUriByBlob, url);
    if (nextMap !== state.photoUriByBlob) {
      set({ photoUriByBlob: nextMap });
    }
    return url;
  },

  setSkin: (dateStr, data) =>
    set((state) => {
      const { data: merged, photoUriByBlob } = stabilizeSkinData(
        state.photoUriByBlob,
        state.skinByDate[dateStr]?.data,
        data
      );
      prefetchPhotoUrls(extractSkinPhotoUrls(merged));
      return {
        photoUriByBlob,
        skinByDate: {
          ...state.skinByDate,
          [dateStr]: { data: merged, fetchedAt: Date.now() },
        },
      };
    }),

  setDiet: (dateStr, data) =>
    set((state) => {
      const { data: merged, photoUriByBlob } = stabilizeDietData(
        state.photoUriByBlob,
        state.dietByDate[dateStr]?.data,
        data
      );
      prefetchPhotoUrls(extractDietPhotoUrls(merged));
      return {
        photoUriByBlob,
        dietByDate: {
          ...state.dietByDate,
          [dateStr]: { data: merged, fetchedAt: Date.now() },
        },
      };
    }),

  setBehavior: (dateStr, data) =>
    set((state) => ({
      behaviorByDate: {
        ...state.behaviorByDate,
        [dateStr]: { data, fetchedAt: Date.now() },
      },
    })),

  setEnvironment: (dateStr, data) =>
    set((state) => ({
      environmentByDate: {
        ...state.environmentByDate,
        [dateStr]: { data, fetchedAt: Date.now() },
      },
    })),

  setCosmeticsTab: (tabId, data) =>
    set((state) => ({
      cosmeticsByTab: {
        ...state.cosmeticsByTab,
        [tabId]: { data, fetchedAt: Date.now() },
      },
    })),

  setMedicationsTab: (tabId, data) =>
    set((state) => ({
      medicationsByTab: {
        ...state.medicationsByTab,
        [tabId]: { data, fetchedAt: Date.now() },
      },
    })),

  getSkin: (dateStr) => get().skinByDate[dateStr]?.data,
  getDiet: (dateStr) => get().dietByDate[dateStr]?.data,
  getBehavior: (dateStr) => get().behaviorByDate[dateStr]?.data,

  hasSkin: (dateStr) => Object.prototype.hasOwnProperty.call(get().skinByDate, dateStr),
  hasDiet: (dateStr) => Object.prototype.hasOwnProperty.call(get().dietByDate, dateStr),
  hasBehavior: (dateStr) => Object.prototype.hasOwnProperty.call(get().behaviorByDate, dateStr),
  hasEnvironment: (dateStr) =>
    Object.prototype.hasOwnProperty.call(get().environmentByDate, dateStr),
  hasCosmeticsTab: (tabId) => Object.prototype.hasOwnProperty.call(get().cosmeticsByTab, tabId),
  hasMedicationsTab: (tabId) => Object.prototype.hasOwnProperty.call(get().medicationsByTab, tabId),

  invalidateSkin: (dateStr) =>
    set((state) => {
      const next = { ...state.skinByDate };
      // 연관된 medgemma 캐시도 함께 제거
      const logId = next[dateStr]?.data?.id;
      delete next[dateStr];
      if (logId) {
        const nextMedgemma = { ...state.medgemmaStatusByLogId };
        delete nextMedgemma[logId];
        return { skinByDate: next, medgemmaStatusByLogId: nextMedgemma };
      }
      return { skinByDate: next };
    }),

  invalidateDiet: (dateStr) =>
    set((state) => {
      const next = { ...state.dietByDate };
      delete next[dateStr];
      return { dietByDate: next };
    }),

  invalidateBehavior: (dateStr) =>
    set((state) => {
      const next = { ...state.behaviorByDate };
      delete next[dateStr];
      return { behaviorByDate: next };
    }),

  invalidateEnvironment: (dateStr) =>
    set((state) => {
      const next = { ...state.environmentByDate };
      delete next[dateStr];
      return { environmentByDate: next };
    }),

  invalidateCosmetics: () => set({ cosmeticsByTab: {} }),

  invalidateCosmeticsTab: (tabId) =>
    set((state) => {
      const next = { ...state.cosmeticsByTab };
      delete next[tabId];
      return { cosmeticsByTab: next };
    }),

  invalidateMedications: () => set({ medicationsByTab: {} }),

  invalidateMedicationsTab: (tabId) =>
    set((state) => {
      const next = { ...state.medicationsByTab };
      delete next[tabId];
      return { medicationsByTab: next };
    }),

  invalidateDate: (dateStr) => {
    get().invalidateSkin(dateStr);
    get().invalidateDiet(dateStr);
    get().invalidateBehavior(dateStr);
    get().invalidateEnvironment(dateStr);
  },

  invalidateToday: () => {
    get().invalidateDate(toDateStr(new Date()));
  },

  incrementCacheEpoch: () =>
    set((state) => ({ cacheEpoch: state.cacheEpoch + 1 })),

  clearRecordCache: () =>
    set((state) => ({
      cacheEpoch: state.cacheEpoch + 1,
      skinByDate: {},
      dietByDate: {},
      behaviorByDate: {},
      environmentByDate: {},
      cosmeticsByTab: {},
      medicationsByTab: {},
      photoUriByBlob: {},
      aiDoneLogIds: new Set(),
      medgemmaStatusByLogId: {},
    })),
}));

export default useRecordCacheStore;

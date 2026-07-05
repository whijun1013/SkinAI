import { Image } from 'react-native';
import { create } from 'zustand';
import { API_BASE_URL } from '@env';

import { toDateStr } from '../luvel/screens/record/components/DateNavigator';
import { resolveImageUrl } from '../utils/imageHelper';

function blobBase(url) {
  if (!url) return '';
  return url.split('?')[0];
}

/** 같은 Blob은 첫 SAS URL을 계속 씀 — 캐시 삭제·재요청 후에도 이미지 재다운로드 방지 */
function resolveStablePhotoUri(photoUriByBlob, url) {
  if (!url) return url;
  const base = blobBase(url);
  if (!base) return url;
  return photoUriByBlob[base] ?? url;
}

function registerPhotoUri(photoUriByBlob, url) {
  if (!url) return photoUriByBlob;
  const base = blobBase(url);
  if (!base || photoUriByBlob[base]) return photoUriByBlob;
  return { ...photoUriByBlob, [base]: url };
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
    Image.prefetch(resolveImageUrl(uri, API_BASE_URL)).catch(() => {});
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

  getCacheEpoch: () => get().cacheEpoch,

  markAiDone: (logId) =>
    set((state) => ({
      aiDoneLogIds: new Set([...state.aiDoneLogIds, logId]),
    })),

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
      delete next[dateStr];
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
    })),
}));

export default useRecordCacheStore;

import { useCallback, useEffect, useRef, useState } from 'react';

import { getSkinLogByDate } from '../api/skinLogs';
import { getDietLogsByDate } from '../api/diet';
import { getBehaviorByDate } from '../api/behavior';
import { getEnvironmentLogsByDate } from '../api/environment';
import { cosmeticsAPI } from '../api/cosmetics';
import { medicationsAPI } from '../api/medications';
import useRecordCacheStore from '../stores/recordCacheStore';

function useStableEpoch() {
  return useRecordCacheStore((state) => state.cacheEpoch);
}

/**
 * Zustand 캐시를 단일 진실 공급원으로 사용.
 * 해당 날짜 캐시가 없을 때만 API를 호출한다 (타입별 invalidate 시에만 갱신).
 */
function useStaleQuery(dateStr, fetcher, cacheKey) {
  const cacheEntry = useRecordCacheStore((state) => state[cacheKey][dateStr]);
  const setCache = useRecordCacheStore((state) => {
    if (cacheKey === 'skinByDate') return state.setSkin;
    if (cacheKey === 'dietByDate') return state.setDiet;
    if (cacheKey === 'environmentByDate') return state.setEnvironment;
    return state.setBehavior;
  });

  const hasCache = cacheEntry !== undefined;
  const data = cacheEntry?.data;

  const [fetching, setFetching] = useState(!hasCache);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (hasCache) {
      setFetching(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    const fetchEpoch = useRecordCacheStore.getState().getCacheEpoch();
    setFetching(true);
    setError(null);

    (async () => {
      try {
        const result = await fetcher(dateStr);
        if (cancelled) return;
        if (useRecordCacheStore.getState().getCacheEpoch() !== fetchEpoch) return;
        setCache(dateStr, result);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dateStr, cacheKey, fetcher, setCache, hasCache]);

  return {
    data,
    isInitialLoad: !hasCache && fetching,
    isRefreshing: false,
    error,
  };
}

function useStaleTabQuery(tabId, fetcher, cacheKey, retryKey = 0) {
  const cacheEntry = useRecordCacheStore((state) => state[cacheKey][tabId]);
  const setCache = useRecordCacheStore((state) => {
    if (cacheKey === 'cosmeticsByTab') return state.setCosmeticsTab;
    return state.setMedicationsTab;
  });

  const hasCache = cacheEntry !== undefined;
  const data = cacheEntry?.data;

  const [fetching, setFetching] = useState(!hasCache);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (hasCache && retryKey === 0) {
      setFetching(false);
      return undefined;
    }

    let cancelled = false;
    const fetchEpoch = useRecordCacheStore.getState().getCacheEpoch();
    setFetching(true);
    setError(null);

    (async () => {
      try {
        const result = await fetcher(tabId);
        if (cancelled) return;
        if (useRecordCacheStore.getState().getCacheEpoch() !== fetchEpoch) return;
        setCache(tabId, Array.isArray(result) ? result : []);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tabId, cacheKey, fetcher, setCache, hasCache, retryKey]);

  return {
    data,
    isInitialLoad: !hasCache && fetching,
    isRefreshing: false,
    error,
  };
}

async function fetchSkin(dateStr) {
  const log = await getSkinLogByDate(dateStr);
  if (log?.id && log?.medgemma_status) {
    const s = log.medgemma_status;
    if (s?.status && !["none", "not_requested"].includes(s.status)) {
      useRecordCacheStore.getState().setMedgemmaStatus(log.id, s);
    }
  }
  return log;
}

async function fetchDiet(dateStr) {
  const result = await getDietLogsByDate(dateStr);
  return Array.isArray(result) ? result : [];
}

async function fetchBehavior(dateStr) {
  return getBehaviorByDate(dateStr);
}

async function fetchCosmeticsTab(tabId) {
  return cosmeticsAPI.getMyCosmetics(tabId === 'current');
}

async function fetchMedicationsTab(tabId) {
  return medicationsAPI.getMyMedications(tabId === 'current');
}

async function fetchEnvironment(dateStr) {
  const result = await getEnvironmentLogsByDate(dateStr);
  return Array.isArray(result) ? result : [];
}

export function useSkinLogQuery(dateStr) {
  return useStaleQuery(dateStr, fetchSkin, 'skinByDate');
}

export function useDietLogsQuery(dateStr) {
  return useStaleQuery(dateStr, fetchDiet, 'dietByDate');
}

export function useBehaviorLogQuery(dateStr) {
  return useStaleQuery(dateStr, fetchBehavior, 'behaviorByDate');
}

export function useEnvironmentLogsQuery(dateStr) {
  return useStaleQuery(dateStr, fetchEnvironment, 'environmentByDate');
}

export function useCosmeticsListQuery(isCurrent, retryKey = 0) {
  const tabId = isCurrent ? 'current' : 'past';
  return useStaleTabQuery(tabId, fetchCosmeticsTab, 'cosmeticsByTab', retryKey);
}

export function useMedicationsListQuery(isCurrent, retryKey = 0) {
  const tabId = isCurrent ? 'current' : 'past';
  return useStaleTabQuery(tabId, fetchMedicationsTab, 'medicationsByTab', retryKey);
}

const PAST_MEDICATIONS_PAGE_SIZE = 10;

export function usePastMedicationsPagination(pageSize = PAST_MEDICATIONS_PAGE_SIZE, retryKey = 0) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const requestSeqRef = useRef(0);
  const cacheEpoch = useStableEpoch();

  const applyPage = useCallback((page, append, requestSeq) => {
    if (requestSeq !== requestSeqRef.current) return;
    const nextItems = page?.items ?? [];
    setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
    setTotal(page?.total ?? nextItems.length);
    setHasMore(!!page?.has_more);
  }, []);

  const fetchPage = useCallback(
    async (skip, append, requestSeq) => {
      const page = await medicationsAPI.getMyMedicationsPage({
        is_current: false,
        skip,
        limit: pageSize,
      });
      applyPage(page, append, requestSeq);
      return page;
    },
    [applyPage, pageSize]
  );

  useEffect(() => {
    const requestSeq = ++requestSeqRef.current;

    setIsInitialLoad(true);
    setError(null);

    fetchPage(0, false, requestSeq)
      .catch((err) => {
        if (requestSeq !== requestSeqRef.current) return;
        setError(err);
        setItems([]);
        setTotal(0);
        setHasMore(false);
      })
      .finally(() => {
        if (requestSeq === requestSeqRef.current) {
          setIsInitialLoad(false);
        }
      });
  }, [fetchPage, retryKey, cacheEpoch]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || isInitialLoad) return;

    const requestSeq = ++requestSeqRef.current;
    setIsLoadingMore(true);
    try {
      await fetchPage(items.length, true, requestSeq);
      setError(null);
    } catch (err) {
      if (requestSeq === requestSeqRef.current) setError(err);
    } finally {
      if (requestSeq === requestSeqRef.current) setIsLoadingMore(false);
    }
  }, [fetchPage, hasMore, isInitialLoad, isLoadingMore, items.length]);

  return {
    items,
    total,
    hasMore,
    isInitialLoad,
    isLoadingMore,
    error,
    loadMore,
    setItems,
    setTotal,
    setHasMore,
  };
}

export async function fetchPastMedicationsTotal() {
  const page = await medicationsAPI.getMyMedicationsPage({
    is_current: false,
    skip: 0,
    limit: 1,
  });
  return page.total;
}

const PAST_COSMETICS_PAGE_SIZE = 10;

export function usePastCosmeticsPagination(pageSize = PAST_COSMETICS_PAGE_SIZE, retryKey = 0) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const requestSeqRef = useRef(0);
  const cacheEpoch = useStableEpoch();

  const applyPage = useCallback((page, append, requestSeq) => {
    if (requestSeq !== requestSeqRef.current) return;
    const nextItems = page?.items ?? [];
    setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
    setTotal(page?.total ?? nextItems.length);
    setHasMore(!!page?.has_more);
  }, []);

  const fetchPage = useCallback(
    async (skip, append, requestSeq) => {
      const page = await cosmeticsAPI.getMyCosmeticsPage({
        is_current: false,
        skip,
        limit: pageSize,
      });
      applyPage(page, append, requestSeq);
      return page;
    },
    [applyPage, pageSize]
  );

  useEffect(() => {
    const requestSeq = ++requestSeqRef.current;

    setIsInitialLoad(true);
    setError(null);

    fetchPage(0, false, requestSeq)
      .catch((err) => {
        if (requestSeq !== requestSeqRef.current) return;
        setError(err);
        setItems([]);
        setTotal(0);
        setHasMore(false);
      })
      .finally(() => {
        if (requestSeq === requestSeqRef.current) {
          setIsInitialLoad(false);
        }
      });
  }, [fetchPage, retryKey, cacheEpoch]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || isInitialLoad) return;

    const requestSeq = ++requestSeqRef.current;
    setIsLoadingMore(true);
    try {
      await fetchPage(items.length, true, requestSeq);
      setError(null);
    } catch (err) {
      if (requestSeq === requestSeqRef.current) setError(err);
    } finally {
      if (requestSeq === requestSeqRef.current) setIsLoadingMore(false);
    }
  }, [fetchPage, hasMore, isInitialLoad, isLoadingMore, items.length]);

  return {
    items,
    total,
    hasMore,
    isInitialLoad,
    isLoadingMore,
    error,
    loadMore,
    setItems,
    setTotal,
    setHasMore,
  };
}

export async function fetchPastCosmeticsTotal() {
  const page = await cosmeticsAPI.getMyCosmeticsPage({
    is_current: false,
    skip: 0,
    limit: 1,
  });
  return page.total;
}

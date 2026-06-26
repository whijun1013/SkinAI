import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getSkinLogs } from "../../../../api/skinLogs";
import {
  createAnalysisRequest,
  getAnalysisDetail,
  getAnalysisList,
} from "../../../../api/analysis";
import useTabContentInsets from "../../../../hooks/useTabContentInsets";
import useRecordCacheStore from "../../../../stores/recordCacheStore";

import ReportDetailView, { getDisplayFactorText } from "./ReportDetailView";
import ReportCalendarModal from "./ReportCalendarModal";
import ReportConcernModal from "./ReportConcernModal";
import { isSupportedImageUri } from "../../../components/AuthImage";

import ComparisonHero from "./components/ComparisonHero";
import RecordOverview  from "./components/RecordOverview";
import HistorySection  from "./components/HistorySection";
import InsightSection  from "./components/InsightSection";

import { COLORS, FONT } from "./reportTheme";
import {
  ANALYSIS_POLL_INTERVAL_MS,
  IN_PROGRESS_STATUSES,
  LOOKBACK_DAYS,
  REANALYSIS_COOLDOWN_DAYS,
  REQUIRED_SKIN_LOG_DAYS,
  countUniqueLogDays,
  findRelevantCompletedAnalysis,
  formatKoreanDate,
  getAnalysisDateKey,
  getAnalysisTimestamp,
  getLatestLogChangedAt,
  getLatestSkinLogOnOrBefore,
  getLookbackDateKeys,
  isAnalysisRequestDuplicate,
  isAnalyzableSkinLog,
  isCompletedAnalysis,
  isTimeoutError,
  isWithinLookbackFromBase,
  normalizeAnalysisList,
  parseDateKey,
  toDateKey,
  getAnalysisRequestErrorMessage,
} from "./reportUtils";
import { getReportCopy, getReportState } from "./reportCopy";

// ─── 상세 뷰 히어로 헤더 ──────────────────────────────────────────────────────
function DetailHero({ analysis, onBack }) {
  const dateKey = getAnalysisDateKey(analysis);
  const dateLabel = dateKey ? formatKoreanDate(dateKey) : "";

  const isFailed = analysis?.status === "failed";
  const isInProgress = IN_PROGRESS_STATUSES.has(analysis?.status);
  const statusLabel = isFailed ? "미완료" : isInProgress ? "분석 중" : "완료";
  const statusColor = isFailed ? COLORS.warning : isInProgress ? "#C9A864" : COLORS.olive;

  return (
    <>
      <View style={dStyles.hero}>
        <View style={dStyles.heroTop}>
          <Pressable
            style={({ pressed }) => [dStyles.backBtn, pressed && { opacity: 0.55 }]}
            onPress={onBack}
          >
            <Ionicons name="chevron-back" size={16} color={COLORS.olive} />
            <Text style={dStyles.backText}>목록</Text>
          </Pressable>
          <View style={[dStyles.statusChip, { backgroundColor: `${statusColor}22` }]}>
            <View style={[dStyles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[dStyles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        <View style={dStyles.heroLeft}>
          <Text style={dStyles.heroTitle}>피부 리포트</Text>
          {dateLabel ? <Text style={dStyles.heroSubtitle}>{dateLabel} 기준</Text> : null}
        </View>
      </View>
      <View style={dStyles.divider} />
    </>
  );
}

const dStyles = StyleSheet.create({
  hero: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 18,
    paddingBottom: 12,
    gap: 6,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
  },
  backText: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.olive,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontFamily: FONT.bold,
  },
  heroLeft: { gap: 2 },
  heroTitle: {
    fontSize: 32,
    fontFamily: FONT.extraBold,
    color: COLORS.text,
    letterSpacing: -1,
    includeFontPadding: false,
  },
  heroSubtitle: {
    fontSize: 11,
    fontFamily: FONT.bold,
    color: COLORS.olive,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.line,
  },
});

export default function ReportScreen({
  isActive = false,
  selectedDate = null,
  onNavigateRecord = null,
}) {
  const contentInsets = useTabContentInsets();
  const cacheEpoch = useRecordCacheStore((state) => state.cacheEpoch);
  const hasLoadedRef = useRef(false);
  const loadedEpochRef = useRef(-1);
  const extendedBaseDatesRef = useRef(new Set());
  const oldestSkinLogKeyRef = useRef(null);

  // ─── State ────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [allSkinLogs, setAllSkinLogs] = useState([]);
  const [analysisList, setAnalysisList] = useState([]);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState(null);
  const [isCreatingAnalysis, setIsCreatingAnalysis] = useState(false);
  const [analysisRequestError, setAnalysisRequestError] = useState(null);
  const [analysisRequestMessage, setAnalysisRequestMessage] = useState(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailRequestId, setDetailRequestId] = useState(null);
  const [selectedBaseDateKey, setSelectedBaseDateKey] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [concernModalOpen, setConcernModalOpen] = useState(false);
  const [concernNote, setConcernNote] = useState("");
  const [concernModalError, setConcernModalError] = useState(null);
  const [completedAnalysisDetail, setCompletedAnalysisDetail] = useState(null);

  // ─── 데이터 로드 ──────────────────────────────────────────────────────────
  // 90건 ≈ 3개월치 일일 기록, 캘린더 과거 선택 시 lookback 커버
  const SKIN_LOG_FETCH_LIMIT = 90;

  const loadCore = useCallback(async (isMounted = () => true) => {
    setLoading(true);
    setAnalysisLoading(true);
    try {
      const [skinRes, analysisRes] = await Promise.allSettled([
        getSkinLogs(SKIN_LOG_FETCH_LIMIT, { includeMedgemma: false }),
        getAnalysisList(50),
      ]);
      if (!isMounted()) return;

      const skinLogs =
        skinRes.status === "fulfilled" && Array.isArray(skinRes.value) ? skinRes.value : [];
      setAllSkinLogs(skinLogs);

      if (analysisRes.status === "fulfilled") {
        setAnalysisList(normalizeAnalysisList(analysisRes.value));
        setAnalysisError(null);
      } else {
        setAnalysisList([]);
        setAnalysisError(isTimeoutError(analysisRes.reason) ? "timeout" : "failed");
      }
    } catch (error) {
      if (isMounted()) {
        setAnalysisList([]);
        setAnalysisError(isTimeoutError(error) ? "timeout" : "failed");
      }
    } finally {
      if (isMounted()) {
        setLoading(false);
        setAnalysisLoading(false);
      }
    }
  }, []);

  // allSkinLogs가 전체 교체되면 추가 fetch 캐시 초기화
  useEffect(() => {
    const last = allSkinLogs[allSkinLogs.length - 1];
    oldestSkinLogKeyRef.current = last ? toDateKey(last.logged_at) : null;
    extendedBaseDatesRef.current.clear();
  }, [allSkinLogs]);

  // 과거 기준일 선택 시 해당 14일 lookback 구간을 추가 fetch (없는 경우만)
  const fetchLogsForBaseDate = useCallback(async (baseDateKey) => {
    if (!baseDateKey) return;
    const lookbackStartKey = getLookbackDateKeys(baseDateKey, LOOKBACK_DAYS)[0];
    if (extendedBaseDatesRef.current.has(lookbackStartKey)) return;
    const oldestKey = oldestSkinLogKeyRef.current;
    if (oldestKey && oldestKey <= lookbackStartKey) {
      extendedBaseDatesRef.current.add(lookbackStartKey);
      return;
    }
    try {
      const additionalLogs = await getSkinLogs(LOOKBACK_DAYS * 3, {
        includeMedgemma: false,
        fromDate: lookbackStartKey,
      });
      if (Array.isArray(additionalLogs) && additionalLogs.length > 0) {
        setAllSkinLogs((prev) => {
          const existingIds = new Set(prev.map((l) => l.id));
          const newLogs = additionalLogs.filter((l) => !existingIds.has(l.id));
          if (newLogs.length === 0) return prev;
          return [...prev, ...newLogs].sort(
            (a, b) => new Date(b.logged_at) - new Date(a.logged_at)
          );
        });
      }
    } catch {
      // 조용히 실패; 기존 데이터로 표시
    } finally {
      extendedBaseDatesRef.current.add(lookbackStartKey);
    }
  }, []);

  const loadStats = useCallback(async (isMounted = () => true) => {
    await loadCore(isMounted);
  }, [loadCore]);

  const refreshAnalysisList = useCallback(async () => {
    try {
      const data = await getAnalysisList(50);
      setAnalysisList(normalizeAnalysisList(data));
      setAnalysisError(null);
    } catch (error) {
      setAnalysisError(isTimeoutError(error) ? "timeout" : "failed");
    }
  }, []);

  // 최초 로드 또는 cacheEpoch 변화(새 기록 저장) 시에만 재로딩
  useEffect(() => {
    const epochChanged = loadedEpochRef.current !== cacheEpoch;
    if (hasLoadedRef.current && !epochChanged) return undefined;
    let mounted = true;
    hasLoadedRef.current = true;
    loadedEpochRef.current = cacheEpoch;
    loadCore(() => mounted);
    return () => { mounted = false; };
  }, [cacheEpoch, loadCore]);

  // ─── 파생 상태 ────────────────────────────────────────────────────────────
  const todayKey = toDateKey(new Date());
  const selectedDateKey = toDateKey(selectedDate);
  const effectiveBaseDateKey = selectedBaseDateKey ?? selectedDateKey ?? todayKey;
  const isBaseToday        = effectiveBaseDateKey === todayKey;
  const isSelectedBaseDate = !!selectedBaseDateKey;
  const baseDateLabel   = formatKoreanDate(effectiveBaseDateKey);
  const baseDateHeading = isBaseToday
    ? "오늘까지의 최근 기록"
    : `${baseDateLabel}까지의 최근 기록`;

  const skinLogDateKeys = useMemo(
    () => new Set(allSkinLogs.map((log) => toDateKey(log?.logged_at)).filter(Boolean)),
    [allSkinLogs]
  );
  const analyzableSkinLogs = useMemo(
    () => allSkinLogs.filter(isAnalyzableSkinLog),
    [allSkinLogs]
  );
  const recentAllSkinLogs = useMemo(
    () => allSkinLogs.filter((log) =>
      isWithinLookbackFromBase(log?.logged_at, effectiveBaseDateKey, LOOKBACK_DAYS)
    ),
    [allSkinLogs, effectiveBaseDateKey]
  );
  const recentAnalyzableSkinLogs = useMemo(
    () => analyzableSkinLogs.filter((log) =>
      isWithinLookbackFromBase(log?.logged_at, effectiveBaseDateKey, LOOKBACK_DAYS)
    ),
    [analyzableSkinLogs, effectiveBaseDateKey]
  );
  const recentSkinLogDays = useMemo(
    () => countUniqueLogDays(recentAllSkinLogs),
    [recentAllSkinLogs]
  );
  const analysisReadySkinLogDays = useMemo(
    () => countUniqueLogDays(recentAnalyzableSkinLogs),
    [recentAnalyzableSkinLogs]
  );
  const remainingSkinLogDays = Math.max(REQUIRED_SKIN_LOG_DAYS - analysisReadySkinLogDays, 0);
  const analysisReady = analysisReadySkinLogDays >= REQUIRED_SKIN_LOG_DAYS;

  const basisSkinLog = useMemo(
    () => getLatestSkinLogOnOrBefore(recentAnalyzableSkinLogs, effectiveBaseDateKey),
    [recentAnalyzableSkinLogs, effectiveBaseDateKey]
  );
  const latestSkinLogId = basisSkinLog?.id ?? basisSkinLog?.skin_log_id ?? null;

  // ─── 헤더 날짜 표시용 ─────────────────────────────────────────────────────
  const headerDate    = parseDateKey(effectiveBaseDateKey) ?? new Date();
  const headerMonth   = headerDate.getMonth() + 1;
  const headerDay     = headerDate.getDate();
  const headerWeekday = ["일", "월", "화", "수", "목", "금", "토"][headerDate.getDay()];

  const completedAnalysis = useMemo(
    () => findRelevantCompletedAnalysis(analysisList, effectiveBaseDateKey),
    [analysisList, effectiveBaseDateKey]
  );

  const lastAnalysisBaseDateKey = useMemo(
    () => (completedAnalysis ? getAnalysisDateKey(completedAnalysis) : null),
    [completedAnalysis]
  );
  const newScoredDaysAfterLastAnalysis = useMemo(() => {
    if (!lastAnalysisBaseDateKey) return 0;
    const baseDate = parseDateKey(lastAnalysisBaseDateKey);
    if (!baseDate) return 0;
    return new Set(
      analyzableSkinLogs
        .filter((log) => {
          const d = parseDateKey(toDateKey(log?.logged_at));
          return d && d > baseDate;
        })
        .map((log) => toDateKey(log?.logged_at))
        .filter(Boolean)
    ).size;
  }, [lastAnalysisBaseDateKey, analyzableSkinLogs]);

  // 과거 기준일 선택 시 락 미적용
  const isBaseDateBeforeLastAnalysis =
    !!lastAnalysisBaseDateKey &&
    !!effectiveBaseDateKey &&
    effectiveBaseDateKey < lastAnalysisBaseDateKey;

  const inProgressAnalysis = useMemo(
    () => analysisList.find((item) => IN_PROGRESS_STATUSES.has(item?.status)),
    [analysisList]
  );
  const inProgressAnalysisId = inProgressAnalysis?.request_id ?? inProgressAnalysis?.id ?? null;

  const failedAnalysis = useMemo(
    () => analysisList.find((item) => item?.status === "failed"),
    [analysisList]
  );
  const completedAnalysisId         = completedAnalysis?.request_id ?? completedAnalysis?.id ?? null;
  const latestSkinLogUpdatedAt      = getLatestLogChangedAt(recentAllSkinLogs);
  const latestAnalysisCreatedAt     = getAnalysisTimestamp(completedAnalysis);
  const latestFailedAnalysisCreatedAt = getAnalysisTimestamp(failedAnalysis);
  const failedAnalysisIsLatest = !!(
    failedAnalysis &&
    (!completedAnalysis || latestFailedAnalysisCreatedAt > latestAnalysisCreatedAt)
  );
  const analysisIsStale = !!(
    completedAnalysis &&
    latestSkinLogUpdatedAt &&
    latestAnalysisCreatedAt &&
    latestSkinLogUpdatedAt > latestAnalysisCreatedAt
  );
  const analysisLocked =
    !!completedAnalysis &&
    analysisIsStale &&
    !isBaseDateBeforeLastAnalysis &&
    newScoredDaysAfterLastAnalysis < REANALYSIS_COOLDOWN_DAYS;

  const reportState = getReportState({
    loading: loading || analysisLoading,
    isCreatingAnalysis,
    inProgressAnalysis,
    recentSkinLogDays,
    completedAnalysis,
    analysisIsStale,
    analysisLocked,
    failedAnalysis,
    failedAnalysisIsLatest,
    analysisReady,
  });
  const isPageLoading = reportState === "loading";

  const lastContributingFactors = useMemo(
    () =>
      (completedAnalysis?.result?.contributing_factors ?? []).map(
        (f) => getDisplayFactorText(f) || f
      ),
    [completedAnalysis]
  );
  const reportCopy = getReportCopy({
    state: reportState,
    actualDays: recentSkinLogDays,
    remainingDays: remainingSkinLogDays,
    hasCompletedAnalysis: !!completedAnalysis,
    newScoredDaysAfterLastAnalysis,
    lastContributingFactors,
  });
  const primaryCtaLabel =
    reportState === "no_record" || reportState === "insufficient"
      ? isBaseToday ? "오늘 기록하기" : "이 날짜 기록하기"
      : reportCopy.primaryCta;
  const showInsightActionPanel = isPageLoading || !!primaryCtaLabel;

  const historyItems = useMemo(
    () =>
      analysisList
        .filter((item) => isCompletedAnalysis(item))
        .sort((a, b) => {
          const da  = getAnalysisDateKey(a) ?? "";
          const db_ = getAnalysisDateKey(b) ?? "";
          if (da !== db_) return da > db_ ? -1 : 1;
          return (b?.request_id ?? b?.id ?? 0) - (a?.request_id ?? a?.id ?? 0);
        }),
    [analysisList]
  );

  const photoCount = useMemo(
    () => allSkinLogs.filter((log) => isSupportedImageUri(log?.photo_url)).length,
    [allSkinLogs]
  );

  // 비교 히어로 카드 데이터: 상세 API 우선, 목록 데이터 fallback
  const relationshipSummary = useMemo(() => {
    const detailResult = completedAnalysisDetail?.result ?? completedAnalysisDetail?.analysis_result;
    const listResult   = completedAnalysis?.result ?? completedAnalysis?.analysis_result;
    const result       = detailResult ?? listResult ?? {};
    const patterns = Array.isArray(result?.discovered_patterns) ? result.discovered_patterns : [];
    const verdicts = Array.isArray(result?.concern_verdicts)     ? result.concern_verdicts : [];
    const signalLabels = { active_lesion: "트러블", redness: "붉은기", barrier: "피부 장벽" };
    const cards = [];

    patterns.forEach((item) => {
      const title = getDisplayFactorText(item?.label) || getDisplayFactorText(item?.factor_key);
      if (!title) return;
      const signal = item?.affected_signal_label || signalLabels[item?.affected_signal] || "피부 상태";
      cards.push({
        key:   `pattern-${item?.factor_key ?? title}`,
        tone:  item?.evidence_level === "weak" ? "watch" : "caution",
        title,
        description: item?.pattern || `${title} 이후 ${signal} 기록을 함께 살펴봤어요.`,
        signal,
        badge:
          item?.evidence_level === "strong"  ? "뚜렷한 흐름"  :
          item?.evidence_level === "moderate" ? "살펴볼 흐름"  : "더 지켜보기",
      });
    });

    verdicts.forEach((item) => {
      const title = getDisplayFactorText(item?.label) || getDisplayFactorText(item?.factor_key);
      if (!title || cards.some((card) => card.title === title)) return;
      const signal    = item?.affected_signal_label || signalLabels[item?.signal] || "피부 상태";
      const isCaution = item?.verdict === "confirmed" || item?.verdict === "partial";
      const isSafe    = item?.verdict === "low";
      cards.push({
        key:  `verdict-${item?.factor_key ?? title}`,
        tone: isCaution ? "caution" : isSafe ? "safe" : "watch",
        title,
        description: isCaution
          ? `${title}을 기록한 날과 ${signal} 흐름이 함께 나타났어요.`
          : isSafe
            ? `${title}과 ${signal} 사이에 뚜렷한 흐름은 보이지 않았어요.`
            : `${title}의 영향을 확인하려면 기록이 조금 더 필요해요.`,
        signal,
        badge: isCaution ? "주의해서 보기" : isSafe ? "뚜렷한 영향 없음" : "더 지켜보기",
      });
    });

    return {
      cards:        cards.slice(0, 4),
      cautionCount: cards.filter((c) => c.tone === "caution").length,
      safeCount:    cards.filter((c) => c.tone === "safe").length,
      watchCount:   cards.filter((c) => c.tone === "watch").length,
    };
  }, [completedAnalysis, completedAnalysisDetail]);

  // 완료 분석이 바뀔 때 상세 데이터(패턴·판정) 자동 로드
  useEffect(() => {
    if (!completedAnalysisId) { setCompletedAnalysisDetail(null); return undefined; }
    if (
      completedAnalysisDetail?.request_id === completedAnalysisId ||
      completedAnalysisDetail?.id === completedAnalysisId
    ) return undefined;
    let cancelled = false;
    getAnalysisDetail(completedAnalysisId)
      .then((data) => { if (!cancelled) setCompletedAnalysisDetail(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [completedAnalysisId]); // eslint-disable-line react-hooks/exhaustive-deps

  // isActive true로 전환 시(탭 전환 포함) 분석 목록 갱신 — 기록 탭에서 요청 후 넘어올 때 반영
  const prevIsActiveRef = useRef(false);
  useEffect(() => {
    if (isActive && !prevIsActiveRef.current) {
      refreshAnalysisList();
    }
    prevIsActiveRef.current = isActive;
  }, [isActive, refreshAnalysisList]);

  // ─── 폴링 ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive || !inProgressAnalysisId) return undefined;
    let cancelled = false;
    const poll = () => { if (!cancelled) refreshAnalysisList(); };
    poll();
    const intervalId = setInterval(poll, ANALYSIS_POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [isActive, inProgressAnalysisId, refreshAnalysisList]);

  // ─── 핸들러 ───────────────────────────────────────────────────────────────
  const handleCreateAnalysis = async (note = "") => {
    if (isCreatingAnalysis) return;
    if (!analysisReady) {
      setAnalysisRequestError("피부 리포트를 만들려면 기록이 조금 더 필요해요.");
      return;
    }
    if (!latestSkinLogId) {
      setAnalysisRequestError("선택한 날짜 이전의 피부 기록이 필요해요.");
      return;
    }
    setIsCreatingAnalysis(true);
    setAnalysisRequestError(null);
    setAnalysisRequestMessage(null);
    setConcernModalError(null);
    try {
      const payload = { skin_log_id: latestSkinLogId };
      if (note.trim()) payload.concern_note = note.trim();
      const created = await createAnalysisRequest(payload);
      // POST 응답에 base_date가 없으면 basisSkinLog.logged_at으로 보완 (낙관적 업데이트용)
      const createdWithDate = created?.base_date
        ? created
        : { ...created, base_date: basisSkinLog?.logged_at ?? null };
      setConcernModalOpen(false);
      setAnalysisList((prev) => [
        createdWithDate,
        ...prev.filter(
          (item) => (item?.request_id ?? item?.id) !== (createdWithDate?.request_id ?? createdWithDate?.id)
        ),
      ]);
      setAnalysisRequestMessage("피부 리포트를 만들기 시작했어요.");
      await refreshAnalysisList();
    } catch (error) {
      const message = getAnalysisRequestErrorMessage(error);
      setConcernModalError(message);
      if (isAnalysisRequestDuplicate(error)) {
        setConcernModalOpen(false);
        setAnalysisRequestError(message);
        await refreshAnalysisList();
      }
    } finally {
      setIsCreatingAnalysis(false);
    }
  };

  const handleRecordCtaPress = () => {
    const targetDate = parseDateKey(effectiveBaseDateKey) ?? new Date();
    if (onNavigateRecord) { onNavigateRecord(targetDate); return; }
    Alert.alert("피부 기록하기", "기록 탭에서 선택한 날짜의 피부 상태를 저장해보세요.");
  };

  const handlePrimaryAction = () => {
    if (reportState === "loading" || reportState === "creating") { loadStats(); return; }
    if (reportState === "no_record" || reportState === "insufficient") { handleRecordCtaPress(); return; }
    if (reportState === "complete" && completedAnalysisId) { handleOpenDetail(completedAnalysisId); return; }
    if (reportState === "locked"   && completedAnalysisId) { handleOpenDetail(completedAnalysisId); return; }
    if (reportState === "ready" || reportState === "stale" || reportState === "failed") {
      setConcernNote("");
      setConcernModalError(null);
      setConcernModalOpen(true);
    }
  };

  const handleOpenCalendar = () => {
    setCalendarOpen(true);
  };

  const handleSelectBaseDate = (dateKey) => {
    setSelectedBaseDateKey(dateKey);
    setAnalysisRequestError(null);
    setAnalysisRequestMessage(null);
    fetchLogsForBaseDate(dateKey);
  };

  const handleResetBaseDate = () => {
    setSelectedBaseDateKey(null);
    setAnalysisRequestError(null);
    setAnalysisRequestMessage(null);
  };

  const handleOpenDetail = async (id) => {
    if (!id) return;
    setDetailRequestId(id);
    setDetailLoading(true);
    setDetailError(null);
    setSelectedAnalysis(null);
    try {
      const data = await getAnalysisDetail(id);
      setSelectedAnalysis(data);
    } catch {
      setDetailError("failed");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleBackToList = () => {
    setSelectedAnalysis(null);
    setDetailError(null);
    setDetailLoading(false);
    setDetailRequestId(null);
  };

  const handleBackToListRef = useRef(handleBackToList);
  useEffect(() => { handleBackToListRef.current = handleBackToList; });

  const swipePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gs) =>
        evt.nativeEvent.pageX < 44 && gs.dx > 8 && Math.abs(gs.dy) < 20,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 50) handleBackToListRef.current();
      },
    })
  ).current;

  // ─── 상세 뷰 ──────────────────────────────────────────────────────────────
  if (selectedAnalysis || detailLoading || detailError) {
    return (
      <View style={styles.root} {...swipePanResponder.panHandlers}>
        <DetailHero
          analysis={selectedAnalysis}
          onBack={handleBackToList}
        />
        <ScrollView
          style={styles.root}
          contentContainerStyle={[styles.content, { paddingBottom: contentInsets.paddingBottom }, styles.detailContent]}
          showsVerticalScrollIndicator={false}
        >
          <ReportDetailView
            detailLoading={detailLoading}
            detailError={detailError}
            detailRequestId={detailRequestId}
            selectedAnalysis={selectedAnalysis}
            allSkinLogs={allSkinLogs}
            onRetry={() => handleOpenDetail(detailRequestId)}
          />
        </ScrollView>
      </View>
    );
  }

  // ─── 목록 뷰 ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* 고정 헤더 */}
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderLeft}>
          <Text style={styles.pageTitle}>나의 결</Text>
          <Text style={styles.pageSubtitle}>피부와 생활의 흐름</Text>
        </View>
        <Pressable
          style={styles.datePill}
          onPress={handleOpenCalendar}
        >
          <Ionicons name="calendar-outline" size={13} color={COLORS.olive} />
          <Text style={styles.datePillText}>{headerMonth}월 {headerDay}일</Text>
          <Ionicons name="chevron-down" size={11} color={COLORS.olive} />
        </Pressable>
      </View>
      <View style={styles.headerDivider} />

      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, contentInsets, styles.listContent]}
        showsVerticalScrollIndicator={false}
      >
        <ComparisonHero
          isPageLoading={isPageLoading}
          reportState={reportState}
          isCreatingAnalysis={isCreatingAnalysis}
          relationshipSummary={relationshipSummary}
          reportCopy={reportCopy}
          showInsightActionPanel={showInsightActionPanel}
          primaryCtaLabel={primaryCtaLabel}
          completedAnalysisId={completedAnalysisId}
          analysisRequestMessage={analysisRequestMessage}
          analysisRequestError={analysisRequestError}
          onPrimaryAction={handlePrimaryAction}
          onOpenDetail={handleOpenDetail}
        />

        <InsightSection
          failedAnalysis={failedAnalysis}
          completedAnalysis={completedAnalysis}
          completedAnalysisId={completedAnalysisId}
          analysisError={analysisError}
          onOpenDetail={handleOpenDetail}
          onLoadStats={loadStats}
        />

        <RecordOverview
          recentSkinLogDays={recentSkinLogDays}
          analysisReadySkinLogDays={analysisReadySkinLogDays}
          photoCount={photoCount}
        />

        <HistorySection
          historyItems={historyItems}
          onOpenDetail={handleOpenDetail}
        />
      </ScrollView>

      <ReportCalendarModal
        visible={calendarOpen}
        effectiveBaseDateKey={effectiveBaseDateKey}
        skinLogDateKeys={skinLogDateKeys}
        isSelectedBaseDate={isSelectedBaseDate}
        onClose={() => setCalendarOpen(false)}
        onSelectDate={handleSelectBaseDate}
        onResetDate={handleResetBaseDate}
      />

      <ReportConcernModal
        visible={concernModalOpen}
        concernNote={concernNote}
        concernModalError={concernModalError}
        isCreatingAnalysis={isCreatingAnalysis}
        lastContributingFactors={lastContributingFactors}
        onChangeNote={setConcernNote}
        onClose={() => setConcernModalOpen(false)}
        onSkip={() => handleCreateAnalysis("")}
        onConfirm={() => handleCreateAnalysis(concernNote)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 16 },
  listContent:   { paddingTop: 4, paddingBottom: 220 },
  detailContent: { paddingBottom: 180 },

  // ── 고정 헤더 ──
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.bg,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
  },
  pageHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  pageTitle: {
    fontSize: 32,
    fontFamily: FONT.extraBold,
    color: COLORS.text,
    letterSpacing: -1,
    includeFontPadding: false,
  },
  pageSubtitle: {
    fontSize: 11,
    fontFamily: FONT.bold,
    color: COLORS.olive,
  },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.oliveSoft,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
  },
  datePillText: {
    fontSize: 12.5,
    fontFamily: FONT.bold,
    color: COLORS.olive,
  },
  headerDivider: {
    height: 1,
    backgroundColor: COLORS.line,
  },
});

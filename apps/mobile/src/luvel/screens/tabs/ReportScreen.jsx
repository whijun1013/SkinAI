import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getSkinLogs } from "../../../api/skinLogs";
import { getDietLogs } from "../../../api/diet";
import { getMyCosmetics } from "../../../api/cosmetics";
import { getMyMedications } from "../../../api/medications";
import { createAnalysisRequest, getAnalysisDetail, getAnalysisList } from "../../../api/analysis";
import useTabContentInsets from "../../../hooks/useTabContentInsets";
import useRecordCacheStore from "../../../stores/recordCacheStore";
import SkinTrendChart from "../../components/SkinTrendChart";
import WeeklyNutrientCard from "../../components/WeeklyNutrientCard";

const COLORS = {
  bg: "#F8F7F2",
  surface: "#FFFCF7",
  surfaceSoft: "#FCFAF6",
  line: "#DED9CD",
  olive: "#4F603C",
  oliveSoft: "#E8EEDD",
  text: "#1F2520",
  muted: "#8B9184",
  warning: "#A45F48",
};

const LOOKBACK_DAYS = 14;
const REQUIRED_SKIN_LOG_DAYS = 7;
const IN_PROGRESS_STATUSES = new Set(["pending", "processing"]);
const ANALYSIS_TIMEOUT_MS_MESSAGE = "응답이 지연되고 있어요. 잠시 후 다시 확인해 주세요.";
const ANALYSIS_POLL_INTERVAL_MS = 6000;
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export default function ReportScreen({
  isActive = false,
  selectedDate = null,
  onNavigateRecord = null,
  onNavigateSubScreen = null,
}) {
  const contentInsets = useTabContentInsets();
  const cacheEpoch = useRecordCacheStore((state) => state.cacheEpoch);
  const hasLoadedRef = useRef(false);
  const loadedEpochRef = useRef(-1);

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ skin: 0, diet: 0, cosmetics: 0, medications: 0 });
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
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => new Date());
  const [concernModalOpen, setConcernModalOpen] = useState(false);
  const [concernNote, setConcernNote] = useState("");
  const [concernModalError, setConcernModalError] = useState(null);

  const loadStats = useCallback(async (isMounted = () => true) => {
    setLoading(true);
    setAnalysisLoading(true);

    try {
      const [skinRes, dietRes, cosmeticRes, medRes, analysisRes] = await Promise.allSettled([
        getSkinLogs(30),
        getDietLogs(0, 30),
        getMyCosmetics(true),
        getMyMedications(true),
        getAnalysisList(10),
      ]);

      if (!isMounted()) return;

      const skinLogs = skinRes.status === "fulfilled" && Array.isArray(skinRes.value) ? skinRes.value : [];
      setAllSkinLogs(skinLogs);
      setStats({
        skin: skinLogs.length,
        diet: dietRes.status === "fulfilled" && Array.isArray(dietRes.value) ? dietRes.value.length : 0,
        cosmetics: cosmeticRes.status === "fulfilled" && Array.isArray(cosmeticRes.value) ? cosmeticRes.value.length : 0,
        medications: medRes.status === "fulfilled" && Array.isArray(medRes.value) ? medRes.value.length : 0,
      });

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

  const refreshAnalysisList = useCallback(async () => {
    try {
      const data = await getAnalysisList(10);
      setAnalysisList(normalizeAnalysisList(data));
      setAnalysisError(null);
    } catch (error) {
      setAnalysisError(isTimeoutError(error) ? "timeout" : "failed");
    }
  }, []);

  useEffect(() => {
    const epochChanged = loadedEpochRef.current !== cacheEpoch;
    if (hasLoadedRef.current && !isActive && !epochChanged) return undefined;

    let mounted = true;
    hasLoadedRef.current = true;
    loadedEpochRef.current = cacheEpoch;
    loadStats(() => mounted);

    return () => {
      mounted = false;
    };
  }, [cacheEpoch, isActive, loadStats]);

  const todayKey = toDateKey(new Date());
  const selectedDateKey = toDateKey(selectedDate);
  const effectiveBaseDateKey = selectedBaseDateKey ?? selectedDateKey ?? todayKey;
  const isBaseToday = effectiveBaseDateKey === todayKey;
  const isSelectedBaseDate = !!selectedBaseDateKey;
  const baseDateLabel = formatKoreanDate(effectiveBaseDateKey);
  const baseDateHeading = isBaseToday ? "오늘까지의 최근 기록" : `${baseDateLabel}까지의 최근 기록`;

  const skinLogDateKeys = useMemo(
    () => new Set(allSkinLogs.map((log) => toDateKey(log?.logged_at)).filter(Boolean)),
    [allSkinLogs]
  );
  const analyzableSkinLogs = useMemo(() => allSkinLogs.filter(isAnalyzableSkinLog), [allSkinLogs]);
  const analyzableSkinLogDateKeys = useMemo(
    () => new Set(analyzableSkinLogs.map((log) => toDateKey(log?.logged_at)).filter(Boolean)),
    [analyzableSkinLogs]
  );
  const recentAllSkinLogs = useMemo(
    () => allSkinLogs.filter((log) => isWithinLookbackFromBase(log?.logged_at, effectiveBaseDateKey, LOOKBACK_DAYS)),
    [allSkinLogs, effectiveBaseDateKey]
  );
  const recentAnalyzableSkinLogs = useMemo(
    () => analyzableSkinLogs.filter((log) => isWithinLookbackFromBase(log?.logged_at, effectiveBaseDateKey, LOOKBACK_DAYS)),
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
  const baseDateHasSkinLog = skinLogDateKeys.has(effectiveBaseDateKey);
  const recordFlowCopy = getRecordFlowCopy({
    actualDays: recentSkinLogDays,
    analyzableDays: analysisReadySkinLogDays,
    remainingDays: remainingSkinLogDays,
  });

  const basisSkinLog = useMemo(
    () => getLatestSkinLogOnOrBefore(recentAnalyzableSkinLogs, effectiveBaseDateKey),
    [recentAnalyzableSkinLogs, effectiveBaseDateKey]
  );
  const latestSkinLogId = basisSkinLog?.id ?? basisSkinLog?.skin_log_id ?? null;

  const completedAnalysis = useMemo(() => findCompletedAnalysis(analysisList), [analysisList]);
  const inProgressAnalysis = useMemo(
    () => analysisList.find((item) => IN_PROGRESS_STATUSES.has(item?.status)),
    [analysisList]
  );
  const inProgressAnalysisId = inProgressAnalysis?.request_id ?? inProgressAnalysis?.id ?? null;

  useEffect(() => {
    if (!isActive || !inProgressAnalysisId) return undefined;

    let cancelled = false;
    const poll = () => {
      if (!cancelled) refreshAnalysisList();
    };

    poll();
    const intervalId = setInterval(poll, ANALYSIS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isActive, inProgressAnalysisId, refreshAnalysisList]);

  const failedAnalysis = useMemo(
    () => analysisList.find((item) => item?.status === "failed"),
    [analysisList]
  );
  const completedAnalysisId = completedAnalysis?.request_id ?? completedAnalysis?.id ?? null;
  const latestSkinLogUpdatedAt = getLatestLogChangedAt(recentAllSkinLogs);
  const latestAnalysisCreatedAt = getAnalysisTimestamp(completedAnalysis);
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
  const reportState = getReportState({
    loading: loading || analysisLoading,
    isCreatingAnalysis,
    inProgressAnalysis,
    recentSkinLogDays,
    completedAnalysis,
    analysisIsStale,
    failedAnalysis,
    failedAnalysisIsLatest,
    analysisReady,
  });
  const isPageLoading = reportState === "loading";
  const baseDateRecordCopy = isPageLoading
    ? {
        title: "기록을 확인하고 있어요",
        description: "최근 피부 흐름과 참고 인사이트 상태를 불러오는 중이에요.",
      }
    : getBaseDateRecordCopy({
        isBaseToday,
        hasRecord: baseDateHasSkinLog,
      });
  const reportCopy = getReportCopy({
    state: reportState,
    actualDays: recentSkinLogDays,
    remainingDays: remainingSkinLogDays,
    hasCompletedAnalysis: !!completedAnalysis,
  });
  const insightActionCopy = getInsightActionCopy({
    state: reportState,
    reportCopy,
    completedAnalysis,
    hasCompletedAnalysis: !!completedAnalysis,
  });
  const primaryCtaLabel = (
    reportState === "no_record" || reportState === "insufficient"
      ? (isBaseToday ? "오늘 기록하기" : "이 날짜 기록하기")
      : reportCopy.primaryCta
  );
  const showInsightActionPanel = isPageLoading || !!primaryCtaLabel;
  const historyItems = useMemo(
    () => analysisList
      .filter((item) => {
        const id = item?.request_id ?? item?.id ?? null;
        return isCompletedAnalysis(item) && id !== completedAnalysisId;
      })
      .slice(0, 2),
    [analysisList, completedAnalysisId]
  );

  const handleCreateAnalysis = async (note = "") => {
    if (isCreatingAnalysis) return;
    if (!analysisReady) {
      setAnalysisRequestError("참고 인사이트를 만들 기록이 조금 더 필요해요.");
      return;
    }

    if (!latestSkinLogId) {
      setAnalysisRequestError("기준일 이전의 분석 가능한 피부 기록이 필요해요.");
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
      setConcernModalOpen(false);
      setAnalysisList((prev) => [
        created,
        ...prev.filter((item) => (item?.request_id ?? item?.id) !== (created?.request_id ?? created?.id)),
      ]);
      setAnalysisRequestMessage("참고 인사이트 생성을 시작했어요.");
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
    if (onNavigateRecord) {
      onNavigateRecord(targetDate);
      return;
    }
    Alert.alert("피부 기록하기", "기록 탭에서 선택한 날짜의 피부 상태를 저장해보세요.");
  };

  const handlePrimaryAction = () => {
    if (reportState === "loading" || reportState === "creating") {
      loadStats();
      return;
    }
    if (reportState === "no_record" || reportState === "insufficient") {
      handleRecordCtaPress();
      return;
    }
    if (reportState === "complete" && completedAnalysisId) {
      handleOpenDetail(completedAnalysisId);
      return;
    }
    if (reportState === "ready" || reportState === "stale" || reportState === "failed") {
      setConcernNote("");
      setConcernModalError(null);
      setConcernModalOpen(true);
    }
  };

  const handleOpenCalendar = () => {
    const baseDate = parseDateKey(effectiveBaseDateKey) ?? new Date();
    setCalendarMonthDate(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1));
    setCalendarOpen(true);
  };

  const handleSelectBaseDate = (dateKey) => {
    if (isFutureDateKey(dateKey)) return;
    setSelectedBaseDateKey(dateKey);
    setCalendarOpen(false);
    setAnalysisRequestError(null);
    setAnalysisRequestMessage(null);
  };

  const handleResetBaseDate = () => {
    setSelectedBaseDateKey(null);
    setCalendarOpen(false);
    setAnalysisRequestError(null);
    setAnalysisRequestMessage(null);
  };

  const handleMoveCalendarMonth = (amount) => {
    setCalendarMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + amount, 1));
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
    } catch (error) {
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

  const renderHero = () => (
    <View style={styles.hero}>
      <View pointerEvents="none" style={styles.heroWashLarge} />
      <View pointerEvents="none" style={styles.heroWashSmall} />
      <View pointerEvents="none" style={styles.heroFlowLine} />
      <View style={styles.heroTopRow}>
        <View style={styles.heroTextWrap}>
          <Text style={styles.eyebrow}>{baseDateHeading}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.dateButton, pressed && styles.pressedItem]}
          onPress={handleOpenCalendar}
        >
          <Ionicons name="calendar-outline" size={15} color={COLORS.olive} />
          <Text style={styles.dateButtonText}>{baseDateLabel}</Text>
          <Ionicons name="chevron-down" size={14} color={COLORS.olive} />
        </Pressable>
      </View>

      <View style={styles.heroVisualPanel}>
        <View style={styles.heroChart}>
          <View pointerEvents="none" style={styles.heroChartGuide} />
          <View style={[styles.heroChartPoint, styles.heroChartPointOne]} />
          <View style={[styles.heroChartCurve, styles.heroChartCurveOne]} />
          <View style={[styles.heroChartPoint, styles.heroChartPointTwo]} />
          <View style={[styles.heroChartCurve, styles.heroChartCurveTwo]} />
          <View style={[styles.heroChartPoint, styles.heroChartPointThree]} />
          <View style={[styles.heroChartCurve, styles.heroChartCurveThree]} />
          <View style={[styles.heroChartCheck, !isPageLoading && baseDateHasSkinLog && styles.heroChartCheckActive]}>
            <Ionicons
              name={isPageLoading ? "ellipse-outline" : baseDateHasSkinLog ? "checkmark" : "ellipse-outline"}
              size={15}
              color={!isPageLoading && baseDateHasSkinLog ? "#FFFFFF" : COLORS.olive}
            />
          </View>
        </View>
        <View style={styles.heroStatusRow}>
          <Text style={styles.statusTitle}>{baseDateRecordCopy.title}</Text>
          <Text style={styles.statusDescription}>{baseDateRecordCopy.description}</Text>
        </View>
      </View>

      {showInsightActionPanel ? (
        <View style={styles.insightActionPanel}>
          <View style={styles.insightActionTop}>
            <View style={styles.insightActionIcon}>
              <Ionicons name={insightActionCopy.icon} size={16} color={COLORS.olive} />
            </View>
            <View style={styles.insightActionText}>
              <Text style={styles.insightActionTitle}>{insightActionCopy.title}</Text>
              <Text style={styles.insightActionDescription}>{insightActionCopy.description}</Text>
            </View>
          </View>
          {isPageLoading ? (
            <View style={styles.heroLoadingRow}>
              <ActivityIndicator size="small" color={COLORS.olive} />
              <Text style={styles.heroLoadingText}>기록과 인사이트 상태를 불러오는 중...</Text>
            </View>
          ) : (
            <View style={styles.insightActionButtons}>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryActionPill,
                  (reportState === "creating" || isCreatingAnalysis) && styles.primaryButtonDisabled,
                  pressed && styles.pressedItem,
                ]}
                onPress={handlePrimaryAction}
                disabled={isCreatingAnalysis}
              >
                {isCreatingAnalysis ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryActionPillText}>{primaryCtaLabel}</Text>
                    <Ionicons name="chevron-forward" size={15} color="#FFFFFF" />
                  </>
                )}
              </Pressable>
              {reportCopy.secondaryCta && completedAnalysisId ? (
                <Pressable
                  style={({ pressed }) => [styles.secondaryActionButton, pressed && styles.pressedItem]}
                  onPress={() => handleOpenDetail(completedAnalysisId)}
                >
                  <Text style={styles.secondaryActionText}>{reportCopy.secondaryCta}</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      ) : null}

      {analysisRequestMessage ? (
        <Text style={styles.inlineMessage}>{analysisRequestMessage}</Text>
      ) : null}
      {analysisRequestError ? (
        <Text style={styles.errorText}>{analysisRequestError}</Text>
      ) : null}
    </View>
  );

  const renderInsightSection = () => {
    const showFailureSupport = failedAnalysis && completedAnalysis;
    if (!showFailureSupport && !analysisError) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>참고 인사이트</Text>
        <View style={styles.group}>
          {showFailureSupport ? (
            <Row
              title="최근 다시 만들기가 완료되지 않았어요"
              description="기존 인사이트는 계속 확인할 수 있어요."
              trailing="기존 결과 보기"
              onPress={() => handleOpenDetail(completedAnalysisId)}
            />
          ) : null}
          {showFailureSupport && analysisError ? <Divider /> : null}
          {analysisError ? (
            <Row
              title="인사이트 정보를 불러오지 못했어요"
              description={analysisError === "timeout" ? ANALYSIS_TIMEOUT_MS_MESSAGE : "잠시 후 다시 시도해 주세요."}
              trailing="새로고침"
              onPress={() => loadStats()}
            />
          ) : null}
        </View>
      </View>
    );
  };

  const renderRecordFlowSection = () => {
    if (isPageLoading) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>최근 기록 흐름</Text>
          <View style={styles.group}>
            <View style={styles.sectionLoadingPanel}>
              <ActivityIndicator size="small" color={COLORS.olive} />
              <Text style={styles.sectionLoadingText}>최근 14일 기록을 확인하고 있어요...</Text>
            </View>
          </View>
        </View>
      );
    }

    const timeline = getLookbackDateKeys(effectiveBaseDateKey, LOOKBACK_DAYS);
    const coveragePercent = Math.min((recentSkinLogDays / LOOKBACK_DAYS) * 100, 100);
    const streakDays = getTrailingRecordStreak(timeline, skinLogDateKeys);
    const startDateLabel = formatKoreanDate(timeline[0]);
    const endDateLabel = formatKoreanDate(effectiveBaseDateKey);

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>최근 기록 흐름</Text>
        <View style={styles.group}>
          <View style={styles.flowHeader}>
            <View style={styles.flowTextWrap}>
              <Text style={styles.groupHeadline}>{recordFlowCopy.title}</Text>
              <Text style={styles.groupDescription}>{recordFlowCopy.description}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{analysisReady ? "조건 충족" : `${remainingSkinLogDays}일 더`}</Text>
            </View>
          </View>

          <View style={styles.flowMeter}>
            <View style={styles.flowTrack}>
              <View style={[styles.flowTrackFill, { width: `${coveragePercent}%` }]} />
            </View>
            <View style={styles.flowDateRow}>
              <Text style={styles.flowDateText}>{startDateLabel}</Text>
              <Text style={styles.flowDateText}>{endDateLabel}</Text>
            </View>
          </View>

          <View style={{ marginVertical: 12 }}>
            <SkinTrendChart data={timeline.map(dateKey => {
              const log = allSkinLogs.find(l => toDateKey(l?.logged_at) === dateKey);
              let active_lesion = 0;
              let redness = 0;
              let barrier = 0;
              
              if (log?.condition_tags) {
                const tags = Array.isArray(log.condition_tags) ? log.condition_tags : Object.keys(log.condition_tags);
                if (tags.some(t => t.includes('트러블') || t.includes('여드름') || t.includes('뾰루지'))) active_lesion = 1;
                if (tags.some(t => t.includes('홍조') || t.includes('붉은'))) redness = 1;
                if (tags.some(t => t.includes('각질') || t.includes('건조'))) barrier = 1;
              }
              
              return {
                dateLabel: String(new Date(dateKey).getDate()),
                active_lesion,
                redness,
                barrier
              };
            })} />
          </View>

          <View style={styles.flowStats}>
            <View style={styles.flowStatItem}>
              <Text style={styles.flowStatValue}>{recentSkinLogDays}일</Text>
              <Text style={styles.flowStatLabel}>실제 기록</Text>
            </View>
            <View style={styles.flowStatDivider} />
            <View style={styles.flowStatItem}>
              <Text style={styles.flowStatValue}>{analysisReadySkinLogDays}일</Text>
              <Text style={styles.flowStatLabel}>반영 가능</Text>
            </View>
            <View style={styles.flowStatDivider} />
            <View style={styles.flowStatItem}>
              <Text style={styles.flowStatValue}>{streakDays}일</Text>
              <Text style={styles.flowStatLabel}>이어진 기록</Text>
            </View>
          </View>

          {!analysisReady ? (
            <Text style={styles.subtleLine}>
              최근 14일 중 {analysisReadySkinLogDays}일이 참고 인사이트 조건에 포함돼요.
            </Text>
          ) : (
            <Text style={styles.subtleLine}>기록 수보다 최신 기록 반영 여부를 우선 확인해 주세요.</Text>
          )}
        </View>
      </View>
    );
  };

  const renderSummarySection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>기록 요약</Text>
      <View style={styles.group}>
        {isPageLoading ? (
          <View style={styles.sectionLoadingPanel}>
            <ActivityIndicator size="small" color={COLORS.olive} />
            <Text style={styles.sectionLoadingText}>기록 요약을 불러오는 중...</Text>
          </View>
        ) : (
          <>
            <SummaryRow label="피부 기록 (14일)" value={getSkinSummaryValue(recentSkinLogDays)} />
            <Divider />
            <SummaryRow label="참고 기준 기록 (14일)" value={getSkinSummaryValue(analysisReadySkinLogDays)} />
            <Divider />
            <SummaryRow label="식단 기록 (최근)" value={`${stats.diet}건`} />
            <Divider />
            <SummaryRow label="화장품 / 복용 (최근)" value={`${stats.cosmetics + stats.medications}건`} />
            <Text style={styles.summaryNote}>
              피부는 선택한 기준일 기준 14일, 식단·화장품·복용은 최근 등록 건수예요.
            </Text>
          </>
        )}
      </View>
    </View>
  );

  const renderHistorySection = () => {
    if (historyItems.length === 0) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>이전 인사이트</Text>
        <View style={styles.group}>
          {historyItems.map((item, index) => {
            const id = item?.request_id ?? item?.id;
            const teaser = buildAnalysisTeaser(item);
            return (
              <React.Fragment key={`analysis-${String(id ?? index)}`}>
                {index > 0 ? <Divider /> : null}
                <Row
                  title={getAnalysisHistoryTitle(item)}
                  description={teaser.description}
                  trailing="보기"
                  onPress={id ? () => handleOpenDetail(id) : null}
                />
              </React.Fragment>
            );
          })}
        </View>
      </View>
    );
  };

  const renderCalendar = () => {
    const calendarDays = getCalendarDays(calendarMonthDate);
    const monthTitle = `${calendarMonthDate.getFullYear()}년 ${calendarMonthDate.getMonth() + 1}월`;

    return (
      <Modal
        visible={calendarOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCalendarOpen(false)}>
          <Pressable style={styles.calendarSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.calendarTopRow}>
              <Text style={styles.calendarGuide}>기준일을 선택해 최근 14일 흐름을 확인해요.</Text>
              {isSelectedBaseDate ? (
                <Pressable onPress={handleResetBaseDate}>
                  <Text style={styles.calendarReset}>오늘 기준</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.calendarHeader}>
              <Pressable style={styles.calendarArrow} onPress={() => handleMoveCalendarMonth(-1)}>
                <Ionicons name="chevron-back" size={18} color={COLORS.olive} />
              </Pressable>
              <Text style={styles.calendarTitle}>{monthTitle}</Text>
              <Pressable style={styles.calendarArrow} onPress={() => handleMoveCalendarMonth(1)}>
                <Ionicons name="chevron-forward" size={18} color={COLORS.olive} />
              </Pressable>
            </View>
            <View style={styles.weekRow}>
              {WEEKDAY_LABELS.map((label) => (
                <Text key={label} style={styles.weekdayText}>{label}</Text>
              ))}
            </View>
            <View style={styles.dayGrid}>
              {calendarDays.map((item, index) => {
                const disabled = !item.inMonth || isFutureDateKey(item.dateKey);
                const selected = item.dateKey === effectiveBaseDateKey;
                const hasRecord = skinLogDateKeys.has(item.dateKey);
                return (
                  <Pressable
                    key={`${item.dateKey}-${index}`}
                    style={({ pressed }) => [
                      styles.dayCell,
                      disabled && styles.dayCellMuted,
                      selected && styles.dayCellSelected,
                      pressed && !disabled && styles.pressedItem,
                    ]}
                    onPress={() => !disabled && handleSelectBaseDate(item.dateKey)}
                  >
                    <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{item.day}</Text>
                    
                    {hasRecord && (
                      <View style={{ flexDirection: 'row', gap: 2, marginTop: 4 }}>
                        {(() => {
                          const log = allSkinLogs.find(l => toDateKey(l?.logged_at) === item.dateKey);
                          let hasTrouble = false, hasRedness = false, hasBarrier = false;
                          if (log?.condition_tags) {
                            const tags = Array.isArray(log.condition_tags) ? log.condition_tags : Object.keys(log.condition_tags);
                            if (tags.some(t => t.includes('트러블') || t.includes('여드름') || t.includes('뾰루지'))) hasTrouble = true;
                            if (tags.some(t => t.includes('홍조') || t.includes('붉은'))) hasRedness = true;
                            if (tags.some(t => t.includes('각질') || t.includes('건조'))) hasBarrier = true;
                          }
                          
                          if (!hasTrouble && !hasRedness && !hasBarrier) {
                             return <View style={[styles.calendarDot, styles.calendarDotActive, selected && styles.calendarDotSelected]} />;
                          }
                          
                          return (
                            <>
                              {hasTrouble && <View style={[styles.calendarDot, { backgroundColor: '#E57373' }]} />}
                              {hasRedness && <View style={[styles.calendarDot, { backgroundColor: '#FFB74D' }]} />}
                              {hasBarrier && <View style={[styles.calendarDot, { backgroundColor: '#64B5F6' }]} />}
                            </>
                          );
                        })()}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderConcernModal = () => (
    <Modal
      visible={concernModalOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setConcernModalOpen(false)}
    >
      <Pressable style={styles.modalBackdrop} onPress={() => setConcernModalOpen(false)}>
        <Pressable style={styles.concernSheet} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.concernTitle}>어떤 점이 걱정되시나요?</Text>
          <Text style={styles.concernDescription}>
            특정 화장품, 식단, 수면 등 신경 쓰이는 게 있다면 적어주세요.{"\n"}없으면 건너뛰어도 괜찮아요.
          </Text>
          <TextInput
            style={styles.concernInput}
            value={concernNote}
            onChangeText={setConcernNote}
            placeholder="예: 요즘 새로운 크림 쓰기 시작했어요"
            placeholderTextColor={COLORS.muted}
            multiline
            maxLength={100}
            returnKeyType="done"
            blurOnSubmit
          />
          {concernModalError ? (
            <Text style={styles.concernErrorText}>{concernModalError}</Text>
          ) : null}
          <View style={styles.concernButtons}>
            <Pressable
              style={({ pressed }) => [styles.concernSkipButton, isCreatingAnalysis && styles.primaryButtonDisabled, pressed && styles.pressedItem]}
              onPress={() => handleCreateAnalysis("")}
              disabled={isCreatingAnalysis}
            >
              <Text style={styles.concernSkipText}>건너뛰기</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.concernConfirmButton, isCreatingAnalysis && styles.primaryButtonDisabled, pressed && styles.pressedItem]}
              onPress={() => handleCreateAnalysis(concernNote)}
              disabled={isCreatingAnalysis}
            >
              {isCreatingAnalysis ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.concernConfirmText}>시작하기</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderDetailContent = () => {
    if (detailLoading) {
      return (
        <View style={styles.detailState}>
          <ActivityIndicator size="small" color={COLORS.olive} />
          <Text style={styles.detailStateText}>인사이트를 불러오고 있어요.</Text>
        </View>
      );
    }

    if (detailError) {
      return (
        <View style={styles.detailState}>
          <Ionicons name="cloud-offline-outline" size={28} color={COLORS.muted} />
          <Text style={styles.detailStateText}>인사이트를 불러오지 못했어요.</Text>
          {detailRequestId ? (
            <Pressable
              style={({ pressed }) => [styles.detailRetryButton, pressed && styles.pressedItem]}
              onPress={() => handleOpenDetail(detailRequestId)}
            >
              <Text style={styles.detailRetryText}>다시 시도</Text>
            </Pressable>
          ) : null}
        </View>
      );
    }

    const detail = buildAnalysisDetailViewModel(selectedAnalysis, allSkinLogs);

    return (
      <>
        <DetailSection title="요약" text={detail.summary} />

        {detail.isSparseContent ? (
          <View style={styles.section}>
            <View style={styles.group}>
              <View style={styles.detailSparsePanel}>
                <Ionicons name="information-circle-outline" size={22} color={COLORS.olive} />
                <Text style={styles.detailSparseTitle}>아직 뚜렷한 패턴이 없어요</Text>
                <Text style={styles.detailSparseText}>
                  기록을 조금 더 이어가면 함께 보이는 흐름을 정리할 수 있어요.
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {detail.concernVerdicts.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>내가 적은 의심 요인</Text>
            <View style={styles.group}>
              {detail.concernVerdicts.map((item, index) => (
                <React.Fragment key={`verdict-${item.factor_key}-${index}`}>
                  {index > 0 ? <Divider /> : null}
                  <VerdictRow item={item} />
                </React.Fragment>
              ))}
            </View>
          </View>
        ) : null}

        {detail.discoveredPatterns.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>발견된 패턴</Text>
            <View style={styles.group}>
              {detail.discoveredPatterns.map((item, index) => (
                <React.Fragment key={`pattern-${item.factor_key}-${index}`}>
                  {index > 0 ? <Divider /> : null}
                  <PatternRow item={item} />
                </React.Fragment>
              ))}
            </View>
          </View>
        ) : null}

        {!detail.hasPipeline && !detail.isSparseContent ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>함께 보인 항목</Text>
            <View style={styles.group}>
              {detail.candidateFactors.map((item, index) => (
                <React.Fragment key={`${item.title}-${index}`}>
                  {index > 0 ? <Divider /> : null}
                  <Row title={item.title} description={item.description} trailing={item.badge} />
                </React.Fragment>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>다음 기록에서 볼 점</Text>
          <View style={styles.group}>
            {detail.nextChecks.map((item, index) => (
              <React.Fragment key={`${item}-${index}`}>
                {index > 0 ? <Divider /> : null}
                <Row title={item} description="다음 기록에서 함께 확인해볼 수 있어요." />
              </React.Fragment>
            ))}
          </View>
        </View>
        <DetailSection title="안내" text={detail.notice} />
      </>
    );
  };

  if (selectedAnalysis || detailLoading || detailError) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, contentInsets, styles.detailContent]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.backButton} onPress={handleBackToList}>
          <Ionicons name="chevron-back" size={18} color={COLORS.olive} />
          <Text style={styles.backButtonText}>목록으로</Text>
        </Pressable>
        <Text style={styles.title}>참고 인사이트</Text>
        <Text style={styles.description}>최근 기록에서 함께 보인 흐름을 정리했어요.</Text>
        {renderDetailContent()}
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, contentInsets, styles.listContent]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>내 피부 흐름</Text>
          <Text style={styles.description}>최근 기록에서 피부 흐름을 정리해드려요.</Text>
        </View>
        {renderHero()}
        {renderInsightSection()}
        {renderRecordFlowSection()}
        <View style={styles.section}>
          <WeeklyNutrientCard selectedDate={effectiveBaseDateKey} />
          
          <Pressable 
            style={[styles.primaryButton, { marginTop: 16 }]}
            onPress={() => onNavigateSubScreen && onNavigateSubScreen("timeline")}
          >
            <Ionicons name="list-outline" size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>통합 타임라인 뷰 보기</Text>
          </Pressable>
        </View>
        {renderSummarySection()}
        {renderHistorySection()}
      </ScrollView>
      {renderCalendar()}
      {renderConcernModal()}
    </>
  );
}

function Row({ icon = null, title, description, trailing = "", onPress = null }) {
  const Content = (
    <>
      {icon ? (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={17} color={COLORS.olive} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {description ? <Text style={styles.rowDescription} numberOfLines={2}>{description}</Text> : null}
      </View>
      {trailing ? <Text style={styles.rowTrailing}>{trailing}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={COLORS.muted} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{Content}</View>;
  }

  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressedItem]} onPress={onPress}>
      {Content}
    </Pressable>
  );
}

function SummaryRow({ label, value }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function DetailSection({ title, text }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.group}>
        <Text style={styles.detailText}>{text}</Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function VerdictRow({ item }) {
  const { label: verdictLabel, color: verdictColor } = getVerdictMeta(item.verdict);
  const detail = buildVerdictDetail(item);
  const factorLabel = getDisplayFactorText(item.label) || getDisplayFactorText(item.factor_key);
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{factorLabel}</Text>
        {detail ? <Text style={styles.rowDescription}>{detail}</Text> : null}
      </View>
      <View style={[styles.verdictBadge, { backgroundColor: verdictColor.bg }]}>
        <Text style={[styles.verdictBadgeText, { color: verdictColor.text }]}>{verdictLabel}</Text>
      </View>
    </View>
  );
}

function PatternRow({ item }) {
  const { label: evidenceLabel, color: evidenceColor } = getEvidenceMeta(item.evidence_level);
  const signalLabel = getSafeText(item.affected_signal_label) || getSafeText(item.affected_signal) || "";
  const description = [getSafeText(item.pattern), signalLabel ? `영향 신호: ${signalLabel}` : ""].filter(Boolean).join(" · ");
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{getDisplayFactorText(item.label) || getDisplayFactorText(item.factor_key)}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      <View style={[styles.verdictBadge, { backgroundColor: evidenceColor.bg }]}>
        <Text style={[styles.verdictBadgeText, { color: evidenceColor.text }]}>{evidenceLabel}</Text>
      </View>
    </View>
  );
}

const getVerdictMeta = (verdict) => {
  const map = {
    confirmed: { label: "영향 확인", color: { bg: "#E8EEDD", text: "#4F603C" } },
    partial:   { label: "부분적 영향", color: { bg: "#EEF0E8", text: "#5A6B46" } },
    weak:      { label: "약한 영향", color: { bg: "#F2F1EC", text: "#8B9184" } },
    low:       { label: "영향 없음", color: { bg: "#F2F1EC", text: "#8B9184" } },
    inconclusive: { label: "데이터 부족", color: { bg: "#F2F1EC", text: "#8B9184" } },
  };
  return map[verdict] ?? { label: verdict ?? "확인 중", color: { bg: "#F2F1EC", text: "#8B9184" } };
};

const getConcernSignalLabel = (signal) => {
  const labels = {
    active_lesion: "트러블",
    redness: "홍조",
    barrier: "피부 장벽",
  };
  return labels[signal] ?? getSafeText(signal);
};

const getEvidenceMeta = (level) => {
  const map = {
    strong:   { label: "강한 근거", color: { bg: "#E8EEDD", text: "#4F603C" } },
    moderate: { label: "보통 근거", color: { bg: "#EEF0E8", text: "#5A6B46" } },
    weak:     { label: "약한 근거", color: { bg: "#F2F1EC", text: "#8B9184" } },
  };
  return map[level] ?? { label: level ?? "근거 있음", color: { bg: "#F2F1EC", text: "#8B9184" } };
};

const buildVerdictDetail = (item) => {
  const parts = [];
  const signalLabel = getConcernSignalLabel(item.signal);
  if (signalLabel) parts.push(`영향 신호: ${signalLabel}`);
  if (item.exposure_days != null) parts.push(`노출 ${item.exposure_days}일`);
  if (item.effect_size != null) parts.push(`영향도 ${Number(item.effect_size).toFixed(2)}`);
  return parts.join(" · ");
};

const normalizeAnalysisList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

const toDateKey = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toLocalDateKey(value);
  if (typeof value === "string") {
    // 순수 날짜 형식(YYYY-MM-DD)이면 그대로 반환
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    // datetime 문자열이면 로컬 타임존 기준 날짜로 변환
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : toLocalDateKey(d);
  }
  return null;
};

const toLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateKey = (dateKey) => {
  if (!dateKey) return null;
  const [year, month, day] = String(dateKey).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const formatKoreanDate = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) return "오늘";
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};

const isFutureDateKey = (dateKey) => {
  const date = parseDateKey(dateKey);
  const today = parseDateKey(toLocalDateKey(new Date()));
  if (!date || !today) return false;
  return date > today;
};

const isWithinLookbackFromBase = (value, baseDateKey, days) => {
  const key = toDateKey(value);
  const baseDate = parseDateKey(baseDateKey);
  const target = parseDateKey(key);
  if (!baseDate || !target) return false;

  const start = addDays(baseDate, -(days - 1));
  return target >= start && target <= baseDate;
};

const getLookbackDateKeys = (baseDateKey, days) => {
  const base = parseDateKey(baseDateKey) ?? new Date();
  return Array.from({ length: days }, (_, index) => toLocalDateKey(addDays(base, index - (days - 1))));
};

const getCalendarDays = (monthDate) => {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    return {
      dateKey: toLocalDateKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === monthDate.getMonth(),
    };
  });
};

const isAnalyzableSkinLog = (log) => log?.overall_score !== null && log?.overall_score !== undefined;

const countUniqueLogDays = (logs) => {
  if (!Array.isArray(logs)) return 0;
  return new Set(logs.map((log) => toDateKey(log?.logged_at)).filter(Boolean)).size;
};

const getTrailingRecordStreak = (dateKeys, recordDateKeys) => {
  if (!Array.isArray(dateKeys) || !recordDateKeys) return 0;
  let count = 0;
  for (let index = dateKeys.length - 1; index >= 0; index -= 1) {
    if (!recordDateKeys.has(dateKeys[index])) break;
    count += 1;
  }
  return count;
};

const getLogTime = (log) => Math.max(
  getTimestamp(log?.updated_at),
  getTimestamp(log?.created_at),
  getTimestamp(log?.logged_at)
);

const getLatestSkinLogOnOrBefore = (logs, baseDateKey) => {
  const baseDate = parseDateKey(baseDateKey);
  if (!baseDate || !Array.isArray(logs) || logs.length === 0) return null;
  return [...logs]
    .filter((log) => {
      const date = parseDateKey(toDateKey(log?.logged_at));
      return date && date <= baseDate;
    })
    .sort((a, b) => getLogTime(b) - getLogTime(a))[0] ?? null;
};

const getTimestamp = (value) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const getLatestLogChangedAt = (logs) => {
  if (!Array.isArray(logs) || logs.length === 0) return 0;
  return Math.max(...logs.map(getLogTime));
};

const getAnalysisTimestamp = (analysis) => {
  if (!analysis) return 0;
  const result = analysis?.result ?? analysis?.analysis_result ?? {};
  return Math.max(
    getTimestamp(analysis?.completed_at),
    getTimestamp(analysis?.updated_at),
    getTimestamp(analysis?.requested_at),
    getTimestamp(analysis?.created_at),
    getTimestamp(result?.created_at),
    getTimestamp(result?.updated_at)
  );
};

const isCompletedAnalysis = (item) => {
  const result = item?.result ?? item?.analysis_result ?? null;
  return item?.status === "done" || !!result;
};

const findCompletedAnalysis = (items) => items.find(isCompletedAnalysis) ?? null;

const getAnalysisDateKey = (analysis) => toDateKey(
  analysis?.base_date ??
  analysis?.target_date ??
  analysis?.skin_log?.logged_at ??
  analysis?.requested_at ??
  analysis?.created_at
);

const getAnalysisBasisLabel = (analysis) => {
  const dateKey = getAnalysisDateKey(analysis);
  return dateKey ? formatKoreanDate(dateKey) : "";
};

const getAnalysisHistoryTitle = (analysis) => {
  const dateKey = getAnalysisDateKey(analysis);
  return dateKey ? `${formatKoreanDate(dateKey)} 기준` : "이전 인사이트";
};

const getReportState = ({
  loading,
  isCreatingAnalysis,
  inProgressAnalysis,
  recentSkinLogDays,
  completedAnalysis,
  analysisIsStale,
  failedAnalysis,
  failedAnalysisIsLatest,
  analysisReady,
}) => {
  if (loading) return "loading";
  if (isCreatingAnalysis || inProgressAnalysis) return "creating";
  if (recentSkinLogDays === 0) return "no_record";
  if (failedAnalysis && failedAnalysisIsLatest) return "failed";
  if (completedAnalysis && analysisIsStale) return "stale";
  if (completedAnalysis) return "complete";
  if (failedAnalysis) return "failed";
  if (analysisReady) return "ready";
  return "insufficient";
};

const getInsightActionCopy = ({ state, reportCopy, completedAnalysis, hasCompletedAnalysis }) => {
  const analysisBasisLabel = getAnalysisBasisLabel(completedAnalysis);

  if (state === "complete") {
    return {
      icon: "document-text-outline",
      title: analysisBasisLabel ? `${analysisBasisLabel} 인사이트` : "최근 인사이트",
      description: "이후 새 기록이 없어 계속 확인할 수 있어요.",
    };
  }

  if (state === "stale") {
    return {
      icon: "refresh-outline",
      title: "새 기록이 추가됐어요",
      description: analysisBasisLabel
        ? `기존 인사이트는 ${analysisBasisLabel} 기준이에요.`
        : "기존 인사이트는 이전 기록 기준이에요.",
    };
  }

  if (state === "failed" && hasCompletedAnalysis) {
    return {
      icon: "alert-circle-outline",
      title: "다시 만들기가 완료되지 않았어요",
      description: analysisBasisLabel
        ? `${analysisBasisLabel} 기준 기존 인사이트는 계속 확인할 수 있어요.`
        : "기존 인사이트는 계속 확인할 수 있어요.",
    };
  }

  if (state === "ready") {
    return {
      icon: "sparkles-outline",
      title: "참고 인사이트를 만들 수 있어요",
      description: "최근 기록을 바탕으로 흐름을 정리해드려요.",
    };
  }

  if (state === "creating") {
    return {
      icon: "time-outline",
      title: "참고 인사이트를 만들고 있어요",
      description: "완료되면 결과를 확인할 수 있어요.",
    };
  }

  if (state === "failed") {
    return {
      icon: "alert-circle-outline",
      title: "참고 인사이트를 만들지 못했어요",
      description: "다시 시도해볼 수 있어요.",
    };
  }

  if (state === "no_record" || state === "insufficient") {
    return {
      icon: "create-outline",
      title: reportCopy.insightTitle,
      description: reportCopy.insightDescription,
    };
  }

  return {
    icon: "leaf-outline",
    title: reportCopy.insightTitle,
    description: reportCopy.insightDescription,
  };
};

const getReportCopy = ({ state, actualDays, remainingDays, hasCompletedAnalysis }) => {
  if (state === "loading") {
    return {
      title: "최근 흐름을 확인하고 있어요",
      description: "기록과 참고 인사이트 상태를 불러오는 중이에요.",
      insightTitle: "상태 확인 중",
      insightDescription: "잠시만 기다려 주세요.",
      badge: "",
      primaryCta: "",
    };
  }

  if (state === "creating") {
    return {
      title: "참고 인사이트를 만들고 있어요",
      description: "최근 기록을 바탕으로 흐름을 정리하고 있어요.",
      insightTitle: "생성 중",
      insightDescription: "완료되면 결과를 확인할 수 있어요.",
      badge: "진행 중",
      primaryCta: "상태 새로고침",
    };
  }

  if (state === "no_record") {
    return {
      title: "오늘부터 피부 흐름을 기록해볼까요?",
      description: "최근 기록이 아직 없어요.",
      insightTitle: "참고 인사이트 준비 전",
      insightDescription: "피부 기록이 쌓이면 최근 흐름을 정리할 수 있어요.",
      badge: "기록 필요",
      primaryCta: "오늘 기록하기",
    };
  }

  if (state === "stale") {
    return {
      title: "새 기록이 추가됐어요",
      description: "최신 기록 기준으로 참고 인사이트를 다시 만들 수 있어요.",
      insightTitle: "기존 인사이트는 이전 기록 기준이에요",
      insightDescription: "기존 결과를 보거나 최신 기록 기준으로 다시 만들 수 있어요.",
      badge: "업데이트 가능",
      primaryCta: "참고 인사이트 다시 만들기",
      secondaryCta: hasCompletedAnalysis ? "기존 결과 보기" : "",
    };
  }

  if (state === "complete") {
    return {
      title: "최신 기록 기준 인사이트",
      description: "최근 기록에서 함께 보인 흐름을 확인해보세요.",
      insightTitle: "참고 인사이트 준비됨",
      insightDescription: "최신 기록을 기준으로 만든 인사이트예요.",
      badge: "최신",
      primaryCta: "결과 보기",
    };
  }

  if (state === "failed") {
    return {
      title: hasCompletedAnalysis ? "참고 인사이트를 다시 만들지 못했어요" : "참고 인사이트 생성이 완료되지 않았어요",
      description: hasCompletedAnalysis ? "기존 인사이트는 계속 확인할 수 있어요." : "다시 시도해볼 수 있어요.",
      insightTitle: "생성 실패",
      insightDescription: hasCompletedAnalysis ? "다시 시도하거나 기존 결과를 확인해보세요." : "네트워크 상태를 확인한 뒤 다시 시도해보세요.",
      badge: "확인 필요",
      primaryCta: "다시 시도하기",
      secondaryCta: hasCompletedAnalysis ? "기존 결과 보기" : "",
    };
  }

  if (state === "ready") {
    return {
      title: "참고 인사이트 생성 가능",
      description: "최근 흐름을 정리할 만큼 기록이 쌓였어요.",
      insightTitle: "생성 가능",
      insightDescription: "최근 기록을 바탕으로 함께 보인 흐름을 정리해드려요.",
      badge: "조건 충족",
      primaryCta: "참고 인사이트 생성하기",
    };
  }

  return {
    title: "참고 인사이트를 만들 준비 중이에요",
    description: `최근 14일 중 ${actualDays}일 기록했어요. ${remainingDays}일만 더 기록하면 참고 인사이트를 만들 수 있어요.`,
    insightTitle: "조금 더 기록이 필요해요",
    insightDescription: "기록을 이어가면 최근 흐름을 정리할 수 있어요.",
    badge: `${remainingDays}일 더`,
    primaryCta: "이 날짜 기록하기",
  };
};

const getBaseDateRecordCopy = ({ isBaseToday, hasRecord }) => {
  if (isBaseToday && hasRecord) {
    return {
      title: "오늘 기록 반영됨",
      description: "오늘 저장한 기록까지 최근 흐름에 포함됐어요.",
    };
  }
  if (isBaseToday) {
    return {
      title: "오늘 기록은 아직 없어요",
      description: "오늘 기록을 남기면 최근 흐름에 반영돼요.",
    };
  }
  if (hasRecord) {
    return {
      title: "선택한 날짜 기록 반영됨",
      description: "선택한 날짜의 기록이 최근 흐름에 포함됐어요.",
    };
  }
  return {
    title: "선택한 날짜 기록은 아직 없어요",
    description: "이 날짜의 기록을 남기면 흐름에 반영돼요.",
  };
};

const getRecordFlowCopy = ({ actualDays, analyzableDays, remainingDays }) => {
  if (actualDays === 0) {
    return {
      title: "최근 기록이 아직 없어요",
      description: "기록을 시작하면 이곳에 최근 흐름이 표시돼요.",
    };
  }
  if (analyzableDays < REQUIRED_SKIN_LOG_DAYS) {
    return {
      title: `최근 14일 중 ${actualDays}일 기록했어요`,
      description: `${remainingDays}일만 더 기록하면 참고 인사이트를 만들 수 있어요.`,
    };
  }
  if (actualDays >= 14) {
    return {
      title: "기록 흐름이 꾸준히 이어지고 있어요",
      description: "최근 흐름 데이터가 충분히 쌓였어요.",
    };
  }
  if (actualDays >= 11) {
    return {
      title: "최근 흐름 데이터가 충분히 쌓였어요",
      description: "숫자보다 최신 기록 반영 여부가 더 중요해요.",
    };
  }
  return {
    title: "최근 흐름을 정리할 만큼 기록이 쌓였어요",
    description: "참고 인사이트 조건을 충족했어요.",
  };
};

const getSkinSummaryValue = (days) => {
  if (days <= 0) return "아직 없음";
  return `${days}일`;
};

const getAnalysisResultPayload = (analysis) => {
  const result = analysis?.result ?? analysis?.analysis_result ?? analysis ?? {};
  return result && typeof result === "object" ? result : {};
};

const getSafeText = (value) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : "");

const buildAnalysisTeaser = (analysis) => {
  if (analysis?.status === "failed") {
    return {
      title: "생성이 완료되지 않았어요",
      description: "다시 시도해볼 수 있어요.",
    };
  }
  if (IN_PROGRESS_STATUSES.has(analysis?.status)) {
    return {
      title: "만들고 있어요",
      description: "최근 기록을 바탕으로 흐름을 정리하고 있어요.",
    };
  }
  const result = getAnalysisResultPayload(analysis);
  const reportText = getSummaryPreview(getSafeText(result?.report_text));
  return {
    title: "참고 인사이트",
    description: reportText || "최근 기록에서 함께 보인 흐름을 확인해보세요.",
  };
};

const buildAnalysisDetailViewModel = (analysis, allSkinLogs) => {
  const result = getAnalysisResultPayload(analysis);
  const reportText = getSummaryPreview(getSafeText(result?.report_text));
  const concernVerdicts = Array.isArray(result?.concern_verdicts) ? result.concern_verdicts : [];
  const discoveredPatterns = Array.isArray(result?.discovered_patterns) ? result.discovered_patterns : [];
  const hasPipeline = concernVerdicts.length > 0 || discoveredPatterns.length > 0;
  const candidateFactors = hasPipeline ? [] : getCandidateFactorItems(result);

  return {
    summary: reportText || "최근 기록을 바탕으로 함께 보인 흐름을 정리했어요.",
    concernVerdicts,
    discoveredPatterns,
    hasPipeline,
    isSparseContent: !hasPipeline && concernVerdicts.length === 0 && discoveredPatterns.length === 0,
    candidateFactors: !hasPipeline && candidateFactors.length === 0 ? [
      {
        title: "최근 피부 기록",
        description: `${countUniqueLogDays(allSkinLogs)}일의 피부 기록을 참고했어요.`,
        badge: "참고",
      },
    ] : candidateFactors,
    nextChecks: getNextCheckItems(result),
    notice: "이 내용은 기록 기반 참고 인사이트예요. 불편한 변화가 있거나 걱정되는 증상이 있으면 전문가와 상담해 주세요.",
  };
};

const getSummaryPreview = (text) => {
  const safeText = getSafeText(text);
  if (!safeText) return "";
  return safeText.length > 130 ? `${safeText.slice(0, 127).trim()}...` : safeText;
};

const getCandidateFactorItems = (result) => {
  const items = [];
  const primary = getDisplayFactorText(result?.primary_cause);
  if (primary) {
    items.push({
      title: primary,
      description: "최근 기록에서 함께 보인 항목으로 정리됐어요.",
      badge: "참고",
    });
  }

  getAgentResultItems(result).forEach((agent) => {
    const label = getDomainLabel(agent?.agent_type ?? agent?.type ?? agent?.name);
    const suspiciousItems = Array.isArray(agent?.suspicious_items) ? agent.suspicious_items : [];
    suspiciousItems.forEach((item) => {
      const title = getDisplayFactorText(item?.label) || getDisplayFactorText(item?.factor_key) || label;
      if (!title || items.some((existing) => existing.title === title)) return;
      items.push({
        title,
        description: `${label} 기록과 함께 확인할 수 있어요.`,
        badge: "흐름",
      });
    });
  });

  return items.slice(0, 4);
};

const getAgentResultItems = (result) => {
  if (Array.isArray(result?.agent_results)) return result.agent_results;
  if (Array.isArray(result?.agent_result)) return result.agent_result;
  return [];
};

const DOMAIN_LABELS = {
  behavior: "생활 기록",
  diet: "식단 기록",
  cosmetic: "화장품 사용",
  medication: "복용 기록",
  environment: "환경 기록",
  skin: "피부 기록",
};

const getDomainLabel = (value) => {
  const key = getSafeText(value).toLowerCase();
  return Object.keys(DOMAIN_LABELS).find((domain) => key.includes(domain))
    ? DOMAIN_LABELS[Object.keys(DOMAIN_LABELS).find((domain) => key.includes(domain))]
    : "기록 항목";
};

const getDisplayFactorText = (value) => {
  const text = getSafeText(value);
  if (!text) return "";
  if (/^[a-z0-9_ -]+$/i.test(text) && text.includes("_")) return "기록 항목";
  return text.replace(/_/g, " ");
};

const getNextCheckItems = (result) => {
  const candidates = getCandidateFactorItems(result);
  if (candidates.length === 0) {
    return ["피부 기록과 생활 기록을 함께 이어가 보세요.", "다음 기록에서 반복되는 흐름을 확인해볼 수 있어요."];
  }
  return candidates.slice(0, 2).map((item) => `${item.title} 흐름을 다음 기록에서도 확인해보세요.`);
};

const getErrorDetailText = (error) => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg ?? item?.message ?? JSON.stringify(item)).join(" ");
  if (detail && typeof detail === "object") return detail.message ?? detail.msg ?? JSON.stringify(detail);
  return error?.message ?? "";
};

const getNormalizedErrorText = (error) => getErrorDetailText(error).toLowerCase();

const isTimeoutError = (error) => {
  const message = String(error?.message ?? "").toLowerCase();
  return error?.code === "ECONNABORTED" || message.includes("timeout");
};

const isAnalysisRequestDuplicate = (error) => {
  const text = getNormalizedErrorText(error);
  return text.includes("analysis request already exists") || text.includes("already exists");
};

const getAnalysisRequestErrorMessage = (error) => {
  const text = getNormalizedErrorText(error);
  const status = error?.response?.status;

  if (isTimeoutError(error)) return ANALYSIS_TIMEOUT_MS_MESSAGE;
  if (isAnalysisRequestDuplicate(error)) return "이미 만들고 있는 참고 인사이트가 있어요.";
  if (text.includes("at least 7 skin log days are required")) return "참고 인사이트를 만들 기록이 조금 더 필요해요.";
  if (text.includes("skin log not found") || text.includes("not found")) return "기준일 이전의 피부 기록을 찾지 못했어요.";
  if (status === 401 || status === 403 || text.includes("token")) return "다시 로그인한 뒤 시도해 주세요.";
  return "참고 인사이트를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 20 },
  listContent: { paddingBottom: 220 },
  detailContent: { paddingBottom: 180 },
  header: { paddingTop: 4, marginBottom: 14 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "900", color: COLORS.text, letterSpacing: 0 },
  description: { marginTop: 5, fontSize: 14, lineHeight: 20, fontWeight: "600", color: COLORS.muted, letterSpacing: 0 },
  hero: {
    marginHorizontal: -4,
    borderRadius: 30,
    backgroundColor: "#F0F4E9",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    overflow: "hidden",
  },
  heroWashLarge: {
    position: "absolute",
    right: -58,
    top: -48,
    width: 178,
    height: 178,
    borderRadius: 89,
    backgroundColor: "rgba(232,238,221,0.92)",
  },
  heroWashSmall: {
    position: "absolute",
    left: -34,
    bottom: -46,
    width: 126,
    height: 126,
    borderRadius: 63,
    backgroundColor: "rgba(255,252,247,0.72)",
  },
  heroFlowLine: {
    position: "absolute",
    left: 20,
    right: 32,
    top: 96,
    height: 1,
    backgroundColor: "rgba(79,96,60,0.10)",
  },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  heroTextWrap: { flex: 1 },
  eyebrow: { fontSize: 12.5, lineHeight: 17, fontWeight: "800", color: COLORS.olive, letterSpacing: 0 },
  dateButton: {
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,252,247,0.76)",
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateButtonText: { fontSize: 11.5, lineHeight: 15, fontWeight: "900", color: COLORS.olive, letterSpacing: 0 },
  heroVisualPanel: {
    marginTop: 17,
    borderRadius: 24,
    backgroundColor: "rgba(255,252,247,0.64)",
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  heroChart: { height: 68, marginBottom: 14, position: "relative" },
  heroChartGuide: {
    position: "absolute",
    left: 3,
    right: 3,
    top: 35,
    height: 1,
    backgroundColor: "rgba(79,96,60,0.10)",
  },
  heroChartPoint: {
    position: "absolute",
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "rgba(79,96,60,0.52)",
  },
  heroChartPointOne: { left: "4%", top: 38 },
  heroChartPointTwo: { left: "34%", top: 22 },
  heroChartPointThree: { left: "64%", top: 32 },
  heroChartCurve: {
    position: "absolute",
    height: 28,
    borderTopWidth: 2,
    borderColor: "rgba(79,96,60,0.36)",
    borderRadius: 26,
  },
  heroChartCurveOne: { left: "8%", top: 27, width: "28%", transform: [{ rotate: "-10deg" }] },
  heroChartCurveTwo: { left: "38%", top: 24, width: "28%", transform: [{ rotate: "9deg" }] },
  heroChartCurveThree: { left: "68%", top: 22, width: "22%", transform: [{ rotate: "-8deg" }] },
  heroChartCheck: {
    position: "absolute",
    right: "2%",
    top: 16,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,252,247,0.92)",
    borderWidth: 1,
    borderColor: "rgba(79,96,60,0.26)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroChartCheckActive: { backgroundColor: COLORS.olive, borderColor: COLORS.olive },
  heroStatusRow: {},
  heroStatusText: { flex: 1 },
  statusTitle: { fontSize: 15, lineHeight: 20, fontWeight: "900", color: COLORS.text, letterSpacing: 0 },
  statusDescription: { marginTop: 2, fontSize: 12.8, lineHeight: 18, fontWeight: "600", color: COLORS.muted, letterSpacing: 0 },
  insightActionPanel: {
    marginTop: 16,
    borderRadius: 21,
    backgroundColor: "rgba(255,252,247,0.72)",
    padding: 13,
  },
  insightActionTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  insightActionIcon: {
    width: 31,
    height: 31,
    borderRadius: 15.5,
    backgroundColor: "rgba(232,238,221,0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  insightActionText: { flex: 1, minWidth: 0 },
  insightActionTitle: { fontSize: 14.8, lineHeight: 20, fontWeight: "900", color: COLORS.text, letterSpacing: 0 },
  insightActionDescription: { marginTop: 2, fontSize: 12.2, lineHeight: 17, fontWeight: "700", color: COLORS.muted, letterSpacing: 0 },
  insightActionButtons: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  heroLoadingRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 42,
    borderRadius: 16,
    backgroundColor: "rgba(232,238,221,0.45)",
    paddingHorizontal: 14,
  },
  heroLoadingText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: COLORS.muted,
  },
  primaryActionPill: {
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: COLORS.olive,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flex: 1,
  },
  primaryActionPillText: { fontSize: 13.5, lineHeight: 18, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0 },
  secondaryActionButton: { minHeight: 42, borderRadius: 21, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  secondaryActionText: { fontSize: 13, lineHeight: 18, fontWeight: "900", color: COLORS.olive, letterSpacing: 0 },
  primaryButton: {
    marginTop: 19,
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: COLORS.olive,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonDisabled: { opacity: 0.64 },
  primaryButtonText: { fontSize: 15, lineHeight: 20, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0 },
  secondaryInlineButton: { alignSelf: "center", marginTop: 12, paddingVertical: 8, paddingHorizontal: 12 },
  secondaryInlineText: { fontSize: 13, lineHeight: 18, fontWeight: "900", color: COLORS.olive, letterSpacing: 0 },
  inlineMessage: { marginTop: 10, fontSize: 12.5, lineHeight: 18, fontWeight: "700", color: COLORS.olive, textAlign: "center", letterSpacing: 0 },
  errorText: { marginTop: 10, fontSize: 12.5, lineHeight: 18, fontWeight: "700", color: COLORS.warning, textAlign: "center", letterSpacing: 0 },
  section: { marginTop: 18 },
  sectionTitle: { marginBottom: 8, paddingHorizontal: 4, fontSize: 13, lineHeight: 18, fontWeight: "900", color: COLORS.muted, letterSpacing: 0 },
  group: {
    borderRadius: 19,
    backgroundColor: "rgba(255,252,247,0.82)",
    overflow: "hidden",
  },
  groupHeadline: { fontSize: 16, lineHeight: 22, fontWeight: "900", color: COLORS.text, letterSpacing: 0 },
  groupDescription: { marginTop: 4, fontSize: 12.8, lineHeight: 18, fontWeight: "600", color: COLORS.muted, letterSpacing: 0 },
  row: { minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 15, paddingVertical: 10 },
  rowIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14.5, lineHeight: 20, fontWeight: "900", color: COLORS.text, letterSpacing: 0 },
  rowDescription: { marginTop: 2, fontSize: 12.1, lineHeight: 17, fontWeight: "600", color: COLORS.muted, letterSpacing: 0 },
  rowTrailing: { marginLeft: 10, fontSize: 11.8, lineHeight: 16, fontWeight: "900", color: COLORS.olive, letterSpacing: 0 },
  divider: { height: 1, backgroundColor: COLORS.line, marginLeft: 15, opacity: 0.78 },
  flowHeader: { paddingHorizontal: 15, paddingTop: 15, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  flowTextWrap: { flex: 1 },
  pill: { borderRadius: 999, backgroundColor: COLORS.oliveSoft, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 11.5, lineHeight: 15, fontWeight: "900", color: COLORS.olive, letterSpacing: 0 },
  flowMeter: { paddingHorizontal: 15, paddingTop: 17 },
  flowTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(222,217,205,0.68)",
    overflow: "hidden",
  },
  flowTrackFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(79,96,60,0.72)",
  },
  flowDateRow: { marginTop: 8, flexDirection: "row", justifyContent: "space-between" },
  flowDateText: { fontSize: 10.8, lineHeight: 14, fontWeight: "800", color: COLORS.muted, letterSpacing: 0 },
  dotTimeline: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 15, paddingTop: 14, paddingBottom: 11 },
  dotItem: { width: `${100 / LOOKBACK_DAYS}%`, alignItems: "center" },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D9D6CC",
    borderWidth: 1,
    borderColor: "rgba(79,96,60,0.08)",
  },
  timelineDotFilled: { backgroundColor: "rgba(79,96,60,0.36)", borderColor: "rgba(79,96,60,0.18)" },
  timelineDotAnalyzable: { backgroundColor: COLORS.olive, borderColor: COLORS.olive },
  timelineDotBase: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: COLORS.surface },
  flowLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 15,
    paddingBottom: 13,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendDotRecord: { backgroundColor: "rgba(79,96,60,0.36)" },
  legendDotAnalyzable: { backgroundColor: COLORS.olive },
  legendDotBase: { backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.olive },
  legendText: { fontSize: 10.8, lineHeight: 14, fontWeight: "800", color: COLORS.muted, letterSpacing: 0 },
  flowStats: {
    marginHorizontal: 15,
    marginBottom: 13,
    borderRadius: 16,
    backgroundColor: "rgba(232,238,221,0.48)",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
  },
  flowStatItem: { flex: 1, alignItems: "center", minWidth: 0 },
  flowStatValue: { fontSize: 15, lineHeight: 20, fontWeight: "900", color: COLORS.text, letterSpacing: 0 },
  flowStatLabel: { marginTop: 2, fontSize: 10.8, lineHeight: 14, fontWeight: "800", color: COLORS.muted, letterSpacing: 0 },
  flowStatDivider: { width: 1, height: 28, backgroundColor: "rgba(79,96,60,0.14)" },
  subtleLine: { paddingHorizontal: 15, paddingBottom: 15, fontSize: 11.8, lineHeight: 16, fontWeight: "700", color: COLORS.muted, letterSpacing: 0 },
  summaryRow: { minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 15 },
  summaryLabel: { fontSize: 14, lineHeight: 19, fontWeight: "700", color: COLORS.text, letterSpacing: 0 },
  summaryValue: { fontSize: 13.5, lineHeight: 18, fontWeight: "900", color: COLORS.olive, letterSpacing: 0 },
  summaryNote: {
    paddingHorizontal: 15,
    paddingBottom: 14,
    paddingTop: 4,
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: "600",
    color: COLORS.muted,
  },
  sectionLoadingPanel: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 12,
  },
  sectionLoadingText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: COLORS.muted,
    textAlign: "center",
  },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(31,37,32,0.28)", justifyContent: "flex-end", padding: 18 },
  calendarSheet: { borderRadius: 26, backgroundColor: COLORS.surface, padding: 16 },
  calendarTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 },
  calendarGuide: { flex: 1, fontSize: 12.2, lineHeight: 17, fontWeight: "700", color: COLORS.muted, letterSpacing: 0 },
  calendarReset: { fontSize: 12.2, lineHeight: 17, fontWeight: "900", color: COLORS.olive, letterSpacing: 0 },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  calendarArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.oliveSoft, alignItems: "center", justifyContent: "center" },
  calendarTitle: { fontSize: 15, lineHeight: 20, fontWeight: "900", color: COLORS.text, letterSpacing: 0 },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekdayText: { width: `${100 / 7}%`, textAlign: "center", fontSize: 11, lineHeight: 15, fontWeight: "800", color: COLORS.muted, letterSpacing: 0 },
  dayGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  dayCellMuted: { opacity: 0.3 },
  dayCellSelected: { backgroundColor: COLORS.olive },
  dayText: { fontSize: 12.5, lineHeight: 16, fontWeight: "800", color: COLORS.text, letterSpacing: 0 },
  dayTextSelected: { color: "#FFFFFF" },
  calendarDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2, backgroundColor: "transparent" },
  calendarDotActive: { backgroundColor: COLORS.olive },
  calendarDotSelected: { backgroundColor: "#FFFFFF" },
  backButton: { marginTop: 4, marginBottom: 18, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderRadius: 15, backgroundColor: COLORS.oliveSoft, paddingHorizontal: 12, paddingVertical: 8 },
  backButtonText: { marginLeft: 4, fontSize: 13, lineHeight: 18, fontWeight: "900", color: COLORS.olive, letterSpacing: 0 },
  detailState: { marginTop: 24, borderRadius: 22, backgroundColor: COLORS.surface, padding: 24, alignItems: "center", gap: 4 },
  detailStateText: { marginTop: 6, fontSize: 13, lineHeight: 18, fontWeight: "800", color: COLORS.olive, letterSpacing: 0, textAlign: "center" },
  detailRetryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.olive,
    backgroundColor: COLORS.oliveSoft,
  },
  detailRetryText: { fontSize: 14, lineHeight: 18, fontWeight: "800", color: COLORS.olive },
  detailSparsePanel: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 22,
    gap: 8,
  },
  detailSparseTitle: {
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: "900",
    color: COLORS.text,
    textAlign: "center",
  },
  detailSparseText: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
    color: COLORS.muted,
    textAlign: "center",
  },
  detailText: { padding: 15, fontSize: 13.5, lineHeight: 21, fontWeight: "600", color: COLORS.text, letterSpacing: 0 },
  pressedItem: { opacity: 0.72 },
  verdictBadge: {
    marginLeft: 10,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  verdictBadgeText: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "900",
    letterSpacing: 0,
  },
  concernSheet: {
    borderRadius: 26,
    backgroundColor: COLORS.surface,
    padding: 20,
  },
  concernTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "900",
    color: COLORS.text,
    letterSpacing: 0,
    marginBottom: 6,
  },
  concernDescription: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: COLORS.muted,
    letterSpacing: 0,
    marginBottom: 14,
  },
  concernInput: {
    borderRadius: 16,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: COLORS.text,
    minHeight: 88,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  concernErrorText: {
    marginBottom: 10,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
    color: COLORS.warning,
    letterSpacing: 0,
  },
  concernButtons: {
    flexDirection: "row",
    gap: 10,
  },
  concernSkipButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  concernSkipText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: COLORS.olive,
    letterSpacing: 0,
  },
  concernConfirmButton: {
    flex: 2,
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: COLORS.olive,
    alignItems: "center",
    justifyContent: "center",
  },
  concernConfirmText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0,
  },
});

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";

import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { createAnalysisRequest } from "../../../api/analysis";
import { getMonthRecordStatus } from "../../../api/records";
import { getSkinLogMedgemmaStatus } from "../../../api/skinLogs";
import {
  useBehaviorLogQuery,
  useDietLogsQuery,
  useEnvironmentLogsQuery,
  useSkinLogQuery,
} from "../../../hooks/useRecordQueries";
import useRecordCacheStore from "../../../stores/recordCacheStore";

import { useDateNavigatorController, DateNavigatorHero, DateNavigatorStrip, fromDateStr, toDateStr } from "./components/DateNavigator";
import useAuthStore from "../../../stores/authStore";
import useTabContentInsets from "../../../hooks/useTabContentInsets";
import { formatDietLines } from "./dietDisplay";
import { parseConditionTags } from "./skinConstants";
import { isSupportedImageUri } from "../../components/AuthImage";
import { SkinStatusVisual } from "./components/RecordStatusVisuals";

// ─── 색상 ─────────────────────────────────────────────────────────────────────
const C = {
  bg:        "#F7F8F5",
  card:      "#FFFFFF",
  line:      "#E2E5DA",
  text:      "#1A1F17",
  muted:     "#8A9080",
  olive:     "#4F603C",
  oliveSoft: "#E4EBD8",
  oliveMid:  "#C8D8A8",
  chip:      "#F2F4EE",
};

// Earthy 계열 — 채도 낮춰 앱 팔레트와 통일
const ACCENT = {
  skin:        { main: "#4F603C", soft: "#E4EBD8", mid: "#C8D8A8", icon: "leaf-outline",          iconFilled: "leaf"          },
  diet:        { main: "#A06830", soft: "#F2E8D8", mid: "#DDB888", icon: "restaurant-outline",     iconFilled: "restaurant"    },
  behavior:    { main: "#5A6E8A", soft: "#DDE4EE", mid: "#A8BAD0", icon: "moon-outline",           iconFilled: "moon"          },
  environment: { main: "#477A7F", soft: "#D8E8EA", mid: "#90C0C4", icon: "partly-sunny-outline",   iconFilled: "partly-sunny"  },
  cosmetics:   { main: "#6B5F88", soft: "#EAE4F2", mid: "#B8ACCC", icon: "flask-outline",          iconFilled: "flask"         },
  medications: { main: "#8C4444", soft: "#F2E0E0", mid: "#CCA0A0", icon: "medkit-outline",         iconFilled: "medkit"        },
  period:      { main: "#9E5570", soft: "#F2E0EA", mid: "#CCA0B8", icon: "flower-outline",         iconFilled: "flower"        },
};

const shadow = Platform.OS === "ios"
  ? { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10 }
  : { elevation: 2 };

// ─── SectionCard ──────────────────────────────────────────────────────────────
function SectionCard({ accent, label, sub, filled, isToday, loading, error, onPress, children }) {
  return (
    <TouchableOpacity
      style={[
        styles.card,
        filled
          ? { borderColor: accent.mid }
          : isToday
          ? styles.cardEmptyToday
          : styles.cardEmptyPast,
      ]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      {/* 카드 헤더 */}
      <View
        style={[
          styles.cardHead,
          filled
            ? { backgroundColor: accent.main }
            : { backgroundColor: C.card },
        ]}
      >
        <View
          style={[
            styles.cardHeadIcon,
            filled
              ? { backgroundColor: "rgba(255,255,255,0.18)" }
              : { backgroundColor: accent.soft },
          ]}
        >
          <Ionicons
            name={filled ? accent.iconFilled : accent.icon}
            size={16}
            color={filled ? "#fff" : accent.main}
          />
        </View>

        <Text style={[styles.cardHeadLabel, { color: filled ? "#fff" : accent.main }]}>
          {label}
        </Text>
        <Text style={[styles.cardHeadSub, { color: filled ? "rgba(255,255,255,0.55)" : C.muted }]}>
          {sub}
        </Text>

        {filled && (
          <View style={styles.donePill}>
            <Ionicons name="checkmark" size={10} color="#fff" />
            <Text style={styles.donePillText}>완료</Text>
          </View>
        )}
        {!filled && isToday && (
          <View style={[styles.addPill, { backgroundColor: accent.soft, borderColor: accent.mid }]}>
            <Ionicons name="add" size={13} color={accent.main} />
            <Text style={[styles.addPillText, { color: accent.main }]}>기록하기</Text>
          </View>
        )}

        <Ionicons
          name="chevron-forward"
          size={14}
          color={filled ? "rgba(255,255,255,0.45)" : C.muted}
        />
      </View>

      {/* 카드 바디 */}
      {loading ? (
        <View style={styles.cardBodyLoading}>
          <ActivityIndicator size="small" color={accent.main} />
        </View>
      ) : error ? (
        <View style={styles.cardBodyError}>
          <Ionicons name="alert-circle-outline" size={14} color="#C0392B" />
          <Text style={styles.cardBodyErrorText}>데이터를 불러오지 못했어요. 당겨서 새로고침</Text>
        </View>
      ) : filled && children ? (
        <View style={styles.cardBody}>{children}</View>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function RecordScreen({ onNavigate, onOpenReport, refreshKey, selectedDate, onDateChange }) {
  const contentInsets = useTabContentInsets();
  const user = useAuthStore((state) => state.user);

  const minDate = useMemo(() => {
    if (!user?.created_at) return undefined;
    return fromDateStr(String(user.created_at).slice(0, 10));
  }, [user?.created_at]);

  const [markedDates, setMarkedDates] = useState({});

  const loadMonthStatus = useCallback(async (year, month) => {
    try {
      const data = await getMonthRecordStatus(year, month);
      setMarkedDates(data?.dates && typeof data.dates === "object" ? data.dates : {});
    } catch {
      setMarkedDates({});
    }
  }, []);

  const ctl = useDateNavigatorController({
    date: selectedDate,
    onDateChange,
    minDate,
    markedDates,
    onViewMonthChange: loadMonthStatus,
    refreshKey,
  });

  const [isCreatingAnalysis, setIsCreatingAnalysis] = useState(false);
  const [analysisRequestMessage, setAnalysisRequestMessage] = useState(null);
  const [analysisRequestError, setAnalysisRequestError] = useState(null);

  const dateStr          = toDateStr(selectedDate);
  const skinQuery        = useSkinLogQuery(dateStr);
  const dietQuery        = useDietLogsQuery(dateStr);
  const behaviorQuery    = useBehaviorLogQuery(dateStr);
  const environmentQuery = useEnvironmentLogsQuery(dateStr);

  const skinLog         = skinQuery.data ?? null;
  const dietLogs        = dietQuery.data ?? [];
  const behaviorLog     = behaviorQuery.data ?? null;
  const environmentLogs = environmentQuery.data ?? [];

  const isInitialLoad =
    skinQuery.isInitialLoad ||
    dietQuery.isInitialLoad ||
    behaviorQuery.isInitialLoad ||
    environmentQuery.isInitialLoad;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    useRecordCacheStore.getState().invalidateDate(dateStr);
    // 쿼리 재실행 완료를 기다리지 않고 짧은 딜레이 후 종료 (쿼리 훅이 자동 재실행)
    await new Promise((r) => setTimeout(r, 800));
    setIsRefreshing(false);
  }, [dateStr]);

  const apiStatus = {
    skin:        skinQuery.error        ? "rejected" : "fulfilled",
    diet:        dietQuery.error        ? "rejected" : "fulfilled",
    behavior:    behaviorQuery.error    ? "rejected" : "fulfilled",
    environment: environmentQuery.error ? "rejected" : "fulfilled",
  };

  const prevRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== prevRefreshKeyRef.current) {
      prevRefreshKeyRef.current = refreshKey;
      useRecordCacheStore.getState().invalidateDate(dateStr);
    }
  }, [refreshKey, dateStr]);

  const scrollRef = useRef(null);
  const prevDateStrRef = useRef(dateStr);
  useEffect(() => {
    if (dateStr !== prevDateStrRef.current) {
      prevDateStrRef.current = dateStr;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [dateStr]);

  const isToday            = dateStr === toDateStr(new Date());
  const skinLogId          = skinLog?.id ?? skinLog?.skin_log_id ?? null;
  const isFemale           = user?.gender === "여";
  const skinHasScore       = skinLog?.overall_score != null;
  const skinFullyConfirmed = skinHasScore && !!skinLog?.photo_url;
  const skinAiStatus       = useRecordCacheStore(
    (state) => (skinLogId ? (state.medgemmaStatusByLogId[skinLogId] ?? null) : null)
  );
  const showAnalysisCard = !isInitialLoad && skinHasScore && dietLogs.length > 0 && !!behaviorLog;

  const navigate = (target, queryKey) => () => {
    if (queryKey && apiStatus[queryKey] === "rejected") {
      useRecordCacheStore.getState().invalidateDate(dateStr);
    }
    onNavigate?.(target, selectedDate);
  };

  useEffect(() => {
    setAnalysisRequestMessage(null);
    setAnalysisRequestError(null);
    setIsCreatingAnalysis(false);
  }, [dateStr, skinLogId]);

  useEffect(() => {
    if (!skinLogId || !skinLog?.photo_url) return;
    if (useRecordCacheStore.getState().getMedgemmaStatus(skinLogId)) return;
    let cancelled = false;
    getSkinLogMedgemmaStatus(skinLogId)
      .then((data) => {
        if (cancelled || !data) return;
        if (data.status !== "none" && data.status !== "not_requested") {
          useRecordCacheStore.getState().setMedgemmaStatus(skinLogId, data);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [skinLogId, skinLog?.photo_url]);

  useEffect(() => {
    const TERMINAL = new Set(["done", "failed", "cancelled"]);
    const activeStatus = skinAiStatus?.status;
    if (!skinLogId || !activeStatus || TERMINAL.has(activeStatus)) return;
    let cancelled = false;
    let timerId = null;
    const poll = async () => {
      try {
        const data = await getSkinLogMedgemmaStatus(skinLogId);
        if (cancelled) return;
        if (data && data.status !== "none" && data.status !== "not_requested") {
          useRecordCacheStore.getState().setMedgemmaStatus(skinLogId, data);
          if (!TERMINAL.has(data.status)) timerId = setTimeout(poll, 8000);
        }
      } catch {
        if (!cancelled) timerId = setTimeout(poll, 12000);
      }
    };
    timerId = setTimeout(poll, 8000);
    return () => { cancelled = true; if (timerId) clearTimeout(timerId); };
  }, [skinLogId, skinAiStatus?.status]);

  const handleCreateAnalysis = async () => {
    if (!skinLogId || isCreatingAnalysis) return;
    setIsCreatingAnalysis(true);
    setAnalysisRequestMessage(null);
    setAnalysisRequestError(null);
    try {
      await createAnalysisRequest({ skin_log_id: skinLogId });
      setAnalysisRequestMessage("AI 분석 요청이 접수됐어요. 리포트에서 진행 상태를 확인할 수 있어요.");
    } catch (error) {
      const detail = error?.response?.data?.detail;
      const rawMessage = typeof detail === "string" ? detail : error?.message;
      if (typeof rawMessage === "string" && rawMessage.includes("analysis request already exists")) {
        setAnalysisRequestMessage("이 날짜 기록으로 요청한 AI 분석이 이미 있어요. 리포트에서 확인해 주세요.");
        return;
      }
      setAnalysisRequestError(
        typeof detail === "string" ? detail : "AI 분석 요청에 실패했어요. 잠시 후 다시 시도해 주세요."
      );
    } finally {
      setIsCreatingAnalysis(false);
    }
  };

  const skinTags = skinLog ? parseConditionTags(skinLog.condition_tags) : [];

  const behaviorDescription = (() => {
    if (!behaviorLog) return null;
    return `수면 ${behaviorLog.sleep_hours ?? "-"}시간 · 스트레스 ${behaviorLog.stress_level ?? "-"}점`;
  })();

  const environmentDescription = (() => {
    if (environmentLogs.length === 0) return null;
    const latest = environmentLogs[0];
    const parts = [`기록 ${environmentLogs.length}건`];
    if (latest.temperature != null) parts.push(`${latest.temperature}℃`);
    if (latest.weather) parts.push(latest.weather);
    return parts.join(" · ");
  })();

  const manageSections = [
    { title: "사용 화장품", icon: "flask-outline",  navigateTo: "myCosmetics",   accent: ACCENT.cosmetics   },
    { title: "약물 관리",   icon: "medkit-outline", navigateTo: "myMedications", accent: ACCENT.medications },
    ...(isFemale ? [{ title: "생리 주기", icon: "flower-outline", navigateTo: "periodLogs", accent: ACCENT.period }] : []),
  ];

  const allPhotoUrls = useMemo(() => {
    const urls = [];
    if (isSupportedImageUri(skinLog?.photo_url)) urls.push(skinLog.photo_url);
    dietLogs.forEach((log) => { if (isSupportedImageUri(log.photo_url)) urls.push(log.photo_url); });
    return urls;
  }, [skinLog, dietLogs]);

  // 오늘 기록 진행도
  const filledCount = [
    skinHasScore,
    dietLogs.length > 0,
    !!behaviorLog,
    environmentLogs.length > 0,
  ].filter(Boolean).length;

  return (
    <View style={styles.flex}>
      <View style={styles.preloaderClip} pointerEvents="none">
        {allPhotoUrls.map((uri, i) => (
          <Image key={`preload-${i}-${uri}`} source={{ uri }} style={styles.preloadImage} />
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.root}
        contentContainerStyle={[styles.content, contentInsets]}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={C.olive}
            colors={[C.olive]}
          />
        }
      >
        {/* 0: 히어로 — 스크롤 시 위로 사라짐 */}
        <View style={styles.heroWrap}>
          <DateNavigatorHero ctl={ctl} />
          <View style={styles.heroDivider} />
        </View>

        {/* 1: 주간 스트립 — 히어로가 사라지면 상단 고정 */}
        <View style={styles.stickyStrip}>
          <DateNavigatorStrip ctl={ctl} />
        </View>

        {/* 일간 진행 상태 */}
        {!isInitialLoad && (
          <View style={styles.progressRow}>
            <View style={styles.progressDots}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[styles.progressDot, i < filledCount && styles.progressDotOn]}
                />
              ))}
            </View>
            <Text style={styles.progressText}>
              {isToday
                ? filledCount === 4
                  ? "오늘 기록 모두 완료"
                  : `오늘 ${filledCount} / 4 기록됨`
                : filledCount === 0
                ? "기록 없음"
                : `${filledCount} / 4 기록됨`}
            </Text>
          </View>
        )}

        {/* ── 피부 ── */}
        <SectionCard
          accent={ACCENT.skin}
          label="피부"
          sub="SKIN"
          filled={skinHasScore}
          isToday={isToday}
          loading={isInitialLoad}
          error={!isInitialLoad && apiStatus.skin === "rejected"}
          onPress={navigate("skinLogEntry", "skin")}
        >
          <SkinStatusVisual
            skinStatus={{
              score:    skinLog?.overall_score ?? null,
              tags:     skinTags,
              hasPhoto: !!skinLog?.photo_url,
            }}
            skinAiStatus={skinAiStatus}
          />
        </SectionCard>

        {/* ── 식단 ── */}
        <SectionCard
          accent={ACCENT.diet}
          label="식단"
          sub="DIET"
          filled={dietLogs.length > 0}
          isToday={isToday}
          loading={isInitialLoad}
          error={!isInitialLoad && apiStatus.diet === "rejected"}
          onPress={navigate("dietLogEntry", "diet")}
        >
          {formatDietLines(dietLogs).length > 0 && (
            <Text style={styles.bodyText}>
              {formatDietLines(dietLogs).join("  ·  ")}
            </Text>
          )}
        </SectionCard>

        {/* ── 생활 ── */}
        <SectionCard
          accent={ACCENT.behavior}
          label="생활"
          sub="BEHAVIOR"
          filled={!!behaviorLog}
          isToday={isToday}
          loading={isInitialLoad}
          error={!isInitialLoad && apiStatus.behavior === "rejected"}
          onPress={navigate("behaviorLogEntry", "behavior")}
        >
          {behaviorDescription ? (
            <Text style={styles.bodyText}>{behaviorDescription}</Text>
          ) : null}
        </SectionCard>

        {/* ── 환경 ── */}
        <SectionCard
          accent={ACCENT.environment}
          label="환경"
          sub="ENVIRONMENT"
          filled={environmentLogs.length > 0}
          isToday={isToday}
          loading={isInitialLoad}
          error={!isInitialLoad && apiStatus.environment === "rejected"}
          onPress={navigate("environmentLogs", "environment")}
        >
          {environmentDescription ? (
            <Text style={styles.bodyText}>{environmentDescription}</Text>
          ) : null}
        </SectionCard>

        {/* ── AI 분석 ── */}
        {showAnalysisCard && (
          <View style={styles.aiCard}>
            <View style={styles.aiIconWrap}>
              <Ionicons name="sparkles" size={17} color={C.olive} />
            </View>
            <View style={styles.aiTextWrap}>
              <Text style={styles.aiTitle}>AI 리포트</Text>
              {analysisRequestMessage ? (
                <Text style={styles.aiSuccess}>{analysisRequestMessage}</Text>
              ) : analysisRequestError ? (
                <Text style={styles.aiError}>{analysisRequestError}</Text>
              ) : (
                <Text style={styles.aiDesc}>최근 14일 기록 기반 피부 분석</Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.aiBtn, (!skinLogId || isCreatingAnalysis) && styles.aiBtnOff]}
              onPress={analysisRequestMessage ? onOpenReport : handleCreateAnalysis}
              disabled={!skinLogId || isCreatingAnalysis}
              activeOpacity={0.8}
            >
              {isCreatingAnalysis
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.aiBtnText}>{analysisRequestMessage ? "리포트 보기" : "분석 요청"}</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── MANAGE ── */}
        <Text style={styles.manageLabel}>MANAGE</Text>
        <View style={styles.manageRow}>
          {manageSections.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={[
                styles.manageChip,
                { backgroundColor: item.accent.soft, borderColor: item.accent.mid },
              ]}
              onPress={navigate(item.navigateTo)}
              activeOpacity={0.78}
            >
              <View style={[styles.manageChipIcon, { backgroundColor: item.accent.main }]}>
                <Ionicons name={item.icon} size={13} color="#fff" />
              </View>
              <Text style={[styles.manageChipText, { color: item.accent.main }]}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

// ─── 스타일 ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex:          { flex: 1 },
  root:          { flex: 1, backgroundColor: C.bg },
  preloaderClip: { position: "absolute", top: 0, left: 0, width: 1, height: 1, overflow: "hidden" },
  preloadImage:  { width: 300, height: 300 },
  content:     { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  heroWrap:    {},
  heroDivider: { height: 1, backgroundColor: C.line, marginHorizontal: 2 },
  stickyStrip: { backgroundColor: C.bg, paddingHorizontal: 2, paddingTop: 2, paddingBottom: 8 },

  // ── 진행 상태 바 ──
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  progressDots: { flexDirection: "row", gap: 5 },
  progressDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.line,
  },
  progressDotOn: { backgroundColor: C.olive },
  progressText: { fontSize: 12, fontWeight: "600", color: C.muted },

  // ── 섹션 카드 ──
  card: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.card,
    marginBottom: 10,
    overflow: "hidden",
    ...shadow,
  },
  cardEmptyToday: {
    borderColor: C.line,
  },
  cardEmptyPast: {
    opacity: 0.58,
    borderColor: C.line,
  },

  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  cardHeadIcon: {
    width: 30, height: 30, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  cardHeadLabel: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  cardHeadSub: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.3,
    flex: 1,
    marginBottom: 1,
  },
  donePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  donePillText: {
    fontSize: 10, fontWeight: "800", color: "#fff",
  },
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  addPillText: { fontSize: 11, fontWeight: "700" },

  cardBody: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
    gap: 8,
  },
  cardBodyLoading: {
    paddingVertical: 14,
    alignItems: "center",
  },
  cardBodyError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cardBodyErrorText: {
    fontSize: 12,
    color: "#C0392B",
    flex: 1,
  },

  // ── 피부 점수 ──
  skinScoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
  },
  scoreNum: {
    fontSize: 30, fontWeight: "900",
    letterSpacing: -2, lineHeight: 34,
    includeFontPadding: false,
  },
  scoreUnit: { fontSize: 13, fontWeight: "700", color: C.muted },
  scoreSep:  { fontSize: 13, color: C.line },
  scoreMeta: { fontSize: 12, fontWeight: "500", color: C.muted },

  // ── 태그 ──
  tagRow:  { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tagPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  tagText: { fontSize: 11, fontWeight: "700" },

  // ── 바디 텍스트 ──
  bodyText: {
    fontSize: 13, fontWeight: "500",
    color: C.text, lineHeight: 20,
  },

  // ── AI 분석 ──
  aiCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.oliveMid,
    padding: 14,
    marginTop: 4,
    marginBottom: 10,
    ...shadow,
  },
  aiIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.oliveSoft,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  aiTextWrap: { flex: 1, gap: 2 },
  aiTitle:   { fontSize: 13, fontWeight: "800", color: C.text },
  aiDesc:    { fontSize: 11, fontWeight: "500", color: C.muted },
  aiSuccess: { fontSize: 11, fontWeight: "600", color: C.olive, lineHeight: 16 },
  aiError:   { fontSize: 11, fontWeight: "600", color: ACCENT.medications.main, lineHeight: 16 },
  aiBtn: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 12, backgroundColor: C.olive,
  },
  aiBtnOff:  { opacity: 0.5 },
  aiBtnText: { fontSize: 12, fontWeight: "800", color: "#fff" },

  // ── MANAGE ──
  manageLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: C.muted,
    letterSpacing: 1.6,
    marginBottom: 10,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  manageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  manageChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  manageChipIcon: {
    width: 22, height: 22, borderRadius: 7,
    alignItems: "center", justifyContent: "center",
  },
  manageChipText: { fontSize: 13, fontWeight: "700" },
});

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";

import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { createAnalysisRequest } from "../../../api/analysis";
import { getMonthRecordStatus } from "../../../api/records";
import {
  useBehaviorLogQuery,
  useDietLogsQuery,
  useEnvironmentLogsQuery,
  useSkinLogQuery,
} from "../../../hooks/useRecordQueries";
import useRecordCacheStore from "../../../stores/recordCacheStore";

import DateNavigator, { fromDateStr, toDateStr } from "./components/DateNavigator";

import RecordCard from "./components/RecordCard";

import RecordVisualCard from "./components/RecordVisualCard";

import useAuthStore from "../../../stores/authStore";

import useTabContentInsets from "../../../hooks/useTabContentInsets";

import { buildMealSlots, formatDietSummary } from "./dietDisplay";

import { parseConditionTags } from "./skinConstants";
import { RECORD_COLORS } from "./components/SubScreenLayout";
import { isSupportedImageUri } from "../../components/AuthImage";



export default function RecordScreen({ onNavigate, onOpenReport, refreshKey, selectedDate, onDateChange }) {

  const contentInsets = useTabContentInsets();

  const user = useAuthStore((state) => state.user);

  const minDate = useMemo(() => {

    if (!user?.created_at) return undefined;

    const datePart = String(user.created_at).slice(0, 10);

    return fromDateStr(datePart);

  }, [user?.created_at]);



  const [markedDates, setMarkedDates] = useState({});
  const [isCreatingAnalysis, setIsCreatingAnalysis] = useState(false);
  const [analysisRequestMessage, setAnalysisRequestMessage] = useState(null);
  const [analysisRequestError, setAnalysisRequestError] = useState(null);
  const dateStr = toDateStr(selectedDate);
  const skinQuery = useSkinLogQuery(dateStr);
  const dietQuery = useDietLogsQuery(dateStr);
  const behaviorQuery = useBehaviorLogQuery(dateStr);
  const environmentQuery = useEnvironmentLogsQuery(dateStr);

  const skinLog = skinQuery.data ?? null;
  const dietLogs = dietQuery.data ?? [];
  const behaviorLog = behaviorQuery.data ?? null;
  const environmentLogs = environmentQuery.data ?? [];
  const isInitialLoad =
    skinQuery.isInitialLoad ||
    dietQuery.isInitialLoad ||
    behaviorQuery.isInitialLoad ||
    environmentQuery.isInitialLoad;
  const isRefreshing =
    skinQuery.isRefreshing ||
    dietQuery.isRefreshing ||
    behaviorQuery.isRefreshing ||
    environmentQuery.isRefreshing;

  const apiStatus = {
    skin: skinQuery.error ? "rejected" : "fulfilled",
    diet: dietQuery.error ? "rejected" : "fulfilled",
    behavior: behaviorQuery.error ? "rejected" : "fulfilled",
    environment: environmentQuery.error ? "rejected" : "fulfilled",
  };

  const prevRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== prevRefreshKeyRef.current) {
      prevRefreshKeyRef.current = refreshKey;
      useRecordCacheStore.getState().invalidateDate(dateStr);
    }
  }, [refreshKey, dateStr]);

  const loadMonthStatus = useCallback(async (year, month) => {
    try {
      const data = await getMonthRecordStatus(year, month);
      setMarkedDates(data?.dates && typeof data.dates === "object" ? data.dates : {});
    } catch {
      setMarkedDates({});
    }
  }, []);

  const isToday = dateStr === toDateStr(new Date());
  const skinLogId = skinLog?.id ?? skinLog?.skin_log_id ?? null;
  const isFemale = user?.gender === "여";
  const skinHasScore = skinLog?.overall_score != null;
  const skinFullyConfirmed = skinHasScore && !!skinLog?.photo_url;
  const skinScoreOnly = skinHasScore && !skinLog?.photo_url;

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

  const handleCreateAnalysis = async () => {
    if (!skinLogId || isCreatingAnalysis) return;

    setIsCreatingAnalysis(true);
    setAnalysisRequestMessage(null);
    setAnalysisRequestError(null);

    try {
      await createAnalysisRequest({
        skin_log_id: skinLogId,
        lookback_days: 14,
        trigger_type: "worse",
      });

      setAnalysisRequestMessage("AI 분석 요청이 접수되었습니다. 리포트에서 진행 상태를 확인할 수 있어요.");
    } catch (error) {
      const detail = error?.response?.data?.detail;
      const rawMessage = typeof detail === "string" ? detail : error?.message;
      const isDuplicateAnalysisRequest =
        typeof rawMessage === "string" && rawMessage.includes("analysis request already exists");

      if (isDuplicateAnalysisRequest) {
        setAnalysisRequestMessage("이 날짜의 피부 기록으로 요청한 AI 분석이 이미 있어요. 리포트에서 확인해 주세요.");
        return;
      }

      const message =
        typeof detail === "string"
          ? detail
          : "AI 분석 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      setAnalysisRequestError(message);
    } finally {
      setIsCreatingAnalysis(false);
    }
  };

  const skinTags = skinLog ? parseConditionTags(skinLog.condition_tags) : [];



  const skinDescription = (() => {

    if (isInitialLoad) return "불러오는 중...";

    if (apiStatus.skin === "rejected") return "데이터를 불러오는데 실패했습니다.";

    if (skinHasScore) {

      const parts = [`피부 점수 ${skinLog.overall_score}점`];

      if (skinTags.length > 0) parts.push(`태그 ${skinTags.length}개`);

      if (skinLog.photo_url) parts.push("사진 있음");
      else parts.push("사진 없음 · 추가 가능");

      return parts.join(" · ");

    }

    if (isToday && skinLog?.photo_url) {
      return "사진 기반 추천 점수를 확인하고 저장하면 오늘 기록이 확정됩니다.";
    }

    return isToday

      ? "점수와 태그로 오늘 피부 상태를 기록해 보세요."

      : "이 날 피부 기록이 없습니다.";

  })();



  const behaviorDescription = (() => {

    if (isInitialLoad) return "불러오는 중...";

    if (apiStatus.behavior === "rejected") return "데이터를 불러오는데 실패했습니다.";

    if (behaviorLog) {

      return `수면 ${behaviorLog.sleep_hours ?? "-"}시간 · 스트레스 ${behaviorLog.stress_level ?? "-"}점`;

    }

    return isToday

      ? "수면, 스트레스, 운동 등 생활 정보를 기록해 보세요."

      : "이 날 생활 기록이 없습니다.";

  })();



  const dietDescription = (() => {

    if (isInitialLoad) return "불러오는 중...";

    if (apiStatus.diet === "rejected") return "데이터를 불러오는데 실패했습니다.";

    const summary = formatDietSummary(dietLogs);

    if (summary) return summary;

    return isToday

      ? "아침·점심·저녁 식단을 기록해 보세요."

      : "이 날 식단 기록이 없습니다.";

  })();



  const mealSlots = buildMealSlots(dietLogs);



  const environmentDescription = (() => {

    if (isInitialLoad) return "불러오는 중...";

    if (apiStatus.environment === "rejected") return "데이터를 불러오는데 실패했습니다.";

    if (environmentLogs.length > 0) {

      const latest = environmentLogs[0];

      const parts = [`기록 ${environmentLogs.length}건`];

      if (latest.temperature != null) parts.push(`${latest.temperature}℃`);

      if (latest.weather) parts.push(latest.weather);

      return parts.join(" · ");

    }

    return isToday

      ? "위치 포함 식단 기록 시 자동 생성됩니다."

      : "이 날 환경 로그가 없습니다.";

  })();



  const manageSections = [

    {

      title: "사용 화장품",

      description: "화장품 등록·성분 확인",

      icon: "flask-outline",

      navigateTo: "myCosmetics",

    },

    {

      title: "약물 관리",

      description: "복용 약물 등록·피부 영향 확인",

      icon: "medkit-outline",

      navigateTo: "myMedications",

    },

    ...(isFemale
      ? [
          {
            title: "생리 주기",
            description: "시작일 기록으로 피부 분석에 반영",
            icon: "flower-outline",
            navigateTo: "periodLogs",
          },
        ]
      : []),

  ];



  const allPhotoUrls = useMemo(() => {
    const urls = [];
    if (isSupportedImageUri(skinLog?.photo_url)) urls.push(skinLog.photo_url);
    dietLogs.forEach((log) => { if (isSupportedImageUri(log.photo_url)) urls.push(log.photo_url); });
    return urls;
  }, [skinLog, dietLogs]);

  return (
    <View style={styles.flex}>
      <View style={styles.preloaderClip} pointerEvents="none">
        {allPhotoUrls.map((uri, photoIndex) => (
          <Image
            key={`preload-photo-${String(photoIndex)}-${String(uri ?? "unknown")}`}
            source={{ uri }}
            style={styles.preloadImage}
          />
        ))}
      </View>

      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, contentInsets]}
        showsVerticalScrollIndicator={false}
      >

      <View style={styles.headerRow}>

        <Text style={styles.title}>기록</Text>

        {isRefreshing && <ActivityIndicator size="small" color={RECORD_COLORS.olive} />}

      </View>

      <Text style={styles.description}>

        날짜를 이동하며 피부·생활·식단 기록을 확인하세요.

      </Text>



      <View style={styles.dateNavWrap}>

        <DateNavigator

          date={selectedDate}

          onDateChange={onDateChange}

          minDate={minDate}

          markedDates={markedDates}

          onViewMonthChange={loadMonthStatus}

          refreshKey={refreshKey}

        />

      </View>



      <Text style={styles.sectionLabel}>{isToday ? "오늘의 기록" : "이 날의 기록"}</Text>

      <View style={styles.cardList}>

        <RecordVisualCard

          title="피부 기록"

          description={skinDescription}

          icon="happy-outline"

          badge={skinFullyConfirmed}
          badgePartial={skinScoreOnly}

          visualType="skin"

          skinStatus={

            skinLog

              ? {

                  score: skinLog.overall_score ?? null,

                  tags: skinTags,

                  hasPhoto: !!skinLog.photo_url,

                }

              : null

          }

          skinEmptyLabel={isToday ? "피부 상태를 기록해 보세요" : "기록 없음"}

          onPress={navigate("skinLogEntry", "skin")}

        />



        <RecordVisualCard

          title="식단 기록"

          description={dietDescription}

          icon="restaurant-outline"

          badge={dietLogs.length > 0}

          visualType="meals"

          mealSlots={mealSlots}

          onPress={navigate("dietLogEntry", "diet")}

        />



        <RecordCard

          title="생활 기록"

          description={behaviorDescription}

          icon="pulse-outline"

          badge={!!behaviorLog}

          onPress={navigate("behaviorLogEntry", "behavior")}

        />

        <RecordCard

          title="주변 환경"

          description={environmentDescription}

          icon="cloud-outline"

          badge={environmentLogs.length > 0}

          onPress={navigate("environmentLogs", "environment")}

        />

      </View>

      {skinHasScore ? (
        <View style={styles.analysisCard}>
          <View style={styles.analysisTextWrap}>
            <Text style={styles.analysisTitle}>AI 리포트</Text>
            <Text style={styles.analysisDescription}>
              선택한 날짜의 피부 기록을 기준으로 최근 14일 기록을 함께 분석합니다.
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.analysisButton,
              (!skinLogId || isCreatingAnalysis) && styles.analysisButtonDisabled,
            ]}
            activeOpacity={0.82}
            onPress={analysisRequestMessage ? onOpenReport : handleCreateAnalysis}
            disabled={!skinLogId || isCreatingAnalysis}
          >
            {isCreatingAnalysis ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.analysisButtonText}>
                {analysisRequestMessage ? "리포트에서 진행 보기" : "이 날짜 기준 AI 분석 요청"}
              </Text>
            )}
          </TouchableOpacity>
          {!skinLogId ? (
            <Text style={styles.analysisErrorText}>피부 기록 ID를 확인할 수 없어 분석을 요청할 수 없습니다.</Text>
          ) : null}
          {analysisRequestMessage ? (
            <Text style={styles.analysisSuccessText}>{analysisRequestMessage}</Text>
          ) : null}
          {analysisRequestError ? (
            <Text style={styles.analysisErrorText}>{analysisRequestError}</Text>
          ) : null}
        </View>
      ) : null}



      <Text style={styles.sectionLabel}>관리</Text>

      <View style={styles.manageList}>

        {manageSections.map((item) => (

          <RecordCard

            key={item.title}

            title={item.title}

            description={item.description}

            icon={item.icon}

            badge={item.badge}

            compact

            onPress={navigate(item.navigateTo)}

          />

        ))}

      </View>

      </ScrollView>
    </View>
  );
}



const styles = StyleSheet.create({

  flex: { flex: 1 },

  root: { flex: 1, backgroundColor: RECORD_COLORS.bg },

  preloaderClip: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    overflow: "hidden",
  },

  preloadImage: { width: 300, height: 300 },

  content: { paddingHorizontal: 22, paddingBottom: 24 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  title: { fontSize: 28, lineHeight: 36, fontWeight: "900", color: RECORD_COLORS.text },

  description: { marginTop: 8, fontSize: 14.5, lineHeight: 22, fontWeight: "600", color: RECORD_COLORS.muted },

  dateNavWrap: { marginTop: 16, marginBottom: 8 },

  sectionLabel: {

    marginTop: 8,

    marginBottom: 10,

    fontSize: 13,

    fontWeight: "800",

    color: RECORD_COLORS.olive,

    letterSpacing: 0.3,

  },

  cardList: { marginTop: 4 },

  analysisCard: {
    borderRadius: 18,
    backgroundColor: "#FFFCF7",
    borderWidth: 1,
    borderColor: "#D9D6CC",
    padding: 16,
    marginBottom: 14,
  },

  analysisTextWrap: { marginBottom: 12 },

  analysisTitle: { fontSize: 15, lineHeight: 20, fontWeight: "900", color: RECORD_COLORS.text },

  analysisDescription: {
    marginTop: 4,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
    color: RECORD_COLORS.muted,
  },

  analysisButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: RECORD_COLORS.olive,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  analysisButtonDisabled: { opacity: 0.52 },

  analysisButtonText: { fontSize: 14, lineHeight: 19, fontWeight: "900", color: "#FFFFFF" },

  analysisSuccessText: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: RECORD_COLORS.olive,
  },

  analysisErrorText: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: "#B15A3B",
  },

  manageList: { marginTop: 4 },

});



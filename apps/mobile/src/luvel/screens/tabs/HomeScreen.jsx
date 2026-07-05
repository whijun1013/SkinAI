import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";

import useAuthStore from "../../../stores/authStore";
import useTabContentInsets from "../../../hooks/useTabContentInsets";
import { getNotificationUnreadCount } from "../../../api/notifications";
import { toDateStr } from "../record/components/DateNavigator";
import { formatDietSummary } from "../record/dietDisplay";
import { formatBehaviorSummary } from "../record/behaviorConstants";
import { SCORE_LABELS } from "../record/skinConstants";
import {
  useBehaviorLogQuery,
  useDietLogsQuery,
  useEnvironmentLogsQuery,
  useSkinLogQuery,
} from "../../../hooks/useRecordQueries";
import useRecordCacheStore from "../../../stores/recordCacheStore";
import { setAppIconBadgeCount } from "../../utils/pushNotifications";



const COLORS = {

  bg: "#F8F7F2",

  card: "#FFFCF7",

  chip: "#FCFAF6",

  oliveSoft: "#E8EEDD",

  olive: "#4F603C",

  oliveSecondary: "#4A5D4E",

  text: "#1F2520",

  muted: "#8B9184",

  line: "#D9D6CC",

  white: "#FFFFFF",

};



function TodayCheckItem({ label, icon, done, hint, onPress, loading }) {

  return (

    <TouchableOpacity

      activeOpacity={0.82}

      style={[styles.checkItem, done && styles.checkItemDone]}

      onPress={onPress}

      disabled={!onPress}

    >

      <View style={[styles.checkIconWrap, done && styles.checkIconWrapDone]}>

        <Ionicons

          name={done ? "checkmark" : icon}

          size={16}

          color={done ? COLORS.white : COLORS.olive}

        />

      </View>

      <Text style={[styles.checkLabel, done && styles.checkLabelDone]}>{label}</Text>

      <Text style={styles.checkHint} numberOfLines={1}>

        {loading ? "..." : hint}

      </Text>

    </TouchableOpacity>

  );

}



export default function HomeScreen({
  onSkinCamera,
  onDietCamera,
  onNavigateRecord,
  onOpenNotifications,
  onOpenReport,
  isActive = true,
  refreshKey,
}) {
  const contentInsets = useTabContentInsets();
  const { user: authUser } = useAuthStore();
  const userName = authUser?.name || "사용자";
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadRefreshInFlightRef = useRef(false);
  const prevRefreshKeyRef = useRef(refreshKey);

  const todayStr = toDateStr(new Date());
  const skinQuery = useSkinLogQuery(todayStr);
  const dietQuery = useDietLogsQuery(todayStr);
  const behaviorQuery = useBehaviorLogQuery(todayStr);
  const environmentQuery = useEnvironmentLogsQuery(todayStr);

  const todaySkin = skinQuery.data ?? null;
  const todayBehavior = behaviorQuery.data ?? null;
  const todayDietLogs = dietQuery.data ?? [];
  const environmentLogs = environmentQuery.data ?? [];
  const latestEnv = environmentLogs.length > 0 ? environmentLogs[0] : null;

  const recordsInitialLoad =
    skinQuery.isInitialLoad || dietQuery.isInitialLoad || behaviorQuery.isInitialLoad;
  const envInitialLoad = environmentQuery.isInitialLoad;

  useEffect(() => {
    if (refreshKey !== prevRefreshKeyRef.current) {
      prevRefreshKeyRef.current = refreshKey;
      useRecordCacheStore.getState().invalidateToday();
    }
  }, [refreshKey]);

  const refreshUnreadCount = useCallback(() => {
    if (!isActive) return;
    if (unreadRefreshInFlightRef.current) return;

    unreadRefreshInFlightRef.current = true;
    getNotificationUnreadCount()
      .then((data) => {
        const nextCount = Number(data?.unread_count);
        const safeCount = Number.isFinite(nextCount) && nextCount > 0 ? nextCount : 0;
        setUnreadCount(safeCount);
        setAppIconBadgeCount(safeCount);
      })
      .catch((error) => {
        console.warn("[Notifications] failed to load unread count", error?.response?.status || error?.message);
      })
      .finally(() => {
        unreadRefreshInFlightRef.current = false;
      });
  }, [isActive]);

  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (!isActive) return undefined;

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        refreshUnreadCount();
      }
    });
    const notificationSubscription = Notifications.addNotificationReceivedListener(() => {
      refreshUnreadCount();
    });

    return () => {
      appStateSubscription?.remove?.();
      notificationSubscription?.remove?.();
    };
  }, [isActive, refreshUnreadCount]);

  const unreadBadgeText = unreadCount > 99 ? "99+" : String(unreadCount);

  const apiStatus = {
    skin: skinQuery.error ? "rejected" : "fulfilled",
    behavior: behaviorQuery.error ? "rejected" : "fulfilled",
    diet: dietQuery.error ? "rejected" : "fulfilled",
    env: environmentQuery.error ? "rejected" : "fulfilled",
  };



  const skinHasScore = todaySkin?.overall_score != null;
  const skinFullyRecorded = skinHasScore && !!todaySkin?.photo_url;
  const skinScoreOnly = skinHasScore && !todaySkin?.photo_url;
  const skinRecorded = skinFullyRecorded;

  const dietSummary = formatDietSummary(todayDietLogs);

  const hasDietLogToday = todayDietLogs.length > 0;

  // useBehaviorLogQuery(todayStr) 은 로컬 날짜 기준으로 조회하므로
  // 응답이 존재하면 곧 오늘 기록임 — 서버의 is_today(UTC) 에 의존하지 않음
  const behaviorForToday = todayBehavior ?? null;

  const behaviorRecorded = !!(

    behaviorForToday?.sleep_hours != null

    || behaviorForToday?.stress_level != null

    || behaviorForToday?.exercise_yn != null

    || behaviorForToday?.water_intake_ml != null

  );

  const completedCount = [skinRecorded, hasDietLogToday, behaviorRecorded].filter(Boolean).length;



  const skinHint = (() => {

    if (apiStatus.skin === "rejected") return "불러오기 실패";

    if (!todaySkin?.overall_score) return "기록 대기";

    const label = SCORE_LABELS[todaySkin.overall_score] ?? "";
    const scoreText = label ? `${todaySkin.overall_score}점 · ${label}` : `${todaySkin.overall_score}점`;
    if (skinScoreOnly) return `${scoreText} · 사진 추가`;
    return scoreText;

  })();



  const dietHint = (() => {

    if (apiStatus.diet === "rejected") return "불러오기 실패";

    return dietSummary || "기록 대기";

  })();



  const behaviorHint = (() => {
    if (apiStatus.behavior === "rejected") return "불러오기 실패";
    if (!behaviorRecorded) return "기록 대기";
    return formatBehaviorSummary(behaviorForToday) || "입력 완료";
  })();



  const getBehaviorText = (val, suffix) => {

    if (apiStatus.behavior === "rejected") return "불러오기 실패";

    if (val != null) return `${val}${suffix}`;

    return "기록 대기";

  };

  const getBehaviorBoolText = (val, trueText, falseText) => {

    if (apiStatus.behavior === "rejected") return "불러오기 실패";

    if (val === true) return trueText;

    if (val === false) return falseText;

    return "기록 대기";

  };



  const lifestyleItems = [
    {
      key: "sleep",
      label: "수면",
      value: getBehaviorText(behaviorForToday?.sleep_hours, "시간"),
      icon: "moon-outline",
      target: "behaviorLogEntry",
      queryKey: "behavior",
    },
    {
      key: "meal",
      label: "식단",
      value: apiStatus.diet === "rejected" ? "불러오기 실패" : dietSummary || "기록 대기",
      icon: "restaurant-outline",
      target: "dietLogEntry",
      queryKey: "diet",
    },
    {
      key: "exercise",
      label: "운동",
      value: getBehaviorBoolText(behaviorForToday?.exercise_yn, "완료", "안함"),
      icon: "barbell-outline",
      target: "behaviorLogEntry",
      queryKey: "behavior",
    },
    {
      key: "water",
      label: "수분",
      value: getBehaviorText(behaviorForToday?.water_intake_ml, "ml"),
      icon: "water-outline",
      target: "behaviorLogEntry",
      queryKey: "behavior",
    },
    {
      key: "stress",
      label: "스트레스",
      value: getBehaviorText(behaviorForToday?.stress_level, "점"),
      icon: "pulse-outline",
      target: "behaviorLogEntry",
      queryKey: "behavior",
    },
  ];



  const getEnvText = (val, suffix) => {
    if (envInitialLoad) return "...";
    if (apiStatus.env === "rejected") return "오류";
    if (val != null) return `${val}${suffix}`;
    return "-";
  };



  const environmentItems = latestEnv

    ? [

        { key: "temperature", label: "온도", value: getEnvText(latestEnv.temperature, "℃") },

        { key: "humidity", label: "습도", value: getEnvText(latestEnv.humidity, "%") },

        { key: "uv", label: "UV", value: getEnvText(latestEnv.uv_index, "") },

        { key: "pm25", label: "미세먼지", value: getEnvText(latestEnv.pm25, "") },

      ]

    : [

        { key: "temperature", label: "온도", value: envInitialLoad ? "..." : apiStatus.env === "rejected" ? "오류" : "-" },

        { key: "humidity", label: "습도", value: envInitialLoad ? "..." : apiStatus.env === "rejected" ? "오류" : "-" },

        { key: "uv", label: "UV", value: envInitialLoad ? "..." : apiStatus.env === "rejected" ? "오류" : "-" },

        { key: "pm25", label: "미세먼지", value: envInitialLoad ? "..." : apiStatus.env === "rejected" ? "오류" : "-" },

      ];



  const openRecord = (target, queryKey) => () => {
    if (queryKey && apiStatus[queryKey] === "rejected") {
      useRecordCacheStore.getState().invalidateToday();
    }
    onNavigateRecord?.(target);
  };



  const heroMessage = (() => {
    if (recordsInitialLoad) return "오늘 기록을 불러오는 중이에요.";
    if (apiStatus.skin === "rejected") return "피부 기록을 불러오지 못했어요.";
    if (completedCount === 3) return "오늘 기록을 모두 마쳤어요. 수고 많았어요!";
    if (skinFullyRecorded) return "피부 기록은 끝났어요. 식단·생활도 이어가 볼까요?";
    if (skinScoreOnly) return "점수는 저장됐어요. 사진도 함께 남겨볼까요?";
    return "오늘 피부 기록이 아직 없어요.";
  })();

  const headerSubtitle = (() => {
    if (recordsInitialLoad) return "오늘 기록을 불러오고 있어요.";
    if (completedCount === 3) return "오늘 할 일은 모두 끝났어요.";
    if (completedCount > 0) return `오늘 기록 ${completedCount}/3 — 이어서 채워볼까요?`;
    return "오늘 피부 컨디션을 가볍게 기록해볼까요?";
  })();



  return (

    <ScrollView

      style={styles.root}

      contentContainerStyle={[styles.content, contentInsets]}

      showsVerticalScrollIndicator={false}

    >

      <View style={styles.header}>

        <View>

          <Text style={styles.greeting}>안녕하세요, {userName}님</Text>

          <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>

        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            activeOpacity={0.78}
            style={styles.headerIcon}
            onPress={() => onOpenNotifications?.()}
            disabled={!onOpenNotifications}
          >
            <Ionicons name="notifications-outline" size={22} color={COLORS.olive} />
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadBadgeText}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

      </View>



      <View style={styles.heroCard}>

        <View style={styles.cardHeader}>

          <View style={styles.cardTitleBlock}>

            <Text style={styles.cardTitle}>오늘 피부 기록</Text>

            <Text style={styles.cardDescription}>
              매일 한 장씩 쌓인 기록이 피부 변화를 보여줘요.
            </Text>

          </View>

          <View style={styles.cardIcon}>

            <Ionicons name="sparkles-outline" size={24} color={COLORS.olive} />

          </View>

        </View>



        <View style={styles.statusBox}>

          <View

            style={[

              styles.statusDot,

              { backgroundColor: skinFullyRecorded ? COLORS.olive : skinScoreOnly ? "#D4A72C" : COLORS.muted },

            ]}

          />

          <Text style={styles.statusText}>{heroMessage}</Text>

        </View>



        <View style={styles.progressRow}>

          <Text style={styles.progressLabel}>오늘 채운 기록</Text>

          <Text style={styles.progressValue}>

            {recordsInitialLoad ? "-" : `${completedCount}/3`}

          </Text>

        </View>



        <View style={styles.checkRow}>

          <TodayCheckItem

            label="피부"

            icon="happy-outline"

            done={skinFullyRecorded}

            hint={skinHint}

            onPress={onNavigateRecord ? openRecord("skinLogEntry", "skin") : undefined}

            loading={recordsInitialLoad}

          />

          <TodayCheckItem

            label="식단"

            icon="restaurant-outline"

            done={hasDietLogToday}

            hint={dietHint}

            onPress={onNavigateRecord ? openRecord("dietLogEntry", "diet") : undefined}

            loading={recordsInitialLoad}

          />

          <TodayCheckItem

            label="생활"

            icon="pulse-outline"

            done={behaviorRecorded}

            hint={behaviorHint}

            onPress={onNavigateRecord ? openRecord("behaviorLogEntry", "behavior") : undefined}

            loading={recordsInitialLoad}

          />

        </View>



        <View style={styles.cameraRow}>

          <TouchableOpacity
            activeOpacity={0.86}
            style={[styles.cameraButton, skinRecorded && styles.cameraButtonDisabled]}
            onPress={onSkinCamera}
            disabled={skinRecorded}
          >

            <Ionicons
              name={skinRecorded ? "checkmark-circle-outline" : "camera-outline"}
              size={18}
              color={COLORS.white}
            />

            <Text style={styles.cameraButtonText}>{skinRecorded ? "피부 완료" : "피부 사진"}</Text>

          </TouchableOpacity>

          <TouchableOpacity

            activeOpacity={0.86}

            style={[styles.cameraButton, styles.cameraButtonSecondary]}

            onPress={onDietCamera}

          >

            <Ionicons name="restaurant-outline" size={18} color={COLORS.olive} />

            <Text style={[styles.cameraButtonText, styles.cameraButtonTextSecondary]}>식단 사진</Text>

          </TouchableOpacity>

        </View>

        <Text style={styles.sourceCaption}>
          {skinFullyRecorded
            ? "기록 상세에서 사진·점수·메모를 수정할 수 있어요."
            : skinScoreOnly
            ? "사진은 기록 화면에서 언제든 추가할 수 있어요."
            : "사진을 찍은 뒤 점수와 태그를 입력해 주세요."}
        </Text>

      </View>



      <SectionCard
        title="오늘의 생활 요인"
        description="수면, 식단, 운동, 수분, 스트레스를 한곳에서 확인하고 바로 기록할 수 있어요."
      >
        <View style={styles.factorGrid}>
          {lifestyleItems.map((item) => (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.82}
              style={styles.factorItem}
              onPress={onNavigateRecord ? openRecord(item.target, item.queryKey) : undefined}
              disabled={!onNavigateRecord}
            >
              <View style={styles.factorIcon}>
                <Ionicons name={item.icon} size={17} color={COLORS.olive} />
              </View>
              <Text style={styles.factorLabel}>{item.label}</Text>
              <Text style={styles.factorValue} numberOfLines={2}>
                {recordsInitialLoad ? "..." : item.value}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SectionCard>



      <SectionCard
        title="오늘의 환경"
        description="피부 컨디션에 영향을 줄 수 있는 외부 환경이에요. 탭하면 상세를 볼 수 있어요."
      >
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={onNavigateRecord ? openRecord("environmentLogs", "env") : undefined}
          disabled={!onNavigateRecord}
        >
          <View style={styles.environmentGrid}>
            {environmentItems.map((item) => (
              <View key={item.key} style={styles.environmentItem}>
                <Text style={styles.environmentValue}>{item.value}</Text>
                <Text style={styles.environmentLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>
        {!envInitialLoad && !latestEnv && apiStatus.env !== "rejected" && (
          <Text style={styles.sourceCaption}>아직 기록된 환경 데이터가 없어요.</Text>
        )}
      </SectionCard>



      <SectionCard
        title="리포트"
        description="기록이 쌓이면 피부 흐름과 함께 보인 요인을 리포트 탭에서 확인할 수 있어요."
      >
        <View style={styles.insightPreview}>
          <Ionicons name="sparkles-outline" size={19} color={COLORS.olive} />
          <Text style={styles.previewText}>
            {recordsInitialLoad
              ? "오늘 기록을 확인하고 있어요."
              : completedCount === 0
              ? "오늘 기록을 시작하면 리포트가 의미 있어져요."
              : "기록이 쌓이는 중이에요. 리포트 탭에서 흐름을 확인해 보세요."}
          </Text>
        </View>
        {onOpenReport ? (
          <TouchableOpacity
            activeOpacity={0.86}
            style={styles.reportLinkButton}
            onPress={onOpenReport}
          >
            <Text style={styles.reportLinkButtonText}>리포트 보러 가기</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.olive} />
          </TouchableOpacity>
        ) : null}
      </SectionCard>

    </ScrollView>

  );

}



function SectionCard({ title, description, children }) {

  return (

    <View style={styles.sectionCard}>

      <Text style={styles.cardTitle}>{title}</Text>

      <Text style={styles.cardDescription}>{description}</Text>

      <View style={styles.sectionBody}>{children}</View>

    </View>

  );

}



const shadowCard =

  Platform.OS === "ios"

    ? {

        shadowColor: "#D7D0C2",

        shadowOpacity: 0.18,

        shadowRadius: 20,

        shadowOffset: { width: 0, height: 9 },

      }

    : { elevation: 4 };



const styles = StyleSheet.create({

  root: { flex: 1, backgroundColor: COLORS.bg },

  content: { paddingHorizontal: 22, paddingBottom: 24 },

  header: {

    flexDirection: "row",

    justifyContent: "space-between",

    alignItems: "center",

    marginBottom: 20,

    paddingHorizontal: 2,

  },

  greeting: { fontSize: 24, lineHeight: 32, fontWeight: "900", color: COLORS.text },

  headerSubtitle: { marginTop: 5, fontSize: 14.2, lineHeight: 21, fontWeight: "600", color: COLORS.muted },

  headerRight: { flexDirection: "row", alignItems: "center" },

  headerIcon: {

    position: "relative",

    width: 44,

    height: 44,

    borderRadius: 22,

    backgroundColor: "rgba(255, 252, 247, 0.94)",

    borderWidth: 1,

    borderColor: COLORS.line,

    alignItems: "center",

    justifyContent: "center",

    ...shadowCard,

  },

  unreadBadge: {
    position: "absolute",
    top: -5,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: "#B85A50",
    borderWidth: 1,
    borderColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },

  unreadBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
    color: COLORS.white,
  },

  heroCard: {

    borderRadius: 30,

    backgroundColor: "rgba(255, 252, 247, 0.96)",

    borderWidth: 1,

    borderColor: COLORS.line,

    padding: 21,

    marginBottom: 15,

    ...shadowCard,

  },

  sectionCard: {

    borderRadius: 26,

    backgroundColor: "rgba(255, 252, 247, 0.94)",

    borderWidth: 1,

    borderColor: COLORS.line,

    padding: 18,

    marginTop: 15,

    ...shadowCard,

  },

  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },

  cardTitleBlock: { flex: 1, paddingRight: 14 },

  cardTitle: { fontSize: 18, lineHeight: 25, fontWeight: "900", color: COLORS.text },

  cardDescription: { marginTop: 6, fontSize: 13.2, lineHeight: 20.5, fontWeight: "600", color: COLORS.muted },

  cardIcon: {

    width: 48,

    height: 48,

    borderRadius: 24,

    backgroundColor: COLORS.oliveSoft,

    alignItems: "center",

    justifyContent: "center",

    borderWidth: 1,

    borderColor: "rgba(79, 96, 60, 0.1)",

  },

  statusBox: {

    marginTop: 18,

    minHeight: 52,

    borderRadius: 20,

    backgroundColor: COLORS.chip,

    borderWidth: 1,

    borderColor: "rgba(217, 214, 204, 0.72)",

    flexDirection: "row",

    alignItems: "center",

    paddingHorizontal: 16,

    paddingVertical: 12,

  },

  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 8, opacity: 0.75 },

  statusText: { flex: 1, fontSize: 13.8, lineHeight: 20, fontWeight: "800", color: COLORS.oliveSecondary },

  progressRow: {

    marginTop: 14,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

  },

  progressLabel: { fontSize: 12.5, fontWeight: "800", color: COLORS.muted },

  progressValue: { fontSize: 14, fontWeight: "900", color: COLORS.olive },

  checkRow: { marginTop: 10, flexDirection: "row", gap: 8 },

  checkItem: {

    flex: 1,

    minHeight: 88,

    borderRadius: 18,

    backgroundColor: COLORS.chip,

    borderWidth: 1,

    borderColor: COLORS.line,

    padding: 10,

    alignItems: "center",

    justifyContent: "center",

    gap: 5,

  },

  checkItemDone: {

    backgroundColor: COLORS.oliveSoft,

    borderColor: "rgba(79, 96, 60, 0.2)",

  },

  checkIconWrap: {

    width: 30,

    height: 30,

    borderRadius: 15,

    backgroundColor: COLORS.white,

    borderWidth: 1,

    borderColor: COLORS.line,

    alignItems: "center",

    justifyContent: "center",

  },

  checkIconWrapDone: {

    backgroundColor: COLORS.olive,

    borderColor: COLORS.olive,

  },

  checkLabel: { fontSize: 12.5, fontWeight: "900", color: COLORS.text },

  checkLabelDone: { color: COLORS.olive },

  checkHint: { fontSize: 10.5, fontWeight: "700", color: COLORS.muted, textAlign: "center" },

  cameraRow: { marginTop: 16, flexDirection: "row", gap: 10 },

  cameraButton: {

    flex: 1,

    height: 48,

    borderRadius: 24,

    backgroundColor: COLORS.olive,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "center",

    shadowColor: "#4F603C",

    shadowOpacity: Platform.OS === "ios" ? 0.18 : undefined,

    shadowRadius: Platform.OS === "ios" ? 12 : undefined,

    shadowOffset: Platform.OS === "ios" ? { width: 0, height: 6 } : undefined,

    elevation: Platform.OS === "android" ? 3 : undefined,

  },

  cameraButtonSecondary: { backgroundColor: COLORS.oliveSoft, shadowOpacity: 0, elevation: 0 },
  cameraButtonDisabled: { opacity: 0.58 },

  cameraButtonText: { marginLeft: 7, fontSize: 14.5, lineHeight: 20, fontWeight: "900", color: COLORS.white },

  cameraButtonTextSecondary: { color: COLORS.olive },

  sectionBody: { marginTop: 14 },

  factorGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: -10 },

  factorItem: {

    width: "48.4%",

    minHeight: 104,

    borderRadius: 20,

    backgroundColor: COLORS.chip,

    borderWidth: 1,

    borderColor: "rgba(217, 214, 204, 0.72)",

    padding: 13,

    marginBottom: 10,

  },

  factorIcon: {

    width: 32,

    height: 32,

    borderRadius: 16,

    backgroundColor: COLORS.oliveSoft,

    alignItems: "center",

    justifyContent: "center",

  },

  factorLabel: { marginTop: 8, fontSize: 14, lineHeight: 19, fontWeight: "900", color: COLORS.text },

  factorValue: { marginTop: 3, fontSize: 12.6, lineHeight: 18, fontWeight: "800", color: COLORS.muted },

  environmentGrid: { flexDirection: "row", justifyContent: "space-between" },

  environmentItem: {

    width: "23%",

    minHeight: 70,

    borderRadius: 18,

    backgroundColor: COLORS.oliveSoft,

    alignItems: "center",

    justifyContent: "center",

    paddingHorizontal: 5,

  },

  environmentValue: { fontSize: 16.5, lineHeight: 22, fontWeight: "900", color: COLORS.olive },

  environmentLabel: { marginTop: 4, fontSize: 10.8, lineHeight: 15, fontWeight: "700", color: COLORS.oliveSecondary },

  sourceCaption: { marginTop: 12, fontSize: 10.4, lineHeight: 15.5, fontWeight: "700", color: COLORS.muted },

  insightPreview: {

    minHeight: 46,

    borderRadius: 18,

    backgroundColor: COLORS.chip,

    borderWidth: 1,

    borderColor: "rgba(217, 214, 204, 0.66)",

    flexDirection: "row",

    alignItems: "center",

    paddingHorizontal: 14,

  },

  previewText: { marginLeft: 9, flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "800", color: COLORS.oliveSecondary },

  reportLinkButton: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 18,
    backgroundColor: COLORS.oliveSoft,
    borderWidth: 1,
    borderColor: "rgba(79, 96, 60, 0.14)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  reportLinkButtonText: {
    marginRight: 4,
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: "900",
    color: COLORS.olive,
  },
});



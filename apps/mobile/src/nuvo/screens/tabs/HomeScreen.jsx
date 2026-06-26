import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  AppState,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";

import useAuthStore from "../../../stores/authStore";

import { getNotificationUnreadCount } from "../../../api/notifications";
import { toDateStr } from "../record/components/DateNavigator";
import {
  useBehaviorLogQuery,
  useDietLogsQuery,
  useEnvironmentLogsQuery,
  useSkinLogQuery,
} from "../../../hooks/useRecordQueries";
import useRecordCacheStore from "../../../stores/recordCacheStore";
import { getSkinLogByDate } from "../../../api/skinLogs";
import { setAppIconBadgeCount } from "../../utils/pushNotifications";



const COLORS = {

  bg: "#F7F8F5",

  card: "#FFFFFF",

  chip: "#F2F4EE",

  oliveSoft: "#E4EBD8",

  olive: "#4F603C",

  oliveSecondary: "#4F603C",

  text: "#1A1F17",

  muted: "#8A9080",

  line: "#E2E5DA",

  white: "#FFFFFF",

};



function TodayCheckItem({ label, icon, done, fraction, onPress, loading, isSmall }) {
  const iconSize = isSmall ? 62 : 76;
  const iconInnerPad = isSmall ? 5 : 7;
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      style={styles.checkItem}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[
        styles.checkIconWrap,
        done && styles.checkIconWrapDone,
        { width: iconSize, height: iconSize, borderRadius: iconSize / 2, padding: iconInnerPad },
      ]}>
        <View style={[styles.checkIconInner, done && styles.checkIconInnerDone]}>
          <Ionicons name={icon} size={isSmall ? 20 : 24} color={done ? COLORS.white : COLORS.muted} />
        </View>
      </View>
      <Text style={[styles.checkLabel, done && styles.checkLabelDone]}>{label}</Text>
      <Text style={[styles.checkHint, done && styles.checkHintDone]}>
        {loading ? "–" : fraction}
      </Text>
    </TouchableOpacity>
  );
}



export default function HomeScreen({
  onSkinCamera,
  onDietCamera,
  onNavigateRecord,
  onNavigateRecordDate,
  onOpenDailyFlow,
  onOpenNotifications,
  onOpenReport,
  isActive = true,
  refreshKey,
}) {
  const { height: screenHeight } = useWindowDimensions();
  const isSmall = screenHeight < 700; // iPhone SE 등 소형 기종


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

  // 이번 주 월~일 날짜 배열
  const weekDays = useMemo(() => {
    const today = new Date();
    const dow = today.getDay(); // 0=일
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dow + 6) % 7));
    const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const ds = toDateStr(d);
      return {
        dateStr: ds,
        day: d.getDate(),
        weekday: DAY_LABELS[i],
        isToday: ds === todayStr,
        isFuture: ds > todayStr,
      };
    });
  }, [todayStr]);

  // 주간 피부 기록 여부 { "2026-06-19": true, ... }
  const [weekRecords, setWeekRecords] = useState({});

  useEffect(() => {
    let cancelled = false;
    const pastDays = weekDays.filter((d) => !d.isFuture && !d.isToday);

    const fetchAll = async () => {
      const cache = useRecordCacheStore.getState();
      const results = {};
      await Promise.all(
        pastDays.map(async ({ dateStr }) => {
          const cached = cache.skinByDate?.[dateStr];
          if (cached !== undefined) {
            results[dateStr] = !!cached.data?.overall_score;
          } else {
            try {
              const log = await getSkinLogByDate(dateStr);
              results[dateStr] = !!log?.overall_score;
            } catch {
              results[dateStr] = false;
            }
          }
        })
      );
      if (!cancelled) setWeekRecords(results);
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [weekDays]);

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
  };



  const skinHasScore = todaySkin?.overall_score != null;
  const skinFullyRecorded = skinHasScore && !!todaySkin?.photo_url;
  const skinScoreOnly = skinHasScore && !todaySkin?.photo_url;
  // 빠른 기록(점수만)도 완료로 인정 — 사진 여부는 skinFullyRecorded 로 별도 표시
  const skinRecorded = skinHasScore;

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

  // 분수 표시용
  const behaviorFilledCount = [
    behaviorForToday?.sleep_hours != null,
    behaviorForToday?.exercise_yn != null,
    behaviorForToday?.stress_level != null,
  ].filter(Boolean).length;









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
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const weekday = weekdays[today.getDay()];
    return `${month}월 ${day}일 ${weekday}요일`;
  })();



  return (
    <View style={styles.root}>

      {/* 컬러 히어로 헤더 — 고정, 스크롤되지 않음 */}
      <View style={[styles.heroHeader, isSmall && styles.heroHeaderSmall]}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroGreeting}>안녕하세요, {userName}님</Text>
            <Text style={styles.heroSubtitle}>{headerSubtitle}</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.78}
            style={styles.heroBell}
            onPress={() => onOpenNotifications?.()}
            disabled={!onOpenNotifications}
          >
            <Ionicons name="notifications-outline" size={21} color="rgba(255,255,255,0.92)" />
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadBadgeText}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* 주간 스트립 */}
        <View style={styles.heroWeekRow}>
          {weekDays.map(({ dateStr, day, weekday, isToday, isFuture }) => {
            const recorded = isToday ? skinFullyRecorded : !!weekRecords[dateStr];
            const isPast = !isToday && !isFuture;
            return (
              <TouchableOpacity
                key={dateStr}
                style={styles.heroWeekCol}
                activeOpacity={isFuture ? 1 : 0.65}
                disabled={isFuture}
                onPress={() => {
                  if (isFuture) return;
                  onNavigateRecordDate?.(new Date(dateStr + "T00:00:00"));
                }}
              >
                <Text style={[styles.heroWd, isFuture && styles.heroWdFuture]}>{weekday}</Text>
                <View style={[styles.heroCircle, isToday && styles.heroCircleToday]}>
                  <Text style={[styles.heroDay, isToday && styles.heroDayToday, isFuture && styles.heroDayFuture]}>
                    {day}
                  </Text>
                </View>
                <View style={[
                  styles.heroDot,
                  isPast && recorded && styles.heroDotDone,
                  isToday && styles.heroDotToday,
                ]} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 콘텐츠 영역 — heroHeader 위로 20px 올라와 heroCard 겹침 효과 */}
      <View style={[styles.scrollArea, isSmall && styles.scrollAreaSmall]}>

      {/* heroCard */}
      <View style={[styles.heroCard, isSmall && styles.heroCardSmall]}>

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



        <View style={[styles.statusBox, isSmall && { marginTop: 8, minHeight: 38, paddingVertical: 7 }]}>

          <View

            style={[

              styles.statusDot,

              { backgroundColor: skinFullyRecorded ? COLORS.olive : skinScoreOnly ? "#D4A72C" : COLORS.muted },

            ]}

          />

          <Text style={styles.statusText}>{heroMessage}</Text>

        </View>



        <View style={[styles.progressRow, isSmall && { marginTop: 8 }]}>

          <Text style={styles.progressLabel}>오늘 채운 기록</Text>

          <Text style={styles.progressValue}>

            {recordsInitialLoad ? "-" : `${completedCount}/3`}

          </Text>

        </View>



        <View style={[styles.checkRow, isSmall && { marginTop: 8 }]}>

          <TodayCheckItem
            label="피부"
            icon="happy-outline"
            done={skinFullyRecorded}
            fraction={`${skinFullyRecorded ? 1 : 0}/1`}
            onPress={onNavigateRecord ? openRecord("skinLogEntry", "skin") : undefined}
            loading={recordsInitialLoad}
            isSmall={isSmall}
          />
          <TodayCheckItem
            label="식단"
            icon="restaurant-outline"
            done={hasDietLogToday}
            fraction={`${Math.min(todayDietLogs.length, 3)}/3`}
            onPress={onNavigateRecord ? openRecord("dietLogEntry", "diet") : undefined}
            loading={recordsInitialLoad}
            isSmall={isSmall}
          />
          <TodayCheckItem
            label="생활"
            icon="pulse-outline"
            done={behaviorRecorded}
            fraction={`${behaviorFilledCount}/3`}
            onPress={onNavigateRecord ? openRecord("behaviorLogEntry", "behavior") : undefined}
            loading={recordsInitialLoad}
            isSmall={isSmall}
          />

        </View>



        <TouchableOpacity
            activeOpacity={recordsInitialLoad ? 1 : 0.86}
            disabled={recordsInitialLoad}
            style={[styles.cameraButton, completedCount === 3 && styles.cameraButtonDone, recordsInitialLoad && styles.cameraButtonLoading, isSmall && { marginTop: 12, height: 46 }]}
            onPress={() => {
              // 완료 상태여도 수정/재기록을 위해 모달 오픈 허용
              if (onOpenDailyFlow) { onOpenDailyFlow(); return; }
              if (!skinHasScore) { openRecord("skinLogEntry", "skin")(); return; }
              if (!hasDietLogToday) { openRecord("dietLogEntry", "diet")(); return; }
              openRecord("behaviorLogEntry", "behavior")();
            }}
          >
            {recordsInitialLoad ? (
              <ActivityIndicator size="small" color={COLORS.olive} style={{ marginRight: 6 }} />
            ) : completedCount === 3 ? (
              <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.olive} style={{ marginRight: 6 }} />
            ) : null}
            <Text style={[styles.cameraButtonText, completedCount === 3 && styles.cameraButtonTextDone, recordsInitialLoad && styles.cameraButtonTextLoading]}>
              {recordsInitialLoad ? "불러오는 중..." : completedCount === 3 ? "오늘 기록 완료!" : "오늘 기록하기"}
            </Text>
          </TouchableOpacity>

      </View>

      <EnvStrip
        latestEnv={latestEnv}
        loading={environmentQuery.isInitialLoad}
        onPress={onNavigateRecord ? () => onNavigateRecord("environmentLogs") : undefined}
        isSmall={isSmall}
      />

      </View>

    </View>
  );

}



const ENV_ITEMS = [
  { key: "temperature", label: "온도", icon: "thermometer-outline", unit: "°C" },
  { key: "humidity",    label: "습도", icon: "water-outline",       unit: "%" },
  { key: "uv_index",   label: "UV",   icon: "sunny-outline",        unit: "" },
  { key: "pm25",       label: "미세먼지", icon: "cloud-outline",    unit: "" },
];

function EnvStrip({ latestEnv, loading, onPress, isSmall }) {
  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.82 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={[env.card, isSmall && env.cardSmall]}
    >
      {ENV_ITEMS.map(({ key, label, icon, unit }) => {
        const val = latestEnv?.[key];
        const display = loading ? "…" : val != null ? `${val}${unit}` : "-";
        return (
          <View key={key} style={env.item}>
            <View style={env.iconWrap}>
              <Ionicons name={icon} size={13} color={COLORS.olive} />
            </View>
            <Text style={env.value}>{display}</Text>
            <Text style={env.label}>{label}</Text>
          </View>
        );
      })}
      {onPress && <Ionicons name="chevron-forward" size={13} color={COLORS.line} style={env.chevron} />}
    </TouchableOpacity>
  );
}

function WeekStrip({ weekDays, weekRecords, todaySkinRecorded, todayStr }) {
  return (
    <View style={ws.wrap}>
      <View style={ws.row}>
        {weekDays.map(({ dateStr, day, weekday, isToday, isFuture }) => {
          const recorded = isToday ? todaySkinRecorded : !!weekRecords[dateStr];
          const isPast = !isToday && !isFuture;
          return (
            <View
              key={dateStr}
              style={[
                ws.chip,
                recorded && ws.chipDone,
                isToday && !recorded && ws.chipToday,
                isFuture && ws.chipFuture,
              ]}
            >
              <Text style={[ws.weekday, isFuture && ws.weekdayFuture]}>{weekday}</Text>
              <Text style={[
                ws.dateNum,
                recorded && ws.dateNumDone,
                isToday && !recorded && ws.dateNumToday,
                isFuture && ws.dateNumFuture,
                isPast && !recorded && ws.dateNumPast,
              ]}>
                {day}
              </Text>
              <View style={ws.indicator}>
                {recorded ? (
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.olive} />
                ) : isPast ? (
                  <Ionicons name="close-circle-outline" size={16} color={COLORS.line} />
                ) : isToday ? (
                  <View style={ws.todayDot} />
                ) : (
                  <View style={ws.emptyDot} />
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
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

        shadowColor: "#000000",

        shadowOpacity: 0.04,

        shadowRadius: 4,

        shadowOffset: { width: 0, height: 1 },

      }

    : { elevation: 2 };



const env = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E5DA",
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginTop: 10,
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  cardSmall: { paddingVertical: 10, marginTop: 8 },
  item: { flex: 1, alignItems: "center", gap: 4 },
  iconWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "#E3EFE8",
    alignItems: "center", justifyContent: "center",
  },
  value: { fontSize: 13, fontWeight: "800", color: COLORS.text },
  label: { fontSize: 10, fontWeight: "500", color: COLORS.muted },
  chevron: { paddingLeft: 6 },
});

const ws = StyleSheet.create({
  wrap: { marginBottom: 10 },
  row: { flexDirection: "row", gap: 5 },
  chip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    gap: 3,
  },
  chipDone: {
    borderColor: COLORS.olive,
    borderWidth: 1.5,
  },
  chipToday: {
    borderColor: COLORS.olive,
    borderWidth: 2,
  },
  chipFuture: {
    borderColor: COLORS.line,
    backgroundColor: COLORS.card,
  },
  weekday: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.muted,
    letterSpacing: 0.2,
  },
  weekdayFuture: { color: COLORS.muted },
  dateNum: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.text,
    lineHeight: 18,
  },
  dateNumDone: { color: COLORS.olive },
  dateNumToday: { color: COLORS.olive },
  dateNumPast: { color: COLORS.muted },
  dateNumFuture: { color: COLORS.muted },
  indicator: { height: 18, alignItems: "center", justifyContent: "center" },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.olive,
  },
  emptyDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.line,
  },
});

const styles = StyleSheet.create({

  root: { flex: 1, backgroundColor: COLORS.bg },

  scrollArea: { flex: 1, marginTop: -20, backgroundColor: "transparent" },
  scrollAreaSmall: { marginTop: -16 },

  // 컬러 히어로 헤더
  heroHeader: {
    backgroundColor: "#4A7C59",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
  },
  heroHeaderSmall: { paddingBottom: 24, paddingTop: 6 },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  heroGreeting: { fontSize: 21, fontWeight: "800", color: "#FFFFFF", lineHeight: 28 },
  heroSubtitle: { marginTop: 2, fontSize: 12, fontWeight: "500", color: "rgba(255,255,255,0.65)" },
  heroBell: {
    position: "relative",
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  heroWeekRow: { flexDirection: "row" },
  heroWeekCol: { flex: 1, alignItems: "center", gap: 5 },
  heroWd: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.6)" },
  heroWdFuture: { color: "rgba(255,255,255,0.3)" },
  heroCircle: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  heroCircleToday: { backgroundColor: "#FFFFFF" },
  heroDay: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.85)" },
  heroDayToday: { color: "#4A7C59", fontWeight: "900" },
  heroDayFuture: { color: "rgba(255,255,255,0.3)" },
  heroDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "transparent" },
  heroDotDone: { backgroundColor: "rgba(255,255,255,0.8)" },
  heroDotToday: { backgroundColor: "#FFFFFF" },

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
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "#E2E5DA",
    padding: 20,
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },

  heroCardSmall: { padding: 14, marginTop: 0 },

  envDivider: {
    height: 1,
    backgroundColor: COLORS.line,
    marginTop: 14,
    marginHorizontal: -2,
  },

  envRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
  },

  envItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },

  envValue: { fontSize: 13, fontWeight: "800", color: COLORS.text },

  envLabel: { fontSize: 10, fontWeight: "500", color: COLORS.muted },

  sectionCard: {

    borderRadius: 20,

    backgroundColor: COLORS.card,

    borderWidth: 1,

    borderColor: "#E0DDD4",

    padding: 18,

    marginTop: 14,

    ...shadowCard,

  },

  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },

  cardTitleBlock: { flex: 1, paddingRight: 14 },

  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: "800", color: COLORS.text },

  cardDescription: { marginTop: 4, fontSize: 12.5, lineHeight: 18, fontWeight: "500", color: COLORS.muted },

  cardIcon: {

    width: 44,

    height: 44,

    borderRadius: 22,

    backgroundColor: COLORS.oliveSoft,

    alignItems: "center",

    justifyContent: "center",

  },

  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    gap: 10,
  },
  scoreBadge: {
    flexDirection: "row",
    alignItems: "baseline",
    backgroundColor: COLORS.oliveSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 2,
  },
  scoreNum: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.olive,
    lineHeight: 28,
  },
  scoreUnit: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.olive,
  },
  scoreLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.muted,
  },
  statusBox: {

    marginTop: 14,

    minHeight: 46,

    borderRadius: 12,

    backgroundColor: COLORS.chip,

    flexDirection: "row",

    alignItems: "center",

    paddingHorizontal: 14,

    paddingVertical: 10,

  },

  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },

  statusText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "700", color: COLORS.text },

  progressRow: {

    marginTop: 14,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

  },

  progressLabel: { fontSize: 12.5, fontWeight: "800", color: COLORS.muted },

  progressValue: { fontSize: 14, fontWeight: "900", color: COLORS.olive },

  checkRow: { marginTop: 14, marginBottom: 4, flexDirection: "row" },

  checkItem: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },

  checkIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    padding: 7,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },

  checkIconWrapDone: {
    borderColor: COLORS.olive,
  },

  checkIconInner: {
    flex: 1,
    width: "100%",
    borderRadius: 100,
    backgroundColor: COLORS.chip,
    alignItems: "center",
    justifyContent: "center",
  },

  checkIconInnerDone: {
    backgroundColor: COLORS.olive,
  },

  checkLabel: { fontSize: 13, lineHeight: 18, fontWeight: "800", color: COLORS.text },

  checkLabelDone: { color: COLORS.olive },

  checkHint: { fontSize: 12.5, fontWeight: "700", color: COLORS.muted },

  checkHintDone: { color: COLORS.olive },

  cameraButton: {
    marginTop: 20,
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.olive,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2A4020",
    shadowOpacity: Platform.OS === "ios" ? 0.2 : undefined,
    shadowRadius: Platform.OS === "ios" ? 10 : undefined,
    shadowOffset: Platform.OS === "ios" ? { width: 0, height: 5 } : undefined,
    elevation: Platform.OS === "android" ? 3 : undefined,
  },

  cameraButtonDone: {
    backgroundColor: COLORS.oliveSoft,
    shadowOpacity: 0,
    elevation: 0,
  },
  cameraButtonLoading: {
    backgroundColor: COLORS.oliveSoft,
    shadowOpacity: 0,
    elevation: 0,
    opacity: 0.7,
  },

  cameraButtonText: { fontSize: 15.5, lineHeight: 21, fontWeight: "900", color: COLORS.white },
  cameraButtonTextDone: { color: COLORS.olive },
  cameraButtonTextLoading: { color: COLORS.olive },

  sectionBody: { marginTop: 14 },

  factorGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: -10 },

  factorItem: {

    width: "48.4%",

    minHeight: 96,

    borderRadius: 14,

    backgroundColor: COLORS.chip,

    borderWidth: 1,

    borderColor: COLORS.line,

    padding: 12,

    marginBottom: 8,

  },

  factorIcon: {

    width: 30,

    height: 30,

    borderRadius: 15,

    backgroundColor: COLORS.oliveSoft,

    alignItems: "center",

    justifyContent: "center",

  },

  factorLabel: { marginTop: 8, fontSize: 13, lineHeight: 18, fontWeight: "700", color: COLORS.text },

  factorValue: { marginTop: 2, fontSize: 12, lineHeight: 17, fontWeight: "600", color: COLORS.muted },

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

    borderRadius: 12,

    backgroundColor: COLORS.chip,

    borderWidth: 1,

    borderColor: COLORS.line,

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



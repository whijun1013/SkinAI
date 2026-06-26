import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getNotificationLogs,
  markAllNotificationLogsRead,
  markNotificationLogRead,
} from "../../../api/notifications";
import { resolveNotificationNavigation, setAppIconBadgeCount } from "../../utils/pushNotifications";
import ScreenHeader from "./ScreenHeader";

const COLORS = {
  bg: "#F7F8F5",
  olive: "#4F603C",
  oliveSoft: "#E4EBD8",
  card: "#FFFFFF",
  chip: "#F2F4EE",
  text: "#1A1F17",
  muted: "#8A9080",
  line: "#E2E5DA",
  danger: "#B85A50",
};

const PAGE_SIZE = 20;
const FILTERS = [
  { key: "all", label: "전체", category: null, emptyMessage: "아직 받은 알림이 없어요." },
  { key: "analysis", label: "분석", category: "analysis", emptyMessage: "분석 알림이 없어요." },
  { key: "record", label: "기록", category: "record", emptyMessage: "기록 알림이 없어요." },
  { key: "failed", label: "실패", category: "failed", emptyMessage: "실패 알림이 없어요." },
];

export default function NotificationHistoryScreen({ onBack, onNavigateNotification }) {
  const [logs, setLogs] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [loadMoreError, setLoadMoreError] = useState(null);
  const mountedRef = useRef(true);
  const readAllAttemptedRef = useRef(false);
  const loadRequestIdRef = useRef(0);

  const loadLogs = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    const filterKey = activeFilter;

    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    try {
      const category = categoryForFilter(filterKey);
      const data = await getNotificationLogs(PAGE_SIZE, 0, category);
      if (!mountedRef.current || loadRequestIdRef.current !== requestId) return;

      const nextLogs = Array.isArray(data) ? data : [];
      setLogs(nextLogs);
      setHasMore(nextLogs.length === PAGE_SIZE);
      if (!readAllAttemptedRef.current) {
        readAllAttemptedRef.current = true;
        try {
          await markAllNotificationLogsRead();
          if (!mountedRef.current || loadRequestIdRef.current !== requestId) return;

          const readAt = new Date().toISOString();
          setLogs((currentLogs) =>
            currentLogs.map((log) => (log?.read_at ? log : { ...log, read_at: readAt }))
          );
          setAppIconBadgeCount(0);
        } catch (readError) {
          console.warn("[Notifications] failed to mark all logs read", readError?.response?.status || readError?.message);
        }
      }
    } catch (err) {
      if (!mountedRef.current || loadRequestIdRef.current !== requestId) return;

      console.warn("[Notifications] failed to load logs", err?.response?.status || err?.message);
      setError("알림을 불러오지 못했어요.");
      setLogs([]);
      setHasMore(false);
    } finally {
      if (mountedRef.current && loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [activeFilter]);

  const loadMoreLogs = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;

    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const category = categoryForFilter(activeFilter);
      const data = await getNotificationLogs(PAGE_SIZE, logs.length, category);
      const nextLogs = Array.isArray(data) ? data : [];
      const existingIds = new Set(logs.map((log) => log?.id).filter((id) => id != null));
      const uniqueLogs = nextLogs.filter((log) => {
        if (log?.id == null) return true;
        if (existingIds.has(log.id)) return false;
        existingIds.add(log.id);
        return true;
      });
      setLogs((currentLogs) => {
        const currentIds = new Set(currentLogs.map((log) => log?.id).filter((id) => id != null));
        const appendLogs = uniqueLogs.filter((log) => {
          if (log?.id == null) return true;
          if (currentIds.has(log.id)) return false;
          currentIds.add(log.id);
          return true;
        });
        return [...currentLogs, ...appendLogs];
      });
      setHasMore(nextLogs.length === PAGE_SIZE && uniqueLogs.length > 0);
    } catch (err) {
      console.warn("[Notifications] failed to load more logs", err?.response?.status || err?.message);
      setLoadMoreError("알림을 더 불러오지 못했어요.");
    } finally {
      setLoadingMore(false);
    }
  }, [activeFilter, hasMore, loading, loadingMore, logs]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handlePress = (log) => {
    const target = resolveNotificationNavigation(safePayload(log?.data), `in-app:${log?.id ?? "unknown"}`);
    if (target) {
      onNavigateNotification?.(target);
    }

    if (log?.id && !log?.read_at) {
      markNotificationLogRead(log.id)
        .then((result) => {
          if (!mountedRef.current) return;
          const readAt = result?.read_at || new Date().toISOString();
          setLogs((currentLogs) =>
            currentLogs.map((item) => (item?.id === log.id ? { ...item, read_at: readAt } : item))
          );
        })
        .catch((readError) => {
          console.warn("[Notifications] failed to mark log read", readError?.response?.status || readError?.message);
        });
    }
  };

  const handleFilterPress = (filterKey) => {
    if (filterKey === activeFilter) return;
    setActiveFilter(filterKey);
    setLoading(true);
    setError(null);
    setHasMore(false);
    setLoadMoreError(null);
  };

  const emptyMessage =
    FILTERS.find((filter) => filter.key === activeFilter)?.emptyMessage || "아직 받은 알림이 없어요.";

  return (
    <View style={styles.root}>
      <ScreenHeader title="알림 내역" onBack={onBack} />

      {/* 필터 바 */}
      <View style={styles.filterWrap}>
        {FILTERS.map((filter) => {
          const isActive = filter.key === activeFilter;
          return (
            <TouchableOpacity
              key={filter.key}
              activeOpacity={0.75}
              style={[styles.filterBtn, isActive && styles.filterBtnOn]}
              onPress={() => handleFilterPress(filter.key)}
            >
              <Text style={[styles.filterText, isActive && styles.filterTextOn]}>{filter.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator size="small" color={COLORS.olive} />
            <Text style={styles.stateText}>알림을 불러오는 중이에요.</Text>
          </View>
        ) : error ? (
          <View style={[styles.stateWrap, styles.stateError]}>
            <Ionicons name="alert-circle-outline" size={26} color={COLORS.danger} />
            <Text style={[styles.stateText, { color: COLORS.danger }]}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadLogs} activeOpacity={0.75}>
              <Ionicons name="refresh-outline" size={13} color={COLORS.olive} />
              <Text style={styles.retryBtnText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : logs.length === 0 ? (
          <View style={styles.stateWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="notifications-outline" size={28} color={COLORS.muted} />
            </View>
            <Text style={styles.stateText}>{emptyMessage}</Text>
          </View>
        ) : (
          <>
            {logs.map((log, index) => {
              const isUnread = !log?.read_at;
              return (
                <TouchableOpacity
                  key={String(log.id ?? index)}
                  activeOpacity={0.76}
                  style={[styles.notifCard, isUnread && styles.notifCardUnread]}
                  onPress={() => handlePress(log)}
                >
                  <View style={[styles.notifIconWrap, isUnread && styles.notifIconWrapUnread]}>
                    <Ionicons name={iconForType(log.notification_type)} size={18}
                      color={isUnread ? COLORS.olive : COLORS.muted} />
                  </View>
                  <View style={styles.notifBody}>
                    <View style={styles.notifTopRow}>
                      <Text style={[styles.notifTitle, isUnread && styles.notifTitleUnread]} numberOfLines={1}>
                        {log.title}
                      </Text>
                      <Text style={styles.notifTime}>{formatNotificationTime(log.sent_at || log.created_at)}</Text>
                    </View>
                    <Text style={styles.notifDesc} numberOfLines={2}>{log.body}</Text>
                  </View>
                  {isUnread && <View style={styles.unreadDot} />}
                </TouchableOpacity>
              );
            })}

            {loadMoreError ? (
              <Text style={styles.loadMoreError}>{loadMoreError}</Text>
            ) : null}

            {hasMore ? (
              <TouchableOpacity
                style={[styles.loadMoreBtn, loadingMore && { opacity: 0.5 }]}
                onPress={loadMoreLogs}
                disabled={loadingMore}
                activeOpacity={0.75}
              >
                {loadingMore
                  ? <ActivityIndicator size="small" color={COLORS.olive} />
                  : <>
                      <Ionicons name="chevron-down" size={14} color={COLORS.olive} />
                      <Text style={styles.loadMoreText}>더 보기</Text>
                    </>
                }
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StateBox({ children, tone }) {
  return (
    <View style={[styles.stateBox, tone === "error" && styles.errorBox]}>
      {children}
    </View>
  );
}

function safePayload(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function categoryForFilter(filterKey) {
  return FILTERS.find((filter) => filter.key === filterKey)?.category ?? null;
}

function iconForType(type) {
  if (type === "daily_skin_log_reminder") return "create-outline";
  if (type === "analysis_ready") return "sparkles-outline";
  if (type === "analysis_failed") return "alert-circle-outline";
  return "document-text-outline";
}

function formatNotificationTime(value) {
  const date = parseNotificationDate(value);
  if (!date) return "";

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffHours < 48) return "어제";

  const now = new Date();
  if (date.getFullYear() !== now.getFullYear()) {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  }
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function parseNotificationDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const normalized = trimmed.replace(/(\.\d{3})\d+/, "$1");
  const date = new Date(hasTimezone ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const shadow = Platform.OS === "ios"
  ? { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }
  : { elevation: 2 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  /* 필터 바 */
  filterWrap: {
    flexDirection: "row", gap: 7,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.line,
  },
  filterBtn: {
    flex: 1, height: 34, borderRadius: 20,
    borderWidth: 1.5, borderColor: COLORS.line,
    backgroundColor: COLORS.chip,
    alignItems: "center", justifyContent: "center",
  },
  filterBtnOn: { borderColor: COLORS.olive, backgroundColor: COLORS.olive },
  filterText: { fontSize: 13, fontWeight: "700", color: COLORS.muted },
  filterTextOn: { color: "#fff", fontWeight: "800" },

  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 44, gap: 8 },

  /* 알림 아이템 카드 */
  notifCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.line,
    paddingVertical: 14, paddingHorizontal: 14, gap: 12,
    ...shadow,
  },
  notifCardUnread: { borderColor: "#C8D8A8", backgroundColor: "#FAFCF7" },
  notifIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.chip,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  notifIconWrapUnread: { backgroundColor: COLORS.oliveSoft },
  notifBody: { flex: 1, minWidth: 0 },
  notifTopRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  notifTitle: { flex: 1, fontSize: 13, fontWeight: "600", color: COLORS.muted },
  notifTitleUnread: { color: COLORS.text, fontWeight: "800" },
  notifTime: { fontSize: 11, fontWeight: "600", color: COLORS.muted, flexShrink: 0 },
  notifDesc: { fontSize: 12, lineHeight: 17, fontWeight: "500", color: COLORS.muted },
  unreadDot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: COLORS.olive, flexShrink: 0,
  },

  /* 상태 */
  stateWrap: {
    marginTop: 40, alignItems: "center", gap: 10,
  },
  stateError: {
    backgroundColor: "#FFF6F4", borderRadius: 16,
    borderWidth: 1, borderColor: "#F0C9C2",
    padding: 24, marginTop: 20,
  },
  stateText: { fontSize: 13, fontWeight: "600", color: COLORS.muted, textAlign: "center" },
  emptyIconWrap: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: COLORS.chip, alignItems: "center", justifyContent: "center",
  },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    marginTop: 4, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.oliveSoft, borderRadius: 20,
    borderWidth: 1, borderColor: "#C8D8A8",
  },
  retryBtnText: { fontSize: 13, fontWeight: "700", color: COLORS.olive },

  /* 더 보기 */
  loadMoreBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    alignSelf: "center", marginTop: 4,
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.oliveSoft,
    backgroundColor: COLORS.card,
  },
  loadMoreText: { fontSize: 13, fontWeight: "700", color: COLORS.olive },
  loadMoreError: { fontSize: 12, color: COLORS.danger, textAlign: "center", marginTop: 8 },
});

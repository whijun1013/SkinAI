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
  background: "#F8F7F2",
  olive: "#4F603C",
  oliveSoft: "#EEF0E6",
  card: "#FFFFFF",
  text: "#2D2D2D",
  muted: "#7A8A6A",
  border: "#E0DDD4",
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
      <ScreenHeader title="알림" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Text style={styles.title}>최근 알림</Text>
          <Text style={styles.description}>최근 받은 기록과 인사이트 알림을 확인할 수 있어요.</Text>
        </View>
        <View style={styles.filterBar}>
          {FILTERS.map((filter) => {
            const isActive = filter.key === activeFilter;
            return (
              <TouchableOpacity
                key={filter.key}
                activeOpacity={0.78}
                style={[styles.filterButton, isActive && styles.filterButtonActive]}
                onPress={() => handleFilterPress(filter.key)}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>{filter.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <StateBox>
            <ActivityIndicator size="small" color={COLORS.olive} />
            <Text style={styles.stateText}>알림을 불러오는 중이에요.</Text>
          </StateBox>
        ) : error ? (
          <StateBox tone="error">
            <Ionicons name="alert-circle-outline" size={22} color={COLORS.danger} />
            <Text style={[styles.stateText, styles.errorText]}>{error}</Text>
            <TouchableOpacity activeOpacity={0.78} style={styles.retryButton} onPress={loadLogs}>
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </StateBox>
        ) : logs.length === 0 ? (
          <StateBox>
            <Ionicons name="notifications-outline" size={23} color={COLORS.olive} />
            <Text style={styles.stateText}>{emptyMessage}</Text>
          </StateBox>
        ) : (
          <>
            <View style={styles.list}>
              {logs.map((log, index) => {
                const isUnread = !log?.read_at;
                return (
                  <TouchableOpacity
                    key={String(log.id ?? index)}
                    activeOpacity={0.76}
                    style={[styles.item, index !== logs.length - 1 && styles.itemDivider]}
                    onPress={() => handlePress(log)}
                  >
                    <View style={[styles.iconCircle, isUnread && styles.iconCircleUnread]}>
                      <Ionicons name={iconForType(log.notification_type)} size={18} color={COLORS.olive} />
                    </View>
                    <View style={styles.itemText}>
                      <View style={styles.itemTopRow}>
                        <Text style={[styles.itemTitle, isUnread && styles.itemTitleUnread]} numberOfLines={1}>{log.title}</Text>
                        {isUnread ? <View style={styles.unreadDot} /> : null}
                        <Text style={styles.timeText}>{formatNotificationTime(log.sent_at || log.created_at)}</Text>
                      </View>
                      <Text style={styles.itemBody} numberOfLines={2}>{log.body}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                  </TouchableOpacity>
                );
              })}
            </View>
            {loadMoreError ? <Text style={styles.loadMoreErrorText}>{loadMoreError}</Text> : null}
            {hasMore ? (
              <TouchableOpacity
                activeOpacity={0.78}
                style={[styles.loadMoreButton, loadingMore && styles.loadMoreButtonDisabled]}
                onPress={loadMoreLogs}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color={COLORS.olive} />
                ) : (
                  <Text style={styles.loadMoreText}>더 보기</Text>
                )}
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

const shadowCard = Platform.OS === "ios"
  ? { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 }
  : { elevation: 2 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 44 },
  intro: { marginBottom: 16 },
  title: { fontSize: 25, lineHeight: 32, fontWeight: "800", color: COLORS.text, letterSpacing: 0 },
  description: { marginTop: 8, fontSize: 14, lineHeight: 22, fontWeight: "500", color: COLORS.muted, letterSpacing: 0 },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 14,
  },
  filterButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterButtonActive: {
    borderColor: COLORS.olive,
    backgroundColor: COLORS.olive,
  },
  filterText: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "700",
    color: COLORS.muted,
    letterSpacing: 0,
  },
  filterTextActive: {
    color: COLORS.background,
    fontWeight: "800",
  },
  list: {
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    ...shadowCard,
  },
  item: { minHeight: 76, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12 },
  itemDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconCircleUnread: { backgroundColor: "#E4E8D8" },
  itemText: { flex: 1, minWidth: 0, paddingRight: 8 },
  itemTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemTitle: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: "800", color: COLORS.text, letterSpacing: 0 },
  itemTitleUnread: { fontWeight: "900" },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.olive },
  itemBody: { marginTop: 3, fontSize: 12.2, lineHeight: 17, fontWeight: "500", color: COLORS.muted, letterSpacing: 0 },
  timeText: { fontSize: 11.5, lineHeight: 16, fontWeight: "700", color: COLORS.muted, letterSpacing: 0 },
  stateBox: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 20,
    alignItems: "center",
    ...shadowCard,
  },
  stateText: { marginTop: 10, fontSize: 13, lineHeight: 19, fontWeight: "700", color: COLORS.muted, textAlign: "center" },
  errorBox: { backgroundColor: "#FFF6F4", borderColor: "#F0C9C2" },
  errorText: { color: COLORS.danger },
  retryButton: { marginTop: 12, borderRadius: 15, backgroundColor: COLORS.oliveSoft, paddingHorizontal: 13, paddingVertical: 8 },
  retryText: { fontSize: 12.5, lineHeight: 17, fontWeight: "800", color: COLORS.olive },
  loadMoreButton: {
    alignSelf: "center",
    minWidth: 118,
    minHeight: 38,
    marginTop: 14,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  loadMoreButtonDisabled: { opacity: 0.72 },
  loadMoreText: { fontSize: 13, lineHeight: 18, fontWeight: "800", color: COLORS.olive, letterSpacing: 0 },
  loadMoreErrorText: {
    marginTop: 10,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
    color: COLORS.danger,
    textAlign: "center",
    letterSpacing: 0,
  },
});

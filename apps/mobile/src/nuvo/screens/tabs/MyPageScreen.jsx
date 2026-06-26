import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
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
import { setAppIconBadgeCount } from "../../utils/pushNotifications";

const HERO_BG = "#4A7C59";
const COLORS = {
  bg: "#F7F8F5",
  card: "#FFFFFF",
  chip: "#F2F4EE",
  oliveSoft: "#E4EBD8",
  olive: "#4F603C",
  text: "#1A1F17",
  muted: "#8A9080",
  line: "#E2E5DA",
  white: "#FFFFFF",
  danger: "#B85A50",
};

const SETTINGS_ITEMS = [
  {
    key: "permissions",
    icon: "shield-checkmark-outline",
    label: "권한",
    sub: "카메라 · 사진 · 알림",
    action: "permissions",
  },
  {
    key: "notif",
    icon: "notifications-outline",
    label: "알림 설정",
    sub: "기록 · 분석 알림 관리",
    action: "notificationSettings",
  },
];

const SERVICE_ITEMS = [
  {
    key: "terms",
    icon: "document-text-outline",
    label: "약관 및 개인정보",
    action: "termsPrivacyMenu",
  },
  {
    key: "appinfo",
    icon: "information-circle-outline",
    label: "앱 정보",
    rightText: "1.0.0",
  },
  {
    key: "logout",
    icon: "log-out-outline",
    label: "로그아웃",
    action: "logout",
    danger: true,
  },
];

export default function MyPageScreen({ onLogout, onNavigate, isActive = true }) {
  const { logout, isLoading, isInitializing, user } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadRefreshInFlightRef = useRef(false);
  const { height: screenHeight } = useWindowDimensions();
  const isCompact = screenHeight < 700;

  const refreshUnreadCount = useCallback(() => {
    if (!isActive || unreadRefreshInFlightRef.current) return;
    unreadRefreshInFlightRef.current = true;
    getNotificationUnreadCount()
      .then((data) => {
        const n = Number(data?.unread_count);
        const safe = Number.isFinite(n) && n > 0 ? n : 0;
        setUnreadCount(safe);
        setAppIconBadgeCount(safe);
      })
      .catch(() => {})
      .finally(() => { unreadRefreshInFlightRef.current = false; });
  }, [isActive]);

  useEffect(() => { refreshUnreadCount(); }, [refreshUnreadCount]);

  useEffect(() => {
    if (!isActive) return undefined;
    const a = AppState.addEventListener("change", (s) => { if (s === "active") refreshUnreadCount(); });
    const n = Notifications.addNotificationReceivedListener(refreshUnreadCount);
    return () => { a?.remove?.(); n?.remove?.(); };
  }, [isActive, refreshUnreadCount]);

  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);
  const isLoading_ = isInitializing || !user;
  const userName = isLoading_ ? "불러오는 중..." : user?.name || "사용자";
  const userEmail = isLoading_ ? "" : user?.email || "";
  const initial = isLoading_ ? "·" : (userName?.[0] || "사");
  const skinText = isLoading_
    ? "프로필 확인 중"
    : user?.skin_type ? `${user.skin_type} 피부` : "피부 정보 미등록";
  const genderText = !isLoading_ && user?.gender ? `${user.gender}성` : null;

  const handleLogout = async () => {
    const res = await logout();
    if (res?.success === false) {
      Alert.alert("로그아웃 실패", res.error || "다시 시도해주세요.");
      return;
    }
    setAppIconBadgeCount(0);
    onLogout?.();
  };

  const handlePress = (item) => {
    if (item.action === "logout") { handleLogout(); return; }
    if (item.action) onNavigate?.(item.action);
  };

  const renderListItem = (item, index, arr) => {
    const isLast = index === arr.length - 1;
    const isDanger = !!item.danger;
    const hasAction = !!item.action;
    const Comp = hasAction ? TouchableOpacity : View;
    const props = hasAction
      ? { activeOpacity: 0.75, onPress: () => handlePress(item), disabled: item.action === "logout" && isLoading }
      : {};
    return (
      <Comp key={item.key} style={[styles.listItem, isCompact && styles.listItemCompact, !isLast && styles.listDivider]} {...props}>
        <View style={[styles.listIcon, isDanger && styles.listIconDanger]}>
          <Ionicons name={item.icon} size={18} color={isDanger ? COLORS.danger : COLORS.olive} />
        </View>
        <Text style={[styles.listLabel, isDanger && styles.listLabelDanger]}>{item.label}</Text>
        <View style={styles.listRight}>
          {item.rightText ? (
            <Text style={styles.listVersion}>{item.rightText}</Text>
          ) : item.action ? (
            <Ionicons name="chevron-forward" size={16} color={isDanger ? COLORS.danger : COLORS.muted} />
          ) : null}
        </View>
      </Comp>
    );
  };

  return (
    <View style={styles.root}>
      {/* 히어로 헤더 */}
      <View style={[styles.hero, isCompact && styles.heroCompact]}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroTitle}>마이페이지</Text>
            <Text style={styles.heroSubtitle}>계정 및 앱 설정</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.78}
            style={styles.bell}
            onPress={() => onNavigate?.("notificationHistory")}
          >
            <Ionicons name="notifications-outline" size={21} color="rgba(255,255,255,0.92)" />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badgeText}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.body, isCompact && styles.bodyCompact]}>
        {/* 프로필 카드 */}
        <TouchableOpacity
          activeOpacity={0.78}
          style={[styles.profileCard, isCompact && styles.profileCardCompact]}
          onPress={() => onNavigate?.("profileDetail")}
          disabled={isLoading_}
        >
          <View style={styles.profileDecor} />
          <View style={styles.profileRow}>
            <View style={[styles.avatar, isCompact && styles.avatarCompact]}>
              <Text style={[styles.avatarText, isCompact && styles.avatarTextCompact]}>{initial}</Text>
            </View>
            <View style={styles.profileMeta}>
              <Text style={[styles.profileName, isCompact && styles.profileNameCompact]} numberOfLines={1}>
                {userName}
              </Text>
              {userEmail ? <Text style={styles.profileEmail} numberOfLines={1}>{userEmail}</Text> : null}
              <View style={styles.chipRow}>
                <View style={styles.chip}><Text style={styles.chipText}>{skinText}</Text></View>
                {genderText ? <View style={styles.chip}><Text style={styles.chipText}>{genderText}</Text></View> : null}
              </View>
            </View>
            {!isLoading_ && (
              <View style={styles.profileEdit}>
                <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* 앱 설정 */}
        <Text style={[styles.sectionTitle, isCompact && styles.sectionTitleCompact]}>앱 설정</Text>
        <View style={styles.listCard}>
          {SETTINGS_ITEMS.map((item, i) => renderListItem(item, i, SETTINGS_ITEMS))}
        </View>

        {/* 서비스 */}
        <Text style={[styles.sectionTitle, isCompact && styles.sectionTitleCompact]}>서비스</Text>
        <View style={styles.listCard}>
          {SERVICE_ITEMS.map((item, i) => renderListItem(item, i, SERVICE_ITEMS))}
        </View>

        <View style={{ flex: 1 }} />

        {/* 보안 */}
        <View style={styles.securityRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.muted} />
          <Text style={styles.securityText}>
            NUVO는 사용자의 데이터를 안전하게 보호합니다.
          </Text>
        </View>
      </View>
    </View>
  );
}

const shadow = Platform.OS === "ios"
  ? { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10 }
  : { elevation: 3 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  /* 히어로 */
  hero: {
    backgroundColor: HERO_BG,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 36,
  },
  heroCompact: { paddingBottom: 28, paddingTop: 6 },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroTitle: { fontSize: 21, fontWeight: "800", color: COLORS.white, lineHeight: 28, letterSpacing: -0.3 },
  heroSubtitle: { marginTop: 2, fontSize: 12, fontWeight: "500", color: "rgba(255,255,255,0.65)" },
  bell: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute", top: -5, right: -6,
    minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4, backgroundColor: "#B85A50",
    borderWidth: 1, borderColor: COLORS.card,
    alignItems: "center", justifyContent: "center",
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: COLORS.white, lineHeight: 12 },

  /* 바디 */
  body: {
    flex: 1, marginTop: -20, backgroundColor: "transparent",
    paddingHorizontal: 18, paddingBottom: 16,
  },
  bodyCompact: { paddingHorizontal: 14, paddingBottom: 10 },

  /* 프로필 카드 */
  profileCard: {
    borderRadius: 20, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.line,
    padding: 20, marginBottom: 18,
    overflow: "hidden", position: "relative",
    ...shadow,
  },
  profileCardCompact: { padding: 14, marginBottom: 12 },
  profileDecor: {
    position: "absolute", top: -20, right: -20,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: COLORS.oliveSoft, opacity: 0.45,
  },
  profileRow: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center", justifyContent: "center",
    marginRight: 16, flexShrink: 0,
  },
  avatarCompact: { width: 52, height: 52, borderRadius: 26 },
  avatarText: { fontSize: 24, fontWeight: "700", color: COLORS.olive, lineHeight: 30 },
  avatarTextCompact: { fontSize: 20, lineHeight: 26 },
  profileMeta: { flex: 1 },
  profileName: { fontSize: 19, fontWeight: "700", color: COLORS.text, lineHeight: 25 },
  profileNameCompact: { fontSize: 17, lineHeight: 23 },
  profileEmail: { marginTop: 2, fontSize: 12, color: COLORS.muted, fontWeight: "500" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 10 },
  chip: {
    backgroundColor: COLORS.chip, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 0.5, borderColor: COLORS.oliveSoft,
  },
  chipText: { fontSize: 11, fontWeight: "600", color: COLORS.olive, lineHeight: 16 },
  profileEdit: { paddingLeft: 8, alignSelf: "center" },

  /* 섹션 */
  sectionTitle: {
    fontSize: 12, fontWeight: "700", color: COLORS.muted,
    letterSpacing: 0.5, textTransform: "uppercase",
    marginBottom: 8, marginTop: 4,
  },
  sectionTitleCompact: { marginBottom: 6, marginTop: 2 },

  /* 리스트 카드 */
  listCard: {
    borderRadius: 16, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.line,
    overflow: "hidden", marginBottom: 16,
    ...shadow,
  },
  listItem: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 15,
    minHeight: 58,
  },
  listItemCompact: { paddingVertical: 11, minHeight: 48 },
  listDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.line },
  listIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: COLORS.chip,
    alignItems: "center", justifyContent: "center",
    marginRight: 13,
  },
  listIconDanger: { backgroundColor: "#FEF0EE" },
  listLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: COLORS.text },
  listLabelDanger: { color: COLORS.danger },
  listRight: { marginLeft: 8, alignItems: "center", justifyContent: "center" },
  listVersion: { fontSize: 13, color: COLORS.muted, fontWeight: "500" },

  /* 보안 */
  securityRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 4, paddingBottom: 8,
  },
  securityText: { flex: 1, fontSize: 11, color: COLORS.muted, fontWeight: "500", lineHeight: 16 },
});

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import useAuthStore from "../../../stores/authStore";
import useTabContentInsets from "../../../hooks/useTabContentInsets";
import { getNotificationUnreadCount } from "../../../api/notifications";
import { setAppIconBadgeCount } from "../../utils/pushNotifications";

const COLORS = {
  background: "#F8F7F2",
  olive: "#4F603C",
  oliveMuted: "#4A5D4E",
  oliveLight: "#E8EADD",
  oliveSoft: "#EEF0E6",
  card: "#FFFFFF",
  cardAlt: "#FCFBF8",
  chip: "#E6E9DB",
  text: "#2D2D2D",
  muted: "#7A8A6A",
  border: "#E0DDD4",
};

const managementItems = [
  {
    title: "권한",
    description: "카메라 · 사진 · 알림",
    icon: "shield-checkmark-outline",
    action: "permissions",
  },
  {
    title: "알림 설정",
    description: "기록 · 분석 알림 관리",
    icon: "notifications-outline",
    action: "notificationSettings",
  },
];

const serviceItems = [
  {
    title: "약관 및 개인정보",
    description: "이용약관 · 개인정보 처리방침",
    icon: "document-text-outline",
    action: "termsPrivacyMenu",
  },
  {
    title: "앱 정보",
    description: "Luvel 모바일",
    icon: "information-circle-outline",
    rightText: "버전 1.0.0",
  },
  {
    title: "로그아웃",
    description: "현재 계정에서 나가기",
    icon: "log-out-outline",
    action: "logout",
  },
];

export default function MyPageScreen({ onLogout, onNavigate, isActive = true }) {
  const { logout, isLoading, isInitializing, user } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadRefreshInFlightRef = useRef(false);
  const contentInsets = useTabContentInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth <= 390;
  const horizontalPadding = isCompact ? 18 : 22;
  const cardGap = isCompact ? 7 : 8;
  const availableWidth = Math.max(0, screenWidth - horizontalPadding * 2);
  const managementCardWidth = (availableWidth - cardGap) / 2;
  const responsiveContentInsets = {
    ...contentInsets,
    paddingBottom: Math.max(contentInsets.paddingBottom, isCompact ? 148 : 132),
  };

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

  const isProfileLoading = isInitializing || !user;
  const userName = isProfileLoading ? "불러오는 중..." : user?.name || "사용자";
  const userEmail = isProfileLoading ? "잠시만 기다려주세요" : user?.email || "이메일 정보 없음";
  const avatarInitial = isProfileLoading ? "·" : userName?.slice?.(0, 1) || "사";
  const skinTypeText = isProfileLoading
    ? "프로필 확인 중"
    : user?.skin_type
    ? `${user.skin_type} 피부`
    : "피부 정보 미등록";
  const genderChipText =
    !isProfileLoading && user?.gender ? `${user.gender}성` : null;

  const handleLogout = async () => {
    const result = await logout();

    if (result?.success === false) {
      Alert.alert("로그아웃 실패", result.error || "다시 시도해주세요.");
      return;
    }

    setAppIconBadgeCount(0);
    onLogout?.();
  };


  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        responsiveContentInsets,
        { paddingHorizontal: horizontalPadding },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={[styles.title, isCompact && styles.titleCompact]} numberOfLines={1}>
          마이페이지
        </Text>
        <TouchableOpacity
          activeOpacity={0.74}
          style={[styles.headerIconButton, isCompact && styles.headerIconButtonCompact]}
          onPress={() => onNavigate?.("notificationHistory")}
        >
          <Ionicons
            name="notifications-outline"
            size={isCompact ? 19 : 21}
            color={COLORS.olive}
          />
          {unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadBadgeText}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.78}
        style={[styles.profileCard, isCompact && styles.profileCardCompact]}
        onPress={() => onNavigate?.("profileDetail")}
        disabled={isProfileLoading}
      >
        <View style={styles.profileDecor} />

        <View style={styles.profileTop}>
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, isCompact && styles.avatarCompact]}>
              <Text style={[styles.avatarText, isCompact && styles.avatarTextCompact]}>
                {avatarInitial}
              </Text>
            </View>
          </View>

          <View style={styles.profileInfo}>
            <Text style={[styles.userName, isCompact && styles.userNameCompact]} numberOfLines={1}>
              {userName}
            </Text>
            <Text style={styles.email}>{userEmail}</Text>

            <View style={styles.chipRow}>
              <View style={styles.chip}>
                <Text style={styles.chipText}>{skinTypeText}</Text>
              </View>
              {genderChipText ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{genderChipText}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {!isProfileLoading ? (
            <View style={styles.profileActionHint}>
              <Text style={styles.profileActionText}>수정</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.muted} />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>앱 설정</Text>
      </View>

      <View style={[styles.managementGrid, { gap: cardGap }]}>
        {managementItems.map((item) => (
          <TouchableOpacity
            key={item.title}
            activeOpacity={0.78}
            style={[
              styles.managementCard,
              isCompact && styles.managementCardCompact,
              { width: managementCardWidth },
            ]}
            onPress={() => item.action && onNavigate?.(item.action)}
          >
            <View style={styles.managementTop}>
              <View style={[styles.iconCircle, isCompact && styles.iconCircleCompact]}>
                <Ionicons name={item.icon} size={isCompact ? 18 : 20} color={COLORS.olive} />
              </View>
              <Ionicons name="chevron-forward" size={17} color={COLORS.muted} />
            </View>

            <View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSub}>{item.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>서비스</Text>
      </View>



      <View style={styles.serviceCard}>
        {serviceItems.map((item, index) => {
          const isLogout = item.action === "logout";
          const isNav = !isLogout && !!item.action;
          const ItemComponent = isLogout || isNav ? TouchableOpacity : View;
          const itemProps = isLogout
            ? { activeOpacity: 0.78, disabled: isLoading, onPress: handleLogout }
            : isNav
            ? { activeOpacity: 0.78, onPress: () => onNavigate?.(item.action) }
            : {};

          return (
            <ItemComponent
              key={item.title}
              style={[
                styles.serviceItem,
                index !== serviceItems.length - 1 && styles.serviceDivider,
              ]}
              {...itemProps}
            >
              <View style={styles.serviceIconCircle}>
                <Ionicons name={item.icon} size={19} color={COLORS.olive} />
              </View>

              <View style={styles.serviceText}>
                <Text style={[styles.cardTitle, isLogout && styles.logoutText]}>
                  {item.title}
                </Text>
                <Text style={styles.cardSub}>{item.description}</Text>
              </View>

              {item.rightText ? (
                <Text style={styles.versionText}>{item.rightText}</Text>
              ) : (
                <Ionicons name="chevron-forward" size={17} color={COLORS.muted} />
              )}
            </ItemComponent>
          );
        })}
      </View>

      <View style={styles.securityBanner}>
        <Ionicons name="shield-checkmark-outline" size={19} color={COLORS.olive} />
        <Text style={styles.securityText}>
          Luvel은 사용자의 기록과 생활 데이터를 안전하게 보호합니다.
        </Text>
      </View>

    </ScrollView>
  );
}

const shadowCard =
  Platform.OS === "ios"
    ? {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      }
    : {
        elevation: 2,
      };

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    width: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 0,
  },
  titleCompact: {
    fontSize: 22,
    lineHeight: 28,
  },
  headerIconButton: {
    position: "relative",
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconButtonCompact: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
    color: "#FFFFFF",
    letterSpacing: 0,
  },
  profileCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    ...shadowCard,
  },
  profileCardCompact: {
    borderRadius: 18,
    padding: 14,
  },
  profileDecor: {
    position: "absolute",
    top: -18,
    right: -22,
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: COLORS.oliveLight,
    opacity: 0.64,
  },
  profileTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarWrap: {
    position: "relative",
    marginRight: 14,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#C8D5B9",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCompact: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  avatarText: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    color: COLORS.olive,
    letterSpacing: 0,
  },
  avatarTextCompact: {
    fontSize: 20,
    lineHeight: 26,
  },
  profileInfo: {
    flex: 1,
  },
  profileActionHint: {
    marginLeft: 8,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  profileActionText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    color: COLORS.muted,
    opacity: 0.88,
    letterSpacing: 0,
  },
  userName: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 0,
  },
  userNameCompact: {
    fontSize: 18,
    lineHeight: 23,
  },
  email: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: COLORS.muted,
    letterSpacing: 0,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  chip: {
    backgroundColor: COLORS.chip,
    borderColor: "#C8D5B9",
    borderWidth: 0.5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: "#4A6B38",
    letterSpacing: 0,
  },
  sectionHeader: {
    marginTop: 18,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 0,
  },
  managementGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
  },
  managementCard: {
    minHeight: 118,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    justifyContent: "space-between",
    ...shadowCard,
  },
  managementCardCompact: {
    minHeight: 104,
    borderRadius: 14,
    padding: 12,
  },
  managementTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleCompact: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  cardTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 0,
  },
  cardSub: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    color: COLORS.muted,
    letterSpacing: 0,
  },
  serviceCard: {
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    ...shadowCard,
  },
  serviceItem: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  serviceDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  serviceIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  serviceText: {
    flex: 1,
  },
  versionText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: COLORS.muted,
    letterSpacing: 0,
  },
  logoutText: {
    color: COLORS.oliveMuted,
  },
  securityBanner: {
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: COLORS.oliveLight,
    borderWidth: 1,
    borderColor: "#D9DEC9",
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  securityText: {
    flex: 1,
    marginLeft: 9,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    color: COLORS.oliveMuted,
    letterSpacing: 0,
  },
});

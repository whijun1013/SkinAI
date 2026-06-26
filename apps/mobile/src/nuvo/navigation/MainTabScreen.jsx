import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import useSkinCamera from "../../hooks/useSkinCamera";
import useDietCamera from "../../hooks/useDietCamera";
import SkinCameraModal from "../components/SkinCameraModal";
import DietRecordModal from "../components/DietRecordModal";
import DailyRecordFlowModal from "../components/DailyRecordFlowModal";
import { getNotificationUnreadCount } from "../../api/notifications";
import { refreshDietLogsCache } from "../../api/diet";
import { scheduleEnvironmentLogsRefresh } from "../../api/environment";
import useRecordCacheStore from "../../stores/recordCacheStore";
import { toDateStr } from "../screens/record/components/DateNavigator";
import {
  addNotificationNavigationListener,
  getInitialNotificationNavigationTarget,
  registerDevicePushToken,
  setAppIconBadgeCount,
} from "../utils/pushNotifications";

import HomeScreen from "../screens/tabs/HomeScreen";
import RecordScreen from "../screens/record/RecordScreen";
import ReportScreen from "../screens/tabs/ReportScreen";
import MyPageScreen from "../screens/tabs/MyPageScreen";
import SkinLogEntry from "../screens/record/SkinLogEntry";
import BehaviorLogEntry from "../screens/record/BehaviorLogEntry";
import DietLogEntry from "../screens/record/DietLogEntry";
import DietLogEditEntry from "../screens/record/DietLogEditEntry";

// 하위 화면 (기록 탭에서 진입)
import MyCosmeticsScreen from "../screens/cosmetics/MyCosmeticsScreen";
import PastCosmeticsScreen from "../screens/cosmetics/PastCosmeticsScreen";
import MyMedicationsScreen from "../screens/medications/MyMedicationsScreen";
import PastMedicationsScreen from "../screens/medications/PastMedicationsScreen";
import CosmeticSearchScreen from "../screens/cosmetics/CosmeticSearchScreen";
import MedicationSearchScreen from "../screens/medications/MedicationSearchScreen";
import EnvironmentLogScreen from "../screens/record/EnvironmentLogScreen";
import TermsPrivacyMenuScreen from "../screens/mypage/TermsPrivacyMenuScreen";
import TermsOfServiceScreen from "../screens/mypage/TermsOfServiceScreen";
import PrivacyPolicyScreen from "../screens/mypage/PrivacyPolicyScreen";
import DataProtectionScreen from "../screens/mypage/DataProtectionScreen";
import PermissionsScreen from "../screens/mypage/PermissionsScreen";
import NotificationSettingsScreen from "../screens/mypage/NotificationSettingsScreen";
import NotificationHistoryScreen from "../screens/mypage/NotificationHistoryScreen";
import ProfileDetailScreen from "../screens/tabs/ProfileDetailScreen";
import PeriodLogScreen from "../screens/record/PeriodLogScreen";
import MyPageSubScreenShell from "../screens/mypage/MyPageSubScreenShell";

const COLORS = {
  bg: "#F7F8F5",
  card: "#FFFFFF",
  line: "#D9D6CC",
  olive: "#4F603C",
  muted: "#8B9184",
};

const TAB_META = [
  { key: "home", label: "홈", icon: "home-outline", activeIcon: "home" },
  { key: "record", label: "기록", icon: "calendar-outline", activeIcon: "calendar" },
  { key: "report", label: "리포트", icon: "bar-chart-outline", activeIcon: "bar-chart" },
  { key: "mypage", label: "마이페이지", icon: "person-outline", activeIcon: "person" },
];

function parseNotificationTargetDate(value) {
  if (typeof value !== "string") return new Date();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export default function MainTabScreen({ onLogout, resetKey }) {
  const insets = useSafeAreaInsets();
  const pushTokenRegisteredRef = useRef(false);
  const lastNotificationNavigationKeyRef = useRef(null);
  const appIconBadgeSyncInFlightRef = useRef(false);
  const lastBadgeSyncAtRef = useRef(0);
  const lastSyncedBadgeCountRef = useRef(null);
  const [activeTab, setActiveTab] = useState("home");
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const [subScreen, setSubScreen] = useState(null);
  const [initialSkinPhotoUri, setInitialSkinPhotoUri] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dailyFlowVisible, setDailyFlowVisible] = useState(false);

  const { showCamera, handleSkinCamera, handleCapture, handleClose } = useSkinCamera(
    (capture) => {
      setSelectedDate(new Date());
      setInitialSkinPhotoUri(capture.photo_uri);
      setSubScreen("skinLogEntry");
    }
  );

  const [pendingDietCapture, setPendingDietCapture] = useState(null);
  const [editingDietLogId, setEditingDietLogId] = useState(null);

  const handleCloseDietModal = () => {
    setPendingDietCapture(null);
  };

  const { handleDietCamera, openGalleryForDate } = useDietCamera((data) => {
    setPendingDietCapture((prev) => {
      if (prev?.photo_uri !== data.photo_uri) return data;
      return {
        ...prev,
        ...data,
        captured_lat: data.captured_lat ?? prev.captured_lat ?? null,
        captured_lng: data.captured_lng ?? prev.captured_lng ?? null,
      };
    });
  });

  const handleRecordNavigate = (target, date) => {
    if (date) setSelectedDate(date);
    setInitialSkinPhotoUri(null);
    setSubScreen(target);
  };

  const handleOpenTodayRecord = (target) => {
    setSelectedDate(new Date());
    setInitialSkinPhotoUri(null);
    setSubScreen(target);
  };

  const handleReportRecordNavigate = useCallback((date) => {
    setSelectedDate(date || new Date());
    setInitialSkinPhotoUri(null);
    setSubScreen(null);
    setActiveTab("record");
  }, []);

  const handleSubScreenBack = () => {
    if (subScreen === "dietLogEdit") {
      setEditingDietLogId(null);
      setSubScreen("dietLogEntry");
      // 편집 화면에 있는 동안 enrich가 완료됐을 수 있으므로 목록으로 돌아올 때 조용히 갱신
      const dateStr = toDateStr(selectedDate);
      refreshDietLogsCache(dateStr);
      return;
    }
    setInitialSkinPhotoUri(null);
    setSubScreen(null);
  };

  const handleEditDietLog = (log) => {
    setEditingDietLogId(log.id);
    setSubScreen("dietLogEdit");
  };

  const handleRecordsChanged = useCallback(() => {
    setHomeRefreshKey((k) => k + 1);
    // 리포트 탭이 cacheEpoch를 구독해 재로드하므로 epoch를 함께 올림
    useRecordCacheStore.getState().incrementCacheEpoch();
  }, []);

  const syncAppIconBadge = useCallback(() => {
    if (activeTab === "mypage" && subScreen === null) return;
    if (appIconBadgeSyncInFlightRef.current) return;

    const now = Date.now();
    if (now - lastBadgeSyncAtRef.current < 5000) return;
    lastBadgeSyncAtRef.current = now;

    appIconBadgeSyncInFlightRef.current = true;
    getNotificationUnreadCount()
      .then((data) => {
        const nextCount = Number(data?.unread_count);
        const safeCount = Number.isFinite(nextCount) && nextCount > 0 ? nextCount : 0;
        if (lastSyncedBadgeCountRef.current === safeCount) return;
        lastSyncedBadgeCountRef.current = safeCount;
        setAppIconBadgeCount(safeCount);
      })
      .catch(() => {
        // 배지 동기화 실패는 UX에 영향 없음 — 콘솔 스팸 방지
      })
      .finally(() => {
        appIconBadgeSyncInFlightRef.current = false;
      });
  }, [activeTab, subScreen]);

  const tabScreens = useMemo(
    () => ({
      home: (
        <HomeScreen
          onSkinCamera={handleSkinCamera}
          onDietCamera={handleDietCamera}
          onNavigateRecord={handleOpenTodayRecord}
          onNavigateRecordDate={handleReportRecordNavigate}
          onOpenDailyFlow={() => setDailyFlowVisible(true)}
          onOpenNotifications={() => setSubScreen("notificationHistory")}
          onOpenReport={() => setActiveTab("report")}
          isActive={activeTab === "home" && subScreen === null}
          refreshKey={homeRefreshKey}
        />
      ),
      record: (
        <RecordScreen
          onNavigate={handleRecordNavigate}
          onOpenReport={() => {
            useRecordCacheStore.getState().incrementCacheEpoch();
            setActiveTab("report");
          }}
          refreshKey={homeRefreshKey}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
        />
      ),
      report: (
        <ReportScreen
          isActive={activeTab === "report"}
          selectedDate={selectedDate}
          onNavigateRecord={handleReportRecordNavigate}
        />
      ),
      mypage: (
        <MyPageScreen
          onLogout={onLogout}
          onNavigate={setSubScreen}
          isActive={activeTab === "mypage" && subScreen === null}
        />
      ),
    }),
    [
      handleSkinCamera,
      handleDietCamera,
      handleOpenTodayRecord,
      handleRecordNavigate,
      handleReportRecordNavigate,
      homeRefreshKey,
      selectedDate,
      activeTab,
      subScreen,
      onLogout,
    ]
  );

  useEffect(() => {
    setActiveTab("home");
    setSubScreen(null);
    setHomeRefreshKey((key) => key + 1);
    setSelectedDate(new Date());
    setInitialSkinPhotoUri(null);
    setPendingDietCapture(null);
    setEditingDietLogId(null);
    pushTokenRegisteredRef.current = false;
    lastNotificationNavigationKeyRef.current = null;
  }, [resetKey]);

  useEffect(() => {
    if (pushTokenRegisteredRef.current) return;
    pushTokenRegisteredRef.current = true;
    registerDevicePushToken();
  }, [resetKey]);

  useEffect(() => {
    syncAppIconBadge();
  }, [syncAppIconBadge]);

  const handleNotificationNavigation = useCallback((target) => {
    if (!target || (target.tab !== "report" && target.tab !== "record")) return;

    if (target.responseKey && lastNotificationNavigationKeyRef.current === target.responseKey) {
      return;
    }

    lastNotificationNavigationKeyRef.current = target.responseKey ?? `${target.type || "unknown"}:${Date.now()}`;
    setSubScreen(null);
    if (target.tab === "record") {
      setSelectedDate(parseNotificationTargetDate(target.targetDate));
      setInitialSkinPhotoUri(null);
      setActiveTab("record");
      return;
    }
    setActiveTab("report");
  }, []);

  useEffect(() => {
    let isMounted = true;

    getInitialNotificationNavigationTarget().then((target) => {
      if (isMounted) {
        handleNotificationNavigation(target);
      }
    });

    const subscription = addNotificationNavigationListener(handleNotificationNavigation);

    return () => {
      isMounted = false;
      subscription?.remove?.();
    };
  }, [handleNotificationNavigation]);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        syncAppIconBadge();
      }
    });

    const notificationSubscription = Notifications.addNotificationReceivedListener(() => {
      syncAppIconBadge();
    });

    return () => {
      appStateSubscription?.remove?.();
      notificationSubscription?.remove?.();
    };
  }, [syncAppIconBadge]);

  // 앱 시작 시 위치 권한이 없으면 조용히 요청 (식단 촬영 중 팝업 방지)
  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      if (status !== "granted") {
        Location.requestForegroundPermissionsAsync();
      }
    });
  }, []);

  // 탭 전환 시 하위 화면 초기화
  const handleTabPress = (key) => {
    if (key === "record") {
      setSelectedDate(new Date());
      setInitialSkinPhotoUri(null);
    }
    setActiveTab(key);
    setSubScreen(null);
  };

  // 하위 화면 렌더링
  const renderSubScreen = () => {
    switch (subScreen) {
      case "myCosmetics":
        return (
          <MyCosmeticsScreen
            onBack={handleSubScreenBack}
            onSearch={() => setSubScreen("cosmeticSearch")}
            onPast={() => setSubScreen("pastCosmetics")}
            selectedDate={selectedDate}
          />
        );
      case "pastCosmetics":
        return (
          <PastCosmeticsScreen onBack={() => setSubScreen("myCosmetics")} />
        );
      case "myMedications":
        return (
          <MyMedicationsScreen
            onBack={handleSubScreenBack}
            onSearch={() => setSubScreen("medicationSearch")}
            onPast={() => setSubScreen("pastMedications")}
          />
        );
      case "pastMedications":
        return (
          <PastMedicationsScreen onBack={() => setSubScreen("myMedications")} />
        );
      case "cosmeticSearch":
        return (
          <CosmeticSearchScreen
            onBack={() => setSubScreen("myCosmetics")}
            onAdded={(options) => {
              if (options?.keepSearchOpen) {
                useRecordCacheStore.getState().invalidateCosmeticsTab("current");
                return;
              }
              useRecordCacheStore.getState().invalidateCosmeticsTab("current");
              setSubScreen("myCosmetics");
            }}
            selectedDate={selectedDate}
          />
        );
      case "medicationSearch":
        return (
          <MedicationSearchScreen
            onBack={() => setSubScreen("myMedications")}
            onAdded={(options) => {
              if (options?.keepSearchOpen) {
                useRecordCacheStore.getState().invalidateMedicationsTab("current");
                return;
              }
              setSubScreen("myMedications");
            }}
          />
        );
      case "skinLogEntry":
        return (
          <SkinLogEntry
            selectedDate={selectedDate}
            initialPhotoUri={initialSkinPhotoUri}
            onBack={handleSubScreenBack}
            onDataChanged={() => {
              setInitialSkinPhotoUri(null);
              handleRecordsChanged();
            }}
          />
        );
      case "behaviorLogEntry":
        return (
          <BehaviorLogEntry
            selectedDate={selectedDate}
            onBack={handleSubScreenBack}
            onDataChanged={handleRecordsChanged}
          />
        );
      case "dietLogEntry":
        return (
          <DietLogEntry
            selectedDate={selectedDate}
            onEditLog={handleEditDietLog}
            onAddPhoto={() => {
              const dateStr = toDateStr(selectedDate);
              if (dateStr === toDateStr(new Date())) {
                handleDietCamera();
              } else {
                openGalleryForDate(dateStr);
              }
            }}
            onBack={handleSubScreenBack}
          />
        );
      case "dietLogEdit":
        return editingDietLogId ? (
          <DietLogEditEntry
            logId={editingDietLogId}
            selectedDate={selectedDate}
            onBack={handleSubScreenBack}
            onDataChanged={handleRecordsChanged}
          />
        ) : null;
      case "environmentLogs":
        return (
          <EnvironmentLogScreen
            selectedDate={selectedDate}
            onBack={handleSubScreenBack}
          />
        );
      case "profileDetail":
        return (
          <ProfileDetailScreen onBack={handleSubScreenBack} onLogout={onLogout} />
        );
      case "termsPrivacyMenu":
        return (
          <MyPageSubScreenShell onBack={handleSubScreenBack}>
            <TermsPrivacyMenuScreen
              onBack={handleSubScreenBack}
              onNavigate={(target) => setSubScreen(target)}
            />
          </MyPageSubScreenShell>
        );
      case "termsOfService":
        return (
          <MyPageSubScreenShell onBack={() => setSubScreen("termsPrivacyMenu")}>
            <TermsOfServiceScreen onBack={() => setSubScreen("termsPrivacyMenu")} />
          </MyPageSubScreenShell>
        );
      case "privacyPolicy":
        return (
          <MyPageSubScreenShell onBack={() => setSubScreen("termsPrivacyMenu")}>
            <PrivacyPolicyScreen onBack={() => setSubScreen("termsPrivacyMenu")} />
          </MyPageSubScreenShell>
        );
      case "dataProtection":
        return (
          <MyPageSubScreenShell onBack={() => setSubScreen("termsPrivacyMenu")}>
            <DataProtectionScreen onBack={() => setSubScreen("termsPrivacyMenu")} />
          </MyPageSubScreenShell>
        );
      case "periodLogs":
        return (
          <PeriodLogScreen
            onBack={handleSubScreenBack}
            selectedDate={selectedDate}
            onDataChanged={handleRecordsChanged}
          />
        );
      case "permissions":
        return (
          <MyPageSubScreenShell onBack={handleSubScreenBack}>
            <PermissionsScreen onBack={handleSubScreenBack} />
          </MyPageSubScreenShell>
        );
      case "notificationSettings":
        return (
          <MyPageSubScreenShell onBack={handleSubScreenBack}>
            <NotificationSettingsScreen onBack={handleSubScreenBack} />
          </MyPageSubScreenShell>
        );
      case "notificationHistory":
        return (
          <MyPageSubScreenShell onBack={handleSubScreenBack}>
            <NotificationHistoryScreen
              onBack={handleSubScreenBack}
              onNavigateNotification={handleNotificationNavigation}
            />
          </MyPageSubScreenShell>
        );
      default:
        return null;
    }
  };

  const isSubScreenActive = subScreen !== null;

  const heroHeaderBg = "#4A7C59";
  const isHeroTabVisible = (activeTab === "home" || activeTab === "mypage") && !isSubScreenActive;

  // 서브화면별 히어로 헤더 색상 (상태바 fill과 동기화)
  const SUB_SCREEN_HERO_BG = {
    skinLogEntry:     "#4F603C",
    dietLogEntry:     "#C49A5A",
    dietLogEdit:      "#C49A5A",
    behaviorLogEntry: "#5A6E8A",
    environmentLogs:  "#477A7F",
    myCosmetics:      "#6B5F88",
    pastCosmetics:    "#6B5F88",
    cosmeticSearch:   "#6B5F88",
    myMedications:    "#8C4444",
    pastMedications:  "#8C4444",
    medicationSearch: "#8C4444",
    periodLogs:       "#8A4E65",
  };
  const subScreenHeroBg = subScreen ? (SUB_SCREEN_HERO_BG[subScreen] ?? null) : null;
  const statusBarBg = isHeroTabVisible
    ? heroHeaderBg
    : isSubScreenActive
      ? (subScreenHeroBg ?? COLORS.bg)
      : COLORS.bg;

  return (
    <View style={styles.screenRoot}>
    <SkinCameraModal
      visible={showCamera}
      onCapture={handleCapture}
      onClose={handleClose}
    />

    <DietRecordModal
      visible={pendingDietCapture !== null}
      capture={pendingDietCapture}
      onClose={handleCloseDietModal}
      onSaved={(savedDateStr, meta = {}) => {
        const dateStr = savedDateStr || toDateStr(new Date());
        refreshDietLogsCache(dateStr);
        if (meta.environmentQueued) {
          scheduleEnvironmentLogsRefresh(dateStr);
        } else {
          useRecordCacheStore.getState().invalidateEnvironment(dateStr);
        }
        handleRecordsChanged();
      }}
    />

    <DailyRecordFlowModal
      visible={dailyFlowVisible}
      onClose={() => setDailyFlowVisible(false)}
      onComplete={handleRecordsChanged}
      onGoSkinRecord={() => { setDailyFlowVisible(false); setActiveTab("record"); setSubScreen("skinLogEntry"); }}
      onGoDietRecord={() => { setDailyFlowVisible(false); setActiveTab("record"); setSubScreen("dietLogEntry"); }}
    />

    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.root}>
        <View style={styles.scene}>
          {TAB_META.map((tab) => (
            <View
              key={tab.key}
              style={[
                styles.tabPane,
                (activeTab !== tab.key || isSubScreenActive) && styles.tabPaneHidden,
              ]}
              pointerEvents={activeTab === tab.key && !isSubScreenActive ? "auto" : "none"}
            >
              {tabScreens[tab.key]}
            </View>
          ))}
          {isSubScreenActive ? (
            <View style={[styles.subScreenOverlay, subScreenHeroBg && { backgroundColor: subScreenHeroBg }]}>
              {renderSubScreen()}
            </View>
          ) : null}
        </View>

        {/* 탭 바 하단 배경 — 상세 화면에서는 footer와 겹치므로 숨김 */}
        {!isSubScreenActive && insets.bottom > 0 && (
          <View
            style={[styles.bottomFill, { height: insets.bottom }]}
            pointerEvents="none"
          />
        )}

        {/* 상세 화면: 하단 고정 버튼과 겹치지 않도록 탭 바 숨김 */}
        {!isSubScreenActive && (
          <View
            style={[
              styles.tabBarWrap,
              { bottom: Math.max(8, 22 - insets.bottom) },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.tabBar}>
              {TAB_META.map((tab) => {
                const isActive = tab.key === activeTab;
                const color = isActive ? COLORS.olive : COLORS.muted;

                return (
                  <TouchableOpacity
                    key={tab.key}
                    activeOpacity={0.78}
                    style={styles.tabButton}
                    onPress={() => handleTabPress(tab.key)}
                  >
                    <View
                      style={[
                        styles.iconBubble,
                        isActive && styles.iconBubbleActive,
                      ]}
                    >
                      <Ionicons
                        name={isActive ? tab.activeIcon : tab.icon}
                        size={22}
                        color={color}
                      />
                    </View>
                    <Text style={[styles.tabLabel, isActive && styles.tabLabelActive, { color }]}>{tab.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>

    {/* 상단 상태바 배경 — SafeAreaView 위에 렌더링해야 덮임 */}
    <View
      style={[
        styles.statusBarFill,
        { height: insets.top, backgroundColor: statusBarBg },
      ]}
      pointerEvents="none"
    />

    </View>
  );
}

const shadowTab =
  Platform.OS === "ios"
    ? {
        shadowColor: "#000000",
        shadowOpacity: 0.07,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      }
    : { elevation: 4 };

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  statusBarFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scene: {
    flex: 1,
  },
  tabPane: {
    ...StyleSheet.absoluteFillObject,
  },
  tabPaneHidden: {
    opacity: 0,
    zIndex: -1,
  },
  subScreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: COLORS.bg,
  },
  bottomFill: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bg,
  },

  tabBarWrap: {
    position: "absolute",
    left: 18,
    right: 18,
  },
  tabBar: {
    height: 68,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "#E2E5DA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    ...shadowTab,
  },
  tabButton: {
    flex: 1,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBubble: {
    width: 34,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBubbleActive: {
    backgroundColor: "#E4EBD8",
  },
  tabLabel: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    letterSpacing: 0,
  },
  tabLabelActive: {
    fontWeight: "800",
  },
});

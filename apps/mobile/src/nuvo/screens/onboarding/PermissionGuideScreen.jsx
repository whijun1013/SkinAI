import React, { useRef, useState } from "react";
import {
  Dimensions,
  Image,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { BASE_WIDTH, sx, sy, s } from "../../../utils/responsive";

const { height } = Dimensions.get("window");

const COLORS = {
  bg: "#F8F7F2",
  card: "#FFFCF7",
  inputBg: "#FCFAF6",
  line: "#D9D6CC",
  olive: "#4F603C",
  oliveSecondary: "#2E7D50",
  oliveSoft: "#E8EEDD",
  circleBg: "#E6E9DB",
  text: "#1F2520",
  muted: "#8B9184",
  ctaDisabled: "#B9C5A8",
  cta: "#4F603C",
  ctaText: "#F7F7F2",
  white: "#FFFFFF",
};

const PERMISSIONS = [
  {
    key: "camera",
    icon: "camera-outline",
    title: "카메라",
    description: "피부 사진 촬영 및 기록",
    badge: "선택",
  },
  {
    key: "media",
    icon: "image-outline",
    title: "사진",
    description: "기록 이미지 저장 및 업로드",
    badge: "선택",
  },
  {
    key: "location",
    icon: "location-outline",
    title: "위치",
    description: "식단 기록 시 날씨·환경 정보 자동 수집",
    badge: "선택",
  },
  {
    key: "notification",
    icon: "notifications-outline",
    title: "알림",
    description: "기록 리마인드 및 중요 알림",
    badge: "선택",
  },
  {
    key: "health",
    icon: "heart-outline",
    title: "건강 데이터",
    description: "수면, 운동 등 생활 흐름 참고",
    badge: "선택",
  },
];

const getPermissionState = (result) => {
  if (result?.granted || result?.status === "granted") {
    return "granted";
  }

  return "denied";
};

export default function PermissionGuideScreen({
  onBack,
  onComplete,
  onNext,
  onStart,
}) {
  const insets = useSafeAreaInsets();
  const availableHeight = height - insets.top - insets.bottom;
  const safeTop = (value) => Math.max(0, sy(value) - insets.top);
  const safeBottom = (value) => Math.max(0, sy(value) - insets.bottom);
  const [permissionStatus, setPermissionStatus] = useState({
    camera: "idle",
    media: "idle",
    location: "idle",
    notification: "idle",
    health: "not_requested",
  });
  const [selectedPermissions, setSelectedPermissions] = useState({
    camera: false,
    media: false,
    location: false,
    notification: false,
    health: false,
  });
  const [isRequesting, setIsRequesting] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);

  const hasSelectedPermission = Object.values(selectedPermissions).some(Boolean);
  const swipeBackResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dx >= 70 && Math.abs(gestureState.dy) <= 40,
      onMoveShouldSetPanResponderCapture: (_, gestureState) =>
        gestureState.dx >= 70 && Math.abs(gestureState.dy) <= 40,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= 70 && Math.abs(gestureState.dy) <= 40) {
          onBack?.();
        }
      },
    }),
  ).current;

  const updatePermissionStatus = (key, status) => {
    setPermissionStatus((prev) => ({
      ...prev,
      [key]: status,
    }));
  };

  const moveNext = () => {
    if (onComplete) {
      onComplete();
      return;
    }

    if (onNext) {
      onNext();
      return;
    }

    onStart?.();
  };

  const requestPermission = async (key, requester) => {
    updatePermissionStatus(key, "requesting");

    try {
      const result = await requester();
      console.log(`[Permission] ${key} result`, result);
      updatePermissionStatus(key, getPermissionState(result));
    } catch (error) {
      console.warn(`${key} permission request failed`, error);
      updatePermissionStatus(key, "denied");
    }
  };

  const togglePermission = (key) => {
    if (isRequesting) return;

    setSelectedPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handlePermissionRequest = async () => {
    console.log("[Permission] CTA pressed");
    console.log("[Permission] selectedPermissions", selectedPermissions);

    if (isRequesting) return;

    if (!hasSelectedPermission) {
      moveNext();
      return;
    }

    setIsRequesting(true);
    setHasRequested(true);

    try {
      if (selectedPermissions.camera) {
        console.log("[Permission] request camera");
        await requestPermission("camera", () =>
          Camera.requestCameraPermissionsAsync(),
        );
      }

      if (selectedPermissions.media) {
        console.log("[Permission] request media");
        await requestPermission("media", () =>
          ImagePicker.requestMediaLibraryPermissionsAsync(),
        );
      }

      if (selectedPermissions.location) {
        console.log("[Permission] request location");
        await requestPermission("location", () =>
          Location.requestForegroundPermissionsAsync(),
        );
      }

      if (selectedPermissions.notification) {
        console.log("[Permission] request notification");
        await requestPermission("notification", () =>
          Notifications.requestPermissionsAsync(),
        );
      }

      if (selectedPermissions.health) {
        console.log("[Permission] health skipped");
        updatePermissionStatus("health", "skipped");
      }
    } catch (error) {
      console.warn("Permission request failed", error);
    } finally {
      setIsRequesting(false);
      moveNext();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[styles.root, { minHeight: availableHeight }]}
          {...swipeBackResponder.panHandlers}
        >
          <BackgroundDecorations />

        <View style={[styles.content, { top: safeTop(84) }]}>
          <Image
            source={require("../../../../assets/logo-nuvo.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.description}>
            더 정확한 기록과 분석을 위해 필요한 권한을 확인해 주세요.
          </Text>

          <View style={styles.permissionPanel}>
            {PERMISSIONS.map((item) => (
              <PermissionRow
                key={item.key}
                item={item}
                status={permissionStatus[item.key]}
                selected={selectedPermissions[item.key]}
                disabled={isRequesting}
                onToggle={() => togglePermission(item.key)}
              />
            ))}
          </View>
        </View>

        <View style={[styles.bottomArea, { bottom: safeBottom(42) }]}>
          <View style={styles.dots}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotActive]} />
          </View>

          {hasRequested ? (
            <Text style={styles.retryNotice}>
              일부 권한은 나중에 마이페이지에서 다시 설정할 수 있어요.
            </Text>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={isRequesting}
            style={[styles.ctaButton, isRequesting && styles.ctaButtonDisabled]}
            onPress={handlePermissionRequest}
          >
            <Text style={styles.ctaText}>
              {isRequesting
                ? "권한 확인 중..."
                : hasSelectedPermission
                  ? "선택한 권한 허용하기"
                  : "건너뛰고 시작하기"}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={s(22)}
              color={COLORS.ctaText}
              style={styles.ctaIcon}
            />
          </TouchableOpacity>

          <View style={styles.securityNotice}>
            <Ionicons
              name="shield-checkmark-outline"
              size={s(17)}
              color={COLORS.oliveSecondary}
            />
            <Text style={styles.securityText}>
              NUVO는 당신의 데이터를 안전하게 보호합니다.
            </Text>
          </View>
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BackgroundDecorations() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.bgBase} />
      <Image
        source={require("../../../../assets/leaf-shadow-right.png")}
        style={styles.topLeafShadow}
        resizeMode="contain"
      />
      <Image
        source={require("../../../../assets/leaf-left.png")}
        style={styles.leftLeaf}
        resizeMode="contain"
      />
      <Image
        source={require("../../../../assets/leaf-shadow-right.png")}
        style={styles.rightLeafShadow}
        resizeMode="contain"
      />
      <View style={styles.topSoftCircle} />
      <View style={styles.centerHalo} />
      <View style={styles.bottomGlow} />
    </View>
  );
}

function PermissionRow({ item, status, selected, disabled, onToggle }) {
  const isRequesting = status === "requesting";

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={disabled}
      style={styles.permissionRow}
      onPress={onToggle}
    >
      <View style={styles.iconCircle}>
        <Ionicons name={item.icon} size={s(22)} color={COLORS.olive} />
      </View>

      <View style={styles.permissionTextBlock}>
        <Text style={styles.permissionTitle}>{item.title}</Text>
        <Text style={styles.permissionDescription}>{item.description}</Text>
      </View>

      <View
        style={[
          styles.toggleTrack,
          selected ? styles.toggleTrackOn : styles.toggleTrackOff,
          isRequesting && styles.toggleTrackRequesting,
        ]}
      >
        <View
          style={[
            styles.toggleThumb,
            selected ? styles.toggleThumbOn : styles.toggleThumbOff,
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

const shadowCard =
  Platform.OS === "ios"
    ? {
        shadowColor: "#D7D0C2",
        shadowOpacity: 0.18,
        shadowRadius: s(18),
        shadowOffset: {
          width: 0,
          height: s(8),
        },
      }
    : {
        elevation: 4,
      };

const shadowButton =
  Platform.OS === "ios"
    ? {
        shadowColor: "#4F603C",
        shadowOpacity: 0.2,
        shadowRadius: s(14),
        shadowOffset: {
          width: 0,
          height: s(7),
        },
      }
    : {
        elevation: 5,
      };

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
  },

  root: {
    width: "100%",
    maxWidth: sx(BASE_WIDTH),
    alignSelf: "center",
    position: "relative",
    overflow: "hidden",
    backgroundColor: COLORS.bg,
  },

  scrollView: {
    flex: 1,
    width: "100%",
  },

  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
  },

  bgBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
  },

  topLeafShadow: {
    position: "absolute",
    top: sy(-46),
    left: sx(-48),
    width: sx(220),
    height: sy(260),
    opacity: 0.14,
    transform: [{ rotate: "180deg" }],
  },

  leftLeaf: {
    position: "absolute",
    top: sy(288),
    left: sx(-68),
    width: sx(162),
    height: sy(392),
    opacity: 0.28,
  },

  rightLeafShadow: {
    position: "absolute",
    top: sy(232),
    right: sx(-58),
    width: sx(174),
    height: sy(440),
    opacity: 0.22,
  },

  topSoftCircle: {
    position: "absolute",
    top: sy(124),
    right: sx(-78),
    width: sx(176),
    height: sx(176),
    borderRadius: sx(88),
    backgroundColor: "rgba(230, 233, 219, 0.34)",
  },

  centerHalo: {
    position: "absolute",
    top: sy(286),
    alignSelf: "center",
    width: sx(360),
    height: sx(360),
    borderRadius: sx(180),
    backgroundColor: "rgba(232, 238, 221, 0.42)",
  },

  bottomGlow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: sy(260),
    backgroundColor: "rgba(255, 252, 247, 0.36)",
  },

  content: {
    position: "absolute",
    left: sx(24),
    right: sx(24),
    alignItems: "center",
    zIndex: 5,
  },

  logo: {
    width: sx(198),
    height: sy(76),
  },

  description: {
    marginTop: sy(30),
    width: sx(314),
    fontSize: s(15.2),
    lineHeight: s(24),
    fontWeight: "600",
    color: COLORS.muted,
    textAlign: "center",
    letterSpacing: 0,
  },

  permissionPanel: {
    marginTop: sy(38),
    width: sx(354),
    borderRadius: s(28),
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: sx(14),
    paddingVertical: sy(12),
    ...shadowCard,
  },

  permissionRow: {
    minHeight: sy(76),
    borderRadius: s(20),
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: "rgba(217, 214, 204, 0.72)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: sx(14),
    paddingVertical: sy(12),
    marginVertical: sy(5),
  },

  iconCircle: {
    width: s(42),
    height: s(42),
    borderRadius: s(21),
    backgroundColor: COLORS.circleBg,
    alignItems: "center",
    justifyContent: "center",
    marginRight: sx(12),
  },

  permissionTextBlock: {
    flex: 1,
    paddingRight: sx(10),
  },

  permissionTitle: {
    fontSize: s(15.6),
    lineHeight: s(21),
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: 0,
  },

  permissionDescription: {
    marginTop: sy(3),
    fontSize: s(11.8),
    lineHeight: s(17.5),
    fontWeight: "500",
    color: COLORS.muted,
    letterSpacing: 0,
  },

  toggleTrack: {
    width: sx(48),
    height: sy(28),
    borderRadius: sy(14),
    padding: s(3),
    justifyContent: "center",
  },

  toggleTrackOn: {
    backgroundColor: COLORS.olive,
  },

  toggleTrackOff: {
    backgroundColor: COLORS.line,
  },

  toggleTrackRequesting: {
    backgroundColor: "#AFC19A",
  },

  toggleThumb: {
    width: s(22),
    height: s(22),
    borderRadius: s(11),
    backgroundColor: COLORS.white,
  },

  toggleThumbOn: {
    alignSelf: "flex-end",
  },

  toggleThumbOff: {
    alignSelf: "flex-start",
  },

  bottomArea: {
    position: "absolute",
    left: sx(24),
    right: sx(24),
    alignItems: "center",
    zIndex: 8,
  },

  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sy(14),
  },

  dot: {
    width: s(8.5),
    height: s(8.5),
    borderRadius: s(4.25),
    backgroundColor: "#E0E4D8",
    marginHorizontal: sx(7),
  },

  dotActive: {
    backgroundColor: COLORS.olive,
  },

  retryNotice: {
    marginBottom: sy(12),
    fontSize: s(11.8),
    lineHeight: s(17),
    fontWeight: "500",
    color: COLORS.muted,
    textAlign: "center",
    letterSpacing: 0,
  },

  ctaButton: {
    width: sx(326),
    height: sy(54),
    borderRadius: sy(27),
    backgroundColor: COLORS.cta,
    alignItems: "center",
    justifyContent: "center",
    ...shadowButton,
  },

  ctaButtonDisabled: {
    backgroundColor: COLORS.ctaDisabled,
  },

  ctaText: {
    color: COLORS.ctaText,
    fontSize: s(15.6),
    lineHeight: s(21),
    fontWeight: "800",
    letterSpacing: 0,
  },

  ctaIcon: {
    position: "absolute",
    right: sx(22),
  },

  securityNotice: {
    marginTop: sy(16),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  securityText: {
    marginLeft: sx(7),
    fontSize: s(12.2),
    lineHeight: s(18),
    fontWeight: "600",
    color: COLORS.muted,
    letterSpacing: 0,
  },
});

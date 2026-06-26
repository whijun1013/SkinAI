import React, { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
  AppState,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import ScreenHeader from "./ScreenHeader";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 16 * 2 - 10) / 2;

const COLORS = {
  bg: "#F7F8F5",
  olive: "#4F603C",
  oliveSoft: "#E4EBD8",
  oliveMid: "#C8D8A8",
  card: "#FFFFFF",
  text: "#1A1F17",
  muted: "#8A9080",
  line: "#E2E5DA",
  danger: "#B85A50",
  dangerSoft: "#FEF0EE",
};

const PERMISSIONS_CONFIG = [
  {
    key: "camera",
    icon: "camera-outline",
    iconActive: "camera",
    title: "카메라",
    label: "피부 촬영",
  },
  {
    key: "media",
    icon: "image-outline",
    iconActive: "image",
    title: "사진",
    label: "이미지 저장",
  },
  {
    key: "location",
    icon: "location-outline",
    iconActive: "location",
    title: "위치",
    label: "환경 수집",
  },
  {
    key: "notification",
    icon: "notifications-outline",
    iconActive: "notifications",
    title: "알림",
    label: "리마인드",
  },
];

export default function PermissionsScreen({ onBack }) {
  const [permissions, setPermissions] = useState({
    camera: "loading",
    media: "loading",
    location: "loading",
    notification: "loading",
  });
  const [loading, setLoading] = useState(true);

  const checkPermissions = useCallback(async () => {
    try {
      const [cam, media, loc, notif] = await Promise.all([
        Camera.getCameraPermissionsAsync(),
        ImagePicker.getMediaLibraryPermissionsAsync(),
        Location.getForegroundPermissionsAsync(),
        Notifications.getPermissionsAsync(),
      ]);
      setPermissions({
        camera: cam.granted ? "granted" : "denied",
        media: media.granted ? "granted" : "denied",
        location: loc.granted ? "granted" : "denied",
        notification: notif.granted ? "granted" : "denied",
      });
    } catch {
      setPermissions({ camera: "denied", media: "denied", location: "denied", notification: "denied" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkPermissions();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") checkPermissions();
    });
    return () => sub.remove();
  }, [checkPermissions]);

  const requestPermission = async (key) => {
    try {
      let result;
      if (key === "camera") result = await Camera.requestCameraPermissionsAsync();
      else if (key === "media") result = await ImagePicker.requestMediaLibraryPermissionsAsync();
      else if (key === "location") result = await Location.requestForegroundPermissionsAsync();
      else if (key === "notification") result = await Notifications.requestPermissionsAsync();
      if (result?.granted) setPermissions((p) => ({ ...p, [key]: "granted" }));
      else if (result && !result.canAskAgain) Linking.openSettings();
      else checkPermissions();
    } catch { Linking.openSettings(); }
  };

  const grantedCount = Object.values(permissions).filter((s) => s === "granted").length;
  const allGranted = grantedCount === 4;

  return (
    <View style={styles.root}>
      <ScreenHeader title="권한 설정" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── 상태 요약 바 ── */}
        {!loading && (
          <View style={[styles.statusBar, allGranted && styles.statusBarAll]}>
            <Ionicons
              name={allGranted ? "shield-checkmark" : "shield-outline"}
              size={15}
              color={allGranted ? COLORS.olive : COLORS.muted}
            />
            <Text style={[styles.statusBarText, allGranted && styles.statusBarTextAll]}>
              {`${grantedCount} / 4개 허용됨`}
            </Text>
          </View>
        )}

        {/* ── 2열 그리드 ── */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={COLORS.olive} />
            <Text style={styles.loadingText}>권한 확인 중...</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {PERMISSIONS_CONFIG.map((item) => {
              const granted = permissions[item.key] === "granted";
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.gridCard, granted ? styles.gridCardGranted : styles.gridCardDenied]}
                  activeOpacity={0.8}
                  onPress={granted ? Linking.openSettings : () => requestPermission(item.key)}
                >
                  {/* 상태 점 */}
                  <View style={[styles.statusDot, granted ? styles.statusDotOn : styles.statusDotOff]} />

                  {/* 아이콘 */}
                  <View style={[styles.gridIconWrap, granted ? styles.gridIconGranted : styles.gridIconDenied]}>
                    <Ionicons
                      name={granted ? item.iconActive : item.icon}
                      size={26}
                      color={granted ? COLORS.olive : COLORS.danger}
                    />
                  </View>

                  {/* 제목 */}
                  <Text style={[styles.gridTitle, !granted && styles.gridTitleDenied]}>{item.title}</Text>

                  {/* 라벨 */}
                  <Text style={styles.gridLabel}>{item.label}</Text>

                  {/* 액션 */}
                  <View style={[styles.gridBtn, granted ? styles.gridBtnGranted : styles.gridBtnDenied]}>
                    <Ionicons name={granted ? "checkmark" : "add"} size={11} color={granted ? COLORS.olive : "#fff"} />
                    <Text style={[styles.gridBtnText, granted ? styles.gridBtnTextGranted : styles.gridBtnTextDenied]}>
                      {granted ? "허용됨" : "허용하기"}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── 안내 ── */}
        <View style={styles.footnote}>
          <Ionicons name="information-circle-outline" size={13} color={COLORS.muted} style={{ marginTop: 1 }} />
          <Text style={styles.footnoteText}>
            「허용됨」을 탭하면 기기 설정에서 해제할 수 있어요.
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

const shadow = Platform.OS === "ios"
  ? { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10 }
  : { elevation: 3 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 48 },

  /* ── 상태 바 ── */
  statusBar: {
    flexDirection: "row", alignItems: "center", gap: 7,
    alignSelf: "flex-start",
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
    backgroundColor: COLORS.card, borderColor: COLORS.line,
    marginBottom: 14,
  },
  statusBarAll: { backgroundColor: COLORS.oliveSoft, borderColor: COLORS.oliveMid },
  statusBarText: { fontSize: 12.5, fontWeight: "700", color: COLORS.muted },
  statusBarTextAll: { color: COLORS.olive },

  /* ── 그리드 ── */
  grid: {
    flexDirection: "row", flexWrap: "wrap", gap: 10,
  },
  gridCard: {
    width: CARD_W, borderRadius: 18,
    borderWidth: 1.5,
    paddingTop: 18, paddingBottom: 16, paddingHorizontal: 14,
    alignItems: "center",
    position: "relative",
    ...shadow,
  },
  gridCardGranted: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.oliveMid,
  },
  gridCardDenied: {
    backgroundColor: "#FFFBFA",
    borderColor: "#F0DDD9",
  },

  /* 상태 점 */
  statusDot: {
    position: "absolute", top: 12, right: 12,
    width: 8, height: 8, borderRadius: 4,
  },
  statusDotOn: { backgroundColor: COLORS.olive },
  statusDotOff: { backgroundColor: COLORS.danger, opacity: 0.6 },

  /* 아이콘 */
  gridIconWrap: {
    width: 54, height: 54, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  gridIconGranted: { backgroundColor: COLORS.oliveSoft },
  gridIconDenied: { backgroundColor: COLORS.dangerSoft },

  /* 텍스트 */
  gridTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text, marginBottom: 2 },
  gridTitleDenied: { color: COLORS.text },
  gridLabel: { fontSize: 11, color: COLORS.muted, fontWeight: "600", marginBottom: 14 },

  /* 버튼 */
  gridBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20,
  },
  gridBtnGranted: { backgroundColor: COLORS.oliveSoft, borderWidth: 1, borderColor: COLORS.oliveMid },
  gridBtnDenied: { backgroundColor: COLORS.danger },
  gridBtnText: { fontSize: 11, fontWeight: "700" },
  gridBtnTextGranted: { color: COLORS.olive },
  gridBtnTextDenied: { color: "#fff" },

  /* 로딩 */
  loadingWrap: {
    height: 200, alignItems: "center", justifyContent: "center", gap: 10,
  },
  loadingText: { fontSize: 13, fontWeight: "600", color: COLORS.muted },

  /* 안내 */
  footnote: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    marginTop: 20, paddingHorizontal: 2,
  },
  footnoteText: { flex: 1, fontSize: 12, color: COLORS.muted, fontWeight: "500", lineHeight: 18 },
});

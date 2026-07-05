import React, { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
  AppState
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import ScreenHeader from "./ScreenHeader";

const COLORS = {
  background: "#F8F7F2",
  olive: "#4F603C",
  oliveMuted: "#4A5D4E",
  oliveSoft: "#EEF0E6",
  card: "#FFFFFF",
  text: "#2D2D2D",
  muted: "#7A8A6A",
  border: "#E0DDD4",
  danger: "#B85A50",
  success: "#4A6B38"
};

const PERMISSIONS_CONFIG = [
  {
    key: "camera",
    icon: "camera-outline",
    title: "카메라",
    description: "피부 사진 촬영 및 식단 기록을 위해 사용됩니다.",
  },
  {
    key: "media",
    icon: "image-outline",
    title: "사진 및 미디어",
    description: "기록 이미지를 저장하고 업로드하는 데 사용됩니다.",
  },
  {
    key: "location",
    icon: "location-outline",
    title: "위치 정보",
    description: "식단 기록 시 날씨 및 환경 정보 자동 수집에 활용됩니다.",
  },
  {
    key: "notification",
    icon: "notifications-outline",
    title: "알림",
    description: "기록 리마인드 및 분석 완료 등 중요 알림을 전송합니다.",
  }
];

export default function PermissionsScreen({ onBack }) {
  const [permissions, setPermissions] = useState({
    camera: "loading",
    media: "loading",
    location: "loading",
    notification: "loading",
  });
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const checkPermissions = useCallback(async () => {
    try {
      const cameraStatus = await Camera.getCameraPermissionsAsync();
      const mediaStatus = await ImagePicker.getMediaLibraryPermissionsAsync();
      const locationStatus = await Location.getForegroundPermissionsAsync();
      const notifStatus = await Notifications.getPermissionsAsync();

      setPermissions({
        camera: cameraStatus.granted ? "granted" : "denied",
        media: mediaStatus.granted ? "granted" : "denied",
        location: locationStatus.granted ? "granted" : "denied",
        notification: notifStatus.granted ? "granted" : "denied",
      });
    } catch (error) {
      console.warn("권한 확인 실패:", error);
      setPermissions({
        camera: "denied",
        media: "denied",
        location: "denied",
        notification: "denied",
      });
    } finally {
      setIsInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    checkPermissions();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        checkPermissions();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [checkPermissions]);

  const handleOpenSettings = () => {
    Linking.openSettings();
  };

  const requestPermission = async (key) => {
    // If not determined or the user wants to try requesting inside app
    try {
      let result;
      if (key === "camera") {
        result = await Camera.requestCameraPermissionsAsync();
      } else if (key === "media") {
        result = await ImagePicker.requestMediaLibraryPermissionsAsync();
      } else if (key === "location") {
        result = await Location.requestForegroundPermissionsAsync();
      } else if (key === "notification") {
        result = await Notifications.requestPermissionsAsync();
      }

      if (result && result.granted) {
        setPermissions((prev) => ({ ...prev, [key]: "granted" }));
      } else if (result && !result.canAskAgain) {
        handleOpenSettings();
      } else {
        checkPermissions();
      }
    } catch (e) {
      handleOpenSettings();
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="권한 설정" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleSection}>
          <Text style={styles.mainTitle}>앱 권한 관리</Text>
          <Text style={styles.subTitle}>
            안전하고 원활한 서비스 이용을 위해{"\n"}앱에 허용된 권한을 확인하고 관리할 수 있습니다.
          </Text>
        </View>

        <View style={styles.cardContainer}>
          {isInitialLoading ? (
            <View style={styles.loadingPanel}>
              <ActivityIndicator size="small" color={COLORS.olive} />
              <Text style={styles.loadingText}>권한 상태 확인 중...</Text>
            </View>
          ) : (
          PERMISSIONS_CONFIG.map((item, index) => {
            const status = permissions[item.key];
            const isGranted = status === "granted";

            return (
              <View
                key={item.key}
                style={[
                  styles.permissionRow,
                  index !== PERMISSIONS_CONFIG.length - 1 && styles.rowDivider,
                ]}
              >
                <View style={styles.rowLeft}>
                  <View style={styles.iconCircle}>
                    <Ionicons name={item.icon} size={22} color={COLORS.olive} />
                  </View>
                  <View style={styles.textWrap}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemDescription}>{item.description}</Text>
                  </View>
                </View>

                <View style={styles.rowRight}>
                  {isGranted ? (
                    <TouchableOpacity
                      style={styles.statusBadgeGranted}
                      activeOpacity={0.7}
                      onPress={handleOpenSettings}
                    >
                      <Text style={styles.statusBadgeTextGranted}>허용됨 (해제)</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.statusBadgeDenied}
                      activeOpacity={0.7}
                      onPress={() => requestPermission(item.key)}
                    >
                      <Text style={styles.statusBadgeTextDenied}>허용하기</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
          )}
        </View>

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={20} color={COLORS.muted} style={{marginTop: 2}} />
          <Text style={styles.infoText}>
            「허용하기」는 앱에서 권한을 요청합니다. 이미 허용한 항목은 「허용됨 (해제)」를 눌러 기기 설정에서 변경할 수 있어요.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const shadowCard = Platform.OS === "ios" ? { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 } : { elevation: 2 };

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 40,
  },
  titleSection: {
    marginBottom: 18,
  },
  mainTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 12,
  },
  subTitle: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.muted,
    fontWeight: "500",
  },
  cardContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    ...shadowCard,
  },
  permissionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  textWrap: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 4,
  },
  itemDescription: {
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.muted,
    fontWeight: "500",
  },
  rowRight: {
    justifyContent: "center",
    alignItems: "flex-end",
  },
  loadingPanel: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 150,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    backgroundColor: COLORS.oliveSoft,
    padding: 24,
    gap: 12,
    marginVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.muted,
    textAlign: "center",
  },
  statusBadgeGranted: {
    backgroundColor: "#EAF1EC",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusBadgeTextGranted: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: "700",
  },
  statusBadgeDenied: {
    backgroundColor: "#FCEAE8",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusBadgeTextDenied: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  infoBanner: {
    flexDirection: "row",
    marginTop: 24,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.muted,
    fontWeight: "500",
  }
});

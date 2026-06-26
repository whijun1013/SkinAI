import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { markNotificationLogRead, registerNotificationToken } from "../../api/notifications";

const DEVICE_ID_KEY = "nuvo_push_device_id";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function getExpoProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId
  );
}

let lastAppliedBadgeCount = null;
let badgeUpdatesDisabled = false;

export async function setAppIconBadgeCount(count) {
  if (badgeUpdatesDisabled) return false;

  const numericCount = Number(count);
  const safeCount = Number.isFinite(numericCount) ? Math.max(0, Math.floor(numericCount)) : 0;
  if (lastAppliedBadgeCount === safeCount) return true;

  try {
    const didSet = await Notifications.setBadgeCountAsync(safeCount);
    if (didSet === false) {
      // Android·시뮬레이터·Expo Go 등에서는 배지 미지원 — 정상 동작
      badgeUpdatesDisabled = true;
      return false;
    }
    lastAppliedBadgeCount = safeCount;
    return didSet;
  } catch {
    badgeUpdatesDisabled = true;
    return false;
  }
}

async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "default",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function getOrCreateDeviceId() {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;

  const deviceId = `nuvo-${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

async function getGrantedNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === "granted";
}

export async function registerDevicePushToken() {
  try {
    await ensureAndroidNotificationChannel();

    const granted = await getGrantedNotificationPermission();
    if (!granted) return { success: false, reason: "permission_denied" };

    const projectId = getExpoProjectId();
    if (!projectId) {
      console.warn("[Notifications] push token registration skipped: missing Expo projectId");
      return { success: false, reason: "project_id_missing" };
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResponse?.data;
    if (!expoPushToken) return { success: false, reason: "token_unavailable" };

    const deviceId = await getOrCreateDeviceId();
    await registerNotificationToken({
      expo_push_token: expoPushToken,
      device_id: deviceId,
      platform: Platform.OS,
    });

    console.log("[Notifications] push token registered");
    return { success: true };
  } catch (error) {
    console.warn("[Notifications] push token registration skipped", error?.response?.status || error?.message);
    return { success: false, reason: "registration_failed" };
  }
}

function getNotificationData(response) {
  return response?.notification?.request?.content?.data ?? null;
}

function getNotificationResponseKey(response) {
  const identifier = response?.notification?.request?.identifier;
  const actionIdentifier = response?.actionIdentifier;

  return [identifier, actionIdentifier].filter(Boolean).join(":") || null;
}

function getNotificationLogId(data) {
  const value = data?.notification_log_id;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function markPushNotificationRead(data) {
  const notificationLogId = getNotificationLogId(data);
  if (!notificationLogId) return;

  markNotificationLogRead(notificationLogId).catch((error) => {
    console.warn("[Notifications] push click mark-read skipped", error?.response?.status || error?.message);
  });
}

export function resolveNotificationNavigation(data, responseKey = null) {
  if (!data || typeof data !== "object") return null;

  const type = typeof data.type === "string" ? data.type : "";
  const screen = typeof data.screen === "string" ? data.screen : "";

  if (screen !== "report" && screen !== "record") {
    return null;
  }

  if (screen === "record") {
    return {
      tab: "record",
      type,
      screen,
      targetDate: typeof data.target_date === "string" ? data.target_date : null,
      responseKey,
    };
  }

  return {
    tab: "report",
    type,
    screen,
    analysisRequestId: data.analysis_request_id ?? null,
    analysisResultId: data.analysis_result_id ?? null,
    responseKey,
  };
}

export function getNotificationNavigationTarget(response) {
  const data = getNotificationData(response);
  const target = resolveNotificationNavigation(data, getNotificationResponseKey(response));
  if (target) {
    markPushNotificationRead(data);
  }
  return target;
}

export function addNotificationNavigationListener(onNavigate) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const target = getNotificationNavigationTarget(response);
    if (target) {
      onNavigate(target);
    }
  });
}

export async function getInitialNotificationNavigationTarget() {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    const target = getNotificationNavigationTarget(response);

    if (target) {
      await Notifications.clearLastNotificationResponseAsync();
    }

    return target;
  } catch (error) {
    console.warn("[Notifications] initial response handling skipped", error?.message);
    return null;
  }
}

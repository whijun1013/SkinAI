import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenHeader from "./ScreenHeader";
import { getNotificationSettings, updateNotificationSettings } from "../../../api/notifications";

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

const FALLBACK_SETTINGS = {
  analysis_ready_enabled: true,
  analysis_complete_enabled: true,
  daily_log_reminder_enabled: true,
  timezone: "Asia/Seoul",
};

const TOGGLE_DEFINITIONS = [
  {
    field: "analysis_ready_enabled",
    title: "참고 인사이트 생성 가능 알림",
    description: "기록이 충분히 쌓이면 알려드려요.",
    icon: "sparkles-outline",
  },
  {
    field: "analysis_complete_enabled",
    title: "참고 인사이트 완료 알림",
    description: "인사이트 생성이 끝나면 알려드려요.",
    icon: "checkmark-circle-outline",
  },
  {
    field: "daily_log_reminder_enabled",
    title: "오늘 피부 기록 리마인더",
    description: "오늘 기록이 없을 때 기록을 도와드려요.",
    icon: "create-outline",
  },
];

export default function NotificationSettingsScreen({ onBack }) {
  const [settings, setSettings] = useState(FALLBACK_SETTINGS);
  const [availableFields, setAvailableFields] = useState(new Set(Object.keys(FALLBACK_SETTINGS)));
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState(null);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const visibleToggles = useMemo(
    () => TOGGLE_DEFINITIONS.filter((item) => availableFields.has(item.field)),
    [availableFields]
  );

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaveError(null);
    try {
      const data = await getNotificationSettings();
      const fieldSet = new Set(Object.keys(data || {}));
      setAvailableFields(fieldSet);
      setSettings({ ...FALLBACK_SETTINGS, ...(data || {}) });
    } catch (err) {
      console.warn("[Notifications] failed to load settings", err?.response?.status || err?.message);
      setError("알림 설정을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleToggle = async (field, value) => {
    if (savingField) return;

    const previousValue = settings[field];
    setSaveError(null);
    setSavingField(field);
    setSettings((prev) => ({ ...prev, [field]: value }));

    try {
      const saved = await updateNotificationSettings({ [field]: value });
      setSettings((prev) => ({ ...prev, ...saved }));
      setAvailableFields(new Set(Object.keys(saved || {})));
    } catch (err) {
      console.warn("[Notifications] failed to save setting", err?.response?.status || err?.message);
      setSettings((prev) => ({ ...prev, [field]: previousValue }));
      setSaveError("설정을 저장하지 못했어요. 다시 시도해주세요.");
    } finally {
      setSavingField(null);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="알림 설정" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>
          기록과 참고 인사이트 알림을 종류별로 관리할 수 있어요.
        </Text>

        {loading ? (
          <StateBox>
            <ActivityIndicator size="small" color={COLORS.olive} />
            <Text style={styles.stateText}>알림 설정을 불러오는 중이에요.</Text>
          </StateBox>
        ) : error ? (
          <StateBox tone="error">
            <Ionicons name="alert-circle-outline" size={22} color={COLORS.danger} />
            <Text style={[styles.stateText, styles.errorText]}>{error}</Text>
            <TouchableOpacity activeOpacity={0.78} style={styles.retryButton} onPress={loadSettings}>
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </StateBox>
        ) : (
          <>
            {saveError ? (
              <View style={styles.saveErrorBox}>
                <Text style={styles.saveErrorText}>{saveError}</Text>
              </View>
            ) : null}

            <View style={styles.group}>
              {visibleToggles.map((item, index) => {
                const saving = savingField === item.field;
                const disabled = !!savingField;
                return (
                  <View
                    key={item.field}
                    style={[styles.row, index !== visibleToggles.length - 1 && styles.divider]}
                  >
                    <View style={styles.iconCircle}>
                      <Ionicons name={item.icon} size={18} color={COLORS.olive} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle}>{item.title}</Text>
                      <Text style={styles.rowDescription}>{item.description}</Text>
                    </View>
                    {saving ? (
                      <ActivityIndicator size="small" color={COLORS.olive} />
                    ) : (
                      <Switch
                        value={!!settings[item.field]}
                        disabled={disabled}
                        onValueChange={(value) => handleToggle(item.field, value)}
                        trackColor={{ false: "#D9D6CC", true: "#C9D4B7" }}
                        thumbColor={settings[item.field] ? COLORS.olive : "#FFFFFF"}
                      />
                    )}
                  </View>
                );
              })}
            </View>

            {availableFields.has("timezone") ? (
              <View style={styles.group}>
                <View style={styles.row}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="earth-outline" size={18} color={COLORS.olive} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>시간대</Text>
                    <Text style={styles.rowDescription}>시간대 변경은 별도 설정에서 다룰 예정이에요.</Text>
                  </View>
                  <Text style={styles.timezoneText}>{settings.timezone || "Asia/Seoul"}</Text>
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StateBox({ children, tone }) {
  return (
    <View style={[styles.stateBox, tone === "error" && styles.errorStateBox]}>
      {children}
    </View>
  );
}

const shadowGroup = Platform.OS === "ios"
  ? { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3 }
  : { elevation: 1 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 44 },
  description: { marginTop: 8, fontSize: 14, lineHeight: 22, fontWeight: "500", color: COLORS.muted, letterSpacing: 0 },
  group: {
    marginBottom: 14,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    ...shadowGroup,
  },
  row: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowText: { flex: 1, minWidth: 0, paddingRight: 10 },
  rowTitle: { fontSize: 14.5, lineHeight: 20, fontWeight: "800", color: COLORS.text, letterSpacing: 0 },
  rowDescription: { marginTop: 3, fontSize: 12.2, lineHeight: 17, fontWeight: "500", color: COLORS.muted, letterSpacing: 0 },
  timezoneText: { fontSize: 12.5, lineHeight: 17, fontWeight: "800", color: COLORS.olive, letterSpacing: 0 },
  stateBox: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 20,
    alignItems: "center",
    ...shadowGroup,
  },
  errorStateBox: { backgroundColor: "#FFF6F4", borderColor: "#F0C9C2" },
  stateText: { marginTop: 10, fontSize: 13, lineHeight: 19, fontWeight: "700", color: COLORS.muted, textAlign: "center" },
  errorText: { color: COLORS.danger },
  retryButton: { marginTop: 12, borderRadius: 15, backgroundColor: COLORS.oliveSoft, paddingHorizontal: 13, paddingVertical: 8 },
  retryText: { fontSize: 12.5, lineHeight: 17, fontWeight: "800", color: COLORS.olive, letterSpacing: 0 },
  saveErrorBox: {
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: "#FFF6F4",
    borderWidth: 1,
    borderColor: "#F0C9C2",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  saveErrorText: { fontSize: 12.5, lineHeight: 18, fontWeight: "700", color: COLORS.danger, letterSpacing: 0 },
});

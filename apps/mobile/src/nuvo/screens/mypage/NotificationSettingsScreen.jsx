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
  bg: "#F7F8F5",
  olive: "#4F603C",
  oliveSoft: "#E4EBD8",
  oliveMid: "#C8D8A8",
  card: "#FFFFFF",
  chip: "#F2F4EE",
  text: "#1A1F17",
  muted: "#8A9080",
  line: "#E2E5DA",
  danger: "#B85A50",
  dangerSoft: "#FEF0EE",
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
    title: "인사이트 생성 가능",
    description: "기록이 충분히 쌓이면 알려드려요.",
    icon: "sparkles-outline",
    iconOn: "sparkles",
  },
  {
    field: "analysis_complete_enabled",
    title: "인사이트 분석 완료",
    description: "인사이트 생성이 끝나면 바로 알려드려요.",
    icon: "checkmark-circle-outline",
    iconOn: "checkmark-circle",
  },
  {
    field: "daily_log_reminder_enabled",
    title: "오늘 기록 리마인더",
    description: "오늘 기록이 없을 때 알림을 보내드려요.",
    icon: "create-outline",
    iconOn: "create",
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
      setAvailableFields(new Set(Object.keys(data || {})));
      setSettings({ ...FALLBACK_SETTINGS, ...(data || {}) });
    } catch (err) {
      console.warn("[Notifications] load failed", err?.message);
      setError("알림 설정을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleToggle = async (field, value) => {
    if (savingField) return;
    const prev = settings[field];
    setSaveError(null);
    setSavingField(field);
    setSettings((s) => ({ ...s, [field]: value }));
    try {
      const saved = await updateNotificationSettings({ [field]: value });
      setSettings((s) => ({ ...s, ...saved }));
      setAvailableFields(new Set(Object.keys(saved || {})));
    } catch {
      setSettings((s) => ({ ...s, [field]: prev }));
      setSaveError("설정을 저장하지 못했어요. 다시 시도해주세요.");
    } finally {
      setSavingField(null);
    }
  };

  const enabledCount = visibleToggles.filter((t) => !!settings[t.field]).length;

  return (
    <View style={styles.root}>
      <ScreenHeader title="알림 설정" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── 상단 요약 카드 ── */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryDecorTR} />
          <View style={styles.summaryRow}>
            <View style={styles.summaryIconWrap}>
              <Ionicons name="notifications" size={22} color={COLORS.olive} />
            </View>
            <View style={styles.summaryTextWrap}>
              <Text style={styles.summaryTitle}>알림 설정</Text>
              <Text style={styles.summarySub}>원하는 알림만 골라서 켜두세요</Text>
            </View>
            {!loading && (
              <View style={[styles.summaryBadge, enabledCount === visibleToggles.length && styles.summaryBadgeAll]}>
                <Text style={[styles.summaryBadgeText, enabledCount === visibleToggles.length && styles.summaryBadgeTextAll]}>
                  {enabledCount}/{visibleToggles.length} 활성
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── 에러 배너 ── */}
        {saveError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={14} color={COLORS.danger} />
            <Text style={styles.errorBannerText}>{saveError}</Text>
          </View>
        ) : null}

        {/* ── 알림 토글 카드들 ── */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={COLORS.olive} />
            <Text style={styles.loadingText}>불러오는 중...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={28} color={COLORS.danger} />
            <Text style={styles.errorCardText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadSettings} activeOpacity={0.75}>
              <Ionicons name="refresh-outline" size={13} color={COLORS.olive} />
              <Text style={styles.retryBtnText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>알림 종류</Text>
            {visibleToggles.map((item) => {
              const isOn = !!settings[item.field];
              const saving = savingField === item.field;
              const disabled = !!savingField;
              return (
                <View key={item.field} style={[styles.notifCard, isOn ? styles.notifCardOn : styles.notifCardOff]}>
                  <View style={[styles.notifAccent, isOn ? styles.accentOn : styles.accentOff]} />
                  <View style={styles.notifInner}>
                    <View style={[styles.notifIconWrap, isOn ? styles.iconWrapOn : styles.iconWrapOff]}>
                      <Ionicons
                        name={isOn ? item.iconOn : item.icon}
                        size={18}
                        color={isOn ? COLORS.olive : COLORS.muted}
                      />
                    </View>
                    <View style={styles.notifText}>
                      <Text style={[styles.notifTitle, !isOn && styles.notifTitleOff]}>{item.title}</Text>
                      <Text style={styles.notifDesc}>{item.description}</Text>
                    </View>
                    <View style={styles.notifRight}>
                      {saving ? (
                        <ActivityIndicator size="small" color={COLORS.olive} />
                      ) : (
                        <Switch
                          value={isOn}
                          disabled={disabled}
                          onValueChange={(v) => handleToggle(item.field, v)}
                          trackColor={{ false: "#D9D6CC", true: COLORS.oliveMid }}
                          thumbColor={isOn ? COLORS.olive : "#FFFFFF"}
                          ios_backgroundColor="#D9D6CC"
                        />
                      )}
                    </View>
                  </View>
                </View>
              );
            })}

            {/* ── 시간대 ── */}
            {availableFields.has("timezone") ? (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 8 }]}>기타</Text>
                <View style={[styles.notifCard, styles.notifCardOff]}>
                  <View style={[styles.notifAccent, styles.accentOff]} />
                  <View style={styles.notifInner}>
                    <View style={styles.iconWrapOff}>
                      <View style={[styles.notifIconWrap, styles.iconWrapOff]}>
                        <Ionicons name="earth-outline" size={18} color={COLORS.muted} />
                      </View>
                    </View>
                    <View style={styles.notifText}>
                      <Text style={styles.notifTitle}>시간대</Text>
                      <Text style={styles.notifDesc}>알림 발송 기준 시간대에요.</Text>
                    </View>
                    <Text style={styles.timezoneValue}>{settings.timezone || "Asia/Seoul"}</Text>
                  </View>
                </View>
              </>
            ) : null}
          </>
        )}

      </ScrollView>
    </View>
  );
}

const shadow = Platform.OS === "ios"
  ? { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }
  : { elevation: 2 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 48 },

  /* ── 요약 카드 ── */
  summaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18, borderWidth: 1, borderColor: COLORS.line,
    paddingVertical: 16, paddingHorizontal: 16,
    marginBottom: 16, overflow: "hidden",
    position: "relative",
    ...shadow,
  },
  summaryDecorTR: {
    position: "absolute", top: -20, right: -20,
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: COLORS.oliveSoft, opacity: 0.5,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  summaryIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: COLORS.oliveSoft,
    borderWidth: 1, borderColor: COLORS.oliveMid,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  summaryTextWrap: { flex: 1 },
  summaryTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text, letterSpacing: -0.2 },
  summarySub: { fontSize: 11, color: COLORS.muted, fontWeight: "500", marginTop: 2 },
  summaryBadge: {
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20,
    backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.line,
  },
  summaryBadgeAll: { backgroundColor: COLORS.olive },
  summaryBadgeText: { fontSize: 11, fontWeight: "700", color: COLORS.muted },
  summaryBadgeTextAll: { color: "#fff" },

  /* ── 섹션 라벨 ── */
  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: COLORS.muted,
    letterSpacing: 0.5, textTransform: "uppercase",
    marginBottom: 8, paddingHorizontal: 2,
  },

  /* ── 알림 카드 ── */
  notifCard: {
    borderRadius: 16, borderWidth: 1,
    marginBottom: 8, overflow: "hidden",
    flexDirection: "row",
    ...shadow,
  },
  notifCardOn: { backgroundColor: COLORS.card, borderColor: COLORS.oliveMid },
  notifCardOff: { backgroundColor: COLORS.card, borderColor: COLORS.line },

  notifAccent: { width: 3 },
  accentOn: { backgroundColor: COLORS.olive },
  accentOff: { backgroundColor: "transparent" },

  notifInner: {
    flex: 1, flexDirection: "row", alignItems: "center",
    paddingVertical: 14, paddingLeft: 13, paddingRight: 14, gap: 12,
  },
  notifIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  iconWrapOn: { backgroundColor: COLORS.oliveSoft },
  iconWrapOff: { backgroundColor: COLORS.chip },

  notifText: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: "700", color: COLORS.text, marginBottom: 2 },
  notifTitleOff: { color: COLORS.muted },
  notifDesc: { fontSize: 12, color: COLORS.muted, fontWeight: "500", lineHeight: 17 },

  notifRight: { alignItems: "center", justifyContent: "center", minWidth: 50 },
  timezoneValue: { fontSize: 12, fontWeight: "700", color: COLORS.olive },

  /* ── 에러 배너 ── */
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: COLORS.dangerSoft, borderRadius: 12,
    borderWidth: 1, borderColor: "#F0C9C2",
    paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 14,
  },
  errorBannerText: { flex: 1, fontSize: 12, fontWeight: "600", color: COLORS.danger },

  /* ── 에러 카드 ── */
  errorCard: {
    alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.dangerSoft, borderRadius: 16,
    borderWidth: 1, borderColor: "#F0C9C2",
    paddingVertical: 32, paddingHorizontal: 20, gap: 10,
  },
  errorCardText: { fontSize: 13, fontWeight: "600", color: COLORS.danger, textAlign: "center" },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    marginTop: 4, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.oliveSoft, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.oliveMid,
  },
  retryBtnText: { fontSize: 13, fontWeight: "700", color: COLORS.olive },

  /* ── 로딩 ── */
  loadingWrap: { height: 160, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 13, fontWeight: "600", color: COLORS.muted },
});

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createBehaviorLog, updateBehaviorLog, getBehaviorByDate } from "../../../api/behavior";
import { useBehaviorLogQuery } from "../../../hooks/useRecordQueries";
import useRecordCacheStore from "../../../stores/recordCacheStore";
import { toDateStr } from "./components/DateNavigator";
import {
  RECORD_COLORS,
  StatusBanner,
  SubScreenFooter,
  SubScreenRoot,
  SubScreenTopBar,
  useRecordScreenInsets,
} from "./components/SubScreenLayout";

const BEHAV = {
  main: "#5A6E8A",
  soft: "rgba(90,110,138,0.08)",
  softStrong: "rgba(90,110,138,0.13)",
  border: "rgba(90,110,138,0.20)",
};

function SectionHeader({ icon, label }) {
  return (
    <View style={SH.wrap}>
      <View style={SH.iconCircle}>
        <Ionicons name={icon} size={15} color={BEHAV.main} />
      </View>
      <Text style={SH.label}>{label}</Text>
    </View>
  );
}

const SH = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: BEHAV.soft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BEHAV.border,
    alignSelf: 'stretch',
  },
  iconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: BEHAV.softStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 15,
    fontWeight: '900',
    color: BEHAV.main,
    letterSpacing: -0.3,
  },
});

// ── 선택지 상수 ───────────────────────────────────────────────────────────────

const SLEEP_RANGE_OPTIONS = [
  { key: "under4", label: "4시간 미만", hours: 3 },
  { key: "4to6",   label: "4~6시간",   hours: 5 },
  { key: "6to8",   label: "6~8시간",   hours: 7 },
  { key: "over8",  label: "8시간+",    hours: 9 },
];

const SLEEP_QUALITY_OPTIONS = [
  { key: "bad",  label: "못 잤어요",   value: 1, color: "#B85A46" },
  { key: "ok",   label: "보통이에요",  value: 3, color: "#B8924A" },
  { key: "good", label: "잘 잤어요",   value: 5, color: "#4F7A5A" },
];

const STRESS_OPTIONS = [
  { key: "easy",      label: "여유로웠어요",     value: 1 },
  { key: "tired",     label: "조금 피곤했어요",  value: 2 },
  { key: "hard",      label: "힘들었어요",       value: 4 },
  { key: "very_hard", label: "매우 힘들었어요",  value: 5 },
];

const WATER_OPTIONS = [
  { label: "500ml", value: 500  },
  { label: "1L",    value: 1000 },
  { label: "1.5L",  value: 1500 },
  { label: "2L+",   value: 2000 },
];

const EXERCISE_TYPES = [
  { label: "조깅",   icon: "walk-outline" },
  { label: "헬스",   icon: "barbell-outline" },
  { label: "요가",   icon: "body-outline" },
  { label: "수영",   icon: "water-outline" },
  { label: "사이클", icon: "bicycle-outline" },
  { label: "기타",   icon: "ellipsis-horizontal-outline" },
];

const EXERCISE_DURATION_OPTIONS = [
  { label: "30분",   value: 30  },
  { label: "60분",   value: 60  },
  { label: "90분",   value: 90  },
  { label: "120분+", value: 120 },
];

// ── 변환 헬퍼 ────────────────────────────────────────────────────────────────

function hoursToRangeKey(h) {
  if (h == null) return null;
  if (h < 4) return "under4";
  if (h < 6) return "4to6";
  if (h < 8) return "6to8";
  return "over8";
}

function qualityToKey(q) {
  if (q == null) return null;
  if (q <= 2) return "bad";
  if (q <= 3) return "ok";
  return "good";
}

function stressToKey(s) {
  if (s == null) return null;
  if (s <= 1) return "easy";
  if (s <= 2) return "tired";
  if (s <= 4) return "hard";
  return "very_hard";
}

function durationToKey(d) {
  if (d == null) return null;
  if (d <= 30) return 30;
  if (d <= 60) return 60;
  if (d <= 90) return 90;
  return 120;
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function yesterday(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return toDateStr(d);
}

function buildBehaviorPayload({ dateStr, sleepHours, sleepQuality, stressLevel, waterIntake, exerciseYn, exerciseDuration, exerciseType, alcoholYn, smokingYn }) {
  return {
    logged_at: dateStr,
    sleep_hours: sleepHours ?? null,
    sleep_quality: sleepQuality ?? null,
    stress_level: stressLevel ?? null,
    water_intake_ml: waterIntake != null && waterIntake > 0 ? waterIntake : null,
    exercise_yn: exerciseYn,
    exercise_duration_min: exerciseYn && exerciseDuration ? exerciseDuration : null,
    exercise_type: exerciseYn && exerciseType && exerciseType !== "기타" ? exerciseType : null,
    alcohol_yn: alcoholYn,
    smoking_yn: smokingYn,
    custom_behaviors: {},
  };
}

function numEq(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

function behaviorPayloadMatchesLog(payload, log) {
  if (!log) return false;
  return (
    numEq(payload.sleep_hours, log.sleep_hours) &&
    numEq(payload.sleep_quality, log.sleep_quality) &&
    numEq(payload.stress_level, log.stress_level) &&
    numEq(payload.water_intake_ml, log.water_intake_ml) &&
    payload.exercise_yn === !!log.exercise_yn &&
    numEq(payload.exercise_duration_min, log.exercise_duration_min) &&
    payload.exercise_type === (log.exercise_type ?? null) &&
    payload.alcohol_yn === !!log.alcohol_yn &&
    payload.smoking_yn === !!log.smoking_yn
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────────────────────

export default function BehaviorLogEntry({ onBack, selectedDate, onDataChanged }) {
  const { scrollPaddingBottom } = useRecordScreenInsets();
  const date = selectedDate ?? new Date();
  const dateStr = toDateStr(date);
  const isToday = dateStr === toDateStr(new Date());

  const [sleepHours, setSleepHours] = useState(null);
  const [sleepQuality, setSleepQuality] = useState(null);
  const [stressLevel, setStressLevel] = useState(null);
  const [waterIntake, setWaterIntake] = useState(null);
  const [exerciseYn, setExerciseYn] = useState(false);
  const [exerciseDuration, setExerciseDuration] = useState(null);
  const [exerciseType, setExerciseType] = useState("");
  const [exerciseTypeCustom, setExerciseTypeCustom] = useState("");
  const [alcoholYn, setAlcoholYn] = useState(false);
  const [smokingYn, setSmokingYn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingLogId, setExistingLogId] = useState(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [prefillBanner, setPrefillBanner] = useState(false);
  const { data: loadedLog, isInitialLoad, error: queryError } = useBehaviorLogQuery(dateStr);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const tryPrefillFromYesterday = useCallback(async () => {
    try {
      const log = await getBehaviorByDate(yesterday(dateStr));
      if (!log || !isMountedRef.current) return;
      if (log.sleep_hours != null) setSleepHours(Number(log.sleep_hours));
      if (log.sleep_quality != null) setSleepQuality(Number(log.sleep_quality));
      if (log.stress_level != null) setStressLevel(Number(log.stress_level));
      if (log.water_intake_ml != null) setWaterIntake(Number(log.water_intake_ml));
      if (log.exercise_yn != null) {
        setExerciseYn(!!log.exercise_yn);
        if (log.exercise_duration_min != null) setExerciseDuration(Number(log.exercise_duration_min));
        if (log.exercise_type) {
          const known = EXERCISE_TYPES.find((t) => t.label === log.exercise_type);
          setExerciseType(known ? log.exercise_type : "기타");
          if (!known) setExerciseTypeCustom(log.exercise_type);
        }
      }
      if (log.alcohol_yn != null) setAlcoholYn(!!log.alcohol_yn);
      if (log.smoking_yn != null) setSmokingYn(!!log.smoking_yn);
      setPrefillBanner(true);
    } catch { /* 조용히 무시 */ }
  }, [dateStr, isMountedRef]);


  useEffect(() => {
    if (isInitialLoad) return;
    if (loadedLog) {
      setExistingLogId(loadedLog.id);
      setSleepHours(loadedLog.sleep_hours != null ? Number(loadedLog.sleep_hours) : null);
      setSleepQuality(loadedLog.sleep_quality != null ? Number(loadedLog.sleep_quality) : null);
      setStressLevel(loadedLog.stress_level != null ? Number(loadedLog.stress_level) : null);
      setWaterIntake(loadedLog.water_intake_ml != null ? Number(loadedLog.water_intake_ml) : null);
      setExerciseYn(!!loadedLog.exercise_yn);
      setExerciseDuration(loadedLog.exercise_duration_min != null ? Number(loadedLog.exercise_duration_min) : null);
      if (loadedLog.exercise_type) {
        const known = EXERCISE_TYPES.find((t) => t.label === loadedLog.exercise_type);
        setExerciseType(known ? loadedLog.exercise_type : "기타");
        if (!known) setExerciseTypeCustom(loadedLog.exercise_type ?? "");
      } else { setExerciseType(""); setExerciseTypeCustom(""); }
      setAlcoholYn(!!loadedLog.alcohol_yn);
      setSmokingYn(!!loadedLog.smoking_yn);
      setPrefillBanner(false);
      return;
    }
    setExistingLogId(null); setSleepHours(null); setSleepQuality(null);
    setStressLevel(null); setWaterIntake(null); setExerciseYn(false);
    setExerciseDuration(null); setExerciseType(""); setExerciseTypeCustom("");
    setAlcoholYn(false); setSmokingYn(false);
    void tryPrefillFromYesterday();
  }, [loadedLog, isInitialLoad, dateStr, tryPrefillFromYesterday]);


  const persistSave = async (payload) => {
    if (saving) return;
    setSaving(true); setSaveError(null);
    try {
      let saved;
      if (existingLogId) {
        const { logged_at, custom_behaviors, ...updatePayload } = payload;
        saved = await updateBehaviorLog(existingLogId, updatePayload);
      } else {
        saved = await createBehaviorLog(payload);
      }
      if (!existingLogId && saved?.id) setExistingLogId(saved.id);
      useRecordCacheStore.getState().setBehavior(dateStr, {
        ...(saved || {}), logged_at: dateStr,
      });
      onDataChanged?.();
      setSavedSuccess(true);
      setTimeout(() => onBack(), 800);
    } catch (error) {
      console.error(error);
      setSaveError("생활 기록 저장에 실패했습니다.");
    } finally { setSaving(false); }
  };

  const handleSave = async () => {
    const resolvedExerciseType = exerciseType === "기타" ? exerciseTypeCustom.trim() : exerciseType;
    const payload = buildBehaviorPayload({
      dateStr, sleepHours, sleepQuality, stressLevel, waterIntake,
      exerciseYn, exerciseDuration, exerciseType: resolvedExerciseType, alcoholYn, smokingYn,
    });
    if (existingLogId && behaviorPayloadMatchesLog(payload, loadedLog)) {
      Alert.alert("수정사항 없음", "수정사항이 없습니다. 이대로 저장하겠습니까?", [
        { text: "취소", style: "cancel" },
        { text: "저장", onPress: () => persistSave(payload) },
      ]);
      return;
    }
    await persistSave(payload);
  };

  const sleepRangeKey = hoursToRangeKey(sleepHours);
  const sleepQualityKey = qualityToKey(sleepQuality);
  const stressKey = stressToKey(stressLevel);
  const durationKey = durationToKey(exerciseDuration);

  return (
    <SubScreenRoot onBack={onBack}>
      <KeyboardAvoidingView style={S.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <SubScreenTopBar
          title="생활 기록"
          dateLabel={isToday ? "오늘" : dateStr}
          onBack={onBack}
          accentColor={BEHAV.main}
          trailing={isInitialLoad ? <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" /> : null}
        />

        <ScrollView
          contentContainerStyle={[S.scroll, { paddingBottom: scrollPaddingBottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 상태 배너 */}
          {savedSuccess ? (
            <StatusBanner icon="checkmark-circle" text="저장되었습니다." />
          ) : saveError ? (
            <StatusBanner icon="alert-circle-outline" text={saveError} variant="error" onPress={() => setSaveError(null)} />
          ) : queryError && !isInitialLoad ? (
            <StatusBanner icon="alert-circle-outline" text="기록을 불러오지 못했습니다." variant="error" onPress={() => useRecordCacheStore.getState().invalidateBehavior(dateStr)} />
          ) : prefillBanner ? (
            <StatusBanner icon="time-outline" text="어제 기록을 불러왔어요 · 변경된 내용만 수정 후 저장하세요" />
          ) : existingLogId ? (
            <StatusBanner icon="checkmark-circle" text={isToday ? "오늘 기록이 있어요 · 수정 후 저장하면 업데이트됩니다" : "이 날 기록을 수정할 수 있어요"} />
          ) : !isToday ? (
            <StatusBanner icon="calendar-outline" text="이 날 생활 기록이 없습니다" variant="empty" />
          ) : null}

          {/* ══ 수면 ══ */}
          <View style={S.section}>
            <SectionHeader icon="moon-outline" label="수면" />

            <Text style={S.fieldLabel}>잠은 얼마나 잤나요?</Text>
            <View style={S.chipGrid2x2}>
              {SLEEP_RANGE_OPTIONS.map((opt) => {
                const active = sleepRangeKey === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[S.gridChip, active && S.gridChipActive]}
                    onPress={() => setSleepHours(sleepHours === opt.hours ? null : opt.hours)}
                    activeOpacity={0.78} disabled={saving}
                  >
                    <Text style={[S.gridChipText, active && S.gridChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[S.fieldLabel, S.fieldLabelSpaced]}>수면의 질은요?</Text>
            <View style={S.qualityRow}>
              {SLEEP_QUALITY_OPTIONS.map((opt) => {
                const active = sleepQualityKey === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[S.qualityChip, active && { backgroundColor: opt.color, borderColor: opt.color }]}
                    onPress={() => setSleepQuality(sleepQuality === opt.value ? null : opt.value)}
                    activeOpacity={0.78} disabled={saving}
                  >
                    <Text style={[S.qualityChipText, active && S.qualityChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ══ 스트레스 ══ */}
          <View style={S.divider} />
          <View style={S.section}>
            <SectionHeader icon="flame-outline" label="스트레스" />
            <Text style={S.fieldLabel}>오늘 하루 어땠나요?</Text>
            <View style={S.stressOptions}>
              {STRESS_OPTIONS.map((opt) => {
                const active = stressKey === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[S.stressOption, active && S.stressOptionActive]}
                    onPress={() => setStressLevel(stressLevel === opt.value ? null : opt.value)}
                    activeOpacity={0.78} disabled={saving}
                  >
                    <Text style={[S.stressOptionText, active && S.stressOptionTextActive]}>{opt.label}</Text>
                    {active ? <Ionicons name="checkmark-circle" size={18} color={BEHAV.main} /> : <View style={S.stressOptionCheck} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ══ 수분 섭취 ══ */}
          <View style={S.divider} />
          <View style={S.section}>
            <SectionHeader icon="water-outline" label="수분 섭취" />
            <Text style={S.fieldLabel}>오늘 마신 물·음료는요?</Text>
            <View style={S.chipRow}>
              {WATER_OPTIONS.map((opt) => {
                const active = waterIntake === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[S.rowChip, active && S.rowChipActive]}
                    onPress={() => setWaterIntake(waterIntake === opt.value ? null : opt.value)}
                    activeOpacity={0.78} disabled={saving}
                  >
                    <Text style={[S.rowChipText, active && S.rowChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ══ 운동 ══ */}
          <View style={S.divider} />
          <View style={S.section}>
            <SectionHeader icon="barbell-outline" label="운동" />
            <View style={S.choiceRow}>
              <TouchableOpacity style={[S.choiceChip, exerciseYn && S.choiceChipActive]} onPress={() => !saving && setExerciseYn(true)} activeOpacity={0.78} disabled={saving}>
                <Ionicons name="fitness-outline" size={18} color={exerciseYn ? BEHAV.main : RECORD_COLORS.text} />
                <Text style={[S.choiceChipText, exerciseYn && S.choiceChipTextActive]}>했어요</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[S.choiceChip, !exerciseYn && S.choiceChipActive]} onPress={() => !saving && setExerciseYn(false)} activeOpacity={0.78} disabled={saving}>
                <Ionicons name="bed-outline" size={18} color={!exerciseYn ? BEHAV.main : RECORD_COLORS.text} />
                <Text style={[S.choiceChipText, !exerciseYn && S.choiceChipTextActive]}>안 했어요</Text>
              </TouchableOpacity>
            </View>

            {exerciseYn ? (
              <View style={S.conditionalBlock}>
                <Text style={S.fieldLabel}>운동 종류</Text>
                <View style={S.exerciseTypeGrid}>
                  {EXERCISE_TYPES.map((t) => {
                    const active = exerciseType === t.label;
                    return (
                      <TouchableOpacity
                        key={t.label}
                        style={[S.exerciseTypeChip, active && S.exerciseTypeChipActive]}
                        onPress={() => !saving && setExerciseType(t.label)}
                        activeOpacity={0.78} disabled={saving}
                      >
                        <Ionicons name={t.icon} size={15} color={active ? BEHAV.main : RECORD_COLORS.text} />
                        <Text style={[S.exerciseTypeText, active && S.exerciseTypeTextActive]}>{t.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {exerciseType === "기타" ? (
                  <TextInput
                    style={[S.textInput, S.fieldGap]}
                    placeholder="운동 종류 직접 입력"
                    placeholderTextColor={RECORD_COLORS.muted}
                    value={exerciseTypeCustom}
                    onChangeText={setExerciseTypeCustom}
                    editable={!saving}
                  />
                ) : null}
                <Text style={[S.fieldLabel, S.fieldLabelSpaced]}>운동 시간</Text>
                <View style={S.chipRow}>
                  {EXERCISE_DURATION_OPTIONS.map((opt) => {
                    const active = durationKey === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[S.rowChip, active && S.rowChipActive]}
                        onPress={() => setExerciseDuration(exerciseDuration === opt.value ? null : opt.value)}
                        activeOpacity={0.78} disabled={saving}
                      >
                        <Text style={[S.rowChipText, active && S.rowChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>

          {/* ══ 기타 요인 ══ */}
          <View style={S.divider} />
          <View style={S.section}>
            <SectionHeader icon="ellipsis-horizontal-circle-outline" label="기타 요인" />
            <View style={S.tagGrid}>
              <TouchableOpacity style={[S.tagChip, alcoholYn && S.tagChipActive]} onPress={() => !saving && setAlcoholYn(!alcoholYn)} activeOpacity={0.78} disabled={saving}>
                <Ionicons name="wine-outline" size={16} color={alcoholYn ? RECORD_COLORS.white : RECORD_COLORS.text} />
                <Text style={[S.tagText, alcoholYn && S.tagTextActive]}>음주</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[S.tagChip, smokingYn && S.tagChipActive]} onPress={() => !saving && setSmokingYn(!smokingYn)} activeOpacity={0.78} disabled={saving}>
                <Ionicons name="flame-outline" size={16} color={smokingYn ? RECORD_COLORS.white : RECORD_COLORS.text} />
                <Text style={[S.tagText, smokingYn && S.tagTextActive]}>흡연</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        <SubScreenFooter
          label={existingLogId ? "수정 저장" : "저장하기"}
          onPress={handleSave}
          saving={saving}
          icon="checkmark-circle-outline"
          color={BEHAV.main}
        />
      </KeyboardAvoidingView>
    </SubScreenRoot>
  );
}

const S = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  section: { paddingVertical: 4 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: RECORD_COLORS.line,
    marginVertical: 22,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5A6070",
    marginBottom: 10,
  },
  fieldLabelSpaced: { marginTop: 18 },
  fieldGap: { marginBottom: 12, marginTop: 8 },

  // 2x2 그리드 칩 (수면 시간)
  chipGrid2x2: {
    flexDirection: "row", flexWrap: "wrap", gap: 10,
  },
  gridChip: {
    width: "47%",
    paddingVertical: 14,
    borderRadius: 16, borderWidth: 1.5,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
    alignItems: "center",
  },
  gridChipActive: { backgroundColor: BEHAV.soft, borderColor: BEHAV.main },
  gridChipText: { fontSize: 15, fontWeight: "800", color: RECORD_COLORS.text },
  gridChipTextActive: { color: BEHAV.main },

  // 수면 질 가로 3개
  qualityRow: { flexDirection: "row", gap: 8 },
  qualityChip: {
    flex: 1, paddingVertical: 13,
    borderRadius: 16, borderWidth: 1.5,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
    alignItems: "center",
  },
  qualityChipText: { fontSize: 13, fontWeight: "800", color: RECORD_COLORS.text },
  qualityChipTextActive: { color: "#fff", fontWeight: "900" },

  // 스트레스 세로 스택
  stressOptions: { gap: 8 },
  stressOption: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18, paddingVertical: 16,
    borderRadius: 16, borderWidth: 1.5,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
  },
  stressOptionActive: { backgroundColor: BEHAV.soft, borderColor: BEHAV.main },
  stressOptionText: { fontSize: 15, fontWeight: "700", color: RECORD_COLORS.text },
  stressOptionTextActive: { color: BEHAV.main, fontWeight: "800" },
  stressOptionCheck: { width: 18, height: 18 },

  // 가로 칩 행 (수분, 운동 시간)
  chipRow: { flexDirection: "row", gap: 8 },
  rowChip: {
    flex: 1, paddingVertical: 12,
    borderRadius: 14, borderWidth: 1.5,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
    alignItems: "center",
  },
  rowChipActive: { backgroundColor: BEHAV.soft, borderColor: BEHAV.main },
  rowChipText: { fontSize: 13, fontWeight: "700", color: RECORD_COLORS.text },
  rowChipTextActive: { color: BEHAV.main, fontWeight: "800" },

  // 운동 여부
  choiceRow: { flexDirection: "row", gap: 10 },
  choiceChip: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 16,
    borderWidth: 1.5, borderColor: RECORD_COLORS.line, backgroundColor: RECORD_COLORS.chip,
  },
  choiceChipActive: { backgroundColor: BEHAV.soft, borderColor: BEHAV.main },
  choiceChipText: { fontSize: 15, fontWeight: "800", color: RECORD_COLORS.text },
  choiceChipTextActive: { color: BEHAV.main },
  conditionalBlock: { marginTop: 16 },

  // 운동 종류
  exerciseTypeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  exerciseTypeChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999, backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1.5, borderColor: RECORD_COLORS.line,
  },
  exerciseTypeChipActive: { backgroundColor: BEHAV.soft, borderColor: BEHAV.main },
  exerciseTypeText: { fontSize: 13, fontWeight: "700", color: RECORD_COLORS.text },
  exerciseTypeTextActive: { color: BEHAV.main },

  // 텍스트 입력
  textInput: {
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1, borderColor: RECORD_COLORS.line,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 15, color: RECORD_COLORS.text,
  },

  // 기타 태그
  tagGrid: { flexDirection: "row", gap: 10 },
  tagChip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: 999, backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1.5, borderColor: RECORD_COLORS.line,
  },
  tagChipActive: { backgroundColor: BEHAV.main, borderColor: BEHAV.main },
  tagText: { fontSize: 14, fontWeight: "700", color: RECORD_COLORS.text },
  tagTextActive: { color: RECORD_COLORS.white },
});

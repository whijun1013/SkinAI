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
  AppState,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createBehaviorLog, updateBehaviorLog } from "../../../api/behavior";
import useHealthConnect from "../../../hooks/useHealthConnect";
import { useBehaviorLogQuery } from "../../../hooks/useRecordQueries";
import useRecordCacheStore from "../../../stores/recordCacheStore";
import { toDateStr } from "./components/DateNavigator";
import {
  SLEEP_QUALITY_COLORS,
  SLEEP_QUALITY_LABELS,
  STRESS_COLORS,
  STRESS_LABELS,
} from "./behaviorConstants";
import {
  RECORD_COLORS,
  SectionCard,
  StatusBanner,
  SubScreenFooter,
  SubScreenRoot,
  SubScreenTopBar,
  useRecordScreenInsets,
  styles as layoutStyles,
} from "./components/SubScreenLayout";

function ScorePicker({ value, onChange, colors, labels, disabled }) {
  return (
    <>
      <View style={styles.scoreRow}>
        {[1, 2, 3, 4, 5].map((score) => {
          const active = value === score;
          const palette = colors[score];
          return (
            <TouchableOpacity
              key={score}
              style={[
                styles.scoreItem,
                { backgroundColor: palette.bg, borderColor: palette.border },
                active && { backgroundColor: palette.active, borderColor: palette.active },
              ]}
              onPress={() => !disabled && onChange(score)}
              activeOpacity={0.8}
              disabled={disabled}
            >
              <Text style={[styles.scoreNumber, active && styles.scoreNumberActive]}>{score}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {value ? (
        <View style={styles.scoreSelectedRow}>
          <Text style={styles.scoreSelectedLabel}>{labels[value]}</Text>
          <Text style={styles.scoreSelectedHint}>{value}점 선택됨</Text>
        </View>
      ) : (
        <Text style={styles.scoreGuide}>가장 가까운 상태를 선택해 주세요</Text>
      )}
    </>
  );
}

function buildBehaviorPayload({
  dateStr,
  sleepHours,
  sleepQuality,
  stressLevel,
  waterIntake,
  exerciseYn,
  exerciseDuration,
  exerciseType,
  alcoholYn,
  smokingYn,
}) {
  return {
    logged_at: dateStr,
    sleep_hours: sleepHours ? parseFloat(sleepHours) : null,
    sleep_quality: sleepQuality,
    stress_level: stressLevel,
    water_intake_ml: waterIntake ? parseInt(waterIntake, 10) : null,
    exercise_yn: exerciseYn,
    exercise_duration_min:
      exerciseYn && exerciseDuration ? parseInt(exerciseDuration, 10) : null,
    exercise_type: exerciseYn && exerciseType ? exerciseType : null,
    alcohol_yn: alcoholYn,
    smoking_yn: smokingYn,
    custom_behaviors: {},
  };
}

function behaviorPayloadMatchesLog(payload, log) {
  if (!log) return false;
  return (
    payload.sleep_hours === log.sleep_hours &&
    payload.sleep_quality === log.sleep_quality &&
    payload.stress_level === log.stress_level &&
    payload.water_intake_ml === log.water_intake_ml &&
    payload.exercise_yn === !!log.exercise_yn &&
    payload.exercise_duration_min === log.exercise_duration_min &&
    payload.exercise_type === (log.exercise_type ?? null) &&
    payload.alcohol_yn === !!log.alcohol_yn &&
    payload.smoking_yn === !!log.smoking_yn
  );
}

export default function BehaviorLogEntry({ onBack, selectedDate, onDataChanged }) {
  const { scrollPaddingBottom } = useRecordScreenInsets();
  const date = selectedDate ?? new Date();
  const dateStr = toDateStr(date);
  const isToday = dateStr === toDateStr(new Date());

  const [sleepHours, setSleepHours] = useState("");
  const [sleepQuality, setSleepQuality] = useState(null);
  const [stressLevel, setStressLevel] = useState(null);
  const [waterIntake, setWaterIntake] = useState("");
  const [exerciseYn, setExerciseYn] = useState(false);
  const [exerciseDuration, setExerciseDuration] = useState("");
  const [exerciseType, setExerciseType] = useState("");
  const [alcoholYn, setAlcoholYn] = useState(false);
  const [smokingYn, setSmokingYn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingLogId, setExistingLogId] = useState(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [healthBanner, setHealthBanner] = useState("");

  const { isAvailable, platform, loading: hcLoading, fetchHealthData } = useHealthConnect();
  const { data: loadedLog, isInitialLoad, error: queryError } = useBehaviorLogQuery(dateStr);

  const fillFromHealth = useCallback(
    async (silent = false) => {
      const data = await fetchHealthData(date);
      if (!data) return;
      const filled = [];
      if (data.sleepHours !== null) { setSleepHours(String(data.sleepHours)); filled.push("수면"); }
      if (data.sleepQuality != null) { setSleepQuality(data.sleepQuality); filled.push("수면 질"); }
      if (data.exerciseYn) {
        setExerciseYn(true);
        if (data.exerciseDurationMin) { setExerciseDuration(String(data.exerciseDurationMin)); filled.push("운동"); }
        if (data.exerciseType) setExerciseType(data.exerciseType);
      }
      if (silent && filled.length > 0) {
        const appName = platform === "ios" ? "Apple Health" : "갤럭시 헬스";
        setHealthBanner(`${appName}에서 불러왔어요 (${filled.join(", ")})`);
        setTimeout(() => setHealthBanner(""), 3000);
      }
      if (!silent && filled.length > 0) {
        const appName = platform === "ios" ? "Apple Health" : "갤럭시 헬스";
        setHealthBanner(`${appName}에서 불러왔어요 (${filled.join(", ")})`);
        setTimeout(() => setHealthBanner(""), 3000);
      }
    },
    [date, fetchHealthData, platform]
  );

  useEffect(() => {
    if (isInitialLoad) return;

    if (loadedLog) {
      setExistingLogId(loadedLog.id);
      setSleepHours(loadedLog.sleep_hours != null ? String(loadedLog.sleep_hours) : "");
      setSleepQuality(loadedLog.sleep_quality ?? null);
      setStressLevel(loadedLog.stress_level ?? null);
      setWaterIntake(loadedLog.water_intake_ml != null ? String(loadedLog.water_intake_ml) : "");
      setExerciseYn(!!loadedLog.exercise_yn);
      setExerciseDuration(
        loadedLog.exercise_duration_min != null ? String(loadedLog.exercise_duration_min) : ""
      );
      setExerciseType(loadedLog.exercise_type ?? "");
      setAlcoholYn(!!loadedLog.alcohol_yn);
      setSmokingYn(!!loadedLog.smoking_yn);
      return;
    }

    setExistingLogId(null);
    setSleepHours("");
    setSleepQuality(null);
    setStressLevel(null);
    setWaterIntake("");
    setExerciseYn(false);
    setExerciseDuration("");
    setExerciseType("");
    setAlcoholYn(false);
    setSmokingYn(false);

    if (isAvailable && isToday) {
      void fillFromHealth(true);
    }
  }, [loadedLog, isInitialLoad, dateStr, isAvailable, isToday, fillFromHealth]);

  const appState = useRef(AppState.currentState);
  useEffect(() => {
    if (!isToday || !isAvailable || existingLogId) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        fillFromHealth(true);
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [isToday, isAvailable, existingLogId, fillFromHealth]);

  const handleImportFromHealthApp = async () => {
    const data = await fetchHealthData(date);
    if (!data) return;

    const imported = [];
    const manualNeeded = [];

    if (data.sleepHours !== null) {
      setSleepHours(String(data.sleepHours));
      imported.push(`수면 ${data.sleepHours}시간`);
    }
    if (data.sleepQuality != null) {
      setSleepQuality(data.sleepQuality);
      imported.push(`수면 질 ${data.sleepQuality}점`);
    } else if (data.sleepHours !== null) {
      manualNeeded.push("수면 질");
    }
    if (data.exerciseYn) {
      setExerciseYn(true);
      if (data.exerciseDurationMin) {
        setExerciseDuration(String(data.exerciseDurationMin));
        imported.push(`운동 ${data.exerciseDurationMin}분`);
      }
      if (data.exerciseType) {
        setExerciseType(data.exerciseType);
        imported.push(`운동 종류: ${data.exerciseType}`);
      }
    }
    if (data.steps !== null) {
      imported.push(`걸음수 ${data.steps.toLocaleString()}보 (참고용)`);
    }

    const appName = platform === "ios" ? "Apple Health" : "갤럭시 헬스";
    if (imported.length > 0) {
      const manualSuffix =
        manualNeeded.length > 0
          ? ` · 직접 입력 필요: ${manualNeeded.join(", ")}, 스트레스`
          : " · 스트레스는 직접 입력해 주세요";
      setHealthBanner(`${appName}: ${imported.join(", ")}${manualSuffix}`);
      setTimeout(() => setHealthBanner(""), 5000);
    } else {
      setHealthBanner("오늘·어제 기록된 건강 데이터가 없습니다.");
      setTimeout(() => setHealthBanner(""), 3000);
    }
  };

  const persistSave = async (payload) => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (existingLogId) {
        await updateBehaviorLog(existingLogId, payload);
      } else {
        await createBehaviorLog(payload);
      }

      useRecordCacheStore.getState().invalidateBehavior(dateStr);
      onDataChanged?.();
      setSavedSuccess(true);
      setTimeout(() => onBack(), 800);
    } catch (error) {
      console.error(error);
      setSaveError("생활 기록 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (sleepHours) {
      const sleepVal = parseFloat(sleepHours);
      if (isNaN(sleepVal) || sleepVal < 0 || sleepVal > 24) {
        Alert.alert("입력 오류", "수면 시간은 0에서 24 사이의 숫자여야 합니다.");
        return;
      }
    }
    if (waterIntake) {
      const waterVal = parseInt(waterIntake, 10);
      if (isNaN(waterVal) || waterVal < 0 || !/^\d+$/.test(waterIntake)) {
        Alert.alert("입력 오류", "수분 섭취량은 0 이상의 정수여야 합니다.");
        return;
      }
    }
    if (exerciseYn && exerciseDuration) {
      const durationVal = parseInt(exerciseDuration, 10);
      if (isNaN(durationVal) || durationVal < 0 || !/^\d+$/.test(exerciseDuration)) {
        Alert.alert("입력 오류", "운동 시간은 0 이상의 정수여야 합니다.");
        return;
      }
    }

    const payload = buildBehaviorPayload({
      dateStr,
      sleepHours,
      sleepQuality,
      stressLevel,
      waterIntake,
      exerciseYn,
      exerciseDuration,
      exerciseType,
      alcoholYn,
      smokingYn,
    });

    if (existingLogId && behaviorPayloadMatchesLog(payload, loadedLog)) {
      Alert.alert(
        "수정사항 없음",
        "수정사항이 없습니다. 이대로 저장하겠습니까?",
        [
          { text: "취소", style: "cancel" },
          { text: "저장", onPress: () => persistSave(payload) },
        ]
      );
      return;
    }

    await persistSave(payload);
  };

  const healthAppName = platform === "ios" ? "Apple Health" : "갤럭시 헬스";

  return (
    <SubScreenRoot onBack={onBack}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SubScreenTopBar
          title="생활 기록"
          dateLabel={isToday ? "오늘" : dateStr}
          onBack={onBack}
          trailing={
            isInitialLoad ? (
              <ActivityIndicator size="small" color={RECORD_COLORS.olive} />
            ) : null
          }
        />

        <ScrollView
          contentContainerStyle={[layoutStyles.scrollContent, { paddingBottom: scrollPaddingBottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {savedSuccess ? (
            <StatusBanner icon="checkmark-circle" text="저장되었습니다." />
          ) : saveError ? (
            <StatusBanner
              icon="alert-circle-outline"
              text={saveError}
              variant="error"
              onPress={() => setSaveError(null)}
            />
          ) : healthBanner ? (
            <StatusBanner icon="heart-outline" text={healthBanner} />
          ) : queryError && !isInitialLoad ? (
            <StatusBanner
              icon="alert-circle-outline"
              text="기록을 불러오지 못했습니다. 저장하면 새 기록이 생성됩니다."
              variant="error"
              onPress={() => useRecordCacheStore.getState().invalidateBehavior(dateStr)}
            />
          ) : existingLogId ? (
            <StatusBanner
              icon="checkmark-circle"
              text={
                isToday
                  ? "오늘 기록이 있어요 · 수정 후 저장하면 업데이트됩니다"
                  : "이 날 기록을 수정할 수 있어요"
              }
            />
          ) : !isToday ? (
            <StatusBanner icon="calendar-outline" text="이 날 생활 기록이 없습니다" variant="empty" />
          ) : (
            <StatusBanner
              icon="pulse-outline"
              text="수면, 스트레스, 운동 등 오늘의 생활 정보를 기록해 보세요"
              variant="empty"
            />
          )}

          {isAvailable && isToday ? (
            <SectionCard
              title="건강 앱 연동"
              subtitle={`${healthAppName}에서 수면·운동 데이터를 불러올 수 있어요`}
            >
              <TouchableOpacity
                style={styles.healthImportBtn}
                onPress={handleImportFromHealthApp}
                disabled={hcLoading || saving}
                activeOpacity={0.85}
              >
                {hcLoading ? (
                  <ActivityIndicator color={RECORD_COLORS.olive} size="small" />
                ) : (
                  <>
                    <View style={styles.healthImportIcon}>
                      <Ionicons
                        name={platform === "ios" ? "heart-circle" : "heart"}
                        size={20}
                        color={RECORD_COLORS.olive}
                      />
                    </View>
                    <View style={styles.healthImportTextBlock}>
                      <Text style={styles.healthImportTitle}>{healthAppName}에서 불러오기</Text>
                      <Text style={styles.healthImportDesc}>수면·운동 데이터 자동 입력</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={RECORD_COLORS.muted} />
                  </>
                )}
              </TouchableOpacity>
            </SectionCard>
          ) : null}

          <SectionCard title="수면" subtitle="수면 시간과 질을 기록해 주세요">
            <Text style={styles.fieldLabel}>수면 시간 (시간)</Text>
            <TextInput
              style={layoutStyles.input}
              placeholder="예: 7.5"
              placeholderTextColor={RECORD_COLORS.muted}
              keyboardType="decimal-pad"
              value={sleepHours}
              onChangeText={setSleepHours}
              editable={!saving}
            />
            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>수면 질 (1~5점)</Text>
            <ScorePicker
              value={sleepQuality}
              onChange={setSleepQuality}
              colors={SLEEP_QUALITY_COLORS}
              labels={SLEEP_QUALITY_LABELS}
              disabled={saving}
            />
          </SectionCard>

          <SectionCard title="스트레스" subtitle="1(낮음) ~ 5(높음)">
            <ScorePicker
              value={stressLevel}
              onChange={setStressLevel}
              colors={STRESS_COLORS}
              labels={STRESS_LABELS}
              disabled={saving}
            />
          </SectionCard>

          <SectionCard title="수분 섭취" subtitle="ml 단위 (선택)">
            <TextInput
              style={layoutStyles.input}
              placeholder="예: 1500"
              placeholderTextColor={RECORD_COLORS.muted}
              keyboardType="number-pad"
              value={waterIntake}
              onChangeText={setWaterIntake}
              editable={!saving}
            />
            {waterIntake && /^\d+$/.test(waterIntake) ? (
              <Text style={styles.inputHint}>
                {parseInt(waterIntake, 10).toLocaleString()}ml 입력됨
              </Text>
            ) : null}
          </SectionCard>

          <SectionCard title="운동" subtitle="오늘 운동 여부와 내용">
            <View style={styles.choiceRow}>
              <TouchableOpacity
                style={[styles.choiceChip, exerciseYn && styles.choiceChipActive]}
                onPress={() => !saving && setExerciseYn(true)}
                activeOpacity={0.78}
                disabled={saving}
              >
                <Ionicons
                  name="fitness-outline"
                  size={18}
                  color={exerciseYn ? RECORD_COLORS.olive : RECORD_COLORS.muted}
                />
                <Text style={[styles.choiceChipText, exerciseYn && styles.choiceChipTextActive]}>
                  했어요
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.choiceChip, !exerciseYn && styles.choiceChipActive]}
                onPress={() => !saving && setExerciseYn(false)}
                activeOpacity={0.78}
                disabled={saving}
              >
                <Ionicons
                  name="bed-outline"
                  size={18}
                  color={!exerciseYn ? RECORD_COLORS.olive : RECORD_COLORS.muted}
                />
                <Text style={[styles.choiceChipText, !exerciseYn && styles.choiceChipTextActive]}>
                  안 했어요
                </Text>
              </TouchableOpacity>
            </View>
            {exerciseYn ? (
              <View style={styles.conditionalBlock}>
                <Text style={styles.fieldLabel}>운동 종류</Text>
                <TextInput
                  style={[layoutStyles.input, styles.fieldGap]}
                  placeholder="예: 조깅, 요가, 헬스"
                  placeholderTextColor={RECORD_COLORS.muted}
                  value={exerciseType}
                  onChangeText={setExerciseType}
                  editable={!saving}
                />
                <Text style={styles.fieldLabel}>운동 시간 (분)</Text>
                <TextInput
                  style={layoutStyles.input}
                  placeholder="예: 30"
                  placeholderTextColor={RECORD_COLORS.muted}
                  keyboardType="number-pad"
                  value={exerciseDuration}
                  onChangeText={setExerciseDuration}
                  editable={!saving}
                />
              </View>
            ) : null}
          </SectionCard>

          <SectionCard title="기타 요인" subtitle="해당 항목을 선택 (선택)">
            <View style={styles.tagGrid}>
              <TouchableOpacity
                style={[styles.tagChip, alcoholYn && styles.tagChipActive]}
                onPress={() => !saving && setAlcoholYn(!alcoholYn)}
                activeOpacity={0.78}
                disabled={saving}
              >
                <Ionicons
                  name="wine-outline"
                  size={14}
                  color={alcoholYn ? RECORD_COLORS.white : RECORD_COLORS.muted}
                />
                <Text style={[styles.tagText, alcoholYn && styles.tagTextActive]}>음주</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tagChip, smokingYn && styles.tagChipActive]}
                onPress={() => !saving && setSmokingYn(!smokingYn)}
                activeOpacity={0.78}
                disabled={saving}
              >
                <Ionicons
                  name="flame-outline"
                  size={14}
                  color={smokingYn ? RECORD_COLORS.white : RECORD_COLORS.muted}
                />
                <Text style={[styles.tagText, smokingYn && styles.tagTextActive]}>흡연</Text>
              </TouchableOpacity>
            </View>
            {alcoholYn || smokingYn ? (
              <Text style={styles.tagCount}>
                {[alcoholYn && "음주", smokingYn && "흡연"].filter(Boolean).join(", ")} 선택됨
              </Text>
            ) : null}
          </SectionCard>
        </ScrollView>

        <SubScreenFooter
          label={existingLogId ? "수정 저장" : "저장하기"}
          onPress={handleSave}
          saving={saving}
          icon="checkmark-circle-outline"
        />
      </KeyboardAvoidingView>
    </SubScreenRoot>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: RECORD_COLORS.oliveMuted,
    marginBottom: 8,
  },
  fieldLabelSpaced: { marginTop: 14 },
  fieldGap: { marginBottom: 12 },
  inputHint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: RECORD_COLORS.olive,
  },

  healthImportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
  },
  healthImportIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RECORD_COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  healthImportTextBlock: { flex: 1 },
  healthImportTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: RECORD_COLORS.text,
  },
  healthImportDesc: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: RECORD_COLORS.muted,
  },

  scoreRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  scoreItem: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 58,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreNumber: { fontSize: 20, fontWeight: "900", color: RECORD_COLORS.muted },
  scoreNumberActive: { color: RECORD_COLORS.white },
  scoreSelectedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(217, 214, 204, 0.6)",
  },
  scoreSelectedLabel: { fontSize: 15, fontWeight: "900", color: RECORD_COLORS.olive },
  scoreSelectedHint: { fontSize: 12, fontWeight: "700", color: RECORD_COLORS.muted },
  scoreGuide: { marginTop: 12, fontSize: 12.5, fontWeight: "600", color: RECORD_COLORS.muted },

  choiceRow: { flexDirection: "row", gap: 10 },
  choiceChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
  },
  choiceChipActive: {
    backgroundColor: RECORD_COLORS.oliveSoft,
    borderColor: RECORD_COLORS.olive,
  },
  choiceChipText: { fontSize: 14, fontWeight: "800", color: RECORD_COLORS.muted },
  choiceChipTextActive: { color: RECORD_COLORS.olive },
  conditionalBlock: { marginTop: 14 },

  tagGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
  },
  tagChipActive: { backgroundColor: RECORD_COLORS.olive, borderColor: RECORD_COLORS.olive },
  tagText: { fontSize: 13, fontWeight: "700", color: RECORD_COLORS.muted },
  tagTextActive: { color: RECORD_COLORS.white },
  tagCount: { marginTop: 10, fontSize: 12, fontWeight: "700", color: RECORD_COLORS.oliveMuted },
});

/**
 * DailyRecordFlowModal
 * "오늘 기록하기" 원버튼 → 피부 → 식단 → 생활 순서로 모달이 착착착 뜨는 플로우
 *
 * 레이아웃 원칙
 * ─ sheet 는 position:absolute / bottom:0 으로 항상 화면 하단에 붙어 있음
 * ─ translateY 로만 밀어내므로 dim과 분리 애니메이션 가능, safeArea 갭 없음
 * ─ dim 은 absoluteFillObject + opacity 페이드 (슬라이드 없음)
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { createSkinLog, updateSkinLog } from "../../api/skinLogs";
import { createDietLog, searchFoodItems } from "../../api/diet";
import { createBehaviorLog, updateBehaviorLog } from "../../api/behavior";
import useRecordCacheStore from "../../stores/recordCacheStore";
import { useSkinLogQuery, useDietLogsQuery, useBehaviorLogQuery } from "../../hooks/useRecordQueries";
import { toDateStr } from "../screens/record/components/DateNavigator";
import { buildLoggedAtIso } from "../../utils/exif";
import { SCORE_LABELS, SCORE_COLORS, SKIN_TAG_OPTIONS } from "../screens/record/skinConstants";
import { STRESS_LABELS, STRESS_COLORS } from "../screens/record/behaviorConstants";
import { MAIN_MEALS } from "../screens/record/dietDisplay";

// ─── 테마 ────────────────────────────────────────────────────────────────────
const C = {
  bg:        "#F7F8F5",
  surface:   "#FFFFFF",
  line:      "#E2E5DA",
  olive:     "#4F603C",
  oliveSoft: "#E4EBD8",
  text:      "#1A1F17",
  muted:     "#8A9080",
  warning:   "#A45F48",
};
const F = {
  medium:    "Pretendard-Medium",
  bold:      "Pretendard-Bold",
  extraBold: "Pretendard-ExtraBold",
};

const STEP_META = {
  skin:     { icon: "leaf-outline",       label: "피부",   color: "#4F603C" },
  diet:     { icon: "restaurant-outline", label: "식단",   color: "#A06830" },
  behavior: { icon: "moon-outline",       label: "생활",   color: "#5A6E8A" },
  photo:    { icon: "camera-outline",     label: "사진",   color: "#4A7CA0" },
};
const MAIN_STEPS = ["skin", "diet", "behavior"];

const SCREEN_H = Dimensions.get("window").height;

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function DailyRecordFlowModal({ visible, onClose, onComplete, onGoSkinRecord, onGoDietRecord }) {
  const insets   = useSafeAreaInsets();
  const todayStr = toDateStr(new Date());

  const skinQuery     = useSkinLogQuery(todayStr);
  const dietQuery     = useDietLogsQuery(todayStr);
  const behaviorQuery = useBehaviorLogQuery(todayStr);

  const todaySkin     = skinQuery.data     ?? null;
  const todayDietLogs = dietQuery.data     ?? [];
  const todayBehavior = behaviorQuery.data ?? null;

  // 내부 Modal mounted 상태 (퇴장 애니메이션 완료 후 unmount)
  const [modalMounted, setModalMounted] = useState(false);

  // ── 애니메이션 ──
  const dimOpacity     = useRef(new Animated.Value(0)).current;
  const slideY         = useRef(new Animated.Value(SCREEN_H)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;


  // ── 스텝 관리 ──
  const [stepQueue,  setStepQueue]  = useState([]);
  const [stepIndex,  setStepIndex]  = useState(0);
  const [saving,     setSaving]     = useState(false);
  const [saveError,  setSaveError]  = useState(null);
  const [allDone,    setAllDone]    = useState(false);

  // ── 폼 상태 ──
  const [skinScore, setSkinScore] = useState(null);
  const [skinTags,  setSkinTags]  = useState([]);
  const [mealType,         setMealType]         = useState("점심");
  const [foodName,         setFoodName]         = useState("");
  const [selectedFoodItem, setSelectedFoodItem] = useState(null);
  const [foodCandidates,   setFoodCandidates]   = useState([]);
  const [foodSearching,    setFoodSearching]     = useState(false);
  const [sessionDietLogs,  setSessionDietLogs]  = useState([]); // 이번 세션에 추가한 식단 목록(표시용)
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [sleepHours,  setSleepHours]  = useState(null);
  const [stressLevel, setStressLevel] = useState(null);
  const [exerciseYn,  setExerciseYn]  = useState(null);

  // ── 진입 / 퇴장 애니메이션 ──
  useEffect(() => {
    if (visible) {
      // 피부→식단→생활→사진(페이지 이동) 4단계
      const queue = [...MAIN_STEPS, "photo"];

      setStepQueue(queue);
      setStepIndex(0);
      setSaveError(null);
      setSaving(false);
      setAllDone(false);

      // 피부·생활은 기존 값 미리 채우기 (update 방식)
      // 식단은 항상 빈 폼 — createDietLog 방식이라 pre-fill 시 중복 로그 생성 위험
      setSkinScore(todaySkin?.overall_score ?? null);
      setSkinTags(todaySkin?.condition_tags ?? []);
      setMealType("점심");
      setFoodName(""); setSelectedFoodItem(null); setFoodCandidates([]); setSessionDietLogs([]);
      setSleepHours(todayBehavior?.sleep_hours ?? null);
      setStressLevel(todayBehavior?.stress_level ?? null);
      setExerciseYn(todayBehavior?.exercise_yn ?? null);
      contentOpacity.setValue(1);

      // 진입 애니메이션
      setModalMounted(true);
      dimOpacity.setValue(0);
      slideY.setValue(SCREEN_H);
      Animated.parallel([
        Animated.timing(dimOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideY, { toValue: 0, damping: 28, stiffness: 230, mass: 0.9, useNativeDriver: true }),
      ]).start();
    } else {
      // 퇴장 애니메이션 → 완료 후 Modal unmount, pending 카메라 실행
      Animated.parallel([
        Animated.timing(dimOpacity, { toValue: 0, duration: 170, useNativeDriver: true }),
        Animated.timing(slideY, { toValue: SCREEN_H, duration: 210, useNativeDriver: true }),
      ]).start(() => {
        setModalMounted(false);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const currentStep = stepQueue[stepIndex] ?? null;
  const totalSteps  = stepQueue.length;
  const isLastStep  = stepIndex === totalSteps - 1;

  const advanceStep = useCallback((cb) => {
    Animated.timing(contentOpacity, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      cb();
      Animated.timing(contentOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    });
  }, [contentOpacity]);

  const goNext = useCallback(() => {
    setSaveError(null);
    if (isLastStep) { setAllDone(true); return; }
    advanceStep(() => setStepIndex((i) => i + 1));
  }, [isLastStep, advanceStep]);

  // photo 스텝 — 닫고 해당 기록 페이지로 이동
  const handleGoSkinRecord = useCallback(() => { onClose(); onGoSkinRecord?.(); }, [onClose, onGoSkinRecord]);
  const handleGoDietRecord = useCallback(() => { onClose(); onGoDietRecord?.(); }, [onClose, onGoDietRecord]);

  const handleSkip = useCallback(() => {
    if (saving) return;
    goNext();
  }, [saving, goNext]);

  // ── 식단 음식명 디바운스 검색 ──
  useEffect(() => {
    if (currentStep !== "diet") return;
    const trimmed = foodName.trim();
    if (!trimmed) { setFoodCandidates([]); return; }
    if (selectedFoodItem?.name === trimmed) { setFoodCandidates([]); return; }
    const timer = setTimeout(async () => {
      setFoodSearching(true);
      try {
        const results = await searchFoodItems(trimmed, null, 0, 3);
        setFoodCandidates(results || []);
      } catch {
        setFoodCandidates([]);
      } finally {
        setFoodSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [foodName, selectedFoodItem, currentStep]);

  // ── 키보드 표시 여부 추적 ──
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardUp(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);



  // 식단 스텝 전용 — 저장 후 폼 초기화해서 계속 추가 가능
  const handleDietAddMore = useCallback(async () => {
    if (saving) return;
    if (!selectedFoodItem) {
      setSaveError("검색 결과에서 음식을 선택해주세요.");
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const dietPayload = {
        meal_type: mealType,
        logged_at: buildLoggedAtIso(todayStr, null),
        items: [{ food_item_id: selectedFoodItem.id, custom_food_name: null }],
      };
      const store = useRecordCacheStore.getState();
      await createDietLog(dietPayload);
      store.invalidateDiet(todayStr);
      onComplete?.();
      // 저장 성공 → 폼 초기화, 다음 끼니로 자동 이동
      const label = selectedFoodItem?.name || foodName.trim() || mealType;
      setSessionDietLogs((prev) => {
        const next = prev.concat({ mealType, label });
        // 저장된 끼니 목록 기준으로 아직 안 쓴 끼니 중 첫 번째 선택
        const used = new Set(next.map((l) => l.mealType));
        const MEAL_ORDER = ["아침", "점심", "저녁", "간식"];
        const nextMeal = MEAL_ORDER.find((m) => !used.has(m)) ?? "간식";
        setMealType(nextMeal);
        return next;
      });
      setFoodName(""); setSelectedFoodItem(null); setFoodCandidates([]);
    } catch {
      setSaveError("저장 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }, [saving, mealType, foodName, selectedFoodItem, todayStr, onComplete]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaveError(null);
    setSaving(true);
    const store = useRecordCacheStore.getState();
    try {
      if (currentStep === "skin") {
        if (!skinScore) { setSaveError("피부 점수를 선택해주세요."); setSaving(false); return; }
        const skinBase = {
          overall_score:  skinScore,
          condition_tags: skinTags.length > 0 ? skinTags : null,
        };
        if (todaySkin?.id) {
          // update: logged_at 제외 (API 스키마가 허용 안 함)
          await updateSkinLog(todaySkin.id, skinBase);
        } else {
          await createSkinLog({ ...skinBase, logged_at: todayStr });
        }
        store.invalidateSkin(todayStr);
      } else if (currentStep === "diet") {
        // 선택된 아이템이 있을 때만 저장 (직접 입력은 백엔드 미지원)
        if (selectedFoodItem) {
          const dietPayload = {
            meal_type: mealType,
            logged_at: buildLoggedAtIso(todayStr, null),
            items: [{ food_item_id: selectedFoodItem.id, custom_food_name: null }],
          };
          await createDietLog(dietPayload);
          store.invalidateDiet(todayStr);
        }
      } else if (currentStep === "behavior") {
        const behaviorBase = {
          sleep_hours:  sleepHours  ?? null,
          stress_level: stressLevel ?? null,
          exercise_yn:  exerciseYn,
        };
        if (todayBehavior?.id) {
          // update: logged_at 제외 (API 스키마가 허용 안 함)
          await updateBehaviorLog(todayBehavior.id, behaviorBase);
        } else {
          await createBehaviorLog({ ...behaviorBase, logged_at: todayStr });
        }
        store.invalidateBehavior(todayStr);
      }
      onComplete?.();
      goNext();
    } catch {
      setSaveError("저장 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }, [saving, currentStep, skinScore, skinTags, todaySkin, mealType, foodName, selectedFoodItem, sleepHours, stressLevel, exerciseYn, todayBehavior, todayStr, goNext, onComplete]);

  if (!modalMounted) return null;

  const meta = STEP_META[currentStep ?? "skin"];

  return (
    <Modal
      visible={modalMounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* ── 딤 (opacity 페이드, 슬라이드 없음) ── */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, s.dim, { opacity: dimOpacity }]}
        pointerEvents="none"
      />
      {/* 배경 탭 → 키보드 내리기만 (모달은 유지) */}
      <Pressable style={StyleSheet.absoluteFillObject} onPress={() => Keyboard.dismiss()} />

      {/* ── 시트: position absolute bottom:0 → translateY 로만 슬라이드 ── */}
      {/* KAV 없음: ScrollView의 automaticallyAdjustKeyboardInsets 로 키보드 처리
          (KAV가 시트 전체를 밀어올리는 문제 방지) */}
      <Animated.View
        style={[s.sheetOuter, { transform: [{ translateY: slideY }] }]}
        pointerEvents="box-none"
      >
        {/* 시트 본체: 하단 safe-area + extra 를 paddingBottom 으로 확보 */}
        <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>

          {/* 핸들 */}
          <View style={s.handle} />

          {allDone ? (
            <DoneView onClose={onClose} />
          ) : (
            <>
              {/* 헤더 */}
              <View style={s.header}>
                <View style={[s.stepIconBox, { backgroundColor: `${meta.color}1A` }]}>
                  <Ionicons name={meta.icon} size={16} color={meta.color} />
                </View>
                <Text style={[s.stepLabel, { color: meta.color }]}>{meta.label}</Text>
                <Text style={s.stepCounter}>{stepIndex + 1} / {totalSteps}</Text>
                <Pressable onPress={onClose} hitSlop={14}>
                  <Ionicons name="close" size={20} color={C.muted} />
                </Pressable>
              </View>

              {/* 프로그레스 바 */}
              <View style={s.progressBar}>
                {stepQueue.map((_, i) => (
                  <View key={i} style={[s.progressSeg, { backgroundColor: i <= stepIndex ? meta.color : C.line }]} />
                ))}
              </View>

              {/* 스텝 콘텐츠 + 버튼을 ScrollView 안에 모두 넣어
                  키보드가 올라와도 스크롤로 버튼에 접근 가능 */}
              <Animated.ScrollView
                style={{ opacity: contentOpacity, flex: 1 }}
                contentContainerStyle={[s.scrollContent, keyboardUp && s.scrollContentKeyboard]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
              >
                {currentStep === "skin" && (
                  <SkinStep
                    score={skinScore}
                    tags={skinTags}
                    onScoreChange={setSkinScore}
                    onTagToggle={(t) =>
                      setSkinTags((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])
                    }
                  />
                )}
                {currentStep === "diet" && (
                  <DietStep
                    mealType={mealType}
                    foodName={foodName}
                    selectedFoodItem={selectedFoodItem}
                    foodCandidates={foodCandidates}
                    foodSearching={foodSearching}
                    sessionDietLogs={sessionDietLogs}
                    onMealTypeChange={setMealType}
                    onFoodNameChange={(text) => {
                      setFoodName(text);
                      if (selectedFoodItem) setSelectedFoodItem(null);
                    }}
                    onSelectCandidate={(item) => {
                      setSelectedFoodItem(item);
                      setFoodName(item.name);
                      setFoodCandidates([]);
                    }}
                  />
                )}
                {currentStep === "behavior" && (
                  <BehaviorStep
                    sleepHours={sleepHours}
                    stressLevel={stressLevel}
                    exerciseYn={exerciseYn}
                    onSleepAdjust={(d) => setSleepHours((p) => Math.min(14, Math.max(0, Math.round(((p ?? 7) + d) * 2) / 2)))}
                    onStressChange={setStressLevel}
                    onSetExercise={(v) => setExerciseYn(v)}
                  />
                )}
                {currentStep === "photo" && (
                  <PhotoStep onGoSkin={handleGoSkinRecord} onGoDiet={handleGoDietRecord} onSkip={() => setAllDone(true)} />
                )}

                {saveError ? <Text style={s.errorText}>{saveError}</Text> : null}

                {/* 스페이서 — 콘텐츠가 짧아도 버튼이 항상 하단에 위치 */}
                <View style={{ flex: 1 }} />

                {/* 버튼 행 — ScrollView 안에 배치해 키보드 위로 스크롤 가능 */}
                {currentStep === "photo" ? null : currentStep === "diet" ? (
                  /* 식단: 저장하고 추가 + 다음 */
                  <View style={s.dietBtnCol}>
                    <Pressable
                      style={({ pressed }) => [s.addMoreBtn, pressed && { opacity: 0.75 }, saving && { opacity: 0.6 }]}
                      onPress={handleDietAddMore}
                      disabled={saving}
                    >
                      <Ionicons name="add-circle-outline" size={16} color={C.olive} />
                      <Text style={s.addMoreBtnText}>저장하고 추가</Text>
                    </Pressable>
                    <View style={s.btnRow}>
                      <Pressable style={({ pressed }) => [s.skipBtn, pressed && { opacity: 0.6 }]} onPress={handleSkip} disabled={saving}>
                        <Text style={s.skipBtnText}>건너뛰기</Text>
                      </Pressable>
                      <Pressable style={({ pressed }) => [s.nextBtn, pressed && { opacity: 0.88 }, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
                        {saving
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={s.nextBtnText}>다음</Text>}
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={s.btnRow}>
                    <Pressable style={({ pressed }) => [s.skipBtn, pressed && { opacity: 0.6 }]} onPress={handleSkip} disabled={saving}>
                      <Text style={s.skipBtnText}>건너뛰기</Text>
                    </Pressable>
                    <Pressable style={({ pressed }) => [s.nextBtn, pressed && { opacity: 0.88 }, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
                      {saving
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={s.nextBtnText}>{isLastStep ? "완료" : "다음"}</Text>}
                    </Pressable>
                  </View>
                )}
              </Animated.ScrollView>
            </>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}



// ─── 완료 화면 ────────────────────────────────────────────────────────────────
function DoneView({ onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 1800);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <View style={s.doneWrap}>
      <View style={s.doneIconCircle}>
        <Ionicons name="checkmark-circle" size={52} color={C.olive} />
      </View>
      <Text style={s.doneTitle}>오늘 기록 완료!</Text>
      <Text style={s.doneSub}>오늘의 기록을 마쳤어요.{"\n"}수고하셨어요 🌿</Text>
    </View>
  );
}

// ─── 사진 스텝 (기록 페이지 이동) ─────────────────────────────────────────────
function PhotoStep({ onGoSkin, onGoDiet, onSkip }) {
  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>사진을 남겨볼까요?</Text>
      <Text style={s.stepSub}>각 기록 페이지로 이동해서 사진을 추가할 수 있어요.</Text>

      <Pressable style={({ pressed }) => [s.navCard, s.navCardSkin, pressed && { opacity: 0.88 }]} onPress={onGoSkin}>
        <View style={[s.navCardIcon, { backgroundColor: "#D6E8C4" }]}>
          <Ionicons name="leaf-outline" size={22} color="#4F603C" />
        </View>
        <View style={s.navCardTexts}>
          <Text style={[s.navCardTitle, { color: "#3A4D2C" }]}>피부 기록으로 이동</Text>
          <Text style={s.navCardSub}>사진 찍으면 AI가 피부 상태를 분석해줘요</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#4F603C" />
      </Pressable>

      <Pressable style={({ pressed }) => [s.navCard, pressed && { opacity: 0.88 }]} onPress={onGoDiet}>
        <View style={[s.navCardIcon, { backgroundColor: "#F2E8D8" }]}>
          <Ionicons name="restaurant-outline" size={22} color="#A06830" />
        </View>
        <View style={s.navCardTexts}>
          <Text style={[s.navCardTitle, { color: "#A06830" }]}>식단 기록으로 이동</Text>
          <Text style={s.navCardSub}>음식 사진으로 칼로리·영양소를 분석해요</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.muted} />
      </Pressable>

      <Pressable style={({ pressed }) => [s.skipAllBtn, pressed && { opacity: 0.6 }]} onPress={onSkip}>
        <Text style={s.skipAllBtnText}>괜찮아요, 완료할게요</Text>
      </Pressable>
    </View>
  );
}

// ─── 피부 스텝 ────────────────────────────────────────────────────────────────
function SkinStep({ score, tags, onScoreChange, onTagToggle }) {
  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>오늘 피부는 어땠나요?</Text>
      <Text style={s.stepSub}>점수를 선택하고, 상태를 태그로 남겨보세요.</Text>
      <View style={s.scoreRow}>
        {[1, 2, 3, 4, 5].map((n) => {
          const p = SCORE_COLORS[n];
          const active = score === n;
          return (
            <Pressable key={n} style={[s.scoreBtn, { backgroundColor: active ? p.active : p.bg, borderColor: p.border }]} onPress={() => onScoreChange(n)}>
              <Text style={[s.scoreBtnNum, { color: active ? "#fff" : p.active }]}>{n}</Text>
              <Text style={[s.scoreBtnLabel, { color: active ? "rgba(255,255,255,0.82)" : p.active }]} numberOfLines={1}>{SCORE_LABELS[n]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={s.fieldLabel}>오늘의 피부 상태 (선택)</Text>
      <View style={s.tagWrap}>
        {SKIN_TAG_OPTIONS.map((tag) => {
          const active = tags.includes(tag);
          return (
            <Pressable key={tag} style={[s.tagChip, active && s.tagChipActive]} onPress={() => onTagToggle(tag)}>
              <Text style={[s.tagChipText, active && s.tagChipTextActive]}>{tag}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── 식단 스텝 ────────────────────────────────────────────────────────────────
const MEAL_ICONS = { 아침: "sunny-outline", 점심: "restaurant-outline", 저녁: "moon-outline", 간식: "cafe-outline" };

function DietStep({ mealType, foodName, selectedFoodItem, foodCandidates, foodSearching, sessionDietLogs, onMealTypeChange, onFoodNameChange, onSelectCandidate }) {
  const showCandidates = foodCandidates.length > 0;
  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>오늘 뭘 드셨나요?</Text>
      <Text style={s.stepSub}>끼니를 선택하고 음식을 검색해 기록해요.</Text>

      {/* 이미 저장된 끼니 칩 */}
      {sessionDietLogs.length > 0 && (
        <View style={s.savedMealWrap}>
          {sessionDietLogs.map((log, i) => (
            <View key={i} style={s.savedMealChip}>
              <Ionicons name="checkmark-circle" size={13} color={C.olive} />
              <Text style={s.savedMealText} numberOfLines={1}>{log.mealType} · {log.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 끼니 탭 */}
      <View style={s.mealTabRow}>
        {[...MAIN_MEALS, "간식"].map((meal) => {
          const active = mealType === meal;
          return (
            <Pressable key={meal} style={[s.mealTab, active && s.mealTabActive]} onPress={() => onMealTypeChange(meal)}>
              <Ionicons name={MEAL_ICONS[meal]} size={14} color={active ? "#A06830" : C.muted} />
              <Text style={[s.mealTabText, active && s.mealTabTextActive]}>{meal}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* 음식 검색 */}
      <View style={s.foodSearchWrap}>
        <View style={[
          s.foodSearchInputRow,
          selectedFoodItem && s.foodSearchInputRowSelected,
          showCandidates && s.foodSearchInputRowOpen,
        ]}>
          <Ionicons name="search-outline" size={15} color={selectedFoodItem ? C.olive : C.muted} style={{ marginRight: 8 }} />
          <TextInput
            style={s.foodSearchInput}
            value={foodName}
            onChangeText={onFoodNameChange}
            placeholder="음식명 검색"
            placeholderTextColor={C.muted}
            returnKeyType="done"
            maxLength={100}
          />
          {foodSearching
            ? <ActivityIndicator size="small" color={C.olive} style={{ marginLeft: 4 }} />
            : selectedFoodItem
              ? <Ionicons name="checkmark-circle" size={17} color={C.olive} style={{ marginLeft: 4 }} />
              : null}
        </View>
        {showCandidates && (
          <View style={[s.candidatesList, selectedFoodItem && { borderColor: "#8AAC6A" }]}>
            {foodCandidates.map((item, idx) => (
              <Pressable
                key={item.id ?? idx}
                style={[s.candidateItem, idx === foodCandidates.length - 1 && s.candidateItemLast]}
                onPress={() => onSelectCandidate(item)}
                android_ripple={{ color: "#E8EDE2" }}
              >
                <View style={s.candidateIconWrap}>
                  <Ionicons name="restaurant-outline" size={13} color={C.olive} />
                </View>
                <Text style={s.candidateText} numberOfLines={1}>{item.name}</Text>
                {item.category ? (
                  <View style={s.candidateBadge}>
                    <Text style={s.candidateBadgeText} numberOfLines={1}>{item.category}</Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={12} color={C.muted} />
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {!selectedFoodItem && !foodName.trim() && (
        <Text style={s.inputHint}>음식을 검색해 선택하면 기록돼요.</Text>
      )}
      {selectedFoodItem && (
        <Text style={[s.inputHint, { color: C.olive }]}>
          ✓ {selectedFoodItem.name} 선택됨
        </Text>
      )}
    </View>
  );
}

// ─── 생활 스텝 ────────────────────────────────────────────────────────────────
function BehaviorStep({ sleepHours, stressLevel, exerciseYn, onSleepAdjust, onStressChange, onSetExercise }) {
  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>오늘 생활은 어땠나요?</Text>
      <Text style={s.stepSub}>수면·스트레스·운동을 기록해요. 모두 선택 사항이에요.</Text>
      <Text style={s.fieldLabel}>수면 시간</Text>
      <View style={s.sleepRow}>
        <Pressable style={s.sleepStepBtn} onPress={() => onSleepAdjust(-0.5)}>
          <Ionicons name="remove" size={22} color={C.olive} />
        </Pressable>
        <View style={s.sleepValBox}>
          <Text style={s.sleepValNum}>{sleepHours != null ? sleepHours : "-"}</Text>
          <Text style={s.sleepValUnit}>시간</Text>
        </View>
        <Pressable style={s.sleepStepBtn} onPress={() => onSleepAdjust(0.5)}>
          <Ionicons name="add" size={22} color={C.olive} />
        </Pressable>
      </View>
      <Text style={s.fieldLabel}>스트레스 수준</Text>
      <View style={s.stressRow}>
        {[1, 2, 3, 4, 5].map((n) => {
          const p = STRESS_COLORS[n];
          const active = stressLevel === n;
          return (
            <Pressable key={n} style={[s.stressBtn, { backgroundColor: active ? p.active : p.bg, borderColor: p.border }]} onPress={() => onStressChange(active ? null : n)}>
              <Text style={[s.stressBtnNum, { color: active ? "#fff" : p.active }]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={s.fieldLabel}>오늘 운동했나요?</Text>
      <View style={s.exerciseRow}>
        <Pressable style={[s.exerciseBtn, exerciseYn === true && s.exerciseBtnOn]} onPress={() => onSetExercise(true)}>
          <Ionicons name={exerciseYn === true ? "checkmark-circle" : "checkmark-circle-outline"} size={18} color={exerciseYn === true ? C.olive : C.muted} />
          <Text style={[s.exerciseBtnText, exerciseYn === true && { color: C.olive, fontFamily: F.extraBold }]}>했어요</Text>
        </Pressable>
        <Pressable style={[s.exerciseBtn, exerciseYn === false && s.exerciseBtnOff]} onPress={() => onSetExercise(false)}>
          <Ionicons name={exerciseYn === false ? "close-circle" : "close-circle-outline"} size={18} color={exerciseYn === false ? C.muted : C.muted} />
          <Text style={[s.exerciseBtnText, exerciseYn === false && { color: C.muted }]}>안 했어요</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // ── 딤 ──
  dim: { backgroundColor: "rgba(0,0,0,0.46)" },

  // ── 시트 외부 래퍼 (translateY 적용 대상, 화면 하단에 절대 고정) ──
  // backgroundColor 를 여기에 지정해 safe-area 간격 없이 흰 면이 채워짐
  sheetOuter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius:  26,
    borderTopRightRadius: 26,
    minHeight: SCREEN_H * 0.74,
    maxHeight: SCREEN_H * 0.90,
  },

  // ── 시트 내부 (실제 패딩/콘텐츠) ──
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 10,
    flex: 1,
  },

  // 핸들
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.line,
    alignSelf: "center",
    marginBottom: 16,
  },

  // ── 헤더 ──
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  stepIconBox: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  stepLabel:   { fontFamily: F.extraBold, fontSize: 15, letterSpacing: -0.2 },
  stepCounter: { flex: 1, textAlign: "right", fontSize: 13, fontFamily: F.medium, color: C.muted, marginRight: 4 },

  // ── 프로그레스 바 ──
  progressBar: { flexDirection: "row", gap: 5, marginBottom: 20 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2 },

  // ── 스크롤 ──
  scrollContent:         { flexGrow: 1, paddingBottom: 24 },
  scrollContentKeyboard: { flexGrow: 1, paddingBottom: 220 },

  // ── 스텝 공통 ──
  stepContent: {},
  stepTitle:   { fontSize: 22, lineHeight: 29, fontFamily: F.extraBold, color: C.text, letterSpacing: -0.5, marginBottom: 4 },
  stepSub:     { fontSize: 13, lineHeight: 19, fontFamily: F.medium, color: C.muted, marginBottom: 12 },
  fieldLabel:  { fontSize: 11.5, lineHeight: 16, fontFamily: F.bold, color: C.muted, letterSpacing: 0.4, marginBottom: 10, marginTop: 18 },

  // ── 피부 점수 ──
  scoreRow: { flexDirection: "row", gap: 7 },
  scoreBtn: { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, alignItems: "center", gap: 4 },
  scoreBtnNum:   { fontSize: 19, lineHeight: 23, fontFamily: F.extraBold },
  scoreBtnLabel: { fontSize: 9.5, lineHeight: 13, fontFamily: F.bold, textAlign: "center" },

  // ── 태그 ──
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.line },
  tagChipActive:     { backgroundColor: "#E4EBD8", borderColor: "#A9B99C" },
  tagChipText:       { fontSize: 13, lineHeight: 17, fontFamily: F.bold, color: C.muted },
  tagChipTextActive: { color: "#4F603C", fontFamily: F.extraBold },

  // ── 식단 끼니 ──
  // ── 저장된 끼니 칩 ──
  savedMealWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 },
  savedMealChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.oliveSoft, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5 },
  savedMealText: { fontSize: 12.5, fontFamily: F.bold, color: C.olive },

  // ── 끼니 탭 ──
  mealTabRow:      { flexDirection: "row", gap: 7, marginBottom: 14 },
  mealTab:         { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 11, borderRadius: 12, backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.line },
  mealTabActive:   { backgroundColor: "#FDF4E7", borderColor: "#DDB888" },
  mealTabText:     { fontSize: 13, fontFamily: F.bold, color: C.muted },
  mealTabTextActive: { color: "#A06830" },

  // ── 음식 검색 ──
  foodSearchWrap:             { marginBottom: 6, zIndex: 10 },
  foodSearchInputRow:         { flexDirection: "row", alignItems: "center", backgroundColor: C.bg, borderRadius: 14, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 12 },
  foodSearchInputRowSelected: { borderColor: "#8AAC6A", backgroundColor: "#F6FBF2" },
  foodSearchInputRowOpen:     { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomColor: "transparent" },
  foodSearchInput:            { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: F.medium, color: C.text, paddingVertical: 0 },
  // absolute: 입력창과 같은 border로 이어진 것처럼 보임
  candidatesList:             { position: "absolute", top: 46, left: 0, right: 0, zIndex: 20, borderWidth: 1.5, borderTopWidth: 1, borderTopColor: C.line, borderColor: C.line, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, overflow: "hidden", backgroundColor: C.bg },
  candidateItem:              { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: 1, borderTopColor: C.line },
  candidateItemLast:          { },
  candidateIconWrap:          { width: 26, height: 26, borderRadius: 8, backgroundColor: C.oliveSoft, alignItems: "center", justifyContent: "center", marginRight: 9 },
  candidateText:              { flex: 1, fontSize: 13.5, lineHeight: 18, fontFamily: F.medium, color: C.text },
  candidateBadge:             { backgroundColor: "#EDF4E6", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginRight: 7 },
  candidateBadgeText:         { fontSize: 10.5, fontFamily: F.bold, color: C.olive },
  textInput: { backgroundColor: C.bg, borderRadius: 14, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: 15, paddingVertical: 13, fontSize: 14, lineHeight: 20, fontFamily: F.medium, color: C.text },
  inputHint: { marginTop: 5, fontSize: 11.5, lineHeight: 16, fontFamily: F.medium, color: C.muted },

  // ── 수면 ──
  sleepRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: C.bg, borderRadius: 16, borderWidth: 1.5, borderColor: C.line, paddingVertical: 10, gap: 20 },
  sleepStepBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.oliveSoft, alignItems: "center", justifyContent: "center" },
  sleepValBox:  { alignItems: "center", minWidth: 72 },
  sleepValNum:  { fontSize: 34, lineHeight: 40, fontFamily: F.extraBold, color: C.text, letterSpacing: -1 },
  sleepValUnit: { fontSize: 13, lineHeight: 17, fontFamily: F.medium, color: C.muted },

  // ── 스트레스 ──
  stressRow: { flexDirection: "row", gap: 8 },
  stressBtn: { flex: 1, paddingVertical: 15, borderRadius: 12, alignItems: "center", borderWidth: 1.5 },
  stressBtnNum: { fontSize: 18, lineHeight: 22, fontFamily: F.extraBold },
  stressHint:   { marginTop: 8, fontSize: 12.5, fontFamily: F.bold, color: C.muted, textAlign: "center" },

  // ── 운동 ──
  exerciseRow: { flexDirection: "row", gap: 10 },
  exerciseBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 15, borderRadius: 14, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.bg },
  exerciseBtnOn:  { backgroundColor: "#E4EBD8", borderColor: "#A9B99C" },
  exerciseBtnOff: {},
  exerciseBtnText: { fontSize: 14, lineHeight: 18, fontFamily: F.bold, color: C.muted },

  // ── 완료 ──
  doneWrap:       { alignItems: "center", paddingVertical: 40, gap: 14 },
  doneIconCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: "#E4EBD8", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  doneTitle:      { fontSize: 22, lineHeight: 28, fontFamily: F.extraBold, color: C.text, letterSpacing: -0.5 },
  doneSub:        { fontSize: 13, lineHeight: 19, fontFamily: F.medium, color: C.muted, textAlign: "center" },

  // ── 에러 ──
  errorText: { marginTop: 10, fontSize: 13, lineHeight: 18, fontFamily: F.bold, color: C.warning, textAlign: "center" },

  // ── 사진 스텝 카드 ──
  // ── 사진 스텝 이동 카드 ──
  navCard:          { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.bg, borderRadius: 18, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: 16, paddingVertical: 18, marginTop: 12 },
  navCardSkin:      { borderColor: "#8AAC6A", backgroundColor: "#F4FAF0" },
  navCardIcon:      { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  navCardTexts:     { flex: 1, gap: 3 },
  navCardTitle:     { fontSize: 15, lineHeight: 20, fontFamily: F.extraBold },
  navCardSub:       { fontSize: 12, lineHeight: 17, fontFamily: F.medium, color: C.muted },
  skipAllBtn:       { marginTop: 20, alignItems: "center", paddingVertical: 12 },
  skipAllBtnText:   { fontSize: 13.5, fontFamily: F.bold, color: C.muted },

  // ── 버튼 행 ──
  dietBtnCol:     { gap: 10 },
  addMoreBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 13, borderRadius: 16, borderWidth: 1.5, borderColor: "#8AAC6A", backgroundColor: "#F4FAF0" },
  addMoreBtnText: { fontSize: 14, fontFamily: F.bold, color: C.olive },
  btnRow: { flexDirection: "row", gap: 10 },
  skipBtn: { paddingHorizontal: 20, paddingVertical: 16, borderRadius: 22, borderWidth: 1.5, borderColor: C.line },
  // 사진 스텝 전용 - 전체 너비 "나중에" 버튼
  skipBtnText: { fontSize: 14, lineHeight: 18, fontFamily: F.bold, color: C.muted },
  nextBtn: { flex: 1, paddingVertical: 16, borderRadius: 22, backgroundColor: C.olive, alignItems: "center", justifyContent: "center" },
  nextBtnText: { fontSize: 15, lineHeight: 19, fontFamily: F.extraBold, color: "#fff" },
});

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AuthImage from './AuthImage';
import { useModalScreenLayout } from '../../hooks/useSubScreenLayout';
import {
  analyzeDietPhoto,
  createDietLog,
  MEAL_TYPE_TO_EN,
  MEAL_TYPES_KR,
  prepareAnalyzeImageUri,
  refreshDietLogsCache,
  searchFoodItems,
  updateDietLog,
  uploadDietPhoto,
} from '../../api/diet';
import useRecordCacheStore from '../../stores/recordCacheStore';
import { buildLoggedAtIso, formatKoDateLabel } from '../../utils/exif';
import { toDateStr } from '../screens/record/components/DateNavigator';
import {
  DietNutritionInsight,
  foodItemToNutrition,
  formatDietImpactFromNutrition,
  isGptEstimateMatch,
  matchTypeFromFoodItem,
} from '../screens/record/dietNutritionInsight';
import {
  RECORD_COLORS,
  SubScreenFooter,
  SubScreenRoot,
  SubScreenTopBar,
} from '../screens/record/components/SubScreenLayout';

// A: #C49A5A (밝고 따뜻한 황금빛 갈색)
// B: #8C7355 (채도 낮은 차분한 웜그레이 브라운)
const DIET = {
  main: '#C49A5A',
  soft: 'rgba(196,154,90,0.08)',
  border: 'rgba(196,154,90,0.22)',
};

const MEAL_ICONS = {
  아침: 'sunny-outline',
  점심: 'partly-sunny-outline',
  저녁: 'moon-outline',
  간식: 'cafe-outline',
};

export default function DietRecordModal({ visible, capture, onClose, onSaved }) {
  const { rootStyle, headerPaddingTop, footerPaddingBottom, scrollPaddingBottom } =
    useModalScreenLayout();

  const recordDateStr = capture?.recordDateStr ?? toDateStr(new Date());
  const isToday = recordDateStr === toDateStr(new Date());
  const dateLabel = isToday ? '오늘' : formatKoDateLabel(recordDateStr);

  const [selectedMealType, setSelectedMealType] = useState('');
  const [foodItemName, setFoodItemName] = useState('');
  const [dietNote, setDietNote] = useState('');
  const [manualLocationName, setManualLocationName] = useState('');
  const [saving, setSaving] = useState(false);

  const [aiRunning, setAiRunning] = useState(false);
  const [skinFactors, setSkinFactors] = useState(null);
  const [nutritionSummary, setNutritionSummary] = useState(null);
  const [matchType, setMatchType] = useState('');

  const preUploadPromiseRef = useRef(null);
  const scrollRef = useRef(null);
  const noteLayout = useRef({ y: 0, height: 0 });
  const isNoteFocused = useRef(false);

  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(event, () => {
      if (isNoteFocused.current) {
        scrollRef.current?.scrollToEnd({ animated: true });
      }
    });
    return () => sub.remove();
  }, []);
  const [selectedFoodItem, setSelectedFoodItem] = useState(null);
  const [foodCandidates, setFoodCandidates] = useState([]);
  const [aiFoodItemId, setAiFoodItemId] = useState(null);

  const userEditedFoodRef = useRef(false);
  const analyzeAbortRef = useRef(null);
  const aiSnapshotRef = useRef({ name: '', foodItemId: null });
  const aiCompletedRef = useRef(false);
  const onSaveSuccessRef = useRef(null);

  const abortAnalyze = useCallback(() => {
    analyzeAbortRef.current?.abort();
    analyzeAbortRef.current = null;
  }, []);

  useEffect(() => {
    const trimmed = (foodItemName || '').trim();
    if (!trimmed) { setFoodCandidates([]); return; }
    if (!userEditedFoodRef.current) { setFoodCandidates([]); return; }
    if (selectedFoodItem && selectedFoodItem.name === trimmed) { setFoodCandidates([]); return; }
    const timer = setTimeout(async () => {
      try {
        const results = await searchFoodItems(trimmed);
        setFoodCandidates(results || []);
      } catch (e) {
        const status = e?.response?.status;
        if (status !== 401) console.warn('[Diet] 음식 검색 실패 (status:', status ?? 'network', ')');
        setFoodCandidates([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [foodItemName, selectedFoodItem]);

  useEffect(() => {
    if (!visible || !capture?.photo_uri) return;

    setSelectedMealType('');
    setFoodItemName('');
    setDietNote('');
    setManualLocationName('');
    setSkinFactors(null);
    setNutritionSummary(null);
    setMatchType('');
    setSelectedFoodItem(null);
    setFoodCandidates([]);
    setAiFoodItemId(null);
    userEditedFoodRef.current = false;
    aiSnapshotRef.current = { name: '', foodItemId: null };
    aiCompletedRef.current = false;

    let savedDate = null;
    let savedLogId = null;
    onSaveSuccessRef.current = (dateStr, logId) => {
      savedDate = dateStr;
      savedLogId = logId;
    };

    preUploadPromiseRef.current = uploadDietPhoto(capture.photo_uri, 'etc', { createLog: false })
      .catch(() => null);

    const controller = new AbortController();
    analyzeAbortRef.current = controller;

    setAiRunning(true);
    (async () => {
      let preparedUri;
      try {
        preparedUri = await prepareAnalyzeImageUri(capture.photo_uri);
      } catch (e) {
        preparedUri = capture.photo_uri;
      }

      analyzeDietPhoto(capture.photo_uri, { signal: controller.signal, preparedUri })
        .then(({ food_name, match_type, nutrition, food_item_id, skin_factors }) => {
          const name = (food_name || '').trim();
          aiSnapshotRef.current = { name, foodItemId: food_item_id ?? null };

          if (!userEditedFoodRef.current && name) setFoodItemName(name);
          setAiFoodItemId(food_item_id ?? null);
          if (!userEditedFoodRef.current) {
            setMatchType(match_type || '');
            const hasSkinFactors = Array.isArray(skin_factors) && skin_factors.length > 0;
            if (hasSkinFactors) {
              setSkinFactors(skin_factors);
              setNutritionSummary(null);
            } else {
              setSkinFactors(null);
              const isEstimate = (match_type || '').includes('GPT') || match_type === '공공API';
              setNutritionSummary(isEstimate ? formatDietImpactFromNutrition(nutrition) : null);
            }
          }

          if (savedDate && savedLogId && name && !userEditedFoodRef.current) {
            updateDietLog(savedLogId, {
              items: [{ food_item_id: food_item_id ?? null, custom_food_name: name }],
            })
              .then(() => refreshDietLogsCache(savedDate))
              .catch(() => refreshDietLogsCache(savedDate))
              .finally(() => { if (savedLogId) useRecordCacheStore.getState().markAiDone(savedLogId); });
          } else {
            if (savedDate) refreshDietLogsCache(savedDate);
            if (savedLogId) useRecordCacheStore.getState().markAiDone(savedLogId);
          }
        })
        .catch((error) => {
          if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return;
          console.warn('[Diet] AI 분석 실패 (백그라운드):', error?.message);
          if (savedDate) refreshDietLogsCache(savedDate);
          if (savedLogId) useRecordCacheStore.getState().markAiDone(savedLogId);
        })
        .finally(() => {
          aiCompletedRef.current = true;
          setAiRunning(false);
        });
    })();

    return () => {
      if (!savedDate) controller.abort();
      analyzeAbortRef.current = null;
      onSaveSuccessRef.current = null;
    };
  }, [visible, capture?.photo_uri]);

  const hasCoords =
    capture?.captured_lat !== undefined && capture?.captured_lat !== null &&
    capture?.captured_lng !== undefined && capture?.captured_lng !== null;

  const executeSave = async (locationName, foodName, note) => {
    if (saving || !capture) return;
    const mealTypeEn = MEAL_TYPE_TO_EN[selectedMealType];
    if (!mealTypeEn) {
      Alert.alert('식사 종류 오류', '아침, 점심, 저녁, 간식 중 하나를 선택해 주세요.');
      return;
    }

    setSaving(true);
    try {
      let uploaded = preUploadPromiseRef.current ? await preUploadPromiseRef.current : null;
      preUploadPromiseRef.current = null;
      if (!uploaded?.imageUrl) {
        uploaded = await uploadDietPhoto(capture.photo_uri, mealTypeEn, { createLog: false });
      }
      const imageUrl = uploaded.imageUrl;

      const aiSnap = aiSnapshotRef.current;
      const resolvedFoodName = foodName ||
        (!userEditedFoodRef.current ? (aiSnap.name || '').trim() || null : null);
      const resolvedAiFoodItemId =
        !userEditedFoodRef.current ? (aiFoodItemId ?? aiSnap.foodItemId ?? null) : null;

      let itemsPayload = [];
      if (selectedFoodItem && selectedFoodItem.name === resolvedFoodName) {
        itemsPayload = [{ food_item_id: selectedFoodItem.id, custom_food_name: null }];
      } else if (resolvedAiFoodItemId && resolvedFoodName && !userEditedFoodRef.current) {
        itemsPayload = [{ food_item_id: resolvedAiFoodItemId, custom_food_name: resolvedFoodName }];
      } else if (resolvedAiFoodItemId && !userEditedFoodRef.current) {
        itemsPayload = [{ food_item_id: resolvedAiFoodItemId, custom_food_name: null }];
      } else if (resolvedFoodName) {
        itemsPayload = [{ food_item_id: null, custom_food_name: resolvedFoodName }];
      }

      const payload = {
        meal_type: selectedMealType,
        input_method: capture.input_method,
        logged_at: buildLoggedAtIso(recordDateStr, capture.captured_at),
        photo_url: imageUrl,
        captured_at: capture.captured_at,
        captured_lat: locationName ? null : (capture.captured_lat ?? null),
        captured_lng: locationName ? null : (capture.captured_lng ?? null),
        captured_location_name: locationName || null,
        note: note || null,
        items: itemsPayload,
      };

      const saved = await createDietLog(payload);

      const environmentQueued =
        (payload.captured_lat !== null && payload.captured_lng !== null) ||
        !!payload.captured_location_name;
      if (environmentQueued) {
        useRecordCacheStore.getState().invalidateEnvironment(recordDateStr);
      }
      onSaveSuccessRef.current?.(recordDateStr, saved?.id ?? null);

      if (aiCompletedRef.current && !userEditedFoodRef.current) {
        const snap = aiSnapshotRef.current;
        if (snap.name && saved?.id) {
          updateDietLog(saved.id, {
            items: [{ food_item_id: snap.foodItemId ?? null, custom_food_name: snap.name }],
          })
            .then(() => refreshDietLogsCache(recordDateStr))
            .catch(() => refreshDietLogsCache(recordDateStr))
            .finally(() => useRecordCacheStore.getState().markAiDone(saved.id));
        } else if (saved?.id) {
          useRecordCacheStore.getState().markAiDone(saved.id);
        }
      }

      onSaved?.(recordDateStr, { environmentQueued });
      onClose();
    } catch (error) {
      console.error('[Diet] 저장 실패', error?.response?.status, error?.response?.data || error.message);
      const detail = error.response?.data?.detail;
      let message = '식단 기록을 저장하지 못했습니다. 다시 시도해 주세요.';
      if (typeof detail === 'string') message = detail;
      else if (Array.isArray(detail) && detail[0]?.msg) message = detail[0].msg;
      else if (error.message) message = error.message;
      Alert.alert('저장 실패', message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (saving || !capture) return;
    if (!selectedMealType) {
      Alert.alert('식사 종류 선택 필요', '아침, 점심, 저녁, 간식 중 하나를 선택해 주세요.');
      return;
    }
    const trimmedLocationName = (manualLocationName || '').trim();
    const trimmedFoodItemName = (foodItemName || '').trim();
    const trimmedDietNote = (dietNote || '').trim();
    const finalLocationName = trimmedLocationName.length > 0 ? trimmedLocationName : null;
    const finalFoodItemName = trimmedFoodItemName.length > 0 ? trimmedFoodItemName : null;
    const finalDietNote = trimmedDietNote.length > 0 ? trimmedDietNote : null;

    if (!hasCoords && !finalLocationName) {
      Alert.alert(
        '위치 정보 누락',
        '사진에 위치 정보가 없고 입력된 지역명도 없습니다. 위치 정보 없이 저장하면 환경 로그(기온·습도 등)가 기록되지 않습니다. 그래도 저장하시겠습니까?',
        [
          { text: '취소', style: 'cancel' },
          { text: '저장하기', onPress: () => executeSave(null, finalFoodItemName, finalDietNote) },
        ]
      );
    } else {
      await executeSave(finalLocationName, finalFoodItemName, finalDietNote);
    }
  };

  const handleClose = () => {
    if (saving) return;
    abortAnalyze();
    onClose();
  };

  if (!capture) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={handleClose}
    >
      <View style={S.safeArea}>
        <KeyboardAvoidingView
          style={S.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* 상태바 영역만 DIET.main — 하단은 기본 배경 유지 */}
          <View style={{ height: rootStyle.paddingTop, backgroundColor: DIET.main }} />
          <SubScreenRoot onBack={handleClose} enabled={!saving}>
            <SubScreenTopBar
              title="식단 기록"
              dateLabel={dateLabel}
              headerPaddingTop={headerPaddingTop}
              onBack={handleClose}
              accentColor={DIET.main}
              trailing={
                aiRunning ? (
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
                ) : null
              }
            />

            <ScrollView
              ref={scrollRef}
              contentContainerStyle={[S.scroll, { paddingBottom: scrollPaddingBottom }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets={true}
            >
              {/* ══════════════════════════════════
                  PHOTO
              ══════════════════════════════════ */}
              <View style={S.section}>
                <View style={S.photoWrap}>
                  <AuthImage uri={capture.photo_uri} style={S.photoHero} />
                  {aiRunning ? (
                    <View style={S.aiOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={S.aiOverlayText}>AI 분석 중</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* ══════════════════════════════════
                  MEAL TYPE
              ══════════════════════════════════ */}
              <View style={S.divider} />
              <View style={S.section}>
                <View style={S.sectionLabelRow}>
                  <Text style={S.sectionLabel}>식사 종류</Text>
                  <View style={S.requiredPill}>
                    <Text style={S.requiredPillText}>필수</Text>
                  </View>
                </View>
                <View style={S.mealGrid}>
                  {MEAL_TYPES_KR.map((type) => {
                    const active = selectedMealType === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[S.mealChip, active && S.mealChipActive]}
                        onPress={() => { if (!saving) setSelectedMealType(type); }}
                        activeOpacity={0.78}
                        disabled={saving}
                      >
                        <View style={[S.mealIcon, active && S.mealIconActive]}>
                          <Ionicons
                            name={MEAL_ICONS[type] || 'restaurant-outline'}
                            size={18}
                            color={active ? DIET.main : RECORD_COLORS.muted}
                          />
                        </View>
                        <Text style={[S.mealChipText, active && S.mealChipTextActive]}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {!selectedMealType ? (
                  <Text style={S.selectionGuide}>식사 종류를 선택해 주세요</Text>
                ) : (
                  <Text style={S.selectionHint}>{selectedMealType} 선택됨</Text>
                )}
              </View>

              {/* ══════════════════════════════════
                  FOOD NAME
              ══════════════════════════════════ */}
              <View style={S.divider} />
              <View style={S.section}>
                <Text style={S.sectionLabel}>
                  음식명{aiRunning ? '  —  AI 분석 중…' : ''}
                </Text>
                <TextInput
                  style={S.textInput}
                  placeholder="예: 김치찌개, 닭가슴살 샐러드"
                  placeholderTextColor={RECORD_COLORS.muted}
                  value={foodItemName}
                  onChangeText={(text) => {
                    userEditedFoodRef.current = true;
                    setAiFoodItemId(null);
                    setSkinFactors(null);
                    setNutritionSummary(null);
                    setMatchType('');
                    setFoodItemName(text);
                    if (!selectedFoodItem || selectedFoodItem.name !== text.trim()) {
                      setSelectedFoodItem(null);
                    }
                  }}
                  maxLength={255}
                  editable={!saving}
                />
                <DietNutritionInsight
                  skinFactors={skinFactors}
                  summary={nutritionSummary}
                  matchType={matchType}
                />
                {foodCandidates.length > 0 ? (
                  <View style={S.candidatesWrap}>
                    <View style={S.candidatesHeader}>
                      <Ionicons name="search-outline" size={11} color={RECORD_COLORS.muted} />
                      <Text style={S.candidatesHeaderText}>식품 DB 검색 결과</Text>
                    </View>
                    <View style={S.candidatesList}>
                      {foodCandidates.slice(0, 5).map((candidate, idx) => (
                        <TouchableOpacity
                          key={candidate.id}
                          style={[
                            S.candidateItem,
                            idx === Math.min(foodCandidates.length, 5) - 1 && S.candidateItemLast,
                          ]}
                          onPress={() => {
                            userEditedFoodRef.current = true;
                            setSelectedFoodItem(candidate);
                            setFoodItemName(candidate.name);
                            setFoodCandidates([]);
                            const mt = matchTypeFromFoodItem(candidate);
                            setMatchType(mt);
                            const hasSf = Array.isArray(candidate.skin_factors) && candidate.skin_factors.length > 0;
                            setSkinFactors(hasSf ? candidate.skin_factors : null);
                            const isEst = isGptEstimateMatch(mt) || mt === '공공API';
                            setNutritionSummary(!hasSf && isEst
                              ? formatDietImpactFromNutrition(foodItemToNutrition(candidate))
                              : null);
                          }}
                          activeOpacity={0.65}
                        >
                          <View style={S.candidateIconWrap}>
                            <Ionicons name="restaurant-outline" size={14} color={RECORD_COLORS.muted} />
                          </View>
                          <Text style={S.candidateText} numberOfLines={1} ellipsizeMode="tail">
                            {candidate.name}
                          </Text>
                          {candidate.category ? (
                            <View style={S.candidateBadge}>
                              <Text style={S.candidateBadgeText} numberOfLines={1}>{candidate.category}</Text>
                            </View>
                          ) : null}
                          <Ionicons name="chevron-forward" size={13} color={RECORD_COLORS.muted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                    {foodCandidates.length > 5 ? (
                      <Text style={S.candidatesOverflow}>
                        외 {foodCandidates.length - 5}개 · 더 구체적인 이름으로 검색해 보세요
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {/* ══════════════════════════════════
                  LOCATION (좌표 없을 때)
              ══════════════════════════════════ */}
              {!hasCoords ? (
                <>
                  <View style={S.divider} />
                  <View style={S.section}>
                    <Text style={S.sectionLabel}>위치</Text>
                    <View style={S.locationWarning}>
                      <Ionicons name="location-outline" size={14} color={RECORD_COLORS.hint} />
                      <Text style={S.locationWarningText}>
                        위치 정보를 가져오지 못했습니다. 지역명을 입력하면 환경 로그에 반영됩니다.
                      </Text>
                    </View>
                    <TextInput
                      style={S.textInput}
                      placeholder="예: 서울특별시 강남구"
                      placeholderTextColor={RECORD_COLORS.muted}
                      value={manualLocationName}
                      onChangeText={setManualLocationName}
                      maxLength={100}
                      editable={!saving}
                    />
                  </View>
                </>
              ) : null}

              {/* ══════════════════════════════════
                  NOTE
              ══════════════════════════════════ */}
              <View style={S.divider} />
              <View
                style={S.section}
                onLayout={(e) => {
                  noteLayout.current = {
                    y: e.nativeEvent.layout.y,
                    height: e.nativeEvent.layout.height,
                  };
                }}
              >
                <Text style={S.sectionLabel}>메모</Text>
                <TextInput
                  style={S.noteInput}
                  placeholder="예: 외식, 매운 음식 섭취"
                  placeholderTextColor={RECORD_COLORS.muted}
                  multiline
                  numberOfLines={4}
                  value={dietNote}
                  onChangeText={setDietNote}
                  maxLength={1000}
                  editable={!saving}
                  textAlignVertical="top"
                  onFocus={() => { isNoteFocused.current = true; }}
                  onBlur={() => { isNoteFocused.current = false; }}
                />
                <Text style={S.charCount}>{dietNote.length} / 1000</Text>
              </View>
            </ScrollView>

            <SubScreenFooter
              label="기록하기"
              onPress={handleSave}
              disabled={!selectedMealType}
              saving={saving}
              icon="checkmark-circle-outline"
              footerPaddingBottom={footerPaddingBottom}
              color={DIET.main}
            />
          </SubScreenRoot>
          <View style={{ height: rootStyle.paddingBottom }} />
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: RECORD_COLORS.bg },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  // ── 공통 섹션 ──
  section: { paddingVertical: 4 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: RECORD_COLORS.line,
    marginVertical: 22,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
    letterSpacing: 0.3,
    marginBottom: 14,
  },
  requiredPill: {
    backgroundColor: 'rgba(196,92,74,0.09)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(196,92,74,0.20)',
    marginBottom: 14,
  },
  requiredPillText: { fontSize: 11, fontWeight: '800', color: '#C45C4A' },

  // ── 사진 ──
  photoWrap: {
    height: 260,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: RECORD_COLORS.chip,
    position: 'relative',
  },
  photoHero: { width: '100%', height: '100%' },
  aiOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  aiOverlayText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // ── 식사 종류 ──
  mealGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mealChip: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
  },
  mealChipActive: {
    backgroundColor: 'rgba(160,104,48,0.10)',
    borderColor: DIET.main,
  },
  mealIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: RECORD_COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealIconActive: { backgroundColor: 'rgba(255,255,255,0.7)' },
  mealChipText: { fontSize: 15, fontWeight: '800', color: RECORD_COLORS.muted },
  mealChipTextActive: { color: DIET.main },
  selectionGuide: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  selectionHint: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '700',
    color: DIET.main,
  },

  // ── 입력 ──
  textInput: {
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: RECORD_COLORS.text,
  },
  noteInput: {
    minHeight: 100,
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: RECORD_COLORS.text,
  },
  charCount: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
    textAlign: 'right',
  },

  // ── 위치 경고 ──
  locationWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
    padding: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(196,92,74,0.08)',
  },
  locationWarningText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.hint,
    lineHeight: 18,
  },

  // ── 음식 검색 결과 ──
  candidatesWrap: { marginTop: 12 },
  candidatesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  candidatesHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: RECORD_COLORS.muted,
  },
  candidatesList: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.white,
    overflow: 'hidden',
  },
  candidateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: RECORD_COLORS.line,
  },
  candidateItemLast: { borderBottomWidth: 0 },
  candidateIconWrap: { width: 20, alignItems: 'center' },
  candidateText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: RECORD_COLORS.text,
  },
  candidateBadge: {
    backgroundColor: DIET.soft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
    maxWidth: 90,
  },
  candidateBadgeText: { fontSize: 11, fontWeight: '600', color: DIET.main },
  candidatesOverflow: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
  },
});

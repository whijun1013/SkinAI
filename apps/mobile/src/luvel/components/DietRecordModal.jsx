import { devLog } from '../../utils/devLogger';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  SectionCard,
  SubScreenFooter,
  SubScreenRoot,
  SubScreenTopBar,
  styles as layoutStyles,
} from '../screens/record/components/SubScreenLayout';

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

  const [selectedFoodItem, setSelectedFoodItem] = useState(null);
  const [foodCandidates, setFoodCandidates] = useState([]);
  const [aiFoodItemId, setAiFoodItemId] = useState(null);

  const userEditedFoodRef = useRef(false);
  const analyzeAbortRef = useRef(null);
  const aiSnapshotRef = useRef({ name: '', foodItemId: null });
  // AI 분석 완료 여부 (성공/실패 무관) — executeSave 레이스 방어용
  const aiCompletedRef = useRef(false);
  // 저장 성공 시 현재 AI effect 클로저에 알리기 위한 콜백 ref
  const onSaveSuccessRef = useRef(null);

  const abortAnalyze = useCallback(() => {
    analyzeAbortRef.current?.abort();
    analyzeAbortRef.current = null;
  }, []);

  useEffect(() => {
    const trimmed = (foodItemName || '').trim();
    if (!trimmed) {
      setFoodCandidates([]);
      return;
    }
    if (!userEditedFoodRef.current) {
      setFoodCandidates([]);
      return;
    }
    if (selectedFoodItem && selectedFoodItem.name === trimmed) {
      setFoodCandidates([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await searchFoodItems(trimmed);
        setFoodCandidates(results || []);
      } catch (e) {
        const status = e?.response?.status;
        if (status === 401) {
          console.warn('[Diet] 음식 검색: 인증 만료, 재로그인 필요');
        } else {
          console.warn('[Diet] 음식 검색 실패 (status:', status ?? 'network', ')');
        }
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

    // 이번 effect 세션의 저장 정보 (클로저로 AI 완료 시 사용)
    let savedDate = null;
    let savedLogId = null;
    // executeSave가 성공했을 때 이 effect 클로저에 저장 정보를 전달
    onSaveSuccessRef.current = (dateStr, logId) => {
      savedDate = dateStr;
      savedLogId = logId;
    };

    // Blob 업로드를 AI와 동시에 시작 — 저장 시 결과를 재사용해 대기 시간 없앰
    preUploadPromiseRef.current = uploadDietPhoto(capture.photo_uri, 'etc', { createLog: false })
      .catch(() => null);

    const controller = new AbortController();
    analyzeAbortRef.current = controller;

    devLog('[Diet] 모달 열림 → AI 분석 + Blob 업로드 동시 시작');

    setAiRunning(true);
    (async () => {
      let preparedUri;
      try {
        preparedUri = await prepareAnalyzeImageUri(capture.photo_uri);
      } catch (e) {
        console.warn('[Diet] analyze 이미지 준비 실패, 원본 사용:', e?.message);
        preparedUri = capture.photo_uri;
      }

      analyzeDietPhoto(capture.photo_uri, {
        signal: controller.signal,
        preparedUri,
      })
        .then(({ food_name, match_type, nutrition, food_item_id, skin_factors }) => {
          const name = (food_name || '').trim();
          aiSnapshotRef.current = { name, foodItemId: food_item_id ?? null };

          // 모달 UI 업데이트 (아직 열려있으면)
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

          // ★ A안 핵심: 저장 후 AI 완료 → 이름 패치 후 캐시 갱신 (폴링 없음)
          // 사용자가 직접 입력한 경우엔 AI 이름으로 덮어쓰지 않음
          if (savedDate && savedLogId && name && !userEditedFoodRef.current) {
            devLog('[Diet] 저장 후 AI 완료 → 이름 패치 후 캐시 갱신', {
              logId: savedLogId,
              name,
              dateStr: savedDate,
            });
            updateDietLog(savedLogId, {
              items: [{ food_item_id: food_item_id ?? null, custom_food_name: name }],
            })
              .then(() => refreshDietLogsCache(savedDate))
              .catch(() => refreshDietLogsCache(savedDate))
              .finally(() => {
                if (savedLogId) useRecordCacheStore.getState().markAiDone(savedLogId);
              });
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
          // onSaveSuccessRef는 effect cleanup에서만 정리 — 연속 촬영 시 다음 세션 콜백을 null 하지 않음
        });
    })();

    return () => {
      // 저장 전 모달 닫기 → AI 취소. 저장 후 닫기 → AI는 계속 실행해 캐시 패치
      if (!savedDate) {
        controller.abort();
      }
      analyzeAbortRef.current = null;
      onSaveSuccessRef.current = null;
    };
  }, [visible, capture?.photo_uri]);

  const hasCoords =
    capture?.captured_lat !== undefined &&
    capture?.captured_lat !== null &&
    capture?.captured_lng !== undefined &&
    capture?.captured_lng !== null;

  const executeSave = async (locationName, foodName, note) => {
    if (saving || !capture) return;

    const mealTypeEn = MEAL_TYPE_TO_EN[selectedMealType];
    if (!mealTypeEn) {
      Alert.alert('식사 종류 오류', '아침, 점심, 저녁, 간식 중 하나를 선택해 주세요.');
      return;
    }

    // AI는 중단하지 않음 — 저장 후에도 완료되면 캐시 직접 패치 (A안)
    setSaving(true);

    try {
      // 모달 열릴 때 미리 시작한 업로드 결과를 재사용, 없으면 지금 업로드
      let uploaded = preUploadPromiseRef.current
        ? await preUploadPromiseRef.current
        : null;
      preUploadPromiseRef.current = null;
      if (!uploaded?.imageUrl) {
        uploaded = await uploadDietPhoto(capture.photo_uri, mealTypeEn, { createLog: false });
      }
      const imageUrl = uploaded.imageUrl;

      const aiSnap = aiSnapshotRef.current;
      const resolvedFoodName =
        foodName ||
        (!userEditedFoodRef.current ? (aiSnap.name || '').trim() || null : null);
      const resolvedAiFoodItemId =
        !userEditedFoodRef.current ? (aiFoodItemId ?? aiSnap.foodItemId ?? null) : null;

      let itemsPayload = [];
      if (selectedFoodItem && selectedFoodItem.name === resolvedFoodName) {
        itemsPayload = [{ food_item_id: selectedFoodItem.id, custom_food_name: null }];
      } else if (resolvedAiFoodItemId && resolvedFoodName && !userEditedFoodRef.current) {
        itemsPayload = [
          { food_item_id: resolvedAiFoodItemId, custom_food_name: resolvedFoodName },
        ];
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
      devLog('[Diet] 저장 성공', { id: saved?.id });

      // AI effect 클로저에 저장 정보 전달 — AI 완료 시 이 기록을 패치
      onSaveSuccessRef.current?.(recordDateStr, saved?.id ?? null);

      // 레이스 방어: AI가 createDietLog 대기 중에 이미 완료됐으면 즉시 패치
      if (aiCompletedRef.current && !userEditedFoodRef.current) {
        const snap = aiSnapshotRef.current;
        if (snap.name && saved?.id) {
          devLog('[Diet] AI 먼저 완료됨 → executeSave에서 즉시 패치', { logId: saved.id, name: snap.name });
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

      Alert.alert('기록 완료', '식단 기록이 저장되었습니다.');
      onSaved?.(recordDateStr);
      onClose();
    } catch (error) {
      console.error(
        '[Diet] 저장 실패',
        error?.response?.status,
        error?.response?.data || error.message
      );
      const detail = error.response?.data?.detail;
      let message = '식단 기록을 저장하지 못했습니다. 다시 시도해 주세요.';
      if (typeof detail === 'string') {
        message = detail;
      } else if (Array.isArray(detail) && detail[0]?.msg) {
        message = detail[0].msg;
      } else if (error.message) {
        message = error.message;
      }
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

    const hasLocation = finalLocationName !== null;

    if (!hasCoords && !hasLocation) {
      Alert.alert(
        '위치 정보 누락',
        '사진에 위치 정보(좌표)가 없고 입력된 지역명도 없습니다. 위치 정보를 입력하지 않고 저장하시면 기온, 습도, 미세먼지 등 주변 환경 로그가 기록되지 않습니다. 그래도 식단만 저장하시겠습니까?',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '저장하기',
            onPress: () => executeSave(null, finalFoodItemName, finalDietNote),
          },
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
      <View style={[styles.safeArea, rootStyle]}>
        <SubScreenRoot onBack={handleClose} enabled={!saving}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <SubScreenTopBar
              title="식단 기록"
              dateLabel={dateLabel}
              headerPaddingTop={headerPaddingTop}
              onBack={handleClose}
              trailing={
                aiRunning ? (
                  <ActivityIndicator size="small" color={RECORD_COLORS.olive} />
                ) : null
              }
            />

            <ScrollView
              contentContainerStyle={[
                layoutStyles.scrollContent,
                { paddingBottom: scrollPaddingBottom },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <SectionCard title="식단 사진" subtitle="촬영한 사진을 확인해 주세요">
                <View style={styles.photoWrap}>
                  <AuthImage uri={capture.photo_uri} style={styles.photoHero} />
                </View>
              </SectionCard>

              <SectionCard title="식사 종류" subtitle="아침 · 점심 · 저녁 · 간식 중 선택 · 필수">
                <View style={styles.mealGrid}>
                  {MEAL_TYPES_KR.map((type) => {
                    const active = selectedMealType === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[styles.mealChip, active && styles.mealChipActive]}
                        onPress={() => {
                          if (saving) return;
                          setSelectedMealType(type);
                        }}
                        activeOpacity={0.78}
                        disabled={saving}
                      >
                        <View style={[styles.mealIcon, active && styles.mealIconActive]}>
                          <Ionicons
                            name={MEAL_ICONS[type] || 'restaurant-outline'}
                            size={18}
                            color={active ? RECORD_COLORS.olive : RECORD_COLORS.muted}
                          />
                        </View>
                        <Text style={[styles.mealChipText, active && styles.mealChipTextActive]}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {selectedMealType ? (
                  <Text style={styles.selectionHint}>{selectedMealType} 선택됨</Text>
                ) : (
                  <Text style={styles.selectionGuide}>식사 종류를 선택해 주세요</Text>
                )}
              </SectionCard>

              <SectionCard
                title="음식명"
                subtitle={
                  aiRunning
                    ? 'AI가 분석 중이에요 · 먼저 입력해도 됩니다'
                    : '직접 입력하거나 검색 결과를 선택 (선택)'
                }
              >
                <TextInput
                  style={layoutStyles.input}
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
                  <View style={styles.candidatesContainer}>
                    <View style={styles.candidatesHeader}>
                      <Ionicons name="search-outline" size={12} color={RECORD_COLORS.oliveMuted} />
                      <Text style={styles.candidatesHeaderText}>식품 DB 검색 결과</Text>
                    </View>
                    <View style={styles.candidatesList}>
                      {foodCandidates.slice(0, 5).map((candidate, idx) => (
                        <TouchableOpacity
                          key={candidate.id}
                          style={[
                            styles.candidateItem,
                            idx === Math.min(foodCandidates.length, 5) - 1 && styles.candidateItemLast,
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
                            setNutritionSummary(
                              !hasSf && isEst
                                ? formatDietImpactFromNutrition(foodItemToNutrition(candidate))
                                : null
                            );
                          }}
                          activeOpacity={0.65}
                        >
                          <View style={styles.candidateIconWrap}>
                            <Ionicons name="restaurant-outline" size={15} color={RECORD_COLORS.oliveMuted} />
                          </View>
                          <View style={styles.candidateNameWrap}>
                            <Text style={styles.candidateText} numberOfLines={1} ellipsizeMode="tail">
                              {candidate.name}
                            </Text>
                          </View>
                          {candidate.category ? (
                            <View style={styles.candidateBadge}>
                              <Text style={styles.candidateBadgeText} numberOfLines={1}>
                                {candidate.category}
                              </Text>
                            </View>
                          ) : null}
                          <Ionicons name="chevron-forward" size={14} color={RECORD_COLORS.muted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                    {foodCandidates.length > 5 ? (
                      <Text style={styles.candidatesOverflow}>
                        외 {foodCandidates.length - 5}개 · 더 구체적인 이름으로 검색해 보세요
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </SectionCard>

              {!hasCoords ? (
                <SectionCard title="위치 정보" subtitle="환경 로그(기온·습도 등) 기록에 사용됩니다">
                  <View style={styles.locationWarning}>
                    <Ionicons name="location-outline" size={16} color={RECORD_COLORS.hint} />
                    <Text style={styles.locationWarningText}>
                      위치 정보를 가져오지 못했습니다. 지역명을 입력하면 환경 로그에 반영됩니다.
                    </Text>
                  </View>
                  <TextInput
                    style={layoutStyles.input}
                    placeholder="예: 서울특별시 강남구"
                    placeholderTextColor={RECORD_COLORS.muted}
                    value={manualLocationName}
                    onChangeText={setManualLocationName}
                    maxLength={100}
                    editable={!saving}
                  />
                </SectionCard>
              ) : null}

              <SectionCard title="메모" subtitle="식단과 관련된 간단한 메모 (선택)">
                <TextInput
                  style={styles.noteInput}
                  placeholder="예: 외식, 매운 음식 섭취"
                  placeholderTextColor={RECORD_COLORS.muted}
                  multiline
                  numberOfLines={4}
                  value={dietNote}
                  onChangeText={setDietNote}
                  maxLength={1000}
                  editable={!saving}
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>{dietNote.length}/1000</Text>
              </SectionCard>
            </ScrollView>

            <SubScreenFooter
              label="기록하기"
              onPress={handleSave}
              disabled={!selectedMealType}
              saving={saving}
              icon="checkmark-circle-outline"
              footerPaddingBottom={footerPaddingBottom}
            />
          </KeyboardAvoidingView>
        </SubScreenRoot>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: RECORD_COLORS.bg,
  },
  flex: { flex: 1 },

  photoWrap: {
    height: 240,
    borderRadius: 18,
    overflow: 'hidden',
  },
  photoHero: {
    width: '100%',
    height: '100%',
    backgroundColor: RECORD_COLORS.chip,
  },

  mealGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  mealChip: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
  },
  mealChipActive: {
    backgroundColor: RECORD_COLORS.oliveSoft,
    borderColor: RECORD_COLORS.olive,
  },
  mealIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: RECORD_COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealIconActive: {
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  mealChipText: {
    fontSize: 14,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
  },
  mealChipTextActive: {
    color: RECORD_COLORS.olive,
  },
  selectionHint: {
    marginTop: 12,
    fontSize: 12.5,
    fontWeight: '700',
    color: RECORD_COLORS.olive,
  },
  selectionGuide: {
    marginTop: 12,
    fontSize: 12.5,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },

  analyzeInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: RECORD_COLORS.chip,
  },
  analyzeInlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },

  foodNameSectionAttention: {
    borderColor: RECORD_COLORS.hint,
    borderWidth: 1.5,
    backgroundColor: 'rgba(196, 92, 74, 0.04)',
  },
  foodNameAttentionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(196, 92, 74, 0.1)',
  },
  foodNameAttentionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: RECORD_COLORS.hint,
    lineHeight: 19,
  },
  foodNameInputAttention: {
    borderColor: RECORD_COLORS.hint,
    borderWidth: 1.5,
    backgroundColor: '#FFF9F7',
  },

  candidatesContainer: {
    marginTop: 12,
  },
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
    color: RECORD_COLORS.oliveMuted,
    letterSpacing: 0.2,
  },
  candidatesList: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(79, 96, 60, 0.22)',
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
  candidateItemLast: {
    borderBottomWidth: 0,
  },
  candidateIconWrap: {
    width: 22,
    alignItems: 'center',
  },
  candidateNameWrap: {
    flex: 1,
    minWidth: 0,
  },
  candidateText: {
    fontSize: 14,
    fontWeight: '700',
    color: RECORD_COLORS.text,
  },
  candidateBadge: {
    backgroundColor: RECORD_COLORS.oliveSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
    maxWidth: 90,
  },
  candidateBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: RECORD_COLORS.oliveMuted,
  },
  candidatesOverflow: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
  },

  locationWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(196, 92, 74, 0.08)',
  },
  locationWarningText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: RECORD_COLORS.hint,
    lineHeight: 18,
  },

  noteInput: {
    minHeight: 96,
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: RECORD_COLORS.text,
  },
  charCount: {
    marginTop: 8,
    fontSize: 11.5,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
    textAlign: 'right',
  },
});

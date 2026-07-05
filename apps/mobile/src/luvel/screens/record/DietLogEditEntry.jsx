import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AuthImage from '../../components/AuthImage';
import {
  deleteDietLog,
  getDietLog,
  MEAL_TYPE_TO_EN,
  MEAL_TYPES_KR,
  searchFoodItems,
  updateDietLog,
  uploadDietPhoto,
} from '../../../api/diet';
import { showDietGalleryPicker, showDietPhotoPicker } from '../../../hooks/useDietCamera';
import useRecordCacheStore from '../../../stores/recordCacheStore';
import { MEAL_ICONS } from './dietDisplay';
import {
  DietNutritionInsight,
  foodItemToNutrition,
  formatDietImpactFromNutrition,
  isGptEstimateMatch,
  matchTypeFromFoodItem,
} from './dietNutritionInsight';
import { toDateStr } from './components/DateNavigator';
import {
  RECORD_COLORS,
  SectionCard,
  StatusBanner,
  SubScreenFooter,
  SubScreenRoot,
  SubScreenTopBar,
  useRecordScreenInsets,
  styles as layoutStyles,
} from './components/SubScreenLayout';

function getInitialFood(log) {
  const item = log?.items?.[0];
  if (!item) return { name: '', foodItem: null };
  // 백엔드 _extract_food_names와 동일한 우선순위: custom_food_name > food_item.name
  if (item.custom_food_name) {
    return { name: item.custom_food_name, foodItem: item.food_item ?? null };
  }
  if (item.food_item) {
    return { name: item.food_item.name, foodItem: item.food_item };
  }
  return { name: '', foodItem: null };
}

export default function DietLogEditEntry({ logId, selectedDate, onBack, onDataChanged }) {
  const { scrollPaddingBottom } = useRecordScreenInsets();
  const date = selectedDate ?? new Date();
  const dateStr = toDateStr(date);
  const isToday = dateStr === toDateStr(new Date());

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [foodSearchError, setFoodSearchError] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState('');
  const [foodItemName, setFoodItemName] = useState('');
  const [dietNote, setDietNote] = useState('');
  const [manualLocationName, setManualLocationName] = useState('');
  const [photoUrl, setPhotoUrl] = useState(null);
  const [localPhotoUri, setLocalPhotoUri] = useState(null);
  const [capturedLat, setCapturedLat] = useState(null);
  const [capturedLng, setCapturedLng] = useState(null);
  const [selectedFoodItem, setSelectedFoodItem] = useState(null);
  const [foodCandidates, setFoodCandidates] = useState([]);

  const displayPhotoUri = localPhotoUri || photoUrl;
  const skinFactors = Array.isArray(selectedFoodItem?.skin_factors) && selectedFoodItem.skin_factors.length > 0
    ? selectedFoodItem.skin_factors
    : null;
  const nutritionMatchType = matchTypeFromFoodItem(selectedFoodItem);
  const isNutritionEstimate = isGptEstimateMatch(nutritionMatchType) || nutritionMatchType === '공공API';
  const nutritionSummary = !skinFactors && isNutritionEstimate
    ? formatDietImpactFromNutrition(foodItemToNutrition(selectedFoodItem))
    : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getDietLog(logId)
      .then((log) => {
        if (cancelled) return;
        const { name, foodItem } = getInitialFood(log);
        setSelectedMealType(log.meal_type || '');
        setFoodItemName(name);
        setSelectedFoodItem(foodItem);
        setDietNote(log.note || '');
        setManualLocationName(log.captured_location_name || '');
        setPhotoUrl(log.photo_url || null);
        setLocalPhotoUri(null);
        setCapturedLat(log.captured_lat ?? null);
        setCapturedLng(log.captured_lng ?? null);
        setLoadError(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[Diet] load failed', error);
        setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [logId, onBack]);

  useEffect(() => {
    const trimmed = (foodItemName || '').trim();
    if (!trimmed) {
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
        setFoodSearchError(false);
      } catch (e) {
        console.error('Food search error:', e);
        setFoodCandidates([]);
        setFoodSearchError(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [foodItemName, selectedFoodItem]);

  const applyPhotoCapture = (capture) => {
    setLocalPhotoUri(capture.photo_uri);
    if (capture.captured_lat != null && capture.captured_lng != null) {
      setCapturedLat(capture.captured_lat);
      setCapturedLng(capture.captured_lng);
    }
  };

  const handleChangePhoto = () => {
    if (isToday) {
      showDietPhotoPicker(applyPhotoCapture, { dateStr });
    } else {
      showDietGalleryPicker(applyPhotoCapture, { dateStr });
    }
  };

  const handleSave = async () => {
    if (saving || loading) return;

    if (!selectedMealType) {
      Alert.alert('식사 종류 선택 필요', '아침, 점심, 저녁, 간식 중 하나를 선택해 주세요.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const mealTypeEn = MEAL_TYPE_TO_EN[selectedMealType];
      const trimmedFood = (foodItemName || '').trim();
      const trimmedNote = (dietNote || '').trim();
      const trimmedLocation = (manualLocationName || '').trim();

      let resolvedPhotoUrl = photoUrl;
      if (localPhotoUri) {
        const uploaded = await uploadDietPhoto(localPhotoUri, mealTypeEn, { createLog: false });
        resolvedPhotoUrl = uploaded.imageUrl;
      }

      let itemsPayload = [];
      if (selectedFoodItem && selectedFoodItem.name === trimmedFood) {
        itemsPayload = [{ food_item_id: selectedFoodItem.id, custom_food_name: null }];
      } else if (trimmedFood) {
        itemsPayload = [{ food_item_id: null, custom_food_name: trimmedFood }];
      }

      const payload = {
        meal_type: selectedMealType,
        note: trimmedNote || null,
        captured_location_name: trimmedLocation || null,
        items: itemsPayload,
      };

      if (resolvedPhotoUrl !== photoUrl) {
        payload.photo_url = resolvedPhotoUrl;
      }

      const hasCoords = capturedLat != null && capturedLng != null;
      if (hasCoords && !trimmedLocation) {
        payload.captured_lat = capturedLat;
        payload.captured_lng = capturedLng;
      }

      await updateDietLog(logId, payload);
      useRecordCacheStore.getState().invalidateDiet(dateStr);
      onDataChanged?.();
      setSavedSuccess(true);
      setTimeout(() => onBack(), 800);
    } catch (error) {
      console.error('[Diet] update failed', error);
      const detail = error.response?.data?.detail;
      setSaveError(typeof detail === 'string' ? detail : '식단 기록 수정에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('기록 삭제', '이 식단 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          if (saving) return;
          setSaving(true);
          try {
            await deleteDietLog(logId);
            useRecordCacheStore.getState().invalidateDiet(dateStr);
            onDataChanged?.();
            onBack();
          } catch (error) {
            console.error('[Diet] delete failed', error);
            Alert.alert('삭제 실패', '식단 기록을 삭제하지 못했습니다.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const hasCoords = capturedLat != null && capturedLng != null;
  const trimmedFood = (foodItemName || '').trim();
  const trimmedNote = (dietNote || '').trim();
  const trimmedLocation = (manualLocationName || '').trim();
  const isLogEmpty =
    !loading &&
    !loadError &&
    !displayPhotoUri &&
    !selectedMealType &&
    !trimmedFood &&
    !trimmedNote &&
    !trimmedLocation;
  const needsMealType =
    !loading && !loadError && !selectedMealType && !isLogEmpty;

  return (
    <SubScreenRoot onBack={onBack} enabled={!saving}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SubScreenTopBar
          title="식단 수정"
          dateLabel={isToday ? '오늘' : dateStr}
          onBack={onBack}
          trailing={
            loading ? (
              <ActivityIndicator size="small" color={RECORD_COLORS.olive} />
            ) : (
              <TouchableOpacity onPress={handleDelete} disabled={saving} hitSlop={8}>
                <Ionicons name="trash-outline" size={22} color={RECORD_COLORS.hint} />
              </TouchableOpacity>
            )
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
          {savedSuccess ? (
            <StatusBanner icon="checkmark-circle" text="저장되었습니다." />
          ) : saveError ? (
            <StatusBanner
              icon="alert-circle-outline"
              text={saveError}
              variant="error"
              onPress={() => setSaveError(null)}
            />
          ) : loadError ? (
            <StatusBanner
              icon="alert-circle-outline"
              text="식단 기록을 불러오지 못했습니다. 다시 시도하거나 뒤로 돌아가세요."
              variant="error"
            />
          ) : isLogEmpty ? (
            <StatusBanner
              icon="restaurant-outline"
              text={
                isToday
                  ? '아직 저장된 정보가 없어요 · 사진 추가나 아래 항목을 채워 보세요'
                  : '이 식단 기록에 저장된 정보가 없어요'
              }
              variant="empty"
            />
          ) : needsMealType ? (
            <StatusBanner
              icon="alert-circle-outline"
              text="식사 종류를 선택하면 저장할 수 있어요"
              variant="empty"
            />
          ) : (
            <StatusBanner
              icon="checkmark-circle"
              text={
                isToday
                  ? '기록을 수정할 수 있어요 · 변경 후 저장하세요'
                  : '이 날 식단 기록을 수정할 수 있어요'
              }
            />
          )}

          {isLogEmpty ? (
            <SectionCard
              title="아직 식단 정보가 없어요"
              subtitle={
                isToday
                  ? '사진을 추가하면 AI가 음식을 분석해요'
                  : '갤러리에서 사진을 선택하거나 직접 입력할 수 있어요'
              }
            >
              <View style={styles.emptyBox}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="restaurant-outline" size={30} color={RECORD_COLORS.olive} />
                </View>
                <Text style={styles.emptyTitle}>
                  {isToday ? '식단 기록을 시작해 보세요' : '이 기록은 비어 있어요'}
                </Text>
                <Text style={styles.emptyDesc}>
                  {isToday
                    ? '아래에서 사진을 추가하거나 식사 종류·음식명·메모를 입력해 저장할 수 있어요.'
                    : '아래에서 사진을 선택하거나 식사 종류·음식명·메모를 입력해 기록을 완성해 보세요.'}
                </Text>
              </View>
            </SectionCard>
          ) : null}

          <SectionCard
            title="식단 사진"
            subtitle={
              isToday
                ? '카메라 촬영 또는 갤러리에서 변경'
                : `${dateStr}에 찍은 갤러리 사진만 선택할 수 있어요`
            }
          >
            <View style={styles.photoWrap}>
              {displayPhotoUri ? (
                <>
                  <AuthImage uri={displayPhotoUri} style={styles.photoHero} />
                  <TouchableOpacity
                    style={styles.photoOverlayBtn}
                    onPress={handleChangePhoto}
                    activeOpacity={0.85}
                    disabled={saving || loading}
                  >
                    <Ionicons
                      name={isToday ? 'camera' : 'images-outline'}
                      size={16}
                      color={RECORD_COLORS.white}
                    />
                    <Text style={styles.photoOverlayBtnText}>
                      {isToday ? '사진 변경' : '다시 선택'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.photoEmpty}
                  onPress={handleChangePhoto}
                  activeOpacity={0.82}
                  disabled={saving || loading}
                >
                  <View style={styles.photoEmptyIcon}>
                    <Ionicons
                      name={isToday ? 'camera-outline' : 'images-outline'}
                      size={28}
                      color={RECORD_COLORS.olive}
                    />
                  </View>
                  <Text style={styles.photoEmptyTitle}>
                    {isToday ? '사진 추가하기' : '갤러리에서 선택'}
                  </Text>
                  <Text style={styles.photoEmptyDesc}>
                    {isToday
                      ? '카메라 촬영 또는 갤러리에서 선택'
                      : '과거 날짜는 해당 날에 찍은 사진만 사용할 수 있어요'}
                  </Text>
                </TouchableOpacity>
              )}
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
                    onPress={() => !saving && setSelectedMealType(type)}
                    activeOpacity={0.78}
                    disabled={saving || loading}
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
          </SectionCard>

          <SectionCard title="음식명" subtitle="직접 입력하거나 검색 결과를 선택 (선택)">
            <TextInput
              style={layoutStyles.input}
              placeholder="예: 김치찌개, 닭가슴살 샐러드"
              placeholderTextColor={RECORD_COLORS.muted}
              value={foodItemName}
              onChangeText={(text) => {
                setFoodItemName(text);
                setFoodSearchError(false);
                if (!selectedFoodItem || selectedFoodItem.name !== text.trim()) {
                  setSelectedFoodItem(null);
                }
              }}
              maxLength={255}
              editable={!saving && !loading}
            />
            <DietNutritionInsight
              skinFactors={skinFactors}
              summary={nutritionSummary}
              matchType={nutritionMatchType}
            />
            {foodSearchError ? (
              <Text style={styles.searchErrorText}>
                검색 중 오류가 발생했습니다. 직접 입력해 주세요.
              </Text>
            ) : null}
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
                        setSelectedFoodItem(candidate);
                        setFoodItemName(candidate.name);
                        setFoodCandidates([]);
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
              <TextInput
                style={layoutStyles.input}
                placeholder="예: 서울특별시 강남구"
                placeholderTextColor={RECORD_COLORS.muted}
                value={manualLocationName}
                onChangeText={setManualLocationName}
                maxLength={100}
                editable={!saving && !loading}
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
              editable={!saving && !loading}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{dietNote.length}/1000</Text>
          </SectionCard>
        </ScrollView>

        <SubScreenFooter
          label="수정 저장"
          onPress={handleSave}
          disabled={!selectedMealType || loading}
          saving={saving}
          icon="checkmark-circle-outline"
        />
      </KeyboardAvoidingView>
    </SubScreenRoot>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: RECORD_COLORS.line,
    borderStyle: 'dashed',
    backgroundColor: RECORD_COLORS.chip,
    padding: 24,
    gap: 10,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: RECORD_COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: RECORD_COLORS.olive,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 12.5,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
  photoWrap: {
    height: 240,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  photoHero: {
    width: '100%',
    height: '100%',
    backgroundColor: RECORD_COLORS.chip,
  },
  photoOverlayBtn: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  photoOverlayBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: RECORD_COLORS.white,
  },
  photoEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
  },
  photoEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: RECORD_COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: RECORD_COLORS.text,
  },
  photoEmptyDesc: {
    fontSize: 12.5,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
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
  searchErrorText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#B15A3B',
  },
});

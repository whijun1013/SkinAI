import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cosmeticsAPI } from '../../../api/cosmetics';
import { usePastCosmeticsPagination } from '../../../hooks/useRecordQueries';
import useRecordCacheStore from '../../../stores/recordCacheStore';
import RegisterDatePickerSheet from '../../components/search/RegisterDatePickerSheet';
import {
  getTodayString,
  parseDateString,
} from '../../components/search/SearchScreenParts';
import { getDefaultMinimumDate } from '../../components/search/searchDateUtils';
import CosmeticAnalysisSheet from './components/CosmeticAnalysisSheet';
import CosmeticGroupedList from './components/CosmeticGroupedList';
import {
  RECORD_COLORS,
  StatusBanner,
  SubScreenRoot,
  SubScreenTopBar,
  useRecordScreenInsets,
  styles as layoutStyles,
} from '../record/components/SubScreenLayout';

const COS_ACCENT = '#6B5F88';
const COS_SOFT   = '#F0EDF6';
const COS_MID    = '#C0B4D8';

function SectionHeader({ count }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>종료 기록</Text>
        {count > 0 ? <Text style={styles.sectionCount}>{count}</Text> : null}
      </View>
      <Text style={styles.sectionSub}>최근에 종료한 순서로 보여요</Text>
    </View>
  );
}

export default function PastCosmeticsScreen({ onBack }) {
  const { scrollPaddingBottom } = useRecordScreenInsets();
  const [detailId, setDetailId] = useState(null);
  const [dateEdit, setDateEdit] = useState(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [dateSaving, setDateSaving] = useState(false);
  const [loadRetryKey, setLoadRetryKey] = useState(0);
  const [savedBanner, setSavedBanner] = useState('');

  const {
    items: pastCosmetics,
    total,
    hasMore,
    isInitialLoad,
    isLoadingMore,
    error,
    loadMore,
    setItems,
    setTotal,
  } = usePastCosmeticsPagination(10, loadRetryKey);

  const invalidateCosmeticsTab = useRecordCacheStore((state) => state.invalidateCosmeticsTab);
  const savingItemId = dateSaving && dateEdit?.item?.id ? dateEdit.item.id : null;

  const openDatePicker = (item, field) => {
    setDateEdit({ item, field });
    setDatePickerVisible(true);
  };

  const closeDatePicker = () => {
    if (dateSaving) return;
    setDatePickerVisible(false);
    setDateEdit(null);
  };

  const handleRetryLoad = () => {
    invalidateCosmeticsTab('past');
    setLoadRetryKey((key) => key + 1);
  };

  const handleDelete = (item) => {
    const name = item.product?.product_name || '이 제품';
    Alert.alert(
      '기록 삭제',
      `${name} 사용 기록을 완전히 삭제할까요?\n\n삭제하면 복구할 수 없고, 피부 분석 맥락에서도 사라집니다. 잘못 등록한 경우에만 삭제해 주세요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await cosmeticsAPI.deleteMyCosmetic(item.id);
              setItems((prev) => prev.filter((c) => c.id !== item.id));
              setTotal((prev) => Math.max(0, prev - 1));
              invalidateCosmeticsTab('past');
            } catch {
              Alert.alert('오류', '기록 삭제에 실패했습니다.');
            }
          },
        },
      ]
    );
  };

  const handleDateConfirm = async (dateStr) => {
    if (!dateEdit || dateSaving) return;

    setDateSaving(true);
    try {
      const updated = await cosmeticsAPI.updateMyCosmetic(dateEdit.item.id, {
        [dateEdit.field]: dateStr,
      });
      setItems((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      invalidateCosmeticsTab('past');
      closeDatePicker();
    } catch (err) {
      const detail = err.response?.data?.detail;
      Alert.alert('오류', typeof detail === 'string' ? detail : '날짜 수정에 실패했습니다.');
    } finally {
      setDateSaving(false);
    }
  };

  const datePickerConfig = useMemo(() => {
    if (!dateEdit) {
      return {
        value: new Date(),
        minimumDate: getDefaultMinimumDate(),
        maximumDate: new Date(),
        title: '사용 시작일',
      };
    }

    const { item, field } = dateEdit;
    const today = new Date();
    const startedAt = parseDateString(item.started_at);
    const endedAt = parseDateString(item.ended_at);
    const currentValue =
      (field === 'started_at'
        ? startedAt || parseDateString(getTodayString())
        : endedAt || startedAt || today) || today;

    if (field === 'ended_at') {
      return {
        value: currentValue,
        minimumDate: startedAt || getDefaultMinimumDate(),
        maximumDate: today,
        title: '사용 종료일',
        hint: '시작일 이후, 오늘 이전 날짜만 선택할 수 있어요.',
      };
    }

    return {
      value: currentValue,
      minimumDate: getDefaultMinimumDate(),
      maximumDate: endedAt || today,
      title: '사용 시작일',
      hint: endedAt
        ? '종료일 이전 날짜만 선택할 수 있어요.'
        : '최근 10년 이내 날짜만 선택할 수 있어요.',
    };
  }, [dateEdit]);

  const handleResumeUsing = (item) => {
    const name = item.product?.product_name || '이 제품';
    const productId = item.product_id || item.product?.id;
    if (!productId) {
      Alert.alert('오류', '제품 정보를 확인할 수 없습니다.');
      return;
    }

    Alert.alert(
      '다시 사용',
      `${name}을(를) 새 사용 기간으로 등록할까요?\n오늘 날짜가 시작일로 기록됩니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '등록',
          onPress: async () => {
            try {
              await cosmeticsAPI.addMyCosmetic({
                product_id: productId,
                is_current: true,
                started_at: getTodayString(),
              });
              invalidateCosmeticsTab('current');
              setSavedBanner(`${name}을(를) 사용 중 제품에 추가했어요.`);
              setTimeout(() => setSavedBanner(''), 2500);
            } catch (err) {
              const detail = err.response?.data?.detail;
              const message =
                typeof detail === 'string' && detail.includes('이미 사용 중')
                  ? '이미 사용 중인 제품이에요.'
                  : '다시 사용 등록에 실패했습니다.';
              Alert.alert('오류', message);
            }
          },
        },
      ]
    );
  };

  const getErrorText = (loadError) => {
    if (!loadError) return null;
    if (!loadError.response) return '네트워크 연결을 확인해 주세요.';
    const detail = loadError.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    const status = loadError.response?.status;
    if (status === 500) return '서버 오류가 발생했습니다. 백엔드를 재시작해 주세요.';
    if (status === 401) return '로그인이 필요합니다.';
    return '이전 사용 기록을 불러오지 못했습니다.';
  };

  const errorText = getErrorText(error);
  // 초기 로드 에러만 전체 에러 화면 표시 (이미 목록이 있으면 인라인 에러로 처리)
  const showLoadError = !isInitialLoad && !!error && pastCosmetics.length === 0;
  const showLoadMoreError = !isInitialLoad && !!error && pastCosmetics.length > 0;
  const showInitialLoading = isInitialLoad && pastCosmetics.length === 0;
  const isDetailOpen = detailId !== null;
  const isDatePickerOpen = datePickerVisible && dateEdit !== null;
  const showTopLoading = showInitialLoading;

  return (
    <>
      <SubScreenRoot onBack={onBack} enabled={!isDetailOpen && !isDatePickerOpen}>
        <SubScreenTopBar
          title="이전에 사용"
          onBack={onBack}
          accentColor="#6B5F88"
          trailing={
            showTopLoading ? <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" /> : null
          }
        />

        <ScrollView
          contentContainerStyle={[
            layoutStyles.scrollContent,
            { paddingBottom: scrollPaddingBottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {savedBanner ? <StatusBanner icon="checkmark-circle" text={savedBanner} /> : null}

          {showInitialLoading ? (
            <View style={styles.statePanel}>
              <ActivityIndicator size="large" color={COS_ACCENT} />
              <Text style={styles.stateDesc}>기록 불러오는 중...</Text>
            </View>
          ) : showLoadError ? (
            <View style={styles.statePanel}>
              <View style={styles.stateIconCircle}>
                <Ionicons name="cloud-offline-outline" size={28} color={COS_ACCENT} />
              </View>
              <Text style={styles.stateTitle}>기록을 불러오지 못했어요</Text>
              <Text style={styles.stateDesc}>{errorText}</Text>
              <TouchableOpacity activeOpacity={0.78} style={styles.retryBtn} onPress={handleRetryLoad}>
                <Ionicons name="refresh-outline" size={14} color={COS_ACCENT} />
                <Text style={styles.retryBtnText}>다시 시도</Text>
              </TouchableOpacity>
            </View>
          ) : pastCosmetics.length === 0 && total === 0 ? (
            <View style={styles.statePanel}>
              <View style={styles.stateIconCircle}>
                <Ionicons name="time-outline" size={28} color={COS_ACCENT} />
              </View>
              <Text style={styles.stateTitle}>이전에 사용한 제품이 없어요</Text>
              <Text style={styles.stateDesc}>사용을 종료한 제품이 여기에 기록돼요</Text>
            </View>
          ) : (
            <>
              <SectionHeader count={total} />
              <CosmeticGroupedList
                items={pastCosmetics}
                isPast
                flatList
                collapsibleCategories={false}
                onPressItem={(item) => setDetailId(item.product_id)}
                onDeleteItem={handleDelete}
                onResumeUsingItem={handleResumeUsing}
                onEditStartDateItem={(item) => openDatePicker(item, 'started_at')}
                onEditEndDateItem={(item) => openDatePicker(item, 'ended_at')}
                savingItemId={savingItemId}
              />
              {hasMore && !showLoadMoreError ? (
                <TouchableOpacity
                  activeOpacity={0.78}
                  style={styles.loadMoreBtn}
                  onPress={loadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? (
                    <ActivityIndicator size="small" color={RECORD_COLORS.muted} />
                  ) : (
                    <Text style={styles.loadMoreBtnText}>
                      더 보기 ({total - pastCosmetics.length}개 남음)
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
              {showLoadMoreError ? (
                <View style={styles.loadMoreErrorRow}>
                  <Ionicons name="alert-circle-outline" size={16} color={RECORD_COLORS.hint} />
                  <Text style={styles.loadMoreErrorText}>더 불러오지 못했어요.</Text>
                  <TouchableOpacity
                    onPress={handleRetryLoad}
                    style={styles.loadMoreRetryBtn}
                    activeOpacity={0.78}
                  >
                    <Text style={styles.retryBtnText}>재시도</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </SubScreenRoot>

      <CosmeticAnalysisSheet
        visible={isDetailOpen}
        cosmeticId={detailId}
        variant="list"
        onClose={() => setDetailId(null)}
      />

      <RegisterDatePickerSheet
        visible={isDatePickerOpen}
        value={datePickerConfig.value}
        title={datePickerConfig.title}
        hint={datePickerConfig.hint}
        minimumDate={datePickerConfig.minimumDate}
        maximumDate={datePickerConfig.maximumDate}
        onConfirm={handleDateConfirm}
        onDismiss={closeDatePicker}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    marginBottom: 10,
    marginTop: 4,
    gap: 4,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: COS_ACCENT,
    letterSpacing: 0.2,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
  },
  sectionSub: {
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
    paddingLeft: 1,
  },
  statePanel: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  stateIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COS_SOFT,
    borderWidth: 1.5,
    borderColor: COS_MID,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stateTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: RECORD_COLORS.text,
  },
  stateDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COS_MID,
    backgroundColor: COS_SOFT,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: COS_ACCENT,
  },
  loadMoreBtn: {
    marginTop: 10,
    alignSelf: 'center',
    minHeight: 40,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
  },
  loadMoreErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
  },
  loadMoreErrorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  loadMoreRetryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COS_MID,
    backgroundColor: COS_SOFT,
  },
});

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { fetchPastCosmeticsTotal, useCosmeticsListQuery } from '../../../hooks/useRecordQueries';
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
  SubScreenFooter,
  SubScreenRoot,
  SubScreenTopBar,
  useRecordScreenInsets,
  styles as layoutStyles,
} from '../record/components/SubScreenLayout';

const COSMETICS_ACCENT = '#6B5F88';
const COSMETICS_SOFT   = '#EAE4F2';
const COSMETICS_MID    = '#B8ACCC';
const COSMETICS_MUTED  = '#9A8FB0';

// ── 코스메틱 테마 배너 ──────────────────────────────────────────────────────
function CosmeticsBanner({ text }) {
  return (
    <View style={styles.banner}>
      <View style={styles.bannerIconWrap}>
        <Ionicons name="checkmark-circle" size={16} color={COSMETICS_ACCENT} />
      </View>
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

// ── 빈 상태 ────────────────────────────────────────────────────────────────
function EmptyState({ onAdd }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="flask-outline" size={32} color={COSMETICS_ACCENT} />
      </View>
      <Text style={styles.emptyTitle}>사용 중인 제품이 없어요</Text>
      <Text style={styles.emptySub}>
        스킨케어·메이크업 등 현재 사용 중인{'\n'}제품을 등록하고 성분을 분석해보세요
      </Text>
      {onAdd ? (
        <TouchableOpacity style={styles.emptyBtn} onPress={onAdd} activeOpacity={0.8}>
          <Ionicons name="add" size={15} color={COSMETICS_ACCENT} />
          <Text style={styles.emptyBtnText}>제품 추가하기</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── 로딩 상태 ──────────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <View style={styles.loadingWrap}>
      <ActivityIndicator size="small" color={COSMETICS_ACCENT} />
      <Text style={styles.loadingText}>불러오는 중...</Text>
    </View>
  );
}

// ── 에러 상태 ──────────────────────────────────────────────────────────────
function ErrorState({ message, onRetry }) {
  return (
    <View style={styles.errorWrap}>
      <View style={styles.errorIconWrap}>
        <Ionicons name="cloud-offline-outline" size={28} color={COSMETICS_MUTED} />
      </View>
      <Text style={styles.errorTitle}>목록을 불러오지 못했어요</Text>
      <Text style={styles.errorSub}>{message || '네트워크 상태를 확인해 주세요'}</Text>
      {onRetry ? (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.8}>
          <Ionicons name="refresh-outline" size={14} color={COSMETICS_ACCENT} />
          <Text style={styles.retryBtnText}>다시 시도</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── 이전 제품 진입 행 ──────────────────────────────────────────────────────
function PastEntryRow({ count, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.78}
      style={styles.pastEntry}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="이전에 사용한 제품 보기"
    >
      <View style={styles.pastEntryIconWrap}>
        <Ionicons name="time-outline" size={16} color={COSMETICS_MUTED} />
      </View>
      <View style={styles.pastEntryTextBlock}>
        <Text style={styles.pastEntryTitle}>이전에 사용한 제품</Text>
        <Text style={styles.pastEntrySub}>사용 종료된 제품 기록 보기</Text>
      </View>
      {count != null && count > 0 ? (
        <View style={styles.pastEntryBadge}>
          <Text style={styles.pastEntryBadgeText}>{count}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={RECORD_COLORS.muted} />
    </TouchableOpacity>
  );
}

export default function MyCosmeticsScreen({ onBack, onSearch, onPast }) {
  const { scrollPaddingBottom } = useRecordScreenInsets();
  const [detailId, setDetailId] = useState(null);
  const [dateEdit, setDateEdit] = useState(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [dateSaving, setDateSaving] = useState(false);
  const [loadRetryKey, setLoadRetryKey] = useState(0);
  const [pastTotal, setPastTotal] = useState(null);
  const [savedBanner, setSavedBanner] = useState('');
  const [pastTotalRetry, setPastTotalRetry] = useState(0);
  const bannerTimerRef = React.useRef(null);

  const {
    data: currentCosmetics = [],
    isInitialLoad: isCurrentLoading,
    error: currentError,
  } = useCosmeticsListQuery(true, loadRetryKey);

  useEffect(() => {
    let cancelled = false;

    fetchPastCosmeticsTotal()
      .then((total) => {
        if (!cancelled) setPastTotal(total);
      })
      .catch(() => {
        if (!cancelled) setPastTotal(null);
      });

    return () => {
      cancelled = true;
    };
  }, [pastTotalRetry]);

  const showBanner = React.useCallback((text) => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setSavedBanner(text);
    bannerTimerRef.current = setTimeout(() => setSavedBanner(''), 2000);
  }, []);

  React.useEffect(() => () => { if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current); }, []);

  const setCosmeticsTab = useRecordCacheStore((state) => state.setCosmeticsTab);
  const invalidateCosmeticsTab = useRecordCacheStore((state) => state.invalidateCosmeticsTab);

  const openDatePicker = useCallback((item, field) => {
    setDateEdit({ item, field });
    setDatePickerVisible(true);
  }, []);

  const closeDatePicker = () => {
    if (dateSaving) return;
    setDatePickerVisible(false);
    setDateEdit(null);
  };

  const handleRetryLoad = () => {
    invalidateCosmeticsTab('current');
    setLoadRetryKey((key) => key + 1);
  };

  const handlePressItem = useCallback((item) => {
    setDetailId(item.product_id);
  }, []);

  const handleStopToday = useCallback(
    async (item) => {
      if (dateSaving) return;
      setDateEdit({ item, field: 'stop' });
      setDateSaving(true);
      try {
        const updated = await cosmeticsAPI.updateMyCosmetic(item.id, {
          is_current: false,
          ended_at: getTodayString(),
        });
        setCosmeticsTab(
          'current',
          currentCosmetics.filter((entry) => entry.id !== updated.id)
        );
        invalidateCosmeticsTab('past');
        setPastTotalRetry((key) => key + 1);
        showBanner('사용이 종료되었습니다.');
      } catch (err) {
        const detail = err.response?.data?.detail;
        Alert.alert('오류', typeof detail === 'string' ? detail : '사용 종료에 실패했습니다.');
      } finally {
        setDateSaving(false);
        setDateEdit(null);
      }
    },
    [dateSaving, currentCosmetics, setCosmeticsTab, invalidateCosmeticsTab]
  );

  const handleStopUsing = useCallback(
    (item) => {
      openDatePicker(item, 'stop');
    },
    [openDatePicker]
  );

  const handleEditDateCurrent = useCallback(
    (item) => {
      openDatePicker(item, 'started_at');
    },
    [openDatePicker]
  );

  const handleDateConfirm = async (dateStr) => {
    if (!dateEdit || dateSaving) return;

    setDateSaving(true);
    try {
      const payload =
        dateEdit.field === 'stop'
          ? { is_current: false, ended_at: dateStr }
          : { [dateEdit.field]: dateStr };

      const updated = await cosmeticsAPI.updateMyCosmetic(dateEdit.item.id, payload);

      if (dateEdit.field === 'stop') {
        setCosmeticsTab(
          'current',
          currentCosmetics.filter((entry) => entry.id !== updated.id)
        );
        invalidateCosmeticsTab('past');
        setPastTotalRetry((key) => key + 1);
        showBanner('사용이 종료되었습니다.');
      } else {
        setCosmeticsTab(
          'current',
          currentCosmetics.map((entry) => (entry.id === updated.id ? updated : entry))
        );
        showBanner('날짜가 수정되었습니다.');
      }
      closeDatePicker();
    } catch (err) {
      const detail = err.response?.data?.detail;
      const fallback =
        dateEdit.field === 'stop' ? '사용 종료에 실패했습니다.' : '날짜 수정에 실패했습니다.';
      Alert.alert('오류', typeof detail === 'string' ? detail : fallback);
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

    if (field === 'stop') {
      return {
        value: parseDateString(getTodayString()) || today,
        minimumDate: startedAt || getDefaultMinimumDate(),
        maximumDate: today,
        title: '사용 종료일',
        hint: '언제 사용을 멈췄나요? 시작일 이후 날짜만 선택할 수 있어요.',
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

  const getErrorText = (error) => {
    if (!error) return null;
    if (!error.response) return '네트워크 연결을 확인해 주세요.';
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    return '제품 목록을 불러오지 못했습니다.';
  };

  const currentErrorText = getErrorText(currentError);
  const showCurrentLoadError = !isCurrentLoading && !!currentError;
  const showCurrentLoading = isCurrentLoading && currentCosmetics.length === 0;
  const savingItemId = dateSaving && dateEdit?.item?.id ? dateEdit.item.id : null;

  const isDetailOpen = detailId !== null;
  const isDatePickerOpen = datePickerVisible && dateEdit !== null;
  const showTopLoading = isCurrentLoading && currentCosmetics.length === 0;

  return (
    <>
      <SubScreenRoot onBack={onBack} enabled={!isDetailOpen && !isDatePickerOpen}>
        <SubScreenTopBar
          title="사용 화장품"
          onBack={onBack}
          accentColor={COSMETICS_ACCENT}
          trailing={
            showTopLoading
              ? <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
              : null
          }
        />

        <ScrollView
          contentContainerStyle={[
            layoutStyles.scrollContent,
            { paddingBottom: scrollPaddingBottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {savedBanner ? <CosmeticsBanner text={savedBanner} /> : null}

          {currentCosmetics.length > 0 ? (
            <CosmeticGroupedList
              items={currentCosmetics}
              isPast={false}
              autoLayout
              onPressItem={handlePressItem}
              onStopTodayItem={handleStopToday}
              onStopUsingItem={handleStopUsing}
              onEditDateItem={handleEditDateCurrent}
              savingItemId={savingItemId}
            />
          ) : showCurrentLoadError ? (
            <ErrorState message={currentErrorText} onRetry={handleRetryLoad} />
          ) : showCurrentLoading ? (
            <LoadingState />
          ) : (
            <EmptyState onAdd={onSearch} />
          )}

          {onPast ? <PastEntryRow count={pastTotal} onPress={onPast} /> : null}
        </ScrollView>

        <SubScreenFooter label="제품 추가" onPress={onSearch} icon="add-circle-outline" color={COSMETICS_ACCENT} />
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
  // ── 코스메틱 배너 ──────────────────────────────────────────────────────────
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COSMETICS_SOFT,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COSMETICS_MID,
  },
  bannerIconWrap: {
    flexShrink: 0,
  },
  bannerText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: COSMETICS_ACCENT,
    lineHeight: 18,
  },

  // ── 빈 상태 ────────────────────────────────────────────────────────────────
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: COSMETICS_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: COSMETICS_MID,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: RECORD_COLORS.text,
    letterSpacing: -0.3,
  },
  emptySub: {
    fontSize: 13,
    fontWeight: '500',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COSMETICS_MID,
    backgroundColor: COSMETICS_SOFT,
  },
  emptyBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: COSMETICS_ACCENT,
  },

  // ── 로딩 상태 ──────────────────────────────────────────────────────────────
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 56,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },

  // ── 에러 상태 ──────────────────────────────────────────────────────────────
  errorWrap: {
    alignItems: 'center',
    paddingVertical: 44,
    paddingHorizontal: 24,
    gap: 8,
  },
  errorIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: RECORD_COLORS.chip,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: RECORD_COLORS.text,
  },
  errorSub: {
    fontSize: 12,
    fontWeight: '500',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COSMETICS_MID,
    backgroundColor: COSMETICS_SOFT,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: COSMETICS_ACCENT,
  },

  // ── 이전 제품 행 ──────────────────────────────────────────────────────────
  pastEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.card,
  },
  pastEntryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COSMETICS_SOFT,
    borderWidth: 1,
    borderColor: COSMETICS_MID,
  },
  pastEntryTextBlock: {
    flex: 1,
    gap: 2,
  },
  pastEntryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: RECORD_COLORS.text,
  },
  pastEntrySub: {
    fontSize: 11,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  pastEntryBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
  },
  pastEntryBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
  },
});

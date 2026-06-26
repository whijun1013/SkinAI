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
import { medicationsAPI } from '../../../api/medications';
import {
  fetchPastMedicationsTotal,
  useMedicationsListQuery,
} from '../../../hooks/useRecordQueries';
import useRecordCacheStore from '../../../stores/recordCacheStore';
import RegisterDatePickerSheet from '../../components/search/RegisterDatePickerSheet';
import {
  getTodayString,
  parseDateString,
} from '../../components/search/SearchScreenParts';
import { getDefaultMinimumDate } from '../../components/search/searchDateUtils';
import MedicationDetailModal from './components/MedicationDetailModal';
import MedicationListCard from './components/MedicationListCard';
import {
  RECORD_COLORS,
  StatusBanner,
  SubScreenFooter,
  SubScreenRoot,
  SubScreenTopBar,
  useRecordScreenInsets,
  styles as layoutStyles,
} from '../record/components/SubScreenLayout';

const MED_ACCENT = '#8C4444';
const MED_SOFT   = '#F5EAEA';
const MED_MID    = '#D4A0A0';

function getFarFutureDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 5);
  return date;
}

function EmptyState({ onAdd }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="medkit-outline" size={32} color={MED_ACCENT} />
      </View>
      <Text style={styles.emptyTitle}>복용 중인 약물이 없어요</Text>
      <Text style={styles.emptySub}>
        현재 복용 중인 약물을{'\n'}추가하고 일정을 관리해보세요
      </Text>
      {onAdd ? (
        <TouchableOpacity style={styles.emptyBtn} onPress={onAdd} activeOpacity={0.8}>
          <Ionicons name="add" size={15} color={MED_ACCENT} />
          <Text style={styles.emptyBtnText}>약물 추가하기</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingWrap}>
      <ActivityIndicator size="small" color={MED_ACCENT} />
      <Text style={styles.loadingText}>불러오는 중...</Text>
    </View>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <View style={styles.errorWrap}>
      <View style={styles.errorIconWrap}>
        <Ionicons name="cloud-offline-outline" size={28} color={MED_ACCENT} />
      </View>
      <Text style={styles.errorTitle}>목록을 불러오지 못했어요</Text>
      <Text style={styles.errorSub}>{message || '네트워크 상태를 확인해 주세요'}</Text>
      {onRetry ? (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.8}>
          <Ionicons name="refresh-outline" size={14} color={MED_ACCENT} />
          <Text style={styles.retryBtnText}>다시 시도</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function PastEntryRow({ count, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.78}
      style={styles.pastEntry}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="복용 종료 기록 보기"
    >
      <View style={styles.pastEntryIconWrap}>
        <Ionicons name="time-outline" size={16} color={MED_ACCENT} />
      </View>
      <View style={styles.pastEntryTextBlock}>
        <Text style={styles.pastEntryTitle}>이전 복용 기록</Text>
        <Text style={styles.pastEntrySub}>종료된 약물 기록 보기</Text>
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

export default function MyMedicationsScreen({ onBack, onSearch, onPast }) {
  const { scrollPaddingBottom } = useRecordScreenInsets();
  const [detailId, setDetailId] = useState(null);
  const [dateEdit, setDateEdit] = useState(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [dateSaving, setDateSaving] = useState(false);
  const [loadRetryKey, setLoadRetryKey] = useState(0);
  const [pastTotal, setPastTotal] = useState(null);
  const [pastTotalRetry, setPastTotalRetry] = useState(0);
  const [savedBanner, setSavedBanner] = useState('');
  const bannerTimerRef = React.useRef(null);

  const {
    data: currentMedications = [],
    isInitialLoad,
    error: currentError,
  } = useMedicationsListQuery(true, loadRetryKey);

  const showBanner = React.useCallback((text) => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setSavedBanner(text);
    bannerTimerRef.current = setTimeout(() => setSavedBanner(''), 2000);
  }, []);

  React.useEffect(() => () => { if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current); }, []);

  const setMedicationsTab = useRecordCacheStore((state) => state.setMedicationsTab);
  const invalidateMedicationsTab = useRecordCacheStore((state) => state.invalidateMedicationsTab);

  useEffect(() => {
    let cancelled = false;

    fetchPastMedicationsTotal()
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
    invalidateMedicationsTab('current');
    setLoadRetryKey((key) => key + 1);
  };

  const handlePressItem = useCallback((item) => {
    setDetailId(item.medication_id);
  }, []);

  const handleStopToday = useCallback(
    async (item) => {
      if (dateSaving) return;
      setDateSaving(true);
      try {
        const updated = await medicationsAPI.updateMyMedication(item.id, {
          is_current: false,
          ended_at: getTodayString(),
        });
        setMedicationsTab(
          'current',
          currentMedications.filter((entry) => entry.id !== updated.id)
        );
        invalidateMedicationsTab('past');
        setPastTotalRetry((key) => key + 1);
        showBanner('복용이 종료되었습니다.');
      } catch (err) {
        const detail = err.response?.data?.detail;
        Alert.alert('오류', typeof detail === 'string' ? detail : '복용 종료에 실패했습니다.');
      } finally {
        setDateSaving(false);
      }
    },
    [dateSaving, currentMedications, setMedicationsTab, invalidateMedicationsTab, showBanner]
  );

  const handleStopUsing = useCallback(
    (item) => {
      openDatePicker(item, 'stop');
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

      const updated = await medicationsAPI.updateMyMedication(dateEdit.item.id, payload);

      if (dateEdit.field === 'stop') {
        setMedicationsTab(
          'current',
          currentMedications.filter((entry) => entry.id !== updated.id)
        );
        invalidateMedicationsTab('past');
        setPastTotalRetry((key) => key + 1);
        showBanner('복용이 종료되었습니다.');
      } else {
        setMedicationsTab(
          'current',
          currentMedications.map((entry) => (entry.id === updated.id ? updated : entry))
        );
        showBanner('날짜가 수정되었습니다.');
      }
      closeDatePicker();
    } catch (err) {
      const detail = err.response?.data?.detail;
      const fallback =
        dateEdit.field === 'stop' ? '복용 종료에 실패했습니다.' : '날짜 수정에 실패했습니다.';
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
        title: '복용 시작일',
      };
    }

    const { item, field } = dateEdit;
    const today = new Date();
    const startedAt = parseDateString(item.started_at);
    const expectedEndAt = parseDateString(item.expected_end_at);

    if (field === 'stop') {
      return {
        value: parseDateString(getTodayString()) || today,
        minimumDate: startedAt || getDefaultMinimumDate(),
        maximumDate: today,
        title: '복용 종료일',
        hint: '언제 복용을 멈췄나요? 시작일 이후 날짜만 선택할 수 있어요.',
      };
    }

    if (field === 'expected_end_at') {
      return {
        value: expectedEndAt || startedAt || today,
        minimumDate: startedAt || getDefaultMinimumDate(),
        maximumDate: getFarFutureDate(),
        title: '종료 예정일',
        hint: startedAt ? '시작일 이후 날짜를 선택해 주세요.' : '예상 복용 종료일을 선택해 주세요.',
      };
    }

    return {
      value: startedAt || today,
      minimumDate: getDefaultMinimumDate(),
      maximumDate: expectedEndAt || today,
      title: '복용 시작일',
      hint: expectedEndAt
        ? '종료 예정일 이전 날짜만 선택할 수 있어요.'
        : '최근 10년 이내 날짜만 선택할 수 있어요.',
    };
  }, [dateEdit]);

  const getErrorText = (error) => {
    if (!error) return null;
    if (!error.response) return '네트워크 연결을 확인해 주세요.';
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    return '약물 목록을 불러오지 못했습니다.';
  };

  const currentErrorText = getErrorText(currentError);
  const showCurrentLoadError = !isInitialLoad && !!currentError;
  const showCurrentLoading = isInitialLoad && currentMedications.length === 0;
  const savingItemId = dateSaving && dateEdit?.item?.id ? dateEdit.item.id : null;
  const isDetailOpen = detailId !== null;
  const isDatePickerOpen = datePickerVisible && dateEdit !== null;
  const showTopLoading = isInitialLoad && currentMedications.length === 0;

  return (
    <>
      <SubScreenRoot onBack={onBack} enabled={!isDetailOpen && !isDatePickerOpen}>
        <SubScreenTopBar
          title="내 약물"
          onBack={onBack}
          accentColor="#8C4444"
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

          {currentMedications.length > 0 ? (
            currentMedications.map((item) => (
              <MedicationListCard
                key={item.id}
                item={item}
                onPress={() => handlePressItem(item)}
                onStopToday={() => handleStopToday(item)}
                onStopUsing={() => handleStopUsing(item)}
                onEditStartDate={() => openDatePicker(item, 'started_at')}
                onEditEndDate={() => openDatePicker(item, 'expected_end_at')}
                saving={savingItemId === item.id}
              />
            ))
          ) : showCurrentLoadError ? (
            <ErrorState message={currentErrorText} onRetry={handleRetryLoad} />
          ) : showCurrentLoading ? (
            <LoadingState />
          ) : (
            <EmptyState onAdd={onSearch} />
          )}

          {onPast ? <PastEntryRow count={pastTotal} onPress={onPast} /> : null}
        </ScrollView>

        <SubScreenFooter label="약물 추가" onPress={onSearch} icon="add-circle-outline" />
      </SubScreenRoot>

      <MedicationDetailModal
        visible={isDetailOpen}
        medicationId={detailId}
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
    backgroundColor: MED_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: MED_MID,
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
    backgroundColor: MED_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: MED_MID,
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
    borderColor: MED_MID,
    backgroundColor: MED_SOFT,
  },
  emptyBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: MED_ACCENT,
  },
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
    backgroundColor: MED_SOFT,
    borderWidth: 1,
    borderColor: MED_MID,
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
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: MED_MID,
    backgroundColor: MED_SOFT,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: MED_ACCENT,
  },
});

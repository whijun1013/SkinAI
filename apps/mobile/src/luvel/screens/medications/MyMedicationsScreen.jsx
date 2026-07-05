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
  SearchEmptyBox,
} from '../../components/search/SearchScreenParts';
import { getDefaultMinimumDate } from '../../components/search/searchDateUtils';
import MedicationDetailModal from './components/MedicationDetailModal';
import MedicationListCard from './components/MedicationListCard';
import {
  RECORD_COLORS,
  SectionCard,
  SubScreenFooter,
  SubScreenRoot,
  SubScreenTopBar,
  useRecordScreenInsets,
  styles as layoutStyles,
} from '../record/components/SubScreenLayout';

function SectionLabel({ title, count }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {count > 0 ? <Text style={styles.sectionCount}>{count}</Text> : null}
    </View>
  );
}

function getFarFutureDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 5);
  return date;
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
        <Ionicons name="time-outline" size={15} color={RECORD_COLORS.oliveMuted} />
      </View>
      <View style={styles.pastEntryTextBlock}>
        <Text style={styles.pastEntryTitle}>복용 종료</Text>
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

  const {
    data: currentMedications = [],
    isInitialLoad,
    error: currentError,
  } = useMedicationsListQuery(true, loadRetryKey);

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
      const _now = new Date();
      const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
      try {
        const updated = await medicationsAPI.updateMyMedication(item.id, {
          is_current: false,
          ended_at: today,
        });
        setMedicationsTab(
          'current',
          currentMedications.filter((entry) => entry.id !== updated.id)
        );
        invalidateMedicationsTab('past');
        setPastTotalRetry((key) => key + 1);
      } catch (err) {
        const detail = err.response?.data?.detail;
        Alert.alert('오류', typeof detail === 'string' ? detail : '복용 종료에 실패했습니다.');
      }
    },
    [currentMedications, setMedicationsTab, invalidateMedicationsTab]
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
      } else {
        setMedicationsTab(
          'current',
          currentMedications.map((entry) => (entry.id === updated.id ? updated : entry))
        );
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
  const showCurrentEmpty =
    !isInitialLoad && !currentError && currentMedications.length === 0;
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
          trailing={
            showTopLoading ? <ActivityIndicator size="small" color={RECORD_COLORS.olive} /> : null
          }
        />

        <ScrollView
          contentContainerStyle={[
            layoutStyles.scrollContent,
            { paddingBottom: scrollPaddingBottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <SectionLabel title="복용 중" count={currentMedications.length} />

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
          ) : showCurrentLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={RECORD_COLORS.olive} />
              <Text style={styles.loadingText}>복용 중 약물 불러오는 중...</Text>
            </View>
          ) : showCurrentLoadError ? (
            <SectionCard title="목록 불러오기 실패">
              <SearchEmptyBox
                icon="cloud-offline-outline"
                title="복용 중 약물을 가져오지 못했어요"
                description={currentErrorText}
              />
              <TouchableOpacity
                activeOpacity={0.78}
                style={styles.retryBtn}
                onPress={handleRetryLoad}
              >
                <Text style={styles.retryBtnText}>다시 시도</Text>
              </TouchableOpacity>
            </SectionCard>
          ) : showCurrentEmpty ? (
            <SectionCard title="등록된 약물 없음">
              <SearchEmptyBox
                icon="medkit-outline"
                title="복용 중인 약물이 없어요."
                description='하단 "약물 추가"로 검색·등록할 수 있어요'
              />
            </SectionCard>
          ) : null}

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
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: RECORD_COLORS.olive,
    letterSpacing: 0.2,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
    paddingHorizontal: 4,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  pastEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.card,
  },
  pastEntryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RECORD_COLORS.oliveSoft,
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
    marginTop: 12,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: RECORD_COLORS.olive,
    backgroundColor: RECORD_COLORS.oliveSoft,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: RECORD_COLORS.olive,
  },
});

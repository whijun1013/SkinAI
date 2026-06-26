import React, { useCallback, useMemo, useState } from 'react';
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
import { usePastMedicationsPagination } from '../../../hooks/useRecordQueries';
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
  SubScreenRoot,
  SubScreenTopBar,
  useRecordScreenInsets,
  styles as layoutStyles,
} from '../record/components/SubScreenLayout';

const MED_ACCENT = '#8C4444';
const MED_SOFT   = '#F5EAEA';
const MED_MID    = '#D4A0A0';

function SectionHeader({ count }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>복용 종료 기록</Text>
        {count > 0 ? <Text style={styles.sectionCount}>{count}</Text> : null}
      </View>
      <Text style={styles.sectionSub}>최근에 종료한 순서로 보여요</Text>
    </View>
  );
}

export default function PastMedicationsScreen({ onBack }) {
  const { scrollPaddingBottom } = useRecordScreenInsets();
  const [detailId, setDetailId] = useState(null);
  const [dateEdit, setDateEdit] = useState(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [dateSaving, setDateSaving] = useState(false);
  const [loadRetryKey, setLoadRetryKey] = useState(0);

  const {
    items: pastMedications,
    total,
    hasMore,
    isInitialLoad,
    isLoadingMore,
    error,
    loadMore,
    setItems,
    setTotal,
  } = usePastMedicationsPagination(10, loadRetryKey);

  const invalidateMedicationsTab = useRecordCacheStore((state) => state.invalidateMedicationsTab);
  const savingItemId = dateSaving && dateEdit?.item?.id ? dateEdit.item.id : null;

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
    invalidateMedicationsTab('past');
    setLoadRetryKey((key) => key + 1);
  };

  const handlePressItem = useCallback((item) => {
    setDetailId(item.medication_id);
  }, []);

  const handleDelete = (item) => {
    const name = item.medication?.name || '이 약물';
    Alert.alert(
      '기록 삭제',
      `${name} 복용 기록을 완전히 삭제할까요?\n\n삭제하면 복구할 수 없고, 피부 분석 맥락에서도 사라집니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await medicationsAPI.deleteMyMedication(item.id);
              setItems((prev) => prev.filter((entry) => entry.id !== item.id));
              setTotal((prev) => Math.max(0, prev - 1));
              invalidateMedicationsTab('past');
            } catch {
              Alert.alert('오류', '기록 삭제에 실패했습니다.');
            }
          },
        },
      ]
    );
  };

  const handleEditDate = (item) => {
    Alert.alert('기간 수정', '어떤 날짜를 변경할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '시작일', onPress: () => openDatePicker(item, 'started_at') },
      { text: '종료일', onPress: () => openDatePicker(item, 'ended_at') },
    ]);
  };

  const handleResumeUsing = (item) => {
    const name = item.medication?.name || '이 약물';
    const medicationId = item.medication_id;

    Alert.alert(
      '다시 복용',
      `${name}을(를) 새 복용 기간으로 등록할까요?\n오늘 날짜가 시작일로 기록됩니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '등록',
          onPress: async () => {
            try {
              await medicationsAPI.addMyMedication({
                medication_id: medicationId,
                is_current: true,
                started_at: getTodayString(),
              });
              invalidateMedicationsTab('current');
            } catch (err) {
              const detail = err.response?.data?.detail;
              const message =
                typeof detail === 'string' && detail.includes('이미 복용 중')
                  ? '이미 복용 중인 약물이에요.'
                  : '다시 복용 등록에 실패했습니다.';
              Alert.alert('오류', message);
              return;
            }
            Alert.alert('등록 완료', `${name}을(를) 복용 중 약물에 추가했어요.`);
          },
        },
      ]
    );
  };

  const handleDateConfirm = async (dateStr) => {
    if (!dateEdit || dateSaving) return;

    setDateSaving(true);
    try {
      const updated = await medicationsAPI.updateMyMedication(dateEdit.item.id, {
        [dateEdit.field]: dateStr,
      });
      setItems((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      invalidateMedicationsTab('past');
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
        title: '복용 시작일',
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
        title: '복용 종료일',
        hint: '시작일 이후, 오늘 이전 날짜만 선택할 수 있어요.',
      };
    }

    return {
      value: currentValue,
      minimumDate: getDefaultMinimumDate(),
      maximumDate: endedAt || today,
      title: '복용 시작일',
      hint: endedAt
        ? '종료일 이전 날짜만 선택할 수 있어요.'
        : '최근 10년 이내 날짜만 선택할 수 있어요.',
    };
  }, [dateEdit]);

  const getErrorText = (loadError) => {
    if (!loadError) return null;
    if (!loadError.response) return '네트워크 연결을 확인해 주세요.';
    const detail = loadError.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    return '복용 종료 기록을 불러오지 못했습니다.';
  };

  const errorText = getErrorText(error);
  // 초기 로드 실패: 아이템이 없는 상태에서 에러 → 전체 에러 화면
  const showInitialError = !isInitialLoad && !!error && pastMedications.length === 0;
  // loadMore 실패: 이미 일부 아이템이 로드된 상태에서 에러 → 인라인 에러
  const showLoadMoreError = !isInitialLoad && !!error && pastMedications.length > 0;
  const showInitialLoading = isInitialLoad && pastMedications.length === 0;
  const isDetailOpen = detailId !== null;
  const isDatePickerOpen = datePickerVisible && dateEdit !== null;
  const showTopLoading = showInitialLoading;

  return (
    <>
      <SubScreenRoot onBack={onBack} enabled={!isDetailOpen && !isDatePickerOpen}>
        <SubScreenTopBar
          title="복용 종료"
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
          {showInitialLoading ? (
            <View style={styles.statePanel}>
              <ActivityIndicator size="large" color={MED_ACCENT} />
              <Text style={styles.stateDesc}>기록 불러오는 중...</Text>
            </View>
          ) : showInitialError ? (
            <View style={styles.statePanel}>
              <View style={styles.stateIconCircle}>
                <Ionicons name="cloud-offline-outline" size={28} color={MED_ACCENT} />
              </View>
              <Text style={styles.stateTitle}>기록을 불러오지 못했어요</Text>
              <Text style={styles.stateDesc}>{errorText}</Text>
              <TouchableOpacity activeOpacity={0.78} style={styles.retryBtn} onPress={handleRetryLoad}>
                <Ionicons name="refresh-outline" size={14} color={MED_ACCENT} />
                <Text style={styles.retryBtnText}>다시 시도</Text>
              </TouchableOpacity>
            </View>
          ) : pastMedications.length === 0 && total === 0 ? (
            <View style={styles.statePanel}>
              <View style={styles.stateIconCircle}>
                <Ionicons name="time-outline" size={28} color={MED_ACCENT} />
              </View>
              <Text style={styles.stateTitle}>복용 종료된 약물이 없어요</Text>
              <Text style={styles.stateDesc}>복용을 종료한 약물이 여기에 기록돼요</Text>
            </View>
          ) : (
            <>
              <SectionHeader count={total} />
              {pastMedications.map((item) => (
                <MedicationListCard
                  key={item.id}
                  item={item}
                  isPast
                  onPress={() => handlePressItem(item)}
                  onDelete={() => handleDelete(item)}
                  onResumeUsing={() => handleResumeUsing(item)}
                  onEditDate={() => handleEditDate(item)}
                  saving={savingItemId === item.id}
                />
              ))}
              {showLoadMoreError ? (
                <View style={styles.loadMoreErrorRow}>
                  <Text style={styles.loadMoreErrorText}>{errorText ?? '추가 목록을 불러오지 못했습니다.'}</Text>
                  <TouchableOpacity activeOpacity={0.78} onPress={loadMore}>
                    <Text style={styles.loadMoreErrorRetry}>다시 시도</Text>
                  </TouchableOpacity>
                </View>
              ) : hasMore ? (
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
                      더 보기 ({total - pastMedications.length}개 남음)
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </ScrollView>
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
  sectionHeader: {
    marginBottom: 12,
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
    color: '#8C4444',
    letterSpacing: 0.2,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
  },
  sectionSub: {
    fontSize: 12,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
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
    backgroundColor: MED_SOFT,
    borderWidth: 1.5,
    borderColor: MED_MID,
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
    borderColor: MED_MID,
    backgroundColor: MED_SOFT,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: MED_ACCENT,
  },
  loadMoreBtn: {
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
    alignItems: 'center',
  },
  loadMoreBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
  },
  loadMoreErrorRow: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(196,92,74,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  loadMoreErrorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#C45C4A',
  },
  loadMoreErrorRetry: {
    fontSize: 12,
    fontWeight: '800',
    color: '#C45C4A',
  },
});

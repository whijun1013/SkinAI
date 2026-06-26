import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { medicationsAPI } from '../../../../api/medications';
import useRecordCacheStore from '../../../../stores/recordCacheStore';
import useSubScreenLayout, { useModalScreenLayout } from '../../../../hooks/useSubScreenLayout';
import {
  getTodayString,
  isValidCalendarDate,
  parseDateString,
  searchStyles,
} from '../../../components/search/SearchScreenParts';
import RegisterDatePickerSheet from '../../../components/search/RegisterDatePickerSheet';
import { getDefaultMinimumDate } from '../../../components/search/searchDateUtils';
import {
  RECORD_COLORS,
  SectionCard,
  SubScreenFooter,
  SubScreenRoot,
  SubScreenTopBar,
} from '../../record/components/SubScreenLayout';

function getFarFutureDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 5);
  return date;
}

function MedicationHero({ medication }) {
  return (
    <View style={styles.heroBlock}>
      <View style={styles.iconCircle}>
        <Ionicons name="medkit" size={24} color={RECORD_COLORS.olive} />
      </View>
      <View style={styles.heroTextBlock}>
        <Text style={styles.heroName} numberOfLines={2}>
          {medication.name}
        </Text>
        {medication.form ? (
          <Text style={styles.heroMeta} numberOfLines={1}>
            {medication.form}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function RegisterSuccessPanel({ onContinueSearch, onGoToList }) {
  return (
    <View style={styles.successPanel}>
      <View style={styles.successIconWrap}>
        <Ionicons name="checkmark-circle" size={52} color={RECORD_COLORS.olive} />
      </View>
      <Text style={styles.successTitle}>등록 완료</Text>
      <Text style={styles.successBody}>내 약물에 추가되었습니다.</Text>
      <View style={styles.successActions}>
        <TouchableOpacity
          style={styles.successSecondaryBtn}
          onPress={onContinueSearch}
          activeOpacity={0.82}
        >
          <Text style={styles.successSecondaryBtnText}>계속 검색</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.successPrimaryBtn}
          onPress={onGoToList}
          activeOpacity={0.82}
        >
          <Text style={styles.successPrimaryBtnText}>목록 보기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** @param {"modal"|"overlay"} presentation */
export default function MedicationRegisterModal({
  visible,
  medication,
  onClose,
  onContinueSearch,
  onRegistered,
  presentation = 'overlay',
}) {
  const modalLayout = useModalScreenLayout();
  const screenLayout = useSubScreenLayout();
  const layout = presentation === 'overlay' ? screenLayout : modalLayout;

  const [startedAt, setStartedAt] = useState('');
  const [expectedEndAt, setExpectedEndAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [datePickerField, setDatePickerField] = useState(null);

  useEffect(() => {
    if (visible && medication) {
      setStartedAt(getTodayString());
      setExpectedEndAt('');
      setDatePickerField(null);
      setRegistrationComplete(false);
    }
  }, [visible, medication?.id]);

  const handleClose = useCallback(() => {
    if (saving) return;
    setRegistrationComplete(false);
    onClose?.();
  }, [saving, onClose]);

  const handleContinueSearch = useCallback(() => {
    setRegistrationComplete(false);
    if (onContinueSearch) onContinueSearch();
    else onClose?.();
  }, [onContinueSearch, onClose]);

  const handleGoToList = useCallback(() => {
    onRegistered?.({ goToList: true });
  }, [onRegistered]);

  const datePickerConfig = useMemo(() => {
    const today = new Date();
    const startedDate = parseDateString(startedAt);
    const expectedDate = parseDateString(expectedEndAt);

    if (datePickerField === 'expected_end_at') {
      return {
        value: expectedDate || startedDate || today,
        minimumDate: startedDate || getDefaultMinimumDate(),
        maximumDate: getFarFutureDate(),
        title: '종료 예정일',
        hint: '선택 사항이에요. 시작일 이후 날짜를 골라 주세요.',
      };
    }

    return {
      value: startedDate || today,
      minimumDate: getDefaultMinimumDate(),
      maximumDate: expectedDate || today,
      title: '복용 시작일',
      hint: expectedEndAt
        ? '종료 예정일 이전 날짜만 선택할 수 있어요.'
        : '최근 10년 이내 날짜만 선택할 수 있어요.',
    };
  }, [datePickerField, startedAt, expectedEndAt]);

  const handleRegister = async () => {
    if (!medication || saving) return;

    const start = startedAt.trim();
    const end = expectedEndAt.trim();

    if (!isValidCalendarDate(start)) {
      Alert.alert('입력 오류', '복용 시작일을 선택해 주세요.');
      return;
    }
    if (end && !isValidCalendarDate(end)) {
      Alert.alert('입력 오류', '예상 종료일이 올바르지 않습니다.');
      return;
    }
    if (end && end < start) {
      Alert.alert('입력 오류', '예상 종료일이 복용 시작일보다 빠를 수 없습니다.');
      return;
    }

    setSaving(true);
    try {
      await medicationsAPI.addMyMedication({
        medication_id: medication.id,
        is_current: true,
        started_at: start,
        expected_end_at: end || null,
      });
      useRecordCacheStore.getState().invalidateMedicationsTab('current');
      setRegistrationComplete(true);
    } catch (err) {
      let errorMsg = '등록에 실패했습니다.';
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        errorMsg = detail;
      } else if (Array.isArray(detail)) {
        errorMsg = detail
          .map((d) => {
            const fieldName = d.loc ? d.loc[d.loc.length - 1] : '';
            const koreanField =
              fieldName === 'started_at'
                ? '복용 시작일'
                : fieldName === 'expected_end_at'
                  ? '예상 종료일'
                  : fieldName;
            return `${koreanField ? `[${koreanField}] ` : ''}${d.msg}`;
          })
          .join('\n');
      }
      Alert.alert('오류', errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const isOpen = visible && medication != null;
  if (!isOpen || !medication) return null;

  const shellStyle = presentation === 'overlay' ? styles.overlayShell : undefined;

  const content = registrationComplete ? (
    <View
      style={[styles.root, presentation === 'modal' ? modalLayout.rootStyle : styles.overlayRoot]}
    >
      <RegisterSuccessPanel onContinueSearch={handleContinueSearch} onGoToList={handleGoToList} />
    </View>
  ) : (
    <View
      style={[styles.root, presentation === 'modal' ? modalLayout.rootStyle : styles.overlayRoot]}
    >
      <SubScreenRoot onBack={handleClose} enabled={!datePickerField}>
        <SubScreenTopBar
          title="약물 등록"
          dateLabel="복용 정보"
          onBack={handleClose}
          headerPaddingTop={layout.headerPaddingTop}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: layout.scrollPaddingBottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[searchStyles.filterPanel, styles.registerPanel]}>
            <MedicationHero medication={medication} />
            <View style={searchStyles.panelDivider} />

            <SectionCard title="복용 시작일" subtitle="필수" style={styles.dateSection}>
              <TouchableOpacity
                activeOpacity={0.78}
                style={styles.dateChip}
                onPress={() => setDatePickerField('started_at')}
                disabled={saving}
              >
                <Ionicons name="calendar-outline" size={16} color={RECORD_COLORS.olive} />
                <Text style={styles.dateChipText}>{startedAt || '날짜 선택'}</Text>
              </TouchableOpacity>
            </SectionCard>

            <SectionCard title="종료 예정일" subtitle="선택" style={styles.dateSection}>
              <TouchableOpacity
                activeOpacity={0.78}
                style={styles.dateChip}
                onPress={() => setDatePickerField('expected_end_at')}
                disabled={saving}
              >
                <Ionicons name="calendar-outline" size={16} color={RECORD_COLORS.olive} />
                <Text style={styles.dateChipText}>{expectedEndAt || '없음 (탭하여 설정)'}</Text>
              </TouchableOpacity>
              {expectedEndAt ? (
                <TouchableOpacity
                  activeOpacity={0.72}
                  style={styles.clearDateBtn}
                  onPress={() => setExpectedEndAt('')}
                  disabled={saving}
                >
                  <Text style={styles.clearDateBtnText}>종료 예정일 지우기</Text>
                </TouchableOpacity>
              ) : null}
            </SectionCard>
          </View>
        </ScrollView>

        <SubScreenFooter
          label="등록하기"
          onPress={handleRegister}
          saving={saving}
          icon="checkmark-circle-outline"
          footerPaddingBottom={layout.footerPaddingBottom}
        />
      </SubScreenRoot>

      <RegisterDatePickerSheet
        visible={!!datePickerField}
        value={datePickerConfig.value}
        title={datePickerConfig.title}
        hint={datePickerConfig.hint}
        minimumDate={datePickerConfig.minimumDate}
        maximumDate={datePickerConfig.maximumDate}
        onConfirm={(dateStr) => {
          if (datePickerField === 'expected_end_at') setExpectedEndAt(dateStr);
          else setStartedAt(dateStr);
          setDatePickerField(null);
        }}
        onDismiss={() => setDatePickerField(null)}
      />
    </View>
  );

  if (presentation === 'overlay') {
    return <View style={shellStyle}>{content}</View>;
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: RECORD_COLORS.bg },
  overlayShell: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: RECORD_COLORS.bg,
  },
  overlayRoot: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4 },
  registerPanel: { marginBottom: 0 },
  heroBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: RECORD_COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextBlock: { flex: 1 },
  heroName: { fontSize: 16, fontWeight: '900', color: RECORD_COLORS.text },
  heroMeta: { marginTop: 4, fontSize: 12, fontWeight: '700', color: RECORD_COLORS.muted },
  dateSection: { marginBottom: 0, padding: 0, borderWidth: 0, backgroundColor: 'transparent' },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: RECORD_COLORS.olive,
    backgroundColor: RECORD_COLORS.oliveSoft,
  },
  dateChipText: { fontSize: 14, fontWeight: '700', color: RECORD_COLORS.olive },
  clearDateBtn: { marginTop: 10, alignSelf: 'flex-start' },
  clearDateBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: RECORD_COLORS.muted,
    textDecorationLine: 'underline',
  },
  successPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  successIconWrap: { marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: '900', color: RECORD_COLORS.text },
  successBody: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
  },
  successActions: { marginTop: 28, width: '100%', gap: 10 },
  successSecondaryBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.card,
  },
  successSecondaryBtnText: { fontSize: 15, fontWeight: '800', color: RECORD_COLORS.text },
  successPrimaryBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: RECORD_COLORS.olive,
  },
  successPrimaryBtnText: { fontSize: 15, fontWeight: '800', color: RECORD_COLORS.white },
});

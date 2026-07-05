import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { medicationsAPI } from '../../../../api/medications';
import useRecordCacheStore from '../../../../stores/recordCacheStore';
import { RECORD_COLORS, shadowCard } from '../../record/components/SubScreenLayout';
import RegisterDatePickerSheet from '../../../components/search/RegisterDatePickerSheet';
import {
  getTodayString,
  isValidCalendarDate,
  parseDateString,
} from '../../../components/search/SearchScreenParts';
import { getDefaultMinimumDate } from '../../../components/search/searchDateUtils';

const SHEET_SLIDE_OFFSET = 500;

function getFarFutureDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 5);
  return d;
}

function MedicationHero({ medication }) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroIcon}>
        <Ionicons name="medkit" size={20} color={RECORD_COLORS.olive} />
      </View>
      <View style={styles.heroText}>
        <Text style={styles.heroName} numberOfLines={2}>
          {medication.name}
        </Text>
        {medication.form ? <Text style={styles.heroMeta}>{medication.form}</Text> : null}
      </View>
    </View>
  );
}

function SuccessPanel({ onContinueSearch, onGoToList }) {
  return (
    <View style={styles.successPanel}>
      <Ionicons name="checkmark-circle" size={46} color={RECORD_COLORS.olive} />
      <Text style={styles.successTitle}>등록 완료</Text>
      <Text style={styles.successBody}>내 약물에 추가됐어요.</Text>
      <View style={styles.successActions}>
        <TouchableOpacity
          style={styles.successSecondary}
          onPress={onContinueSearch}
          activeOpacity={0.82}
        >
          <Text style={styles.successSecondaryText}>계속 검색</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.successPrimary} onPress={onGoToList} activeOpacity={0.82}>
          <Text style={styles.successPrimaryText}>목록 보기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * @param {"modal"|"overlay"} presentation
 *   overlay — 검색 화면 위 절대배치 (RN Modal 중첩 크래시 방지)
 *   modal   — 독립 Modal bottom sheet
 */
export default function MedicationRegisterSheet({
  visible,
  medication,
  onClose,
  onContinueSearch,
  onRegistered,
  presentation = 'overlay',
}) {
  const insets = useSafeAreaInsets();
  const [startedAt, setStartedAt] = useState('');
  const [expectedEndAt, setExpectedEndAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [datePickerField, setDatePickerField] = useState(null);

  const medicationRef = useRef(medication);
  if (medication) medicationRef.current = medication;
  const displayMedication = medication ?? medicationRef.current;

  const [rendered, setRendered] = useState(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SHEET_SLIDE_OFFSET)).current;
  const isOpen = visible && medication != null;

  useEffect(() => {
    if (visible && medication) {
      setStartedAt(getTodayString());
      setExpectedEndAt('');
      setSaving(false);
      setDone(false);
      setDatePickerField(null);
    }
  }, [visible, medication?.id]);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(SHEET_SLIDE_OFFSET);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return undefined;
    }

    if (!rendered) return undefined;

    const closeAnim = Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetTranslateY, {
        toValue: SHEET_SLIDE_OFFSET,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    closeAnim.start(({ finished }) => {
      if (finished) setRendered(false);
    });
    return () => closeAnim.stop();
  }, [visible, rendered, backdropOpacity, sheetTranslateY]);

  const handleClose = useCallback(() => {
    if (saving) return;
    onClose?.();
  }, [saving, onClose]);

  const handleRegister = async () => {
    if (!displayMedication || saving) return;
    const start = startedAt.trim();
    const end = expectedEndAt.trim();
    if (!isValidCalendarDate(start)) {
      Alert.alert('입력 오류', '복용 시작일을 선택해 주세요.');
      return;
    }
    if (end && end < start) {
      Alert.alert('입력 오류', '종료 예정일이 시작일보다 빠를 수 없습니다.');
      return;
    }
    setSaving(true);
    try {
      await medicationsAPI.addMyMedication({
        medication_id: displayMedication.id,
        is_current: true,
        started_at: start,
        expected_end_at: end || null,
      });
      useRecordCacheStore.getState().invalidateMedicationsTab('current');
      setDone(true);
      onRegistered?.({ refreshOnly: true });
    } catch (err) {
      const detail = err.response?.data?.detail;
      Alert.alert('오류', typeof detail === 'string' ? detail : '등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

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
      hint: '최근 10년 이내 날짜만 선택할 수 있어요.',
    };
  }, [datePickerField, startedAt, expectedEndAt]);

  if (presentation === 'overlay' && !isOpen && !rendered) return null;
  if (presentation === 'modal' && (!isOpen || !displayMedication)) return null;
  if (!displayMedication || !rendered) return null;

  const registerDatePicker = (
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
  );

  const sheetContent = (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity, top: insets.top }]}
        pointerEvents="auto"
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheetWrap,
          { transform: [{ translateY: sheetTranslateY }], backgroundColor: RECORD_COLORS.card },
        ]}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
          {done ? (
            <SuccessPanel
              onContinueSearch={() => onRegistered?.({ keepSearchOpen: true })}
              onGoToList={() => onRegistered?.({ goToList: true })}
            />
          ) : (
            <>
              <MedicationHero medication={displayMedication} />
              <View style={styles.divider} />

              <View style={styles.row}>
                <Text style={styles.rowLabel}>시작일</Text>
                <TouchableOpacity
                  style={styles.dateChip}
                  onPress={() => setDatePickerField('started_at')}
                  disabled={saving}
                  activeOpacity={0.78}
                >
                  <Ionicons name="calendar-outline" size={14} color={RECORD_COLORS.olive} />
                  <Text style={styles.dateChipText}>{startedAt || '날짜 선택'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.row}>
                <Text style={styles.rowLabel}>종료 예정일</Text>
                <TouchableOpacity
                  style={[styles.dateChip, !expectedEndAt && styles.dateChipEmpty]}
                  onPress={() => setDatePickerField('expected_end_at')}
                  disabled={saving}
                  activeOpacity={0.78}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={expectedEndAt ? RECORD_COLORS.olive : RECORD_COLORS.muted}
                  />
                  <Text style={[styles.dateChipText, !expectedEndAt && styles.dateChipTextMuted]}>
                    {expectedEndAt || '설정 안 함'}
                  </Text>
                </TouchableOpacity>
                {expectedEndAt ? (
                  <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={() => setExpectedEndAt('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    disabled={saving}
                  >
                    <Ionicons name="close-circle" size={16} color={RECORD_COLORS.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <TouchableOpacity
                style={[styles.confirmBtn, saving && styles.confirmBtnDisabled]}
                onPress={handleRegister}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={styles.confirmBtnText}>등록하기</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </Animated.View>
    </View>
  );

  if (presentation === 'overlay') {
    return (
      <View style={styles.overlayShell} pointerEvents="box-none">
        {sheetContent}
        {registerDatePicker}
      </View>
    );
  }

  return (
    <Modal visible={rendered} transparent animationType="none">
      {sheetContent}
      {registerDatePicker}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayShell: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 30,
  },
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  sheetWrap: {
    width: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 14,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: RECORD_COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },
  heroName: {
    fontSize: 15,
    fontWeight: '900',
    color: RECORD_COLORS.text,
    lineHeight: 21,
  },
  heroMeta: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  divider: {
    height: 1,
    backgroundColor: RECORD_COLORS.line,
    marginVertical: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowLabel: {
    width: 72,
    fontSize: 13,
    fontWeight: '700',
    color: RECORD_COLORS.muted,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: RECORD_COLORS.olive,
    backgroundColor: RECORD_COLORS.oliveSoft,
  },
  dateChipEmpty: {
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
  },
  dateChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: RECORD_COLORS.olive,
  },
  dateChipTextMuted: { color: RECORD_COLORS.muted },
  clearBtn: { padding: 2 },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 25,
    backgroundColor: RECORD_COLORS.olive,
    marginTop: 4,
    ...shadowCard,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
  },
  successPanel: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: RECORD_COLORS.text,
    marginTop: 4,
  },
  successBody: {
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  successActions: {
    width: '100%',
    gap: 8,
    marginTop: 12,
  },
  successSecondary: {
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.card,
  },
  successSecondaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: RECORD_COLORS.text,
  },
  successPrimary: {
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: RECORD_COLORS.olive,
  },
  successPrimaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clampDate, dateToString, getDefaultMinimumDate } from './searchDateUtils';
import { SEARCH_COLORS } from './searchTheme';
import { RECORD_COLORS } from '../../screens/record/components/SubScreenLayout';

const SHEET_SLIDE_OFFSET = 420;

export default function RegisterDatePickerSheet({
  visible,
  value,
  title = '사용 시작일',
  hint = '최근 10년 이내 날짜만 선택할 수 있어요.',
  maximumDate = new Date(),
  minimumDate,
  onConfirm,
  onDismiss,
}) {
  const insets = useSafeAreaInsets();
  const minDate = useMemo(() => minimumDate ?? getDefaultMinimumDate(), [minimumDate]);
  const [draft, setDraft] = useState(value);
  const [rendered, setRendered] = useState(visible);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SHEET_SLIDE_OFFSET)).current;

  useEffect(() => {
    if (visible) {
      setDraft(clampDate(value, minDate, maximumDate));
    }
  }, [visible, value, minDate, maximumDate]);

  useEffect(() => {
    if (Platform.OS === 'android') return undefined;

    if (visible) {
      setRendered(true);
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(SHEET_SLIDE_OFFSET);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
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
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
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

  if (Platform.OS === 'android') {
    if (!visible) return null;

    return (
      <DateTimePicker
        value={draft}
        mode="date"
        display="default"
        minimumDate={minDate}
        maximumDate={maximumDate}
        onChange={(event, selectedDate) => {
          onDismiss();
          if (event?.type === 'dismissed' || !selectedDate) return;
          onConfirm(dateToString(selectedDate));
        }}
      />
    );
  }

  if (!rendered) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity, top: insets.top }]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onDismiss} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: 28 + insets.bottom, transform: [{ translateY: sheetTranslateY }] },
          ]}
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{hint}</Text>
          <DateTimePicker
            value={draft}
            mode="date"
            display="inline"
            locale="ko-KR"
            minimumDate={minDate}
            maximumDate={maximumDate}
            onChange={(_, selectedDate) => {
              if (selectedDate) {
                setDraft(clampDate(selectedDate, minDate, maximumDate));
              }
            }}
            style={styles.calendar}
            textColor={RECORD_COLORS.text}
            accentColor={RECORD_COLORS.olive}
            themeVariant="light"
          />
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => {
              onConfirm(dateToString(draft));
              onDismiss();
            }}
            activeOpacity={0.82}
          >
            <Text style={styles.doneBtnText}>완료</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  sheet: {
    backgroundColor: SEARCH_COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 20,
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: RECORD_COLORS.text,
    textAlign: 'center',
  },
  hint: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
    marginBottom: 4,
  },
  calendar: {
    width: '100%',
    height: 340,
  },
  doneBtn: {
    marginTop: 4,
    height: 48,
    borderRadius: 14,
    backgroundColor: RECORD_COLORS.olive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});

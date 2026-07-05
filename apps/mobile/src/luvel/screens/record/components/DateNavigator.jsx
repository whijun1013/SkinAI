import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Platform } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  olive: '#4F603C',
  oliveSoft: '#E8EEDD',
  muted: '#8B9184',
  text: '#1F2520',
  line: '#D9D6CC',
  card: '#FFFCF7',
  white: '#FFFFFF',
};

/** complete=3개 모두, partial=1~2개, none=없음 */
const DOT_COLORS = {
  complete: '#4F603C',
  partial: '#D4A72C',
  none: '#D97B7B',
};

const MIN_YEAR = 2000;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const CALENDAR_WEEKS = 6;
const DAY_CELL_HEIGHT = 44;
const DATE_ROW_HEIGHT = 56;
const YEAR_ROW_HEIGHT = 34;
const LEGEND_HEIGHT = 22;
const EXPANDED_PANEL_HEIGHT =
  DATE_ROW_HEIGHT +
  1 +
  12 +
  YEAR_ROW_HEIGHT +
  40 +
  20 +
  CALENDAR_WEEKS * DAY_CELL_HEIGHT +
  8 +
  36 +
  12 +
  LEGEND_HEIGHT;

export function toDateStr(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromDateStr(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(dateObj) {
  const d = new Date(dateObj);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a, b) {
  return toDateStr(a) === toDateStr(b);
}

function getDateLabel(dateObj) {
  const today = startOfDay(new Date());
  const target = startOfDay(dateObj);
  const diffDays = Math.round((today - target) / 86400000);

  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';

  return `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일`;
}

function buildMonthGrid(viewYear, viewMonth) {
  const firstDay = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const totalCells = CALENDAR_WEEKS * 7;

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(viewYear, viewMonth, day));
  }
  while (cells.length < totalCells) cells.push(null);
  return cells;
}

function DateRow({ target, expanded, canGoBack, canGoNext, onGoDay, onToggleCalendar }) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={() => onGoDay(-1)}
        disabled={!canGoBack}
        style={[styles.arrow, !canGoBack && styles.arrowDisabled]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="chevron-back" size={20} color={canGoBack ? COLORS.olive : COLORS.line} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.labelButton} onPress={onToggleCalendar} activeOpacity={0.75}>
        <Text style={styles.labelMain}>{getDateLabel(target)}</Text>
        <View style={styles.labelSubRow}>
          <Text style={styles.labelSub}>{toDateStr(target)}</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={COLORS.muted}
            style={{ marginLeft: 4 }}
          />
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => onGoDay(1)}
        disabled={!canGoNext}
        style={[styles.arrow, !canGoNext && styles.arrowDisabled]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="chevron-forward" size={20} color={canGoNext ? COLORS.olive : COLORS.line} />
      </TouchableOpacity>
    </View>
  );
}

function RecordDot({ status, selected }) {
  const dotColor = DOT_COLORS[status];
  if (!dotColor) return null;
  return <View style={[styles.dayDot, { backgroundColor: selected ? COLORS.white : dotColor }]} />;
}

function DayCellContent({ dayNum, status, selected, disabled }) {
  return (
    <>
      <Text
        style={[
          styles.dayText,
          disabled && styles.dayTextDisabled,
          selected && styles.dayTextSelected,
        ]}
      >
        {dayNum}
      </Text>
      {!disabled && <RecordDot status={status} selected={selected} />}
    </>
  );
}

function CalendarPanel({
  viewYear,
  viewMonth,
  target,
  today,
  min,
  max,
  markedDates = {},
  canGoYearBack,
  canGoYearNext,
  onGoYear,
  onGoMonth,
  onSelectDate,
  onGoToToday,
  showYearNav,
}) {
  const monthCells = buildMonthGrid(viewYear, viewMonth);

  const isSelectable = (dayObj) => {
    const d = startOfDay(dayObj);
    return d >= min && d <= max;
  };

  return (
    <View style={styles.calendar}>
      <View style={styles.yearHeader}>
        {showYearNav ? (
          <>
            <TouchableOpacity
              onPress={() => onGoYear(-1)}
              disabled={!canGoYearBack}
              style={[styles.yearArrow, !canGoYearBack && styles.yearArrowDisabled]}
              hitSlop={8}
            >
              <Ionicons
                name="chevron-back"
                size={16}
                color={canGoYearBack ? COLORS.olive : COLORS.line}
              />
            </TouchableOpacity>
            <Text style={styles.yearTitle}>{viewYear}년</Text>
            <TouchableOpacity
              onPress={() => onGoYear(1)}
              disabled={!canGoYearNext}
              style={[styles.yearArrow, !canGoYearNext && styles.yearArrowDisabled]}
              hitSlop={8}
            >
              <Ionicons
                name="chevron-forward"
                size={16}
                color={canGoYearNext ? COLORS.olive : COLORS.line}
              />
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.yearTitleStatic}>{viewYear}년</Text>
        )}
      </View>

      <View style={styles.monthHeader}>
        <TouchableOpacity onPress={() => onGoMonth(-1)} style={styles.monthArrow} hitSlop={8}>
          <Ionicons name="chevron-back" size={18} color={COLORS.olive} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{viewMonth + 1}월</Text>
        <TouchableOpacity onPress={() => onGoMonth(1)} style={styles.monthArrow} hitSlop={8}>
          <Ionicons name="chevron-forward" size={18} color={COLORS.olive} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekdayRow} pointerEvents="none">
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {monthCells.map((dayObj, idx) => {
          if (!dayObj) {
            return <View key={`empty-${idx}`} style={styles.dayCell} />;
          }

          const selectable = isSelectable(dayObj);
          const selected = isSameDay(dayObj, target);
          const dateKey = toDateStr(dayObj);
          const status = selectable ? (markedDates[dateKey] ?? 'none') : null;

          if (!selectable) {
            return (
              <View key={dateKey} style={styles.dayCell}>
                <DayCellContent dayNum={dayObj.getDate()} disabled />
              </View>
            );
          }

          return (
            <Pressable
              key={dateKey}
              style={[styles.dayCell, selected && styles.dayCellSelected]}
              onPress={() => onSelectDate(dayObj)}
            >
              <DayCellContent dayNum={dayObj.getDate()} status={status} selected={selected} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legendRow} pointerEvents="none">
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: DOT_COLORS.complete }]} />
          <Text style={styles.legendText}>완료</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: DOT_COLORS.partial }]} />
          <Text style={styles.legendText}>일부</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: DOT_COLORS.none }]} />
          <Text style={styles.legendText}>없음</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.todayButton} onPress={onGoToToday}>
        <Text style={styles.todayButtonText}>오늘로 이동</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function DateNavigator({
  date,
  onDateChange,
  maxDate,
  minDate,
  markedDates = {},
  onViewMonthChange,
  refreshKey = 0,
}) {
  const cardRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [anchor, setAnchor] = useState(null);

  const today = startOfDay(new Date());
  const max = startOfDay(maxDate ?? today);
  // minDate 미전달 시 2000-01-01. RecordScreen에서는 users.created_at(가입일) 전달
  const parsedMin = minDate ? startOfDay(minDate) : null;
  const min =
    parsedMin && !Number.isNaN(parsedMin.getTime())
      ? parsedMin
      : startOfDay(new Date(MIN_YEAR, 0, 1));

  const target = startOfDay(date);
  const targetDateStr = toDateStr(target);
  const canGoBack = target > min;
  const canGoNext = target < max;

  const [viewYear, setViewYear] = useState(target.getFullYear());
  const [viewMonth, setViewMonth] = useState(target.getMonth());

  const minYear = min.getFullYear();
  const maxYear = today.getFullYear();
  const showYearNav = minYear < maxYear;
  const canGoYearBack = viewYear > minYear;
  const canGoYearNext = viewYear < maxYear;

  const closeCalendar = () => setExpanded(false);

  // 캘린더 닫힌 상태에서만 선택 날짜와 보기 월 동기화 (열린 채 스와이프 탐색 유지)
  useEffect(() => {
    if (expanded) return;
    const synced = fromDateStr(targetDateStr);
    setViewYear(synced.getFullYear());
    setViewMonth(synced.getMonth());
  }, [targetDateStr, expanded]);

  // 보이는 연·월이 바뀌거나 기록 refresh 시 해당 월 dot 데이터만 요청
  useEffect(() => {
    onViewMonthChange?.(viewYear, viewMonth + 1);
  }, [viewYear, viewMonth, onViewMonthChange, refreshKey]);

  const goDay = (delta) => {
    const next = new Date(target);
    next.setDate(next.getDate() + delta);
    onDateChange(next);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const goMonth = (delta) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };
  const goMonthRef = useRef(goMonth);
  goMonthRef.current = goMonth;

  const goYear = (delta) => {
    const nextYear = viewYear + delta;
    if (nextYear < minYear || nextYear > maxYear) return;
    setViewYear(nextYear);
  };

  const applyDateInModal = (dayObj) => {
    const d = startOfDay(dayObj);
    if (d < min || d > max) return;
    onDateChange(d);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const goToTodayInModal = () => applyDateInModal(today);

  const selectDate = (dayObj) => {
    applyDateInModal(dayObj);
  };

  const openCalendar = () => {
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());

    cardRef.current?.measureInWindow((x, y, width) => {
      setAnchor({ top: y, left: x, width });
      setExpanded(true);
    });
  };

  const toggleCalendar = () => {
    if (expanded) closeCalendar();
    else openCalendar();
  };

  const monthSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        // 20px 이상 좌우로 움직여야 스와이프로 인식 → 짧은 탭(날짜 선택)은 그대로 동작
        .activeOffsetX([-20, 20])
        .failOffsetY([-30, 30])
        .onEnd((e) => {
          if (e.translationX > 50) goMonthRef.current(-1);
          else if (e.translationX < -50) goMonthRef.current(1);
        }),
    []
  );

  const rowProps = {
    target,
    expanded,
    canGoBack,
    canGoNext,
    onGoDay: goDay,
    onToggleCalendar: toggleCalendar,
  };

  return (
    <>
      {/* 접힌 상태 — 화면에 보이는 날짜 카드 */}
      <View
        ref={cardRef}
        style={[styles.card, expanded && styles.cardPlaceholder]}
        collapsable={false}
      >
        <DateRow {...rowProps} />
      </View>

      {/* 펼친 상태 — 같은 위치에서 카드가 아래로 확장 + 반투명 배경 */}
      <Modal visible={expanded} transparent animationType="fade" onRequestClose={closeCalendar}>
        <GestureHandlerRootView style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={closeCalendar} />

          {anchor && (
            <GestureDetector gesture={monthSwipeGesture}>
              <View
                style={[
                  styles.card,
                  styles.cardExpanded,
                  { top: anchor.top, left: anchor.left, width: anchor.width },
                ]}
              >
                <DateRow {...rowProps} />
                <View style={styles.expandDivider} />
                <CalendarPanel
                  viewYear={viewYear}
                  viewMonth={viewMonth}
                  target={target}
                  today={today}
                  min={min}
                  max={max}
                  markedDates={markedDates}
                  canGoYearBack={canGoYearBack}
                  canGoYearNext={canGoYearNext}
                  showYearNav={showYearNav}
                  onGoYear={goYear}
                  onGoMonth={goMonth}
                  onSelectDate={selectDate}
                  onGoToToday={goToTodayInModal}
                />
              </View>
            </GestureDetector>
          )}
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}

const shadowCard =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#1F2520',
        shadowOpacity: 0.1,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      }
    : { elevation: 6 };

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 12,
    ...shadowCard,
  },
  cardPlaceholder: {
    opacity: 0,
  },
  cardExpanded: {
    position: 'absolute',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingBottom: 12,
    zIndex: 10,
    height: EXPANDED_PANEL_HEIGHT,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: {
    backgroundColor: 'transparent',
  },
  labelButton: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  labelMain: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  labelSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  labelSub: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
  },
  overlay: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(31, 37, 32, 0.38)',
  },
  expandDivider: {
    height: 1,
    backgroundColor: COLORS.line,
    marginHorizontal: 4,
  },
  calendar: {
    paddingTop: 12,
    paddingHorizontal: 2,
    flex: 1,
    position: 'relative',
  },
  yearHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    gap: 12,
  },
  yearArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearArrowDisabled: {
    backgroundColor: 'transparent',
  },
  yearTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    minWidth: 64,
    textAlign: 'center',
  },
  yearTitleStatic: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.muted,
    textAlign: 'center',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  monthArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    height: CALENDAR_WEEKS * DAY_CELL_HEIGHT,
  },
  dayCell: {
    width: '14.28%',
    height: DAY_CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    backgroundColor: COLORS.olive,
    borderRadius: 12,
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 2,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  dayTextDisabled: {
    color: COLORS.line,
  },
  dayTextSelected: {
    color: COLORS.white,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginTop: 4,
    marginBottom: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
  },
  todayButton: {
    alignSelf: 'center',
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: COLORS.oliveSoft,
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.olive,
  },
});

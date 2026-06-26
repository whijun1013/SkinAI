import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

// ─── 색상 ─────────────────────────────────────────────────────────────────────
const C = {
  olive:     '#4A7C59',
  oliveSoft: '#E6F0E9',
  oliveMid:  '#3A6B4A',
  muted:     '#8B9184',
  text:      '#1F2520',
  line:      '#D9D6CC',
  card:      '#FFFCF7',
  bg:        '#F8F7F2',
  white:     '#FFFFFF',
};

const DOT_COLORS = {
  complete: C.olive,
  partial:  '#D4A72C',
  none:     '#D97B7B',
};

const WEEKDAY_LABELS      = ['월', '화', '수', '목', '금', '토', '일'];
const FULL_WEEKDAY_LABELS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
const MIN_YEAR     = 2000;
const WEEKS_BEFORE = 52;
const WEEKS_AFTER  = 4;

function getWeekdayIndex(dateObj) {
  const dow = dateObj.getDay();
  return (dow + 6) % 7;
}

// ─── 캘린더 상수 ──────────────────────────────────────────────────────────────
const CALENDAR_WEEKS  = 6;
const CAL_CELL_H      = 44;
const CAL_CIRCLE      = 36;
const CAL_HEADER_H    = 86;
const CAL_WEEKDAY_H   = 30;
const CAL_FOOTER_H    = 48;
const CALENDAR_PANEL_H =
  CAL_HEADER_H + CAL_WEEKDAY_H + CALENDAR_WEEKS * CAL_CELL_H + CAL_FOOTER_H;

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
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

function addDays(dateObj, days) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + days);
  return d;
}

function getMondayOfWeek(dateObj) {
  const d = startOfDay(dateObj);
  const dow = d.getDay();
  d.setDate(d.getDate() - ((dow + 6) % 7));
  return d;
}

function getWeekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function buildMonthGrid(viewYear, viewMonth) {
  const firstDay     = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const totalCells   = CALENDAR_WEEKS * 7;
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(viewYear, viewMonth, day));
  while (cells.length < totalCells) cells.push(null);
  return cells;
}

// ─── CalendarPanel ────────────────────────────────────────────────────────────
function CalendarPanel({
  viewYear, viewMonth, target, today, min, max, markedDates = {},
  canGoYearBack, canGoYearNext, onGoYear, onGoMonth, onSelectDate, onGoToToday, showYearNav,
}) {
  const monthCells = buildMonthGrid(viewYear, viewMonth);

  return (
    <View style={{ flex: 1 }}>

      {/* ── 올리브 헤더 ── */}
      <View style={calStyles.calHeader}>
        <View style={calStyles.yearRow}>
          {showYearNav ? (
            <>
              <TouchableOpacity
                onPress={() => onGoYear(-1)}
                disabled={!canGoYearBack}
                hitSlop={10}
                style={[calStyles.headerMiniBtn, !canGoYearBack && { opacity: 0.3 }]}
              >
                <Ionicons name="chevron-back" size={12} color={C.white} />
              </TouchableOpacity>
              <Text style={calStyles.yearLabel}>{viewYear}년</Text>
              <TouchableOpacity
                onPress={() => onGoYear(1)}
                disabled={!canGoYearNext}
                hitSlop={10}
                style={[calStyles.headerMiniBtn, !canGoYearNext && { opacity: 0.3 }]}
              >
                <Ionicons name="chevron-forward" size={12} color={C.white} />
              </TouchableOpacity>
            </>
          ) : (
            <Text style={calStyles.yearLabel}>{viewYear}년</Text>
          )}
        </View>

        <View style={calStyles.monthNavRow}>
          <TouchableOpacity
            onPress={() => onGoMonth(-1)}
            hitSlop={8}
            style={calStyles.headerArrowBtn}
          >
            <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <Text style={calStyles.headerMonthText}>{viewMonth + 1}월</Text>
          <TouchableOpacity
            onPress={() => onGoMonth(1)}
            hitSlop={8}
            style={calStyles.headerArrowBtn}
          >
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 그리드 본문 ── */}
      <View style={calStyles.calBody}>

        <View style={calStyles.weekdayRow}>
          {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
            <Text
              key={w}
              style={[calStyles.weekdayLabel, (i === 0 || i === 6) && calStyles.weekdayWeekend]}
            >
              {w}
            </Text>
          ))}
        </View>

        <View style={calStyles.grid}>
          {monthCells.map((dayObj, idx) => {
            if (!dayObj) return <View key={`empty-${idx}`} style={calStyles.dayCell} />;

            const d          = startOfDay(dayObj);
            const selectable = d >= min && d <= max;
            const selected   = isSameDay(dayObj, target);
            const isToday    = isSameDay(dayObj, today);
            const dateKey    = toDateStr(dayObj);
            const status     = selectable ? (markedDates[dateKey] ?? null) : null;
            const dotColor   = status ? DOT_COLORS[status] : null;
            const col        = idx % 7;
            const isWeekend  = col === 0 || col === 6;

            return (
              <Pressable
                key={dateKey}
                style={calStyles.dayCell}
                onPress={() => selectable && onSelectDate(dayObj)}
                disabled={!selectable}
              >
                <View style={[
                  calStyles.circle,
                  selected            && calStyles.circleSelected,
                  !selected && isToday && calStyles.circleToday,
                  !selectable         && calStyles.circleDisabled,
                ]}>
                  <Text style={[
                    calStyles.dayNum,
                    !selectable           && calStyles.dayNumDisabled,
                    selected              && calStyles.dayNumSelected,
                    !selected && isToday  && calStyles.dayNumToday,
                    !selected && !isToday && isWeekend && selectable && calStyles.dayNumWeekend,
                  ]}>
                    {dayObj.getDate()}
                  </Text>
                </View>
                <View style={[
                  calStyles.dot,
                  dotColor && selectable
                    ? { backgroundColor: selected ? 'rgba(255,255,255,0.9)' : dotColor, opacity: 1 }
                    : { opacity: 0 },
                ]} />
              </Pressable>
            );
          })}
        </View>

        <View style={calStyles.footer}>
          <View style={calStyles.legend}>
            {[
              { key: 'complete', label: '완료' },
              { key: 'partial',  label: '일부' },
              { key: 'none',     label: '없음' },
            ].map(({ key, label }) => (
              <View key={key} style={calStyles.legendItem}>
                <View style={[calStyles.legendDot, { backgroundColor: DOT_COLORS[key] }]} />
                <Text style={calStyles.legendText}>{label}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={calStyles.todayBtn} onPress={onGoToToday} activeOpacity={0.8}>
            <Text style={calStyles.todayBtnText}>오늘</Text>
          </TouchableOpacity>
        </View>

      </View>
    </View>
  );
}

// ─── 주간 스트립 ─────────────────────────────────────────────────────────────
const WeekStrip = React.memo(function WeekStrip({ weekDays, target, today, min, max, markedDates, onSelectDay }) {
  return (
    <View style={stripStyles.row}>
      {weekDays.map((dayObj, i) => {
        const dateKey    = toDateStr(dayObj);
        const isSelected = isSameDay(dayObj, target);
        const isToday    = isSameDay(dayObj, today);
        const disabled   = dayObj > max || dayObj < min;
        const status     = !disabled ? (markedDates[dateKey] ?? null) : null;
        const dotColor   = status ? DOT_COLORS[status] : null;
        const isWeekend  = i >= 5;

        return (
          <TouchableOpacity
            key={dateKey}
            style={[
              stripStyles.cell,
              isSelected && stripStyles.cellSelected,
              !isSelected && isToday && stripStyles.cellToday,
              disabled && stripStyles.cellDisabled,
            ]}
            onPress={() => !disabled && onSelectDay(dayObj)}
            activeOpacity={disabled ? 1 : 0.7}
            disabled={disabled}
          >
            <Text style={[
              stripStyles.weekday,
              isSelected && stripStyles.weekdaySelected,
              !isSelected && isToday && stripStyles.weekdayToday,
              !isSelected && isWeekend && stripStyles.weekdayWeekend,
              disabled && stripStyles.weekdayDisabled,
            ]}>
              {WEEKDAY_LABELS[i]}
            </Text>
            <Text style={[
              stripStyles.dayNum,
              isSelected && stripStyles.dayNumSelected,
              !isSelected && isToday && stripStyles.dayNumToday,
              !isSelected && isWeekend && stripStyles.dayNumWeekend,
              disabled && stripStyles.dayNumDisabled,
            ]}>
              {dayObj.getDate()}
            </Text>
            <View style={stripStyles.dotSlot}>
              {dotColor && !disabled ? (
                <View style={[
                  stripStyles.dot,
                  { backgroundColor: isSelected ? 'rgba(255,255,255,0.75)' : dotColor },
                ]} />
              ) : (
                <View style={stripStyles.dotEmpty} />
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

// ─── 컨트롤러 훅 (공유 상태 + 로직) ──────────────────────────────────────────
export function useDateNavigatorController({
  date,
  onDateChange,
  maxDate,
  minDate,
  markedDates = {},
  onViewMonthChange,
  refreshKey = 0,
}) {
  const today  = startOfDay(new Date());
  const max    = startOfDay(maxDate ?? today);
  const parsedMin = minDate ? startOfDay(minDate) : null;
  const min    = parsedMin && !Number.isNaN(parsedMin.getTime())
    ? parsedMin
    : startOfDay(new Date(MIN_YEAR, 0, 1));

  const target = startOfDay(date);
  const { width: screenWidth } = useWindowDimensions();
  const stripW = screenWidth - 44;

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarAnchor, setCalendarAnchor] = useState(null);
  const headerRef = useRef(null);

  const [monday, setMonday] = useState(() => getMondayOfWeek(target));
  const isSelectedToday = isSameDay(target, today);

  useEffect(() => {
    onViewMonthChange?.(monday.getFullYear(), monday.getMonth() + 1);
  }, [monday, onViewMonthChange, refreshKey]);

  const flatRef          = useRef(null);
  const currentScrollIdx = useRef(WEEKS_BEFORE);
  const stripWRef        = useRef(stripW);
  stripWRef.current      = stripW;

  const allMondays = useMemo(() => {
    const result  = [];
    const baseMon = getMondayOfWeek(today);
    for (let i = -WEEKS_BEFORE; i <= WEEKS_AFTER; i++) {
      const m = new Date(baseMon);
      m.setDate(baseMon.getDate() + i * 7);
      result.push(m);
    }
    return result;
  }, []);

  const mondayIdx = useMemo(() => {
    const ms  = toDateStr(monday);
    const idx = allMondays.findIndex((m) => toDateStr(m) === ms);
    return idx >= 0 ? idx : WEEKS_BEFORE;
  }, [monday, allMondays]);

  useEffect(() => {
    if (!flatRef.current || mondayIdx === currentScrollIdx.current) return;
    flatRef.current.scrollToOffset({ offset: mondayIdx * stripWRef.current, animated: false });
    currentScrollIdx.current = mondayIdx;
  }, [mondayIdx]);

  const getItemLayout = useCallback(
    (_, idx) => ({ length: stripW, offset: stripW * idx, index: idx }),
    [stripW],
  );

  const targetRef        = useRef(target);
  targetRef.current      = target;
  const markedDatesRef   = useRef(markedDates);
  markedDatesRef.current = markedDates;
  const onDateChangeRef  = useRef(onDateChange);
  onDateChangeRef.current = onDateChange;

  const selectDay = useCallback(
    (dayObj) => onDateChangeRef.current(startOfDay(dayObj)),
    [],
  );

  const renderWeekItem = useCallback(({ item: itemMonday }) => (
    <View style={{ width: stripW }}>
      <WeekStrip
        weekDays={getWeekDays(itemMonday)}
        target={targetRef.current}
        today={today}
        min={min}
        max={max}
        markedDates={markedDatesRef.current}
        onSelectDay={selectDay}
      />
    </View>
  ), [stripW, today, min, max, selectDay]);

  const weekPanGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX([-12, 12])
      .failOffsetY([-8, 8])
      .runOnJS(true)
      .onUpdate((e) => {
        flatRef.current?.scrollToOffset({
          offset: currentScrollIdx.current * stripWRef.current - e.translationX,
          animated: false,
        });
      })
      .onEnd((e) => {
        const sw        = stripWRef.current;
        const threshold = sw * 0.25;
        const goNext = e.translationX < -threshold || e.velocityX < -500;
        const goPrev = e.translationX > threshold  || e.velocityX > 500;
        if (goNext || goPrev) {
          const newIdx = Math.max(0, Math.min(
            currentScrollIdx.current + (goNext ? 1 : -1),
            allMondays.length - 1,
          ));
          if (newIdx !== currentScrollIdx.current) {
            currentScrollIdx.current = newIdx;
            flatRef.current?.scrollToOffset({ offset: newIdx * sw, animated: true });
            setMonday(startOfDay(allMondays[newIdx]));
          }
        } else {
          flatRef.current?.scrollToOffset({
            offset: currentScrollIdx.current * sw,
            animated: true,
          });
        }
      }),
    [allMondays],
  );

  const openCalendar = () => {
    headerRef.current?.measureInWindow((x, y, width, height) => {
      setCalendarAnchor({ top: y + height + 6, left: x, width });
      setCalendarOpen(true);
    });
  };

  const [calViewYear, setCalViewYear]   = useState(target.getFullYear());
  const [calViewMonth, setCalViewMonth] = useState(target.getMonth());

  const minYear     = min.getFullYear();
  const maxYear     = today.getFullYear();
  const showYearNav = minYear < maxYear;

  const applyCalendarDate = (dayObj) => {
    const d = startOfDay(dayObj);
    if (d < min || d > max) return;
    onDateChange(d);
    setMonday(getMondayOfWeek(d));
    setCalViewYear(d.getFullYear());
    setCalViewMonth(d.getMonth());
  };

  const monthSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-30, 30])
        .onEnd((e) => {
          if (e.translationX > 50) {
            setCalViewMonth((m) => {
              const prev = new Date(calViewYear, m - 1, 1);
              setCalViewYear(prev.getFullYear());
              return prev.getMonth();
            });
          } else if (e.translationX < -50) {
            setCalViewMonth((m) => {
              const next = new Date(calViewYear, m + 1, 1);
              setCalViewYear(next.getFullYear());
              return next.getMonth();
            });
          }
        }),
    [calViewYear],
  );

  const dayIdx   = getWeekdayIndex(target);
  const dayLabel = FULL_WEEKDAY_LABELS[dayIdx];

  return {
    target, today, min, max, stripW,
    isSelectedToday, dayLabel,
    calendarOpen, setCalendarOpen,
    calendarAnchor,
    calViewYear, setCalViewYear,
    calViewMonth, setCalViewMonth,
    minYear, maxYear, showYearNav,
    headerRef, flatRef, currentScrollIdx, stripWRef,
    allMondays,
    selectDay, openCalendar, applyCalendarDate,
    weekPanGesture, monthSwipeGesture,
    renderWeekItem, getItemLayout,
    markedDates,
  };
}

// ─── 히어로 컴포넌트 (분리 export) ────────────────────────────────────────────
export function DateNavigatorHero({ ctl }) {
  const {
    headerRef, target, isSelectedToday, dayLabel,
    openCalendar, calendarOpen, setCalendarOpen,
    calendarAnchor,
    calViewYear, setCalViewYear,
    calViewMonth, setCalViewMonth,
    min, max, today, markedDates,
    minYear, maxYear, showYearNav,
    applyCalendarDate, monthSwipeGesture,
  } = ctl;

  return (
    <View
      ref={headerRef}
      collapsable={false}
      style={calendarOpen && styles.containerOpen}
    >
      <View style={styles.heroRow}>
        <Text style={styles.heroNum}>{target.getDate()}</Text>
        <View style={styles.heroMeta}>
          <Text style={styles.monthLabel}>
            {target.getFullYear()}년 {target.getMonth() + 1}월
          </Text>
          <Text style={styles.heroDayName}>{dayLabel}</Text>
          {isSelectedToday && (
            <View style={styles.todayChip}>
              <Text style={styles.todayChipText}>오늘</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={openCalendar}
          style={styles.calBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="calendar-outline" size={17} color={C.olive} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={calendarOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarOpen(false)}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Pressable
            style={calStyles.backdrop}
            onPress={() => setCalendarOpen(false)}
          />
          {calendarAnchor && (
            <GestureDetector gesture={monthSwipeGesture}>
              <View
                style={[
                  calStyles.modalCard,
                  {
                    top:   calendarAnchor.top,
                    left:  calendarAnchor.left,
                    width: calendarAnchor.width,
                  },
                ]}
              >
                <CalendarPanel
                  viewYear={calViewYear}
                  viewMonth={calViewMonth}
                  target={target}
                  today={today}
                  min={min}
                  max={max}
                  markedDates={markedDates}
                  canGoYearBack={calViewYear > minYear}
                  canGoYearNext={calViewYear < maxYear}
                  showYearNav={showYearNav}
                  onGoYear={(delta) => setCalViewYear((y) => y + delta)}
                  onGoMonth={(delta) => {
                    const next = new Date(calViewYear, calViewMonth + delta, 1);
                    setCalViewYear(next.getFullYear());
                    setCalViewMonth(next.getMonth());
                  }}
                  onSelectDate={(dayObj) => {
                    applyCalendarDate(dayObj);
                    setCalendarOpen(false);
                  }}
                  onGoToToday={() => {
                    applyCalendarDate(today);
                    setCalendarOpen(false);
                  }}
                />
              </View>
            </GestureDetector>
          )}
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

// ─── 스트립 컴포넌트 (분리 export) ────────────────────────────────────────────
export function DateNavigatorStrip({ ctl }) {
  const { weekPanGesture, flatRef, allMondays, renderWeekItem, getItemLayout, stripWRef, target } = ctl;

  return (
    <GestureDetector gesture={weekPanGesture}>
      <FlatList
        ref={flatRef}
        data={allMondays}
        renderItem={renderWeekItem}
        keyExtractor={(item) => toDateStr(item)}
        extraData={toDateStr(target)}
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        initialScrollIndex={WEEKS_BEFORE}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => {
            flatRef.current?.scrollToOffset({
              offset: index * stripWRef.current,
              animated: false,
            });
          }, 100);
        }}
        initialNumToRender={3}
        windowSize={5}
      />
    </GestureDetector>
  );
}

// ─── 기본 export (결합형, 하위 호환) ─────────────────────────────────────────
export default function DateNavigator({
  date,
  onDateChange,
  maxDate,
  minDate,
  markedDates = {},
  onViewMonthChange,
  refreshKey = 0,
}) {
  const ctl = useDateNavigatorController({
    date, onDateChange, maxDate, minDate, markedDates, onViewMonthChange, refreshKey,
  });

  return (
    <View
      style={[styles.container, ctl.calendarOpen && styles.containerOpen]}
      collapsable={false}
    >
      <DateNavigatorHero ctl={ctl} />
      <View style={styles.divider} />
      <DateNavigatorStrip ctl={ctl} />
    </View>
  );
}

// ─── 주간 스트립 스타일 ────────────────────────────────────────────────────────
const stripStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: 4,
    gap: 3,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 12,
    gap: 3,
  },
  cellSelected:    { backgroundColor: C.olive },
  cellToday:       { backgroundColor: C.oliveSoft },
  cellDisabled:    { opacity: 0.3 },

  weekday:         { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 0.2 },
  weekdaySelected: { color: 'rgba(255,255,255,0.75)' },
  weekdayToday:    { color: C.olive, fontWeight: '800' },
  weekdayWeekend:  { color: '#A07850' },
  weekdayDisabled: { color: C.line },

  dayNum:          { fontSize: 15, fontWeight: '800', color: C.text, lineHeight: 19 },
  dayNumSelected:  { color: C.white },
  dayNumToday:     { color: C.olive, fontWeight: '900' },
  dayNumWeekend:   { color: '#A07850' },
  dayNumDisabled:  { color: C.line },

  dotSlot:  { height: 5, alignItems: 'center', justifyContent: 'center' },
  dotEmpty: { width: 5, height: 5 },
  dot:      { width: 5, height: 5, borderRadius: 2.5 },
});

// ─── 컨테이너 / 히어로 스타일 ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 2,
    paddingTop: 2,
    paddingBottom: 4,
  },
  containerOpen: { opacity: 0 },

  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  heroNum: {
    fontSize: 56,
    fontWeight: '900',
    color: C.text,
    letterSpacing: -3,
    lineHeight: 60,
    includeFontPadding: false,
  },
  heroMeta: {
    flex: 1,
    gap: 2,
  },
  monthLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.olive,
    letterSpacing: 0.2,
  },
  heroDayName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
  },
  todayChip: {
    alignSelf: 'flex-start',
    backgroundColor: C.olive,
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 2,
  },
  todayChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: C.white,
    letterSpacing: 0.3,
  },
  calBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: C.line,
    marginBottom: 2,
  },
});

// ─── 캘린더 모달 스타일 ──────────────────────────────────────────────────────
const modalShadow = Platform.OS === 'ios'
  ? { shadowColor: '#0D1F12', shadowOpacity: 0.22, shadowRadius: 28, shadowOffset: { width: 0, height: 12 } }
  : { elevation: 14 };

const calStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,22,14,0.45)',
  },
  modalCard: {
    position: 'absolute',
    backgroundColor: C.card,
    borderRadius: 22,
    overflow: 'hidden',
    height: CALENDAR_PANEL_H,
    zIndex: 10,
    ...modalShadow,
  },

  calHeader: {
    backgroundColor: C.olive,
    height: CAL_HEADER_H,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    justifyContent: 'space-between',
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  yearLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.3,
    minWidth: 48,
    textAlign: 'center',
  },
  headerMiniBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMonthText: {
    fontSize: 26,
    fontWeight: '900',
    color: C.white,
    letterSpacing: -1,
  },

  calBody: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 0,
  },

  weekdayRow: {
    flexDirection: 'row',
    height: CAL_WEEKDAY_H,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    marginBottom: 2,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
  },
  weekdayWeekend: { color: '#B07040' },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    height: CALENDAR_WEEKS * CAL_CELL_H,
  },
  dayCell: {
    width: '14.28%',
    height: CAL_CELL_H,
    alignItems: 'center',
    justifyContent: 'center',
  },

  circle: {
    width: CAL_CIRCLE,
    height: CAL_CIRCLE,
    borderRadius: CAL_CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleSelected:  { backgroundColor: C.olive },
  circleToday:     { backgroundColor: C.oliveSoft },
  circleDisabled:  { opacity: 0.28 },

  dayNum:         { fontSize: 15, fontWeight: '700', color: C.text },
  dayNumDisabled: { color: C.muted },
  dayNumSelected: { color: C.white, fontWeight: '800' },
  dayNumToday:    { color: C.olive, fontWeight: '900' },
  dayNumWeekend:  { color: '#A07850' },

  dot: { width: 5, height: 5, borderRadius: 2.5 },

  footer: {
    height: CAL_FOOTER_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingHorizontal: 6,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot:  { width: 9, height: 9, borderRadius: 4.5 },
  legendText: { fontSize: 12, fontWeight: '700', color: C.muted },
  todayBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: C.olive,
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
    letterSpacing: 0.2,
  },
});

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { WEEKDAY_LABELS, isFutureDateKey, parseDateKey } from "./reportUtils";
import { COLORS, FONT } from "./reportTheme";

// 캘린더 전용 추가 토큰
const COLORS_EX = {
  surfaceSoft: "#F2F4EE",
  oliveMid:    "#C8D8B8",
};

const shadowPanel =
  Platform.OS === "ios"
    ? {
        shadowColor: "#000000",
        shadowOpacity: 0.10,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
      }
    : { elevation: 10 };

// ─── 상수 ────────────────────────────────────────────────────────────────────
const DAY_CELL_HEIGHT = 46;
const CALENDAR_WEEKS  = 6;
const PANEL_H_PADDING = 20;

const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const TODAY_KEY = `${TODAY.getFullYear()}-${String(TODAY.getMonth()+1).padStart(2,"0")}-${String(TODAY.getDate()).padStart(2,"0")}`;
const MIN_YEAR = 2020;

// ─── 유틸 ────────────────────────────────────────────────────────────────────
function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function formatRangeLabel(startKey, endKey) {
  const s = parseDateKey(startKey);
  const e = parseDateKey(endKey);
  if (!s || !e) return "";
  const fmt = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${fmt(s)} ~ ${fmt(e)}`;
}

function buildGrid(year, month) {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const totalCells = CALENDAR_WEEKS * 7;
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length < totalCells) cells.push(null);
  return cells;
}

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────
export default function ReportCalendarModal({
  visible,
  effectiveBaseDateKey,
  skinLogDateKeys,
  isSelectedBaseDate,
  onClose,
  onSelectDate,
  onResetDate,
}) {

  const [viewYear,  setViewYear]  = useState(() => (parseDateKey(effectiveBaseDateKey) ?? TODAY).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (parseDateKey(effectiveBaseDateKey) ?? TODAY).getMonth());

  useEffect(() => {
    if (!visible) return;
    const d = parseDateKey(effectiveBaseDateKey) ?? TODAY;
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayYear     = TODAY.getFullYear();
  const canGoYearBack = viewYear > MIN_YEAR;
  const canGoYearNext = viewYear < todayYear;

  const goMonth = (delta) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const goYear = (delta) => {
    const next = viewYear + delta;
    if (next < MIN_YEAR || next > todayYear) return;
    setViewYear(next);
  };

  const goMonthRef = useRef(goMonth);
  goMonthRef.current = goMonth;

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-30, 30])
        .onEnd((e) => {
          if      (e.translationX >  50) goMonthRef.current(-1);
          else if (e.translationX < -50) goMonthRef.current( 1);
        }),
    []
  );

  const cells = buildGrid(viewYear, viewMonth);

  const rangeStartKey = useMemo(() => {
    const base = parseDateKey(effectiveBaseDateKey);
    if (!base) return null;
    const start = new Date(base);
    start.setDate(start.getDate() - 13);
    return toDateKey(start);
  }, [effectiveBaseDateKey]);


  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* 반투명 배경 — absoluteFill로 modal 전체 커버 */}
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />

        {/* 캘린더 패널 — 화면 가운데 정렬, box-none으로 패널 자체는 터치 통과 */}
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.panel} pointerEvents="box-none">
          {/* ── 헤더: 기간 표시 + 오늘 기준 리셋 ── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {rangeStartKey ? (
                <>
                  <Text style={styles.rangeLabel}>
                    {formatRangeLabel(rangeStartKey, effectiveBaseDateKey)}
                  </Text>
                  <View style={styles.rangePill}>
                    <Text style={styles.rangePillText}>14일</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.rangeLabel}>기준일을 선택하세요</Text>
              )}
            </View>
            {isSelectedBaseDate ? (
              <TouchableOpacity
                onPress={() => {
                  setViewYear(todayYear);
                  setViewMonth(TODAY.getMonth());
                  onResetDate();
                }}
                hitSlop={10}
                style={styles.resetBtn}
              >
                <Ionicons name="refresh-outline" size={13} color={COLORS.olive} />
                <Text style={styles.resetText}>오늘 기준</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* ── 구분선 ── */}
          <View style={styles.divider} />

          <GestureDetector gesture={swipeGesture}>
            <View>
              {/* ── 연도·월 내비게이션 ── */}
              <View style={styles.navRow}>
                <TouchableOpacity
                  style={styles.arrowBtn}
                  onPress={() => goMonth(-1)}
                  hitSlop={6}
                >
                  <Ionicons name="chevron-back" size={18} color={COLORS.olive} />
                </TouchableOpacity>

                <View style={styles.navCenter}>
                  <TouchableOpacity
                    onPress={() => goYear(-1)}
                    disabled={!canGoYearBack}
                    hitSlop={10}
                    style={styles.yearArrow}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={12}
                      color={canGoYearBack ? COLORS.muted : COLORS.line}
                    />
                  </TouchableOpacity>
                  <Text style={styles.navTitle}>
                    {viewYear}년{"  "}{viewMonth + 1}월
                  </Text>
                  <TouchableOpacity
                    onPress={() => goYear(1)}
                    disabled={!canGoYearNext}
                    hitSlop={10}
                    style={styles.yearArrow}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={12}
                      color={canGoYearNext ? COLORS.muted : COLORS.line}
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.arrowBtn}
                  onPress={() => goMonth(1)}
                  hitSlop={6}
                >
                  <Ionicons name="chevron-forward" size={18} color={COLORS.olive} />
                </TouchableOpacity>
              </View>

              {/* ── 요일 헤더 ── */}
              <View style={styles.weekRow}>
                {WEEKDAY_LABELS.map((label, i) => (
                  <Text
                    key={label}
                    style={[styles.weekdayText, i === 0 && styles.weekdaySun]}
                  >
                    {label}
                  </Text>
                ))}
              </View>

              {/* ── 날짜 그리드 ── */}
              <View style={styles.dayGrid}>
                {cells.map((dayObj, idx) => {
                  if (!dayObj) return <View key={`e-${idx}`} style={styles.dayCell} />;

                  const dateKey      = toDateKey(dayObj);
                  const disabled     = isFutureDateKey(dateKey);
                  const selected     = dateKey === effectiveBaseDateKey;
                  const hasRecord    = skinLogDateKeys.has(dateKey);
                  const isToday      = dateKey === TODAY_KEY;
                  const isSunday     = dayObj.getDay() === 0;
                  const isInRange    = !disabled && rangeStartKey != null
                    && dateKey >= rangeStartKey && dateKey <= effectiveBaseDateKey;
                  const isRangeStart = isInRange && dateKey === rangeStartKey;
                  const isRangeEnd   = isInRange && selected;

                  return (
                    <Pressable
                      key={dateKey}
                      style={({ pressed }) => [
                        styles.dayCell,
                        disabled && styles.dayCellDisabled,
                        pressed && !disabled && styles.dayCellPressed,
                      ]}
                      onPress={() => !disabled && onSelectDate(dateKey)}
                      disabled={disabled}
                    >
                      {/* 14일 범위 배경 띠 */}
                      {isInRange && (
                        <View style={[
                          styles.rangeBar,
                          isRangeStart && styles.rangeBarStart,
                          isRangeEnd   && styles.rangeBarEnd,
                        ]} />
                      )}

                      {/* 날짜 원형 */}
                      <View style={[
                        styles.dayInner,
                        selected && styles.dayInnerSelected,
                        isToday && !selected && styles.dayInnerToday,
                      ]}>
                        <Text
                          style={[
                            styles.dayText,
                            isSunday   && !disabled && !selected && styles.dayTextSun,
                            disabled   && styles.dayTextDisabled,
                            isToday    && !selected && styles.dayTextToday,
                            selected   && styles.dayTextSelected,
                          ]}
                        >
                          {dayObj.getDate()}
                        </Text>
                        {/* 기록 점 */}
                        <View style={[
                          styles.dot,
                          hasRecord && !disabled && (selected ? styles.dotSelected : styles.dotActive),
                        ]} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </GestureDetector>

          {/* ── 구분선 ── */}
          <View style={[styles.divider, { marginTop: 6 }]} />

          {/* ── 범례 ── */}
          <View style={styles.footer}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.olive }]} />
              <Text style={styles.legendText}>피부 기록 있음</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.oliveSoft, borderWidth: 1, borderColor: COLORS_EX.oliveMid }]} />
              <Text style={styles.legendText}>살펴보는 14일</Text>
            </View>
          </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(15, 20, 15, 0.40)",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    paddingHorizontal: PANEL_H_PADDING,
  },
  panel: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    ...shadowPanel,
  },

  // ── 헤더 ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  rangeLabel: {
    fontSize: 14,
    fontFamily: FONT.extraBold,
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  rangePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: COLORS.olive,
  },
  rangePillText: {
    fontSize: 11,
    fontFamily: FONT.extraBold,
    color: COLORS.white,
    letterSpacing: 0.2,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.oliveSoft,
  },
  resetText: {
    fontSize: 12,
    fontFamily: FONT.bold,
    color: COLORS.olive,
  },

  // ── 구분선 ──
  divider: {
    height: 1,
    backgroundColor: COLORS.line,
    marginBottom: 12,
    marginHorizontal: -2,
  },

  // ── 월 내비 ──
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  arrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS_EX.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: "center",
    justifyContent: "center",
  },
  navCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    justifyContent: "center",
  },
  yearArrow: {
    padding: 4,
  },
  navTitle: {
    fontSize: 15,
    fontFamily: FONT.extraBold,
    color: COLORS.text,
    letterSpacing: -0.3,
    minWidth: 90,
    textAlign: "center",
  },

  // ── 요일 ──
  weekRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    fontSize: 11.5,
    fontFamily: FONT.bold,
    color: COLORS.muted,
    letterSpacing: 0.2,
  },
  weekdaySun: {
    color: "#C0785A",
  },

  // ── 날짜 그리드 ──
  dayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    height: CALENDAR_WEEKS * DAY_CELL_HEIGHT,
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: DAY_CELL_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCellDisabled: {
    opacity: 0.22,
  },
  dayCellPressed: {
    opacity: 0.6,
  },

  // ── 범위 띠 ──
  rangeBar: {
    position: "absolute",
    top: 6,
    bottom: 6,
    left: 0,
    right: 0,
    backgroundColor: COLORS.oliveSoft,
  },
  rangeBarStart: {
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  rangeBarEnd: {
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },

  // ── 날짜 원형 ──
  dayInner: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dayInnerSelected: {
    backgroundColor: COLORS.olive,
  },
  dayInnerToday: {
    borderWidth: 1.5,
    borderColor: COLORS.olive,
  },
  dayText: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.text,
  },
  dayTextSun: {
    color: "#C0785A",
  },
  dayTextDisabled: {
    color: COLORS.line,
  },
  dayTextToday: {
    color: COLORS.olive,
    fontFamily: FONT.extraBold,
  },
  dayTextSelected: {
    color: COLORS.white,
    fontFamily: FONT.extraBold,
  },

  // ── 기록 점 ──
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
    backgroundColor: "transparent",
  },
  dotActive:   { backgroundColor: COLORS.olive },
  dotSelected: { backgroundColor: "rgba(255,255,255,0.75)" },

  // ── 푸터 / 범례 ──
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 10,
    paddingHorizontal: 2,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.muted,
  },
});

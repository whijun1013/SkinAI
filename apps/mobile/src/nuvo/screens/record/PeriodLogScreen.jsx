import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar, LocaleConfig } from "react-native-calendars";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { createPeriodLog, deletePeriodLog, getPeriodLogs, getPeriodCycle } from "../../../api/periodLogs";
import { formatKoreanDate, getTodayString } from "../../components/search/searchDateUtils";
import { toDateStr } from "./components/DateNavigator";
import {
  RECORD_COLORS,
  StatusBanner,
  SubScreenRoot,
  SubScreenTopBar,
} from "./components/SubScreenLayout";

const PERIOD_ACCENT = '#8A4E65';
const PERIOD_SOFT   = '#F5EFF2';
const PERIOD_MID    = '#C4B0BB';
const PERIOD_MUTED  = '#A08898';

LocaleConfig.locales["ko"] = {
  monthNames: ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"],
  monthNamesShort: ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"],
  dayNames: ["일요일","월요일","화요일","수요일","목요일","금요일","토요일"],
  dayNamesShort: ["일","월","화","수","목","금","토"],
  today: "오늘",
};
LocaleConfig.defaultLocale = "ko";

function toYM(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : "";
}

const PHASE_META = {
  menstrual: {
    icon: "flower",
    label: "생리 중",
    tip: "피지 분비 감소 · 건조함에 주의하세요",
    color: PERIOD_ACCENT,
  },
  follicular: {
    icon: "leaf-outline",
    label: "여포기",
    tip: "에스트로겐 상승 · 피부가 점점 맑아져요",
    color: "#5E8A6A",
  },
  ovulation: {
    icon: "sunny-outline",
    label: "배란기",
    tip: "에스트로겐 최고조 · 피부 광채가 최상이에요",
    color: "#B07A3A",
  },
  luteal: {
    icon: "moon-outline",
    label: "황체기",
    tip: "프로게스테론 상승 · 피지 과잉·트러블 주의",
    color: "#6A5E8A",
  },
  unknown: {
    icon: "help-circle-outline",
    label: "알 수 없음",
    tip: "생리 시작일을 기록하면 주기를 분석해드려요",
    color: RECORD_COLORS.muted,
  },
};

function CyclePhaseStrip({ cycleData, loading }) {
  if (loading) {
    return (
      <View style={stripStyles.wrap}>
        <ActivityIndicator size="small" color={PERIOD_ACCENT} />
      </View>
    );
  }

  if (!cycleData || !cycleData.applicable) return null;

  const phase = cycleData.phase ?? "unknown";
  const meta = PHASE_META[phase] ?? PHASE_META.unknown;
  const cycleDay = cycleData.cycle_day;
  const cycleLength = cycleData.cycle_length_used;
  const daysRemaining = cycleDay && cycleLength ? cycleLength - cycleDay : null;

  const dDayText = (() => {
    if (phase === "menstrual" && cycleDay) return `D+${cycleDay}`;
    if (daysRemaining !== null && daysRemaining >= 0) return `D-${daysRemaining}`;
    return null;
  })();

  return (
    <View style={stripStyles.wrap}>
      <Ionicons name={meta.icon} size={14} color={meta.color} />
      <Text style={[stripStyles.phase, { color: meta.color }]}>{meta.label}</Text>
      {dDayText ? <Text style={[stripStyles.dday, { color: meta.color }]}>{dDayText}</Text> : null}
      <Text style={stripStyles.dot}>·</Text>
      <Text style={stripStyles.tip} numberOfLines={1}>{meta.tip}</Text>
    </View>
  );
}

const stripStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginBottom: 6,
  },
  phase: {
    fontSize: 13,
    fontWeight: '800',
  },
  dday: {
    fontSize: 12,
    fontWeight: '700',
  },
  dot: {
    fontSize: 12,
    color: RECORD_COLORS.muted,
  },
  tip: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: RECORD_COLORS.muted,
  },
});

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
/** 6주 캘린더 최대 높이 — 모든 달에서 컨테이너 높이 고정 */
const CALENDAR_FIXED_HEIGHT = 310;

function PeriodCalendarWeekHeader() {
  return (
    <View style={calendarHeaderStyles.row}>
      {WEEKDAY_LABELS.map((day) => (
        <Text key={day} style={calendarHeaderStyles.label}>
          {day}
        </Text>
      ))}
    </View>
  );
}

const calendarHeaderStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 10,
    paddingBottom: 6,
  },
  label: {
    width: 32,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: RECORD_COLORS.muted,
  },
});

function PeriodLogRow({
  log,
  onPress,
  onDelete,
  saving,
  isLast,
  variant = "default",
  pendingDeleteId,
  deletingLogId,
  onDeleteConfirm,
  onDeleteCancel,
}) {
  const isModal = variant === "modal";
  const isPending = isModal && pendingDeleteId === log.id;
  const isDeleting = isModal && deletingLogId === log.id;
  const modalBusy = isModal && !!deletingLogId;

  if (isPending) {
    return (
      <View style={[styles.logRow, styles.logRowModal, isLast && styles.logRowLast, styles.logRowConfirm]}>
        <View style={styles.logIconWrap}>
          {isDeleting ? (
            <ActivityIndicator size="small" color="#C0392B" />
          ) : (
            <Ionicons name="trash-outline" size={16} color="#C0392B" />
          )}
        </View>
        <Text style={styles.logConfirmText} numberOfLines={2}>
          {isDeleting
            ? `${formatKoreanDate(log.started_at)} 기록 삭제 중…`
            : `${formatKoreanDate(log.started_at)} 기록을 삭제할까요?`}
        </Text>
        <View style={styles.logConfirmBtns}>
          <TouchableOpacity
            style={styles.logConfirmCancel}
            onPress={onDeleteCancel}
            disabled={isDeleting}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Text style={styles.logConfirmCancelText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logConfirmDelete}
            onPress={() => onDeleteConfirm(log)}
            disabled={isDeleting}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Text style={styles.logConfirmDeleteText}>삭제</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.logRow, isModal && styles.logRowModal, isLast && styles.logRowLast]}>
      <TouchableOpacity
        style={styles.logRowMain}
        onPress={() => onPress(log)}
        activeOpacity={0.7}
        disabled={saving || modalBusy}
      >
        <View style={[styles.logIconWrap, isModal && styles.logIconWrapModal]}>
          <Ionicons
            name="flower-outline"
            size={isModal ? 18 : 16}
            color={PERIOD_ACCENT}
          />
        </View>
        <View style={styles.logTextWrap}>
          <Text style={[styles.logDate, isModal && styles.logDateModal]} numberOfLines={2}>
            {formatKoreanDate(log.started_at)}
          </Text>
          <Text style={styles.logSubLabel}>시작일</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={RECORD_COLORS.muted} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => onDelete(log)}
        disabled={saving || modalBusy}
        hitSlop={10}
      >
        <Ionicons name="trash-outline" size={18} color={RECORD_COLORS.hint} />
      </TouchableOpacity>
    </View>
  );
}

export default function PeriodLogScreen({ onBack, selectedDate, onDataChanged }) {
  const insets = useSafeAreaInsets();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveBanner, setSaveBanner] = useState(null);
  const [cycleData, setCycleData] = useState(null);
  const [cycleLoading, setCycleLoading] = useState(true);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deletingLogId, setDeletingLogId] = useState(null);
  const initialMonth = useMemo(() => {
    if (selectedDate) {
      const d = typeof selectedDate === "string" ? selectedDate : toDateStr(selectedDate);
      return d.slice(0, 7);
    }
    return getTodayString().slice(0, 7);
  }, [selectedDate]);
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const sheetTranslateY = useRef(new Animated.Value(400)).current;
  const wasHistoryModalVisibleRef = useRef(false);

  useEffect(() => {
    if (historyModalVisible && !wasHistoryModalVisibleRef.current) {
      sheetTranslateY.setValue(400);
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 220,
      }).start();
    }
    wasHistoryModalVisibleRef.current = historyModalVisible;
  }, [historyModalVisible, sheetTranslateY]);

  const loadLogs = useCallback(async () => {
    try {
      const data = await getPeriodLogs();
      const sorted = [...(data || [])].sort(
        (a, b) => new Date(b.started_at) - new Date(a.started_at)
      );
      setLogs(sorted);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCycleData = useCallback(async () => {
    setCycleLoading(true);
    try {
      const data = await getPeriodCycle(getTodayString());
      setCycleData(data);
    } catch {
      setCycleData(null);
    } finally {
      setCycleLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
    loadCycleData();
  }, [loadLogs, loadCycleData]);

  const currentMonthLogs = useMemo(
    () =>
      logs
        .filter((log) => toYM(log.started_at) === currentMonth)
        .sort((a, b) => a.started_at.localeCompare(b.started_at)),
    [logs, currentMonth]
  );

  const markedDates = useMemo(() => {
    const result = {};
    logs.forEach((log) => {
      const dateStr = log.started_at;
      if (toYM(dateStr) === currentMonth) {
        result[dateStr] = { selected: true, selectedColor: PERIOD_ACCENT };
      } else {
        result[dateStr] = { marked: true, dotColor: PERIOD_ACCENT };
      }
    });
    return result;
  }, [logs, currentMonth]);

  const handleMonthNav = useCallback((delta) => {
    const [yr, mo] = currentMonth.split("-").map(Number);
    const d = new Date(yr, mo - 1 + delta, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }, [currentMonth]);

  const handleDayPress = useCallback(async (day) => {
    if (saving) return;
    const dateStr = day.dateString;
    if (dateStr > getTodayString()) return;

    if (toYM(dateStr) !== currentMonth) {
      setCurrentMonth(toYM(dateStr));
      return;
    }

    const existingLog = logs.find((log) => log.started_at === dateStr) ?? null;

    if (existingLog) {
      Alert.alert(
        "기록 삭제",
        `${formatKoreanDate(dateStr)} 기록을 삭제할까요?`,
        [
          { text: "취소", style: "cancel" },
          {
            text: "삭제",
            style: "destructive",
            onPress: async () => {
              setSaving(true);
              setSaveBanner(null);
              try {
                await deletePeriodLog(existingLog.id);
                setLogs((prev) => prev.filter((l) => l.id !== existingLog.id));
                onDataChanged?.();
                loadCycleData();
              } catch {
                setSaveBanner({ type: "error", text: "기록을 삭제하지 못했습니다." });
              } finally {
                setSaving(false);
              }
            },
          },
        ]
      );
      return;
    }

    setSaving(true);
    setSaveBanner(null);
    try {
      const created = await createPeriodLog(dateStr);
      setLogs((prev) =>
        [...prev, created ?? { id: Date.now(), started_at: dateStr }].sort(
          (a, b) => new Date(b.started_at) - new Date(a.started_at)
        )
      );
      onDataChanged?.();
      loadCycleData();
    } catch {
      setSaveBanner({ type: "error", text: "생리 시작일을 저장하지 못했습니다." });
    } finally {
      setSaving(false);
    }
  }, [saving, currentMonth, logs, onDataChanged, loadCycleData]);

  const handleDelete = (log) => {
    Alert.alert(
      "기록 삭제",
      `${formatKoreanDate(log.started_at)} 생리 시작 기록을 삭제할까요?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            setSaveBanner(null);
            try {
              await deletePeriodLog(log.id);
              setLogs((prev) => prev.filter((l) => l.id !== log.id));
              onDataChanged?.();
              loadCycleData();
            } catch {
              setSaveBanner({ type: "error", text: "기록을 삭제하지 못했습니다." });
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const closeHistoryModal = useCallback(() => {
    setPendingDeleteId(null);
    setDeletingLogId(null);
    setHistoryModalVisible(false);
  }, []);

  const handleModalDeleteRequest = useCallback((log) => {
    if (deletingLogId) return;
    setPendingDeleteId(log.id);
  }, [deletingLogId]);

  const handleModalDeleteConfirm = useCallback(async (log) => {
    if (deletingLogId) return;
    setDeletingLogId(log.id);
    setSaveBanner(null);
    try {
      await deletePeriodLog(log.id);
      setLogs((prev) => prev.filter((l) => l.id !== log.id));
      setPendingDeleteId(null);
      onDataChanged?.();
      loadCycleData();
    } catch {
      setSaveBanner({ type: "error", text: "기록을 삭제하지 못했습니다." });
    } finally {
      setDeletingLogId(null);
    }
  }, [deletingLogId, onDataChanged, loadCycleData]);

  const handleModalDeleteCancel = useCallback(() => {
    if (deletingLogId) return;
    setPendingDeleteId(null);
  }, [deletingLogId]);

  const handleLogPress = useCallback((log) => {
    if (deletingLogId) return;
    setPendingDeleteId(null);
    setCurrentMonth(toYM(log.started_at));
    setHistoryModalVisible(false);
  }, [deletingLogId]);

  const [y, m] = currentMonth.split("-");
  const monthLabel = `${y}년 ${parseInt(m, 10)}월`;
  const todayMonth = getTodayString().slice(0, 7);
  const isCurrentMonth = currentMonth === todayMonth;

  return (
    <SubScreenRoot onBack={onBack} enabled={!saving}>
      <SubScreenTopBar
        title="생리 주기"
        onBack={onBack}
        accentColor={PERIOD_ACCENT}
        trailing={
          loading || saving ? (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
          ) : null
        }
      />

      <View style={styles.content}>
        {saveBanner?.type === "error" ? (
          <StatusBanner
            icon="alert-circle-outline"
            text={saveBanner.text}
            variant="error"
            onPress={() => setSaveBanner(null)}
          />
        ) : loadError ? (
          <StatusBanner
            icon="alert-circle-outline"
            text="생리 기록을 불러오지 못했습니다."
            variant="error"
            onPress={() => { setLoading(true); loadLogs(); }}
          />
        ) : null}

        {/* 주기 단계 한 줄 */}
        <CyclePhaseStrip cycleData={cycleData} loading={cycleLoading} />

        {/* 달력 네비게이션 바 */}
        <View style={styles.calendarNavBar}>
          <TouchableOpacity
            style={styles.calendarNavArrow}
            onPress={() => handleMonthNav(-1)}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={15} color={PERIOD_ACCENT} />
            <Text style={styles.calendarNavArrowText}>이전</Text>
          </TouchableOpacity>
          <Text style={styles.calendarNavLabel}>{monthLabel}</Text>
          {isCurrentMonth ? (
            <TouchableOpacity
              style={styles.calendarNavArrow}
              onPress={() => handleMonthNav(1)}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={styles.calendarNavArrowText}>다음</Text>
              <Ionicons name="chevron-forward" size={15} color={PERIOD_ACCENT} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.calendarNavArrow}
              onPress={() => setCurrentMonth(todayMonth)}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={styles.calendarNavArrowText}>이번 달</Text>
              <Ionicons name="chevron-forward" size={15} color={PERIOD_ACCENT} />
            </TouchableOpacity>
          )}
        </View>

        {/* 달력 */}
        <View style={styles.calendarContainer}>
          {loading ? (
            <View style={styles.calendarLoading}>
              <ActivityIndicator size="small" color={PERIOD_ACCENT} />
            </View>
          ) : (
            <Calendar
              key={currentMonth}
              current={currentMonth + "-01"}
              markedDates={markedDates}
              onDayPress={handleDayPress}
              hideArrows
              showSixWeeks
              disableMonthChange
              customHeader={PeriodCalendarWeekHeader}
              theme={{
                backgroundColor: RECORD_COLORS.card,
                calendarBackground: RECORD_COLORS.card,
                textSectionTitleColor: RECORD_COLORS.muted,
                selectedDayBackgroundColor: PERIOD_ACCENT,
                selectedDayTextColor: '#FFFFFF',
                todayTextColor: PERIOD_ACCENT,
                dayTextColor: RECORD_COLORS.text,
                textDisabledColor: "#D0CDC6",
                dotColor: PERIOD_ACCENT,
                selectedDotColor: '#FFFFFF',
                monthTextColor: RECORD_COLORS.text,
                textDayFontWeight: "600",
                textMonthFontWeight: "800",
                textDayHeaderFontWeight: "700",
                textDayFontSize: 14,
                textMonthFontSize: 15,
                textDayHeaderFontSize: 12,
                weekVerticalMargin: 6,
              }}
              style={styles.calendar}
            />
          )}
        </View>

        {/* 기록 이력 — 이번달/지난달 미리보기 */}
        {logs.length > 0 && (() => {
          const thisYM = getTodayString().slice(0, 7);
          const [ty, tm] = thisYM.split('-').map(Number);
          const prevDate = new Date(ty, tm - 2, 1);
          const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

          const MAX_PREVIEW = 3;
          const allThisMonth = logs.filter(l => l.started_at.slice(0,7) === thisYM);
          const allPrevMonth = logs.filter(l => l.started_at.slice(0,7) === prevYM);
          const thisMonthLogs = allThisMonth.slice(0, MAX_PREVIEW);
          const remaining1 = MAX_PREVIEW - thisMonthLogs.length;
          const prevMonthLogs = allPrevMonth.slice(0, remaining1);
          const shownIds = new Set([...thisMonthLogs, ...prevMonthLogs].map(l => l.id));
          const remaining = logs.length - shownIds.size;

          const renderGroup = (label, groupLogs) => {
            if (groupLogs.length === 0) return null;
            return (
              <View key={label}>
                <Text style={styles.historyGroupLabel}>{label}</Text>
                {groupLogs.map((log, idx) => (
                  <PeriodLogRow
                    key={log.id}
                    log={log}
                    onPress={handleLogPress}
                    onDelete={handleDelete}
                    saving={saving}
                    isLast={idx === groupLogs.length - 1}
                  />
                ))}
              </View>
            );
          };

          return (
            <View style={styles.historySection}>
              {renderGroup('이번 달', thisMonthLogs)}
              {renderGroup('지난 달', prevMonthLogs)}
              <TouchableOpacity
                style={styles.historyAllBtn}
                onPress={() => setHistoryModalVisible(true)}
                activeOpacity={0.75}
              >
                <Text style={styles.historyAllText}>
                  전체 기록 보기{remaining > 0 ? ` · ${remaining}개 더` : ''}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={PERIOD_MUTED} />
              </TouchableOpacity>
            </View>
          );
        })()}
      </View>

      {/* 전체 기록 모달 */}
      <Modal
        visible={historyModalVisible}
        animationType="none"
        transparent
        statusBarTranslucent
        onRequestClose={closeHistoryModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={closeHistoryModal}
          />
          <Animated.View
            style={[
              styles.modalSheet,
              { transform: [{ translateY: sheetTranslateY }] },
            ]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>전체 기록</Text>
                <Text style={styles.modalSubtitle}>총 {logs.length}개</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={closeHistoryModal}
                hitSlop={10}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={RECORD_COLORS.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalHintBanner}>
              <Ionicons name="information-circle-outline" size={16} color={PERIOD_ACCENT} />
              <Text style={styles.modalHint}>날짜를 탭하면 해당 달로 이동합니다</Text>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.modalScrollContent, { paddingBottom: insets.bottom + 8 }]}
            >
              {logs.map((log, idx) => (
                <PeriodLogRow
                  key={log.id}
                  log={log}
                  onPress={handleLogPress}
                  onDelete={handleModalDeleteRequest}
                  saving={saving}
                  isLast={idx === logs.length - 1}
                  variant="modal"
                  pendingDeleteId={pendingDeleteId}
                  deletingLogId={deletingLogId}
                  onDeleteConfirm={handleModalDeleteConfirm}
                  onDeleteCancel={handleModalDeleteCancel}
                />
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </SubScreenRoot>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  historySection: {
    marginTop: 6,
    backgroundColor: RECORD_COLORS.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: PERIOD_MID,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 4,
    marginBottom: 8,
  },
  historyGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: PERIOD_MUTED,
    marginTop: 10,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  historyAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RECORD_COLORS.line,
  },
  historyAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: PERIOD_MUTED,
  },
  calendarNavBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  calendarNavArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: PERIOD_SOFT,
    borderWidth: 1,
    borderColor: PERIOD_MID,
  },
  calendarNavArrowText: {
    fontSize: 12,
    fontWeight: '700',
    color: PERIOD_ACCENT,
  },
  calendarNavLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "900",
    color: RECORD_COLORS.text,
  },
  calendarContainer: {
    height: CALENDAR_FIXED_HEIGHT,
    borderRadius: 18,
    backgroundColor: RECORD_COLORS.card,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: PERIOD_MID,
  },
  calendarLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  calendar: {
    backgroundColor: RECORD_COLORS.card,
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: RECORD_COLORS.line,
    gap: 8,
  },
  logRowConfirm: {
    backgroundColor: "#FFF5F5",
    borderRadius: 12,
    paddingHorizontal: 4,
  },
  logConfirmText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#C0392B",
    lineHeight: 18,
  },
  logConfirmBtns: {
    flexDirection: "row",
    gap: 6,
  },
  logConfirmCancel: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
  },
  logConfirmCancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: RECORD_COLORS.text,
  },
  logConfirmDelete: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#C0392B",
  },
  logConfirmDeleteText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  logRowModal: {
    paddingVertical: 14,
  },
  logRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PERIOD_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  logIconWrapModal: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  logTextWrap: {
    flex: 1,
    gap: 2,
  },
  logRowLast: {
    borderBottomWidth: 0,
  },
  logDate: {
    fontSize: 14,
    fontWeight: "700",
    color: RECORD_COLORS.text,
    lineHeight: 20,
  },
  logDateModal: {
    fontSize: 15,
    lineHeight: 21,
  },
  logSubLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: RECORD_COLORS.muted,
  },
  deleteBtn: {
    padding: 6,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(31, 37, 32, 0.4)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    backgroundColor: RECORD_COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "75%",
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    borderBottomWidth: 0,
  },
  modalHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: RECORD_COLORS.line,
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: RECORD_COLORS.text,
  },
  modalSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: RECORD_COLORS.muted,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: RECORD_COLORS.chip,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
  },
  modalHintBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: PERIOD_SOFT,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: PERIOD_MID,
  },
  modalHint: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: PERIOD_ACCENT,
    lineHeight: 17,
  },
  modalScrollContent: {
    paddingBottom: 8,
  },
});

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
import { createPeriodLog, deletePeriodLog, getPeriodLogs } from "../../../api/periodLogs";
import { formatKoreanDate, getTodayString } from "../../components/search/searchDateUtils";
import { toDateStr } from "./components/DateNavigator";
import {
  RECORD_COLORS,
  StatusBanner,
  SubScreenRoot,
  SubScreenTopBar,
  useRecordScreenInsets,
} from "./components/SubScreenLayout";

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
            color={RECORD_COLORS.olive}
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
  const { scrollPaddingBottom } = useRecordScreenInsets();
  const insets = useSafeAreaInsets();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveBanner, setSaveBanner] = useState(null);
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

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const currentMonthLogs = useMemo(
    () =>
      logs
        .filter((log) => toYM(log.started_at) === currentMonth)
        .sort((a, b) => a.started_at.localeCompare(b.started_at)),
    [logs, currentMonth]
  );

  const currentMonthStatusText = useMemo(() => {
    if (currentMonthLogs.length === 0) {
      return "날짜를 탭해 시작일을 추가해요";
    }
    if (currentMonthLogs.length === 1) {
      return `시작일 · ${formatKoreanDate(currentMonthLogs[0].started_at)}`;
    }
    return `시작일 ${currentMonthLogs.length}개 · 아래 달력에서 확인`;
  }, [currentMonthLogs]);

  const markedDates = useMemo(() => {
    const result = {};
    logs.forEach((log) => {
      const dateStr = log.started_at;
      if (toYM(dateStr) === currentMonth) {
        result[dateStr] = { selected: true, selectedColor: RECORD_COLORS.olive };
      } else {
        result[dateStr] = { marked: true, dotColor: RECORD_COLORS.olive };
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
    } catch {
      setSaveBanner({ type: "error", text: "생리 시작일을 저장하지 못했습니다." });
    } finally {
      setSaving(false);
    }
  }, [saving, currentMonth, logs, onDataChanged]);

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
    } catch {
      setSaveBanner({ type: "error", text: "기록을 삭제하지 못했습니다." });
    } finally {
      setDeletingLogId(null);
    }
  }, [deletingLogId, onDataChanged]);

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
        trailing={
          loading || saving ? (
            <ActivityIndicator size="small" color={RECORD_COLORS.olive} />
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

        {/* 월 상태 카드 */}
        <View style={styles.monthStatus}>
          <Ionicons
            name="flower-outline"
            size={22}
            color={currentMonthLogs.length > 0 ? RECORD_COLORS.olive : RECORD_COLORS.muted}
          />
          <View style={styles.monthStatusTexts}>
            <Text style={styles.monthStatusTitle}>{monthLabel}</Text>
            <Text
              style={[
                styles.monthStatusSub,
                currentMonthLogs.length === 0 && styles.monthStatusMuted,
              ]}
            >
              {currentMonthStatusText}
            </Text>
          </View>
          {!isCurrentMonth && (
            <TouchableOpacity
              style={styles.todayBtn}
              onPress={() => setCurrentMonth(todayMonth)}
              activeOpacity={0.75}
            >
              <Text style={styles.todayBtnText}>이번 달</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 캘린더: CALENDAR_FIXED_HEIGHT로 고정해 달마다 row 수가 달라도 레이아웃 유지 */}
        <View style={styles.calendarContainer}>
          {loading ? (
            <View style={styles.calendarLoading}>
              <ActivityIndicator size="small" color={RECORD_COLORS.olive} />
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
                selectedDayBackgroundColor: RECORD_COLORS.olive,
                selectedDayTextColor: RECORD_COLORS.white,
                todayTextColor: RECORD_COLORS.olive,
                dayTextColor: RECORD_COLORS.text,
                textDisabledColor: "#D0CDC6",
                dotColor: RECORD_COLORS.olive,
                selectedDotColor: RECORD_COLORS.white,
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

        <View style={styles.calendarLegend}>
          <View style={styles.calendarLegendDot} />
          <Text style={styles.calendarLegendText}>
            색칠된 날 = 생리 시작일 · 탭하면 추가/삭제
          </Text>
        </View>

        {/* 월 이동 버튼 */}
        <View style={styles.monthNav}>
          <TouchableOpacity
            style={styles.monthNavBtn}
            onPress={() => handleMonthNav(-1)}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={22} color={RECORD_COLORS.olive} />
          </TouchableOpacity>
          <Text style={styles.monthNavLabel}>{monthLabel}</Text>
          <TouchableOpacity
            style={styles.monthNavBtn}
            onPress={() => handleMonthNav(1)}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={22} color={RECORD_COLORS.olive} />
          </TouchableOpacity>
        </View>

        {/* 기록 이력 — 미리보기 + 전체 모달 */}
        {logs.length > 0 && (
          <View style={styles.historySection}>
            <View style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>기록 이력</Text>
                <Text style={styles.historyTotalText}>총 {logs.length}개</Text>
              </View>
              {logs.slice(0, 2).map((log, idx, arr) => (
                <PeriodLogRow
                  key={log.id}
                  log={log}
                  onPress={handleLogPress}
                  onDelete={handleDelete}
                  saving={saving}
                  isLast={idx === arr.length - 1 && logs.length <= 2}
                />
              ))}
              {logs.length > 2 && (
                <TouchableOpacity
                  style={styles.showMoreBtn}
                  onPress={() => setHistoryModalVisible(true)}
                  activeOpacity={0.75}
                >
                  <View style={styles.showMoreLeft}>
                    <Text style={styles.showMoreText}>전체 기록 보기</Text>
                    <Text style={styles.showMoreSub}>
                      {`${logs.length - 2}개 더`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={RECORD_COLORS.olive} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
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
              <Ionicons name="information-circle-outline" size={16} color={RECORD_COLORS.olive} />
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
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: RECORD_COLORS.oliveSoft,
    borderWidth: 1,
    borderColor: RECORD_COLORS.olive,
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: RECORD_COLORS.olive,
  },
  monthStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    backgroundColor: RECORD_COLORS.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
  },
  monthStatusTexts: {
    flex: 1,
    gap: 2,
  },
  monthStatusTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: RECORD_COLORS.text,
  },
  monthStatusSub: {
    fontSize: 12,
    fontWeight: "600",
    color: RECORD_COLORS.olive,
  },
  monthStatusMuted: {
    color: RECORD_COLORS.muted,
  },
  calendarContainer: {
    height: CALENDAR_FIXED_HEIGHT,
    borderRadius: 18,
    backgroundColor: RECORD_COLORS.card,
    marginBottom: 2,
    overflow: "hidden",
  },
  calendarLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  calendar: {
    backgroundColor: RECORD_COLORS.card,
  },
  calendarLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 4,
  },
  calendarLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: RECORD_COLORS.olive,
  },
  calendarLegendText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: RECORD_COLORS.muted,
    lineHeight: 17,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 6,
    marginBottom: 8,
  },
  monthNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: RECORD_COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  monthNavLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: RECORD_COLORS.text,
  },
  historySection: {
    flex: 1,
    justifyContent: "flex-start",
  },
  historyCard: {
    backgroundColor: RECORD_COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    marginBottom: 8,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: RECORD_COLORS.text,
  },
  historyTotalText: {
    fontSize: 12,
    fontWeight: "600",
    color: RECORD_COLORS.muted,
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
    backgroundColor: RECORD_COLORS.oliveSoft,
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
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: RECORD_COLORS.oliveSoft,
  },
  showMoreLeft: {
    gap: 2,
  },
  showMoreText: {
    fontSize: 14,
    fontWeight: "800",
    color: RECORD_COLORS.olive,
  },
  showMoreSub: {
    fontSize: 12,
    fontWeight: "600",
    color: RECORD_COLORS.oliveMuted,
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
    backgroundColor: RECORD_COLORS.oliveSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  modalHint: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: RECORD_COLORS.olive,
    lineHeight: 17,
  },
  modalScrollContent: {
    paddingBottom: 8,
  },
});

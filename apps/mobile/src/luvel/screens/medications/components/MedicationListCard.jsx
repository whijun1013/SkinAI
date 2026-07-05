import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentMedicationCaption, getPastMedicationCaption } from '../medicationDisplay';
import { RECORD_COLORS, shadowCard } from '../../record/components/SubScreenLayout';

export default React.memo(function MedicationListCard({
  item,
  isPast = false,
  onPress,
  onDelete,
  onStopToday,
  onStopUsing,
  onResumeUsing,
  onEditStartDate,
  onEditEndDate,
  showDatesReadOnly = false,
  saving = false,
}) {
  const med = item.medication || {};
  const medName = med.name || '약물명 없음';
  const form = med.form?.trim();

  const usageCaption = useMemo(
    () => (isPast ? getPastMedicationCaption(item) : getCurrentMedicationCaption(item)),
    [isPast, item]
  );

  const { usageDays } = usageCaption;

  const daysText = useMemo(() => {
    if (!isPast && usageDays) return `${usageDays}일째`;
    if (isPast && usageDays) return `총 ${usageDays}일`;
    return null;
  }, [isPast, usageDays]);

  const metaText = [form, daysText].filter(Boolean).join('  ·  ');
  const showDateRow = !!(onEditStartDate || onEditEndDate || onDelete || showDatesReadOnly);
  const showStartDate = onEditStartDate || showDatesReadOnly;
  const showEndDate = onEditEndDate || showDatesReadOnly;

  return (
    <View style={[styles.card, saving && styles.cardSaving]}>
      <View style={styles.mainRow}>
        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.infoZone}
          onPress={onPress}
          disabled={!onPress || saving}
          accessibilityLabel={`${medName} 성분 정보 보기`}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="medkit-outline" size={20} color={RECORD_COLORS.oliveMuted} />
          </View>

          <View style={styles.textBlock}>
            <Text style={styles.name} numberOfLines={1}>
              {medName}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {metaText || '제형 정보 없음'}
            </Text>
            {onPress ? (
              <View style={styles.analysisHint}>
                <Ionicons name="sparkles-outline" size={10} color={RECORD_COLORS.oliveMuted} />
                <Text style={styles.analysisHintText}>성분 정보</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        {saving ? (
          <ActivityIndicator size="small" color={RECORD_COLORS.olive} style={styles.spinner} />
        ) : onStopToday || onStopUsing ? (
          <View style={styles.stopGroup}>
            {onStopToday ? (
              <TouchableOpacity
                activeOpacity={0.78}
                style={styles.stopTodayBtn}
                onPress={onStopToday}
                accessibilityLabel="오늘 종료"
              >
                <Text style={styles.stopTodayBtnText}>오늘 종료</Text>
              </TouchableOpacity>
            ) : null}
            {onStopUsing ? (
              <TouchableOpacity
                activeOpacity={0.78}
                style={styles.stopDateBtn}
                onPress={onStopUsing}
                accessibilityLabel="날짜 선택하여 종료"
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="calendar-outline" size={15} color={RECORD_COLORS.oliveMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : onResumeUsing ? (
          <TouchableOpacity
            activeOpacity={0.78}
            style={styles.resumeBtn}
            onPress={onResumeUsing}
            accessibilityLabel="다시 복용"
          >
            <Text style={styles.resumeBtnText}>다시{'\n'}복용</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {showDateRow ? (
        <View style={styles.dateRow}>
          {isPast ? (
            onEditStartDate || onEditEndDate ? (
              <TouchableOpacity
                activeOpacity={0.72}
                style={styles.dateChip}
                onPress={onEditStartDate || onEditEndDate}
                disabled={saving}
                accessibilityLabel="복용 기간 수정"
              >
                <Ionicons name="calendar-outline" size={13} color={RECORD_COLORS.olive} />
                <Text style={styles.dateChipText} numberOfLines={1}>
                  {usageCaption.primary || '기간 수정'}
                </Text>
                <Ionicons name="pencil-outline" size={11} color={RECORD_COLORS.oliveMuted} />
              </TouchableOpacity>
            ) : (
              <View style={styles.dateEditSpacer} />
            )
          ) : (
            <View style={styles.dateChipGroup}>
              {showStartDate ? (
                onEditStartDate ? (
                  <TouchableOpacity
                    activeOpacity={0.72}
                    style={styles.dateChip}
                    onPress={onEditStartDate}
                    disabled={saving}
                    accessibilityLabel="시작일 수정"
                  >
                    <Ionicons name="calendar-outline" size={13} color={RECORD_COLORS.olive} />
                    <Text style={styles.dateChipText} numberOfLines={1}>
                      {item.started_at
                        ? String(item.started_at).slice(5).replace('-', '/')
                        : '시작일'}
                    </Text>
                    <Ionicons name="pencil-outline" size={11} color={RECORD_COLORS.oliveMuted} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.dateChip}>
                    <Ionicons name="calendar-outline" size={13} color={RECORD_COLORS.olive} />
                    <Text style={styles.dateChipText} numberOfLines={1}>
                      {item.started_at
                        ? String(item.started_at).slice(5).replace('-', '/')
                        : '시작일'}
                    </Text>
                  </View>
                )
              ) : null}
              {showEndDate ? (
                onEditEndDate ? (
                  <TouchableOpacity
                    activeOpacity={0.72}
                    style={[styles.dateChip, styles.dateChipEnd]}
                    onPress={onEditEndDate}
                    disabled={saving}
                    accessibilityLabel="종료 예정일 수정"
                  >
                    <Ionicons name="flag-outline" size={12} color={RECORD_COLORS.oliveMuted} />
                    <Text style={[styles.dateChipText, styles.dateChipTextEnd]} numberOfLines={1}>
                      {item.expected_end_at
                        ? String(item.expected_end_at).slice(5).replace('-', '/')
                        : '종료 예정일'}
                    </Text>
                    <Ionicons name="pencil-outline" size={11} color={RECORD_COLORS.oliveMuted} />
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.dateChip, styles.dateChipEnd]}>
                    <Ionicons name="flag-outline" size={12} color={RECORD_COLORS.oliveMuted} />
                    <Text style={[styles.dateChipText, styles.dateChipTextEnd]} numberOfLines={1}>
                      {item.expected_end_at
                        ? String(item.expected_end_at).slice(5).replace('-', '/')
                        : '종료 예정일'}
                    </Text>
                  </View>
                )
              ) : null}
            </View>
          )}

          {onDelete ? (
            <TouchableOpacity
              activeOpacity={0.72}
              style={styles.deleteZone}
              onPress={onDelete}
              disabled={saving}
              accessibilityLabel="기록 삭제"
            >
              <Ionicons name="trash-outline" size={14} color="#C17B74" />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    backgroundColor: RECORD_COLORS.card,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    marginBottom: 6,
    overflow: 'hidden',
    ...shadowCard,
  },
  cardSaving: {
    opacity: 0.65,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 8,
    gap: 8,
  },
  infoZone: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: RECORD_COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: '800',
    color: RECORD_COLORS.text,
    lineHeight: 19,
  },
  meta: {
    fontSize: 12,
    fontWeight: '500',
    color: RECORD_COLORS.muted,
    lineHeight: 17,
  },
  analysisHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  analysisHintText: {
    fontSize: 10,
    fontWeight: '600',
    color: RECORD_COLORS.oliveMuted,
  },
  spinner: {
    marginRight: 4,
  },
  stopGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stopTodayBtn: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C9A040',
    backgroundColor: '#FDF6E8',
  },
  stopTodayBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8A6A2A',
  },
  stopDateBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: RECORD_COLORS.olive,
    backgroundColor: RECORD_COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  resumeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: RECORD_COLORS.olive,
    textAlign: 'center',
    lineHeight: 15,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 8,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: RECORD_COLORS.olive,
    backgroundColor: RECORD_COLORS.oliveSoft,
    flexShrink: 1,
  },
  dateChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: RECORD_COLORS.olive,
    flexShrink: 1,
  },
  dateEditSpacer: {
    flex: 1,
  },
  dateChipGroup: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  dateChipEnd: {
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
  },
  dateChipTextEnd: {
    color: RECORD_COLORS.muted,
  },
  deleteZone: {
    padding: 4,
    marginLeft: 'auto',
  },
});

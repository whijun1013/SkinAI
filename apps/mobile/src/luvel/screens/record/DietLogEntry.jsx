import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import useRecordCacheStore from '../../../stores/recordCacheStore';
import { Ionicons } from '@expo/vector-icons';
import AuthImage from '../../components/AuthImage';
import { useDietLogsQuery } from '../../../hooks/useRecordQueries';
import { formatFoodNames, isAiEnrichPending, MEAL_ICONS, sortDietLogs } from './dietDisplay';
import { DietCardNutrition } from './dietNutritionInsight';
import { toDateStr } from './components/DateNavigator';
import {
  RECORD_COLORS,
  SectionCard,
  StatusBanner,
  SubScreenFooter,
  SubScreenRoot,
  SubScreenTopBar,
  useRecordScreenInsets,
  styles as layoutStyles,
} from './components/SubScreenLayout';

function formatLogTime(loggedAt) {
  if (!loggedAt) return '';
  const d = new Date(loggedAt);
  if (Number.isNaN(d.getTime())) return String(loggedAt);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export default function DietLogEntry({ onBack, selectedDate, onEditLog, onAddPhoto }) {
  const { scrollPaddingBottom } = useRecordScreenInsets();
  const date = selectedDate ?? new Date();
  const dateStr = toDateStr(date);
  const isToday = dateStr === toDateStr(new Date());

  const { data, isInitialLoad, error } = useDietLogsQuery(dateStr);
  const logs = Array.isArray(data) ? data : [];
  const aiDoneLogIds = useRecordCacheStore((s) => s.aiDoneLogIds);

  const handleRetry = useCallback(() => {
    useRecordCacheStore.getState().invalidateDiet(dateStr);
  }, [dateStr]);

  const isAiPendingForLog = useCallback(
    (log) => isAiEnrichPending(log) && !aiDoneLogIds.has(log.id),
    [aiDoneLogIds]
  );

  const sortedLogs = sortDietLogs(logs);

  return (
    <SubScreenRoot onBack={onBack}>
      <SubScreenTopBar
        title="식단 기록"
        dateLabel={isToday ? '오늘' : dateStr}
        onBack={onBack}
        trailing={
          isInitialLoad ? <ActivityIndicator size="small" color={RECORD_COLORS.olive} /> : null
        }
      />

      <ScrollView
        contentContainerStyle={[layoutStyles.scrollContent, { paddingBottom: scrollPaddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        {error && !isInitialLoad && logs.length === 0 ? (
          <>
            <StatusBanner
              icon="alert-circle-outline"
              text="식단 기록을 불러오지 못했습니다."
              variant="empty"
            />
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.8}>
              <Ionicons name="refresh-outline" size={16} color={RECORD_COLORS.olive} />
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {!isInitialLoad && !error && logs.length === 0 ? (
          <>
            <StatusBanner
              icon="restaurant-outline"
              text={
                isToday
                  ? '오늘 식단을 기록해 보세요 · 사진을 추가하면 AI가 음식을 분석해요'
                  : '이 날 식단 기록이 없습니다'
              }
              variant="empty"
            />
            <SectionCard
              title="아직 식단 기록이 없어요"
              subtitle={
                isToday
                  ? '아래 버튼으로 사진을 추가해 보세요'
                  : '해당 날짜에 찍은 갤러리 사진을 추가할 수 있어요'
              }
            >
              <View style={styles.emptyBox}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="restaurant-outline" size={30} color={RECORD_COLORS.olive} />
                </View>
                <Text style={styles.emptyTitle}>
                  {isToday ? '첫 식단 기록을 남겨 보세요' : '이 날 기록된 식단이 없어요'}
                </Text>
                <Text style={styles.emptyDesc}>
                  {isToday
                    ? '식사 사진을 찍거나 갤러리에서 선택하면 AI가 음식명과 영양 정보를 추정해요.'
                    : '갤러리에서 해당 날짜에 찍은 사진을 선택하면 식단 기록을 추가할 수 있어요.'}
                </Text>
              </View>
            </SectionCard>
          </>
        ) : null}

        {logs.length > 0 ? (
          sortedLogs.map((log) => {
            const mealType = log.meal_type || '식사';
            const foodNames = formatFoodNames(log);
            const aiPending = isAiPendingForLog(log);

            return (
              <TouchableOpacity
                key={log.id}
                activeOpacity={0.82}
                onPress={() => onEditLog?.(log)}
                disabled={!onEditLog}
              >
                <SectionCard
                  headerContent={
                    <View style={styles.mealHeaderRow}>
                      {/* 왼쪽: 아이콘 + 끼니 + 음식명 */}
                      <View style={styles.mealHeaderLeft}>
                        <Ionicons
                          name={MEAL_ICONS[mealType] || 'restaurant-outline'}
                          size={26}
                          color={RECORD_COLORS.olive}
                        />
                        <Text style={styles.mealHeaderType}>{mealType}</Text>
                        {aiPending ? (
                          <View style={styles.aiPendingRow}>
                            <ActivityIndicator size={12} color={RECORD_COLORS.muted} />
                            <Text style={styles.aiPendingText}>분석 중</Text>
                          </View>
                        ) : (
                          <Text style={styles.mealHeaderFoods} numberOfLines={1}>
                            {foodNames || '음식 정보 없음'}
                          </Text>
                        )}
                      </View>
                      {/* 오른쪽: 시간 + chevron */}
                      <View style={styles.mealHeaderRight}>
                        {formatLogTime(log.logged_at) ? (
                          <Text style={styles.mealHeaderTime}>{formatLogTime(log.logged_at)}</Text>
                        ) : null}
                        {onEditLog ? (
                          <Ionicons name="chevron-forward" size={16} color={RECORD_COLORS.muted} />
                        ) : null}
                      </View>
                    </View>
                  }
                >
                  {/* 영양 태그 (있을 때만) */}
                  {!aiPending ? <DietCardNutrition log={log} position="body" /> : null}
                  {log.note ? <Text style={styles.noteText}>{log.note}</Text> : null}
                  <View style={styles.photoThumb}>
                    {log.photo_url ? (
                      <AuthImage uri={log.photo_url} style={StyleSheet.absoluteFill} />
                    ) : (
                      <View style={styles.photoEmpty}>
                        <Ionicons name="camera-outline" size={28} color={RECORD_COLORS.muted} />
                        <Text style={styles.photoEmptyText}>사진 없음</Text>
                      </View>
                    )}
                  </View>
                </SectionCard>
              </TouchableOpacity>
            );
          })
        ) : null}
      </ScrollView>

      {onAddPhoto ? (
        <SubScreenFooter
          label={isToday ? '사진 추가' : '갤러리에서 사진 추가'}
          icon={isToday ? 'camera-outline' : 'images-outline'}
          onPress={onAddPhoto}
        />
      ) : null}
    </SubScreenRoot>
  );
}

const styles = StyleSheet.create({
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: RECORD_COLORS.line,
    borderStyle: 'dashed',
    backgroundColor: RECORD_COLORS.chip,
    padding: 24,
    gap: 10,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: RECORD_COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: RECORD_COLORS.olive,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 12.5,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: RECORD_COLORS.oliveSoft,
  },
  retryText: { fontSize: 14, fontWeight: '700', color: RECORD_COLORS.olive },
  mealHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  mealHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    overflow: 'hidden',
  },
  mealHeaderType: {
    fontSize: 18,
    fontWeight: '900',
    color: RECORD_COLORS.olive,
  },
  mealHeaderFoods: {
    fontSize: 17,
    fontWeight: '700',
    color: RECORD_COLORS.text,
    flex: 1,
  },
  mealHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 6,
    flexShrink: 0,
  },
  mealHeaderTime: {
    fontSize: 14,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  aiPendingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  aiPendingText: { fontSize: 14, fontWeight: '600', color: RECORD_COLORS.muted },
  noteText: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
    lineHeight: 19,
  },
  photoThumb: {
    marginTop: 14,
    width: '100%',
    height: 160,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: RECORD_COLORS.chip,
  },
  photoEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoEmptyText: {
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
});

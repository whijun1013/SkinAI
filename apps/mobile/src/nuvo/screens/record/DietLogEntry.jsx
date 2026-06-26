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
  StatusBanner,
  SubScreenFooter,
  SubScreenRoot,
  SubScreenTopBar,
  useRecordScreenInsets,
} from './components/SubScreenLayout';

// A: #C49A5A (밝고 따뜻한 황금빛 갈색)
// B: #8C7355 (채도 낮은 차분한 웜그레이 브라운)
const DIET = {
  main: '#C49A5A',
  soft: 'rgba(196,154,90,0.08)',
  border: 'rgba(196,154,90,0.22)',
};

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
        accentColor={DIET.main}
        trailing={
          isInitialLoad ? <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" /> : null
        }
      />

      <ScrollView
        contentContainerStyle={[S.scroll, { paddingBottom: scrollPaddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 에러 ── */}
        {error && !isInitialLoad && logs.length === 0 ? (
          <View style={S.errorWrap}>
            <StatusBanner
              icon="alert-circle-outline"
              text="식단 기록을 불러오지 못했습니다."
              variant="error"
            />
            <TouchableOpacity style={S.retryBtn} onPress={handleRetry} activeOpacity={0.8}>
              <Ionicons name="refresh-outline" size={16} color={DIET.main} />
              <Text style={S.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── 빈 상태 ── */}
        {!isInitialLoad && !error && logs.length === 0 ? (
          <View style={S.emptyWrap}>
            <View style={S.emptyIconCircle}>
              <Ionicons name="restaurant-outline" size={28} color={DIET.main} />
            </View>
            <Text style={S.emptyTitle}>
              {isToday ? '오늘 식단을 기록해 보세요' : '이 날 식단 기록이 없어요'}
            </Text>
            <Text style={S.emptyDesc}>
              {isToday
                ? '식사 사진을 찍거나 갤러리에서 선택하면\nAI가 음식명과 영양 정보를 추정해요'
                : '갤러리에서 해당 날짜에 찍은\n사진을 선택해 기록을 추가할 수 있어요'}
            </Text>
          </View>
        ) : null}

        {/* ── 식사 목록 ── */}
        {sortedLogs.map((log, idx) => {
          const mealType = log.meal_type || '식사';
          const foodNames = formatFoodNames(log);
          const aiPending = isAiPendingForLog(log);
          const time = formatLogTime(log.logged_at);

          return (
            <TouchableOpacity
              key={log.id}
              style={[S.mealCard, idx > 0 && S.mealCardGap]}
              activeOpacity={0.82}
              onPress={() => onEditLog?.(log)}
              disabled={!onEditLog}
            >
              {/* 헤더 행 */}
              <View style={S.mealHead}>
                <View style={S.mealIconWrap}>
                  <Ionicons
                    name={MEAL_ICONS[mealType] || 'restaurant-outline'}
                    size={19}
                    color={DIET.main}
                  />
                </View>
                <View style={S.mealHeadMeta}>
                  <Text style={S.mealType}>{mealType}</Text>
                  {aiPending ? (
                    <View style={S.aiPendingRow}>
                      <ActivityIndicator size={11} color={RECORD_COLORS.muted} />
                      <Text style={S.aiPendingText}>분석 중</Text>
                    </View>
                  ) : foodNames ? (
                    <Text style={S.mealFoods} numberOfLines={1}>{foodNames}</Text>
                  ) : null}
                </View>
                <View style={S.mealHeadRight}>
                  {time ? <Text style={S.mealTime}>{time}</Text> : null}
                  {onEditLog ? (
                    <Ionicons name="chevron-forward" size={15} color={RECORD_COLORS.muted} />
                  ) : null}
                </View>
              </View>

              {/* 영양 태그 */}
              {!aiPending ? <DietCardNutrition log={log} position="body" /> : null}

              {/* 메모 */}
              {log.note ? <Text style={S.mealNote}>{log.note}</Text> : null}

              {/* 사진 */}
              <View style={S.mealPhoto}>
                {log.photo_url ? (
                  <AuthImage uri={log.photo_url} style={StyleSheet.absoluteFill} />
                ) : (
                  <View style={S.mealPhotoEmpty}>
                    <Ionicons name="camera-outline" size={22} color={RECORD_COLORS.muted} />
                    <Text style={S.mealPhotoEmptyText}>사진 없음</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {onAddPhoto ? (
        <SubScreenFooter
          label={isToday ? '사진 추가' : '갤러리에서 사진 추가'}
          icon={isToday ? 'camera-outline' : 'images-outline'}
          onPress={onAddPhoto}
          color={DIET.main}
        />
      ) : null}
    </SubScreenRoot>
  );
}

const S = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 20, gap: 0 },

  // ── 에러 ──
  errorWrap: { marginBottom: 16 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: DIET.soft,
  },
  retryText: { fontSize: 14, fontWeight: '700', color: DIET.main },

  // ── 빈 상태 ──
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: DIET.border,
    borderStyle: 'dashed',
    backgroundColor: DIET.soft,
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 12,
    marginTop: 8,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(160,104,48,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: DIET.main,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── 식사 카드 ──
  mealCard: {
    backgroundColor: RECORD_COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    padding: 16,
    marginTop: 12,
  },
  mealCardGap: { marginTop: 12 },

  mealHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mealIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: DIET.soft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mealHeadMeta: { flex: 1, gap: 2, overflow: 'hidden' },
  mealType: {
    fontSize: 16,
    fontWeight: '900',
    color: RECORD_COLORS.text,
    letterSpacing: -0.3,
  },
  mealFoods: {
    fontSize: 14,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  mealHeadRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  mealTime: {
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },

  aiPendingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  aiPendingText: { fontSize: 13, fontWeight: '600', color: RECORD_COLORS.muted },

  mealNote: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '500',
    color: RECORD_COLORS.muted,
    lineHeight: 19,
  },

  // ── 사진 ──
  mealPhoto: {
    marginTop: 14,
    width: '100%',
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: RECORD_COLORS.chip,
  },
  mealPhotoEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mealPhotoEmptyText: {
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
});

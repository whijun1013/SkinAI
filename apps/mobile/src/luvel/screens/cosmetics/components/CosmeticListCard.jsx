import React, { useMemo } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getCosmeticCategoryIcon,
  getCurrentUsageCaption,
  getPastUsageCaption,
} from '../cosmeticDisplay';
import { RECORD_COLORS, shadowCard } from '../../record/components/SubScreenLayout';

export function CosmeticCategoryHeader({ category, count }) {
  return (
    <View style={styles.categoryHeader}>
      <Text style={styles.categoryHeaderTitle}>{category}</Text>
      {count > 0 ? <Text style={styles.categoryHeaderCount}>{count}</Text> : null}
    </View>
  );
}

export const CosmeticCategoryToggle = React.memo(function CosmeticCategoryToggle({
  category,
  count,
  expanded,
  previewLabel = null,
  onPress,
}) {
  const iconName = getCosmeticCategoryIcon(category);

  if (expanded) {
    return (
      <TouchableOpacity
        activeOpacity={0.78}
        style={styles.categoryToggleExpanded}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded: true }}
        accessibilityLabel={`${category} ${count}개 접기`}
      >
        <Ionicons name="chevron-down" size={14} color={RECORD_COLORS.muted} />
        <Text style={styles.categoryToggleExpandedTitle}>{category}</Text>
        <Text style={styles.categoryToggleExpandedCount}>{count}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      style={styles.categoryToggleCollapsed}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: false }}
      accessibilityLabel={`${category} ${count}개 펼치기`}
    >
      <View style={styles.categoryIconWrap}>
        <Ionicons name={iconName} size={15} color={RECORD_COLORS.oliveMuted} />
      </View>

      <View style={styles.categoryTextBlock}>
        <Text style={styles.categoryCollapsedTitle}>{category}</Text>
        {previewLabel ? (
          <Text style={styles.categoryCollapsedSub} numberOfLines={1}>
            {previewLabel}
          </Text>
        ) : (
          <Text style={styles.categoryCollapsedSub}>제품 {count}개</Text>
        )}
      </View>

      <View style={styles.categoryCountBadge}>
        <Text style={styles.categoryCountBadgeText}>{count}</Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={RECORD_COLORS.muted} />
    </TouchableOpacity>
  );
});

function CosmeticListCard({
  item,
  isPast = false,
  onPress,
  onDelete,
  onStopToday,
  onStopUsing,
  onResumeUsing,
  onEditDate,
  onEditStartDate,
  onEditEndDate,
  saving = false,
}) {
  const product = item.product || {};
  const productName = product.product_name || '제품명 없음';
  const brand = product.brand?.trim();

  const usageCaption = useMemo(
    () => (isPast ? getPastUsageCaption(item) : getCurrentUsageCaption(item)),
    [isPast, item]
  );

  const { usageDays } = usageCaption;

  const daysText = useMemo(() => {
    if (!isPast && usageDays) return `${usageDays}일째`;
    if (isPast && usageDays) return `총 ${usageDays}일`;
    return null;
  }, [isPast, usageDays]);

  const metaText = [brand, daysText].filter(Boolean).join('  ·  ');

  const hasSplitDateChips = isPast && (onEditStartDate || onEditEndDate);
  const showDateRow = !!(onEditDate || hasSplitDateChips || onDelete);

  return (
    <View style={[styles.card, saving && styles.cardSaving]}>
      {/* 윗줄: 제품 정보(탭 → 성분 분석) + 핵심 액션 버튼 */}
      <View style={styles.mainRow}>
        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.infoZone}
          onPress={onPress}
          disabled={!onPress || saving}
          accessibilityLabel={`${productName} 성분 분석 보기`}
        >
          {product.image_url ? (
            <Image source={{ uri: product.image_url }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Ionicons name="flask-outline" size={20} color={RECORD_COLORS.muted} />
            </View>
          )}

          <View style={styles.textBlock}>
            <Text style={styles.name} numberOfLines={1}>
              {productName}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {metaText}
            </Text>
            {onPress ? (
              <View style={styles.analysisHint}>
                <Ionicons name="sparkles-outline" size={10} color={RECORD_COLORS.oliveMuted} />
                <Text style={styles.analysisHintText}>성분 분석</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        {/* 핵심 액션: 사용 종료 or 다시 사용 */}
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
            accessibilityLabel="다시 사용"
          >
            <Text style={styles.resumeBtnText}>다시{'\n'}사용</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 아랫줄: 날짜 수정 + 삭제 */}
      {showDateRow ? (
        <View style={styles.dateRow}>
          {hasSplitDateChips ? (
            <View style={styles.splitDateChips}>
              {onEditStartDate ? (
                <TouchableOpacity
                  activeOpacity={0.72}
                  style={styles.dateChip}
                  onPress={onEditStartDate}
                  disabled={saving}
                  accessibilityLabel="시작일 수정"
                >
                  <Ionicons name="calendar-outline" size={13} color={RECORD_COLORS.olive} />
                  <Text style={styles.dateChipText} numberOfLines={1}>
                    {item.started_at || '시작일'}
                  </Text>
                  <Ionicons name="pencil-outline" size={11} color={RECORD_COLORS.oliveMuted} />
                </TouchableOpacity>
              ) : null}
              {onEditEndDate ? (
                <TouchableOpacity
                  activeOpacity={0.72}
                  style={styles.dateChip}
                  onPress={onEditEndDate}
                  disabled={saving}
                  accessibilityLabel="종료일 수정"
                >
                  <Ionicons name="calendar-outline" size={13} color={RECORD_COLORS.olive} />
                  <Text style={styles.dateChipText} numberOfLines={1}>
                    {item.ended_at || '종료일'}
                  </Text>
                  <Ionicons name="pencil-outline" size={11} color={RECORD_COLORS.oliveMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : onEditDate ? (
            <TouchableOpacity
              activeOpacity={0.72}
              style={styles.dateChip}
              onPress={onEditDate}
              disabled={saving}
              accessibilityLabel="시작일 수정"
            >
              <Ionicons name="calendar-outline" size={13} color={RECORD_COLORS.olive} />
              <Text style={styles.dateChipText} numberOfLines={1}>
                {usageCaption.primary || '시작일 수정'}
              </Text>
              <Ionicons name="pencil-outline" size={11} color={RECORD_COLORS.oliveMuted} />
            </TouchableOpacity>
          ) : (
            <View style={styles.dateEditSpacer} />
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
}

export default React.memo(CosmeticListCard);

const styles = StyleSheet.create({
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 4,
  },
  categoryHeaderTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: RECORD_COLORS.olive,
    letterSpacing: 0.2,
  },
  categoryHeaderCount: {
    fontSize: 12,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
  },
  categoryToggleCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.card,
  },
  categoryToggleExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
  },
  categoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RECORD_COLORS.oliveSoft,
    flexShrink: 0,
  },
  categoryTextBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  categoryCollapsedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: RECORD_COLORS.text,
  },
  categoryCollapsedSub: {
    fontSize: 11,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  categoryToggleExpandedTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
    color: RECORD_COLORS.olive,
    letterSpacing: 0.2,
  },
  categoryToggleExpandedCount: {
    fontSize: 12,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
  },
  categoryCountBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
  },
  categoryCountBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
  },

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
  thumb: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: RECORD_COLORS.oliveSoft,
    flexShrink: 0,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
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
  splitDateChips: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  dateEditSpacer: {
    flex: 1,
  },
  deleteZone: {
    padding: 4,
    marginLeft: 'auto',
  },
});

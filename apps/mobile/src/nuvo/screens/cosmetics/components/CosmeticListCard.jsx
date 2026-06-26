import React, { useMemo } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getCosmeticCategoryIcon,
  getCurrentUsageCaption,
  getPastUsageCaption,
  getProductCategory,
  UNCATEGORIZED_LABEL,
} from '../cosmeticDisplay';
import { parseDateString } from '../../../components/search/searchDateUtils';
import { RECORD_COLORS, shadowCard } from '../../record/components/SubScreenLayout';

/** 칩용 짧은 날짜: "6월 23일" */
function formatDateShort(dateStr) {
  if (!dateStr) return null;
  const d = parseDateString(dateStr);
  if (!d) return dateStr;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const COSMETICS_ACCENT = '#6B5F88';
const COSMETICS_SOFT   = '#EAE4F2';
const COSMETICS_MID    = '#B8ACCC';
const COSMETICS_MUTED  = '#9A8FB0';

// ── 카테고리별 색상 팔레트 ──────────────────────────────────────────────────
const CATEGORY_PALETTE = {
  클렌징:       { bg: '#DAF0F4', icon: '#3E90A8' },
  스킨케어:     { bg: '#DAF0E0', icon: '#3E8860' },
  선케어:       { bg: '#F4EDD8', icon: '#987840' },
  더모코스메틱: { bg: '#E8E2F0', icon: '#7060A0' },
  마스크팩:     { bg: '#F4DEE8', icon: '#A05878' },
  메이크업:     { bg: '#F0E8DC', icon: '#987858' },
  헤어케어:     { bg: '#DAF0E8', icon: '#3E9078' },
  [UNCATEGORIZED_LABEL]: { bg: '#E4EBD8', icon: '#6B7F58' },
};

function getCategoryPalette(category) {
  return CATEGORY_PALETTE[category] || CATEGORY_PALETTE[UNCATEGORIZED_LABEL];
}

// ── 카테고리 헤더 (expanded, 접기 불필요) ────────────────────────────────────
export function CosmeticCategoryHeader({ category, count }) {
  const iconName = getCosmeticCategoryIcon(category);
  const palette = getCategoryPalette(category);

  return (
    <View style={styles.categoryHeader}>
      <View style={[styles.categoryHeaderIcon, { backgroundColor: palette.bg }]}>
        <Ionicons name={iconName} size={13} color={palette.icon} />
      </View>
      <Text style={styles.categoryHeaderTitle}>{category}</Text>
      {count > 0 ? (
        <View style={styles.categoryHeaderBadge}>
          <Text style={styles.categoryHeaderBadgeText}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── 카테고리 토글 (접힘 / 펼침) ───────────────────────────────────────────────
export const CosmeticCategoryToggle = React.memo(function CosmeticCategoryToggle({
  category,
  count,
  expanded,
  previewLabel = null,
  onPress,
}) {
  const iconName = getCosmeticCategoryIcon(category);
  const palette = getCategoryPalette(category);

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
        <View style={[styles.categoryHeaderIcon, { backgroundColor: palette.bg }]}>
          <Ionicons name={iconName} size={13} color={palette.icon} />
        </View>
        <Text style={styles.categoryToggleExpandedTitle}>{category}</Text>
        <Text style={styles.categoryToggleExpandedCount}>{count}</Text>
        <Ionicons name="chevron-up" size={14} color={RECORD_COLORS.muted} />
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
      <View style={[styles.categoryIconWrap, { backgroundColor: palette.bg }]}>
        <Ionicons name={iconName} size={16} color={palette.icon} />
      </View>

      <View style={styles.categoryTextBlock}>
        <Text style={styles.categoryCollapsedTitle}>{category}</Text>
        <Text style={styles.categoryCollapsedSub} numberOfLines={1}>
          {previewLabel || `제품 ${count}개`}
        </Text>
      </View>

      <View style={[styles.categoryCountBadge, { borderColor: palette.bg }]}>
        <Text style={[styles.categoryCountBadgeText, { color: palette.icon }]}>{count}</Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={RECORD_COLORS.muted} />
    </TouchableOpacity>
  );
});

// ── 개별 제품 카드 ─────────────────────────────────────────────────────────────
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

  const category = useMemo(() => getProductCategory(item), [item]);
  const iconName = useMemo(() => getCosmeticCategoryIcon(category), [category]);
  const palette = useMemo(() => getCategoryPalette(category), [category]);

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

  const hasSplitDateChips = isPast && (onEditStartDate || onEditEndDate);
  const showDateRow = !!(onEditDate || hasSplitDateChips || onDelete);

  return (
    <View style={[styles.card, saving && styles.cardSaving]}>
      {/* ── 메인 행: 썸네일 + 정보 + 액션 ───────────────── */}
      <View style={styles.mainRow}>
        {/* 썸네일 */}
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
            <View style={[styles.thumb, { backgroundColor: palette.bg }]}>
              <Ionicons name={iconName} size={22} color={palette.icon} />
            </View>
          )}

          {/* 제품 텍스트 */}
          <View style={styles.textBlock}>
            <Text style={styles.name} numberOfLines={1}>
              {productName}
            </Text>

            {/* 브랜드 · N일째 한 줄 */}
            {(brand || daysText) ? (
              <Text style={styles.meta} numberOfLines={1}>
                {[brand, daysText].filter(Boolean).join('  ·  ')}
              </Text>
            ) : null}

            {/* 성분 분석 힌트 */}
            {onPress ? (
              <View style={styles.analysisHint}>
                <Ionicons name="sparkles-outline" size={10} color={palette.icon} />
                <Text style={[styles.analysisHintText, { color: palette.icon }]}>성분 분석</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        {/* 액션 버튼 영역 */}
        {saving ? (
          <ActivityIndicator size="small" color={COSMETICS_ACCENT} style={styles.spinner} />
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
                <Ionicons name="calendar-outline" size={15} color={COSMETICS_MUTED} />
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
            <Ionicons name="refresh-outline" size={14} color={COSMETICS_ACCENT} />
            <Text style={styles.resumeBtnText}>다시 사용</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── 날짜 행 ──────────────────────────────────────── */}
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
                  <Ionicons name="play-circle-outline" size={12} color={COSMETICS_ACCENT} />
                  <Text style={styles.dateChipText} numberOfLines={1}>
                    {formatDateShort(item.started_at) || '시작일'}
                  </Text>
                  <Ionicons name="pencil-outline" size={10} color={COSMETICS_MUTED} />
                </TouchableOpacity>
              ) : null}
              {onEditEndDate ? (
                <TouchableOpacity
                  activeOpacity={0.72}
                  style={[styles.dateChip, styles.dateChipEnd]}
                  onPress={onEditEndDate}
                  disabled={saving}
                  accessibilityLabel="종료일 수정"
                >
                  <Ionicons name="stop-circle-outline" size={12} color="#9A5A62" />
                  <Text style={[styles.dateChipText, styles.dateChipTextEnd]} numberOfLines={1}>
                    {formatDateShort(item.ended_at) || '종료일'}
                  </Text>
                  <Ionicons name="pencil-outline" size={10} color="#B0808A" />
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
              <Ionicons name="play-circle-outline" size={12} color={COSMETICS_ACCENT} />
              <Text style={styles.dateChipText} numberOfLines={1}>
                {usageCaption.primary || '시작일 수정'}
              </Text>
              <Ionicons name="pencil-outline" size={10} color={COSMETICS_MUTED} />
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
  // ── 카테고리 헤더 ─────────────────────────────────────────────────────────
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 6,
  },
  categoryHeaderIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryHeaderTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: RECORD_COLORS.text,
    letterSpacing: 0.1,
    flex: 1,
  },
  categoryHeaderBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
  },
  categoryHeaderBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
  },

  // ── 카테고리 토글 ─────────────────────────────────────────────────────────
  categoryToggleCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.card,
    ...shadowCard,
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
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#5A6070',
  },
  categoryToggleExpandedTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
    color: RECORD_COLORS.text,
    letterSpacing: 0.1,
  },
  categoryToggleExpandedCount: {
    fontSize: 12,
    fontWeight: '800',
    color: '#5A6070',
  },
  categoryCountBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1.5,
  },
  categoryCountBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },

  // ── 카드 ────────────────────────────────────────────────────────────────────
  card: {
    borderRadius: 16,
    backgroundColor: RECORD_COLORS.card,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    marginBottom: 8,
    overflow: 'hidden',
    ...shadowCard,
  },
  cardSaving: {
    opacity: 0.6,
  },

  // ── 메인 행 ────────────────────────────────────────────────────────────────
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 12,
    paddingRight: 10,
    gap: 10,
  },
  infoZone: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minWidth: 0,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: '800',
    color: RECORD_COLORS.text,
    lineHeight: 20,
  },
  meta: {
    fontSize: 12,
    fontWeight: '500',
    color: RECORD_COLORS.muted,
    lineHeight: 17,
    marginTop: 2,
  },
  analysisHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  analysisHintText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // ── 액션 버튼 ──────────────────────────────────────────────────────────────
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
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COSMETICS_MID,
    backgroundColor: COSMETICS_SOFT,
  },
  stopTodayBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COSMETICS_ACCENT,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COSMETICS_MID,
    backgroundColor: COSMETICS_SOFT,
  },
  resumeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: COSMETICS_ACCENT,
  },

  // ── 날짜 행 ────────────────────────────────────────────────────────────────
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    borderColor: COSMETICS_MID,
    backgroundColor: COSMETICS_SOFT,
    flexShrink: 1,
  },
  dateChipEnd: {
    borderColor: '#E0C0C4',
    backgroundColor: '#FBF0F1',
  },
  dateChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COSMETICS_ACCENT,
    flexShrink: 1,
  },
  dateChipTextEnd: {
    color: '#9A5A62',
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

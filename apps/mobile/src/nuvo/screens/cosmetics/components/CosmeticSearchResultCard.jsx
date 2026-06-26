import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { searchStyles } from '../../../components/search/SearchScreenParts';
import { RECORD_COLORS, shadowCard } from '../../record/components/SubScreenLayout';
import { getCosmeticCategoryIcon, normalizeCosmeticCategory } from '../cosmeticDisplay';

const COSMETICS_ACCENT = '#6B5F88';
const COSMETICS_SOFT   = '#EAE4F2';

// ── 카테고리별 색상 팔레트 — 파스텔·뮤트 톤 통일 ────────────────────────────
// 모든 bg: 밝기 95%↑, icon: 채도 35~45% / 밝기 50~60% 으로 통일
const CATEGORY_PALETTE = {
  클렌징:       { bg: '#EAF4FB', icon: '#5890B0', text: '#3A6E8C' },
  스킨케어:     { bg: '#EAF6EE', icon: '#4E8C65', text: '#2E6A48' },
  선케어:       { bg: '#FBF5E6', icon: '#B89040', text: '#8C6E20' },
  더모코스메틱: { bg: '#F0EAF8', icon: '#7A62B0', text: '#5A4490' },
  마스크팩:     { bg: '#FAE8F2', icon: '#C06888', text: '#9A4870' },
  메이크업:     { bg: '#F8EDE8', icon: '#B07858', text: '#8A5838' },
  헤어케어:     { bg: '#E8F7F3', icon: '#4A9480', text: '#2E7260' },
  미분류:       { bg: '#F2F2F2', icon: '#909090', text: '#666666' },
};

const DEFAULT_PALETTE = { bg: '#EAE4F2', icon: '#6B5F88', text: '#4E4070' };

function getCategoryPalette(category) {
  return CATEGORY_PALETTE[category] ?? DEFAULT_PALETTE;
}

export default function CosmeticSearchResultCard({ item, onRegister, onPreview }) {
  const metaParts = [item.brand].filter(Boolean);
  const category  = normalizeCosmeticCategory(item.category);
  const iconName  = getCosmeticCategoryIcon(category);
  const palette   = getCategoryPalette(category);

  return (
    <View style={styles.card}>
      <View style={searchStyles.resultRow}>
        {/* ── 메인 탭 영역 ── */}
        <TouchableOpacity
          activeOpacity={0.82}
          style={searchStyles.resultMainTap}
          onPress={() => onRegister(item)}
        >
          {/* 썸네일 */}
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumbPlaceholder, { backgroundColor: palette.bg }]}>
              <Ionicons name={iconName} size={26} color={palette.icon} />
            </View>
          )}

          {/* 텍스트 블록 */}
          <View style={searchStyles.resultBody}>
            <Text style={styles.productName} numberOfLines={2}>
              {item.product_name?.replace(/<\/?b>/gi, '')}
            </Text>

            {metaParts.length > 0 ? (
              <Text style={styles.brandText} numberOfLines={1}>
                {metaParts[0]}
              </Text>
            ) : null}

            {/* 카테고리 뱃지 */}
            <View style={[styles.categoryBadge, { backgroundColor: palette.bg }]}>
              <Ionicons name={iconName} size={10} color={palette.icon} />
              <Text style={[styles.categoryBadgeText, { color: palette.text }]}>
                {category}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* ── 오른쪽 액션 — 항상 보라(테마색) ── */}
        <View style={styles.actions}>
          {/* 성분 분석 버튼 — 항상 보라 */}
          <TouchableOpacity
            style={styles.sparklesBtn}
            onPress={() => onPreview(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="성분 분석"
          >
            <Ionicons name="sparkles-outline" size={14} color={COSMETICS_ACCENT} />
            <Text style={styles.sparklesBtnText}>분석</Text>
          </TouchableOpacity>

          {/* + 추가 버튼 */}
          <View style={styles.addChip}>
            <Ionicons name="add" size={14} color={RECORD_COLORS.text} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: RECORD_COLORS.card,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
    ...shadowCard,
  },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: 14,
    flexShrink: 0,
  },
  thumbPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  productName: {
    fontSize: 14,
    fontWeight: '800',
    color: RECORD_COLORS.text,
    lineHeight: 20,
  },
  brandText: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: '#5A6070',
    lineHeight: 17,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },

  // ── 오른쪽 액션 영역 ──
  actions: {
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
  },
  sparklesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: COSMETICS_SOFT,
    borderWidth: 1,
    borderColor: '#D0C8E8',
  },
  sparklesBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: COSMETICS_ACCENT,
  },
  addChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

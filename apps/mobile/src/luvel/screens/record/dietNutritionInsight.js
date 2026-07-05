import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { lookupFoodItem } from '../../../api/diet';
import { RECORD_COLORS } from './components/SubScreenLayout';

// ── 내부 유틸 ────────────────────────────────────────────────────────────────

const LEVEL_STYLE = {
  high:   { bg: 'rgba(181,73,58,0.08)', text: '#9C3C2E', border: 'rgba(181,73,58,0.14)' },
  medium: { bg: 'rgba(79,96,60,0.08)',  text: '#4F603C', border: 'rgba(79,96,60,0.15)'  },
};

function SkinFactorChip({ factor, compact }) {
  const s = LEVEL_STYLE[factor.level] ?? LEVEL_STYLE.medium;
  return (
    <View style={[styles.chip, { backgroundColor: s.bg, borderColor: s.border }]}>
      <Text style={[styles.chipText, { color: s.text }, compact && styles.chipTextCompact]}>
        {factor.label}
      </Text>
    </View>
  );
}

// ── 공개 유틸 함수 ───────────────────────────────────────────────────────────

export function formatDietImpactFromSkinFactors(skinFactors) {
  if (!Array.isArray(skinFactors) || skinFactors.length === 0) return null;
  const tags = skinFactors.map((f) => f.label).filter(Boolean);
  return tags.length > 0 ? tags.join(' · ') : null;
}

/** GPT 추정 nutrition dict → summary 문자열 (GPT 경로 전용) */
export function formatDietImpactFromNutrition(nutrition) {
  if (!nutrition || typeof nutrition !== 'object') return null;
  const tags = [];
  const calories    = Number(nutrition['에너지(kcal)']);
  const sodium      = Number(nutrition['나트륨(mg)']);
  const carb        = Number(nutrition['탄수화물(g)']);
  const sugar       = Number(nutrition['당류(g)']);
  const fat         = Number(nutrition['지방(g)']);
  if (Number.isFinite(calories) && calories >= 450) tags.push('고열량');
  if (Number.isFinite(sodium)   && sodium   >= 600) tags.push('고나트륨');
  if (Number.isFinite(carb)     && carb     >= 50)  tags.push('고탄수화물');
  if (Number.isFinite(sugar)    && sugar    >= 15)   tags.push('고당류');
  if (Number.isFinite(fat)      && fat      > 8)    tags.push('고지방');
  return tags.length > 0 ? tags.join(' · ') : null;
}

export function formatDietImpactFromFoodItem(foodItem) {
  if (!foodItem) return null;
  if (Array.isArray(foodItem.skin_factors) && foodItem.skin_factors.length > 0) {
    return formatDietImpactFromSkinFactors(foodItem.skin_factors);
  }
  return null;
}

export function matchTypeFromFoodItem(foodItem) {
  if (!foodItem) return '';
  if (foodItem.source === 'gpt_estimate') return 'GPT추정';
  if (foodItem.source === 'mfds_api') return '공공API';
  return 'DB';
}

/** FoodItemResponse(flat 필드) → formatDietImpactFromNutrition용 nutrition dict */
export function foodItemToNutrition(foodItem) {
  if (!foodItem) return null;
  const result = {};
  if (foodItem.calories     != null) result['에너지(kcal)'] = foodItem.calories;
  if (foodItem.carbohydrate != null) result['탄수화물(g)']  = foodItem.carbohydrate;
  if (foodItem.sugar        != null) result['당류(g)']      = foodItem.sugar;
  if (foodItem.protein      != null) result['단백질(g)']    = foodItem.protein;
  if (foodItem.fat          != null) result['지방(g)']      = foodItem.fat;
  if (foodItem.sodium       != null) result['나트륨(mg)']   = foodItem.sodium;
  return Object.keys(result).length > 0 ? result : null;
}

export function formatDietImpactFromLog(log) {
  if (Array.isArray(log?.skin_factors) && log.skin_factors.length > 0) {
    return formatDietImpactFromSkinFactors(log.skin_factors);
  }
  if (log?.nutrition) return formatDietImpactFromNutrition(log.nutrition);
  return null;
}

export function isGptEstimateMatch(matchType) {
  return typeof matchType === 'string' && matchType.includes('GPT');
}

function hasSuccessfulMatch(matchType) {
  if (typeof matchType !== 'string') return false;
  const mt = matchType.trim();
  if (!mt) return false;
  return mt !== '없음' && mt !== '인식실패';
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────────

/**
 * skinFactors: DB skin_factors 배열 (칩 렌더링)
 * summary:     GPT 추정 문자열 폴백 (있으면 텍스트 표시)
 * matchType:   매칭 타입 문자열
 */
/**
 * position="header" : SectionCard trailing 슬롯용 — 칩/태그만 표시, 배경 없음
 * compact=true       : 목록 카드 내 인라인 표시 (현재 미사용, 레거시 호환)
 * default            : 상세 편집 화면용 슬림 카드
 */
export function DietNutritionInsight({ skinFactors, summary, matchType, compact = false, position }) {
  const isGpt    = isGptEstimateMatch(matchType);
  const hasMatch = hasSuccessfulMatch(matchType);

  if (!hasMatch) return null;

  const factors = Array.isArray(skinFactors) && skinFactors.length > 0 ? skinFactors : null;

  /* ── header (SectionCard trailing 슬롯) ── 칩/태그만, 배경 없음 */
  if (position === 'header') {
    if (!factors && !summary) return null;

    const MAX_VISIBLE = 2;

    if (factors) {
      const visible = factors.slice(0, MAX_VISIBLE);
      const overflow = factors.length - MAX_VISIBLE;
      return (
        <View style={styles.headerChipRow}>
          {visible.map((f) => (
            <SkinFactorChip key={f.key} factor={f} compact={false} />
          ))}
          {overflow > 0 && (
            <View style={[styles.chip, styles.chipOverflow]}>
              <Text style={[styles.chipText, styles.chipOverflowText]}>+{overflow}</Text>
            </View>
          )}
        </View>
      );
    }

    // summary 텍스트를 태그로 분리 (최대 2개 + 오버플로우)
    const allTags = summary.split(' · ');
    const visibleTags = allTags.slice(0, MAX_VISIBLE);
    const overflow = allTags.length - MAX_VISIBLE;
    return (
      <View style={styles.headerChipRow}>
        {visibleTags.map((tag) => (
          <View key={tag} style={[styles.chip, styles.chipMedium]}>
            <Text style={[styles.chipText, { color: RECORD_COLORS.oliveMuted }]}>{tag}</Text>
          </View>
        ))}
        {overflow > 0 && (
          <View style={[styles.chip, styles.chipOverflow]}>
            <Text style={[styles.chipText, styles.chipOverflowText]}>+{overflow}</Text>
          </View>
        )}
      </View>
    );
  }

  /* ── body (카드 본문 상단) ── 배경 없이 칩만, 없으면 null */
  if (position === 'body') {
    if (!factors && !summary) return null;

    if (factors) {
      return (
        <View style={styles.bodyChipRow}>
          {factors.map((f) => (
            <SkinFactorChip key={f.key} factor={f} compact={false} />
          ))}
        </View>
      );
    }

    // summary → 태그로 분리
    const allTags = summary.split(' · ');
    return (
      <View style={styles.bodyChipRow}>
        {allTags.map((tag) => (
          <View key={tag} style={[styles.chip, styles.chipMedium]}>
            <Text style={[styles.chipText, { color: RECORD_COLORS.oliveMuted }]}>{tag}</Text>
          </View>
        ))}
      </View>
    );
  }

  /* ── compact (목록 카드) ── 카드 없이 인라인으로 */
  if (compact) {
    return (
      <View style={styles.compactWrap}>
        {/* 구분선 */}
        <View style={styles.compactDivider} />
        <View style={styles.compactRow}>
          <Ionicons
            name={isGpt ? 'sparkles' : 'leaf-outline'}
            size={12}
            color={isGpt ? '#9A6B2F' : RECORD_COLORS.oliveMuted}
          />
          {factors ? (
            <View style={styles.chipRow}>
              {factors.map((f) => (
                <SkinFactorChip key={f.key} factor={f} compact />
              ))}
            </View>
          ) : summary ? (
            <Text style={styles.compactSummary} numberOfLines={1}>{summary}</Text>
          ) : (
            <Text style={styles.compactSafe}>피부에 특별한 영향 없어요</Text>
          )}
        </View>
      </View>
    );
  }

  /* ── non-compact (상세 편집 화면) ── 슬림 카드 */
  return (
    <View style={[styles.nutritionCard, isGpt && styles.nutritionCardGpt]}>
      {/* 헤더 */}
      <View style={styles.insightHeader}>
        <Ionicons
          name={isGpt ? 'sparkles' : 'leaf-outline'}
          size={14}
          color={isGpt ? '#9A6B2F' : RECORD_COLORS.oliveMuted}
        />
        <Text style={[styles.insightLabel, isGpt && styles.insightLabelGpt]}>
          {isGpt ? 'AI 추정 영양 정보' : '영양 분석'}
        </Text>
      </View>

      {/* GPT 안내문 */}
      {isGpt && (
        <Text style={styles.gptNotice}>
          공식 DB에 없는 음식 · AI가 추정한 값이에요
        </Text>
      )}

      {/* 내용 */}
      {factors ? (
        <View style={styles.chipRow}>
          {factors.map((f) => (
            <SkinFactorChip key={f.key} factor={f} compact={false} />
          ))}
        </View>
      ) : summary ? (
        <Text style={styles.insightText}>{summary}</Text>
      ) : (
        <View style={styles.safeRow}>
          <Ionicons name="checkmark-circle" size={14} color={RECORD_COLORS.oliveMuted} />
          <Text style={styles.safeText}>피부에 특별한 영향 없어요</Text>
        </View>
      )}
    </View>
  );
}

// ── 목록 카드용 래퍼 ─────────────────────────────────────────────────────────

export function DietCardNutrition({ log, compact = false, position }) {
  const foodName       = (log?.food_names?.[0] || '').trim();
  const apiSkinFactors = Array.isArray(log?.skin_factors) && log.skin_factors.length > 0
    ? log.skin_factors
    : null;
  const apiMatchType   = log?.match_type || '';
  const isNutritionEstimate = isGptEstimateMatch(apiMatchType) || apiMatchType === '공공API';
  const apiSummary     = !apiSkinFactors && isNutritionEstimate && log?.nutrition
    ? formatDietImpactFromNutrition(log.nutrition)
    : null;

  const [fallbackFactors,   setFallbackFactors]   = useState(null);
  const [fallbackSummary,   setFallbackSummary]   = useState(null);
  const [fallbackMatchType, setFallbackMatchType] = useState('');

  useEffect(() => {
    // API에서 직접 skin_factors 또는 nutrition을 받았으면 폴백 불필요
    if (apiSkinFactors !== null || apiSummary || !foodName) {
      setFallbackFactors(null);
      setFallbackSummary(null);
      setFallbackMatchType('');
      return undefined;
    }

    let cancelled = false;
    lookupFoodItem(foodName)
      .then(({ nutrition, match_type, skin_factors }) => {
        if (cancelled) return;
        if (Array.isArray(skin_factors) && skin_factors.length > 0) {
          setFallbackFactors(skin_factors);
          setFallbackSummary(null);
        } else {
          setFallbackFactors(null);
          const isGptOrApi = isGptEstimateMatch(match_type || '') || match_type === '공공API';
          setFallbackSummary(isGptOrApi ? formatDietImpactFromNutrition(nutrition) : null);
        }
        setFallbackMatchType(match_type || '');
      })
      .catch(() => {
        if (!cancelled) {
          setFallbackFactors(null);
          setFallbackSummary(null);
          setFallbackMatchType('');
        }
      });

    return () => { cancelled = true; };
  }, [apiSkinFactors, apiSummary, foodName, log?.id]);

  return (
    <DietNutritionInsight
      skinFactors={apiSkinFactors ?? fallbackFactors}
      summary={apiSummary || fallbackSummary}
      matchType={log?.match_type || fallbackMatchType}
      compact={compact}
      position={position}
    />
  );
}

// ── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  /* ── non-compact 카드 ── */
  nutritionCard: {
    backgroundColor: RECORD_COLORS.chip,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
    gap: 8,
  },
  nutritionCardGpt: {
    backgroundColor: '#FFFAF3',
    borderColor: 'rgba(154,107,47,0.20)',
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  insightLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: RECORD_COLORS.muted,
  },
  insightLabelGpt: { color: '#9A6B2F' },
  gptNotice: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
    color: '#9A6B2F',
  },

  /* 칩 */
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  chipTextCompact: { fontSize: 11.5 },

  /* non-compact 텍스트 폴백 */
  insightText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: RECORD_COLORS.text,
  },

  /* non-compact 특이사항 없음 */
  safeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  safeText: {
    fontSize: 12,
    fontWeight: '600',
    color: RECORD_COLORS.oliveMuted,
  },

  /* ── body (카드 본문) ── */
  bodyChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 10,
    marginBottom: 2,
  },

  /* ── header trailing 슬롯 ── */
  headerChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'flex-end',
  },
  chipMedium: {
    backgroundColor: 'rgba(79,96,60,0.07)',
    borderColor: 'rgba(79,96,60,0.13)',
  },
  chipOverflow: {
    backgroundColor: RECORD_COLORS.chip,
    borderColor: RECORD_COLORS.line,
  },
  chipOverflowText: {
    color: RECORD_COLORS.muted,
  },

  /* ── compact 인라인 ── */
  compactWrap: {
    marginTop: 8,
  },
  compactDivider: {
    height: 1,
    backgroundColor: RECORD_COLORS.line,
    marginBottom: 7,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  compactSummary: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  compactSafe: {
    fontSize: 11.5,
    fontWeight: '600',
    color: RECORD_COLORS.oliveMuted,
  },
});

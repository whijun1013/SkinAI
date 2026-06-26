export const SAFETY_GRADE_CONFIG = {
  '안전 (Green)': {
    color: '#3D8B37',
    bg: 'rgba(61,139,55,0.10)',
    icon: 'shield-checkmark',
    label: '괜찮아요',
    summary: '특별히 주의할 성분이 많지 않아요.',
  },
  '주의 (Yellow)': {
    color: '#C49A2B',
    bg: 'rgba(196,154,43,0.10)',
    icon: 'warning',
    label: '주의가 필요해요',
    summary: '자극·코메도제닉 성분이 일부 포함돼 있어요.',
  },
  '경고 (Red)': {
    color: '#C45C4A',
    bg: 'rgba(196,92,74,0.10)',
    icon: 'alert-circle',
    label: '사용을 재고해 보세요',
    summary: '주의가 필요한 성분이 여러 개 있어요.',
  },
};

export function getSafetyGradeConfig(grade, analysis) {
  if (analysis) {
    const hasIssues =
      analysis.irritant_count > 0 || analysis.comedogenic_count > 0 || analysis.banned_count > 0;
    if (!hasIssues) {
      return SAFETY_GRADE_CONFIG['안전 (Green)'];
    }
    // 문제 성분이 있는데 grade 매핑 실패 시 — '안전' 오판 방지를 위해 '주의'로 fallback
    return SAFETY_GRADE_CONFIG[grade] || SAFETY_GRADE_CONFIG['주의 (Yellow)'];
  }
  return SAFETY_GRADE_CONFIG[grade] || SAFETY_GRADE_CONFIG['안전 (Green)'];
}

export function formatAnalysisStats(analysis) {
  if (!analysis) return '';
  const parts = [];
  if (analysis.irritant_count > 0) parts.push(`자극 ${analysis.irritant_count}`);
  if (analysis.comedogenic_count > 0) parts.push(`코메도 ${analysis.comedogenic_count}`);
  if (analysis.banned_count > 0) parts.push(`금지 ${analysis.banned_count}`);
  return parts.length > 0 ? parts.join(' · ') : '주의 성분 없음';
}

export function getIngredientFlags(ingredient) {
  const flags = [];
  if (ingredient.is_banned) flags.push({ key: 'banned', label: '금지', tone: 'red' });
  if (ingredient.is_irritant) flags.push({ key: 'irritant', label: '자극', tone: 'red' });
  if (ingredient.comedogenic != null && ingredient.comedogenic > 0) {
    flags.push({ key: 'comed', label: `코메도 ${ingredient.comedogenic}`, tone: 'yellow' });
  }
  if (ingredient.restriction_limit) flags.push({ key: 'restrict', label: '제한', tone: 'yellow' });
  return flags;
}

export function getRiskIngredients(analysis, detail) {
  if (analysis?.risk_ingredients?.length) return analysis.risk_ingredients;
  const list = detail?.ingredients_list || [];
  return list.filter((ing) => getIngredientFlags(ing).length > 0);
}

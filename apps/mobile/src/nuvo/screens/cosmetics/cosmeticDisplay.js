import { formatKoreanDate, parseDateString } from '../../components/search/searchDateUtils';

/**
 * cosmetic_products.category — 올리브영 시드(oliveyoung_db.json) 기준 대분류.
 * @see apps/backend/data/oliveyoung_db.json (올리브영 크롤 시드)
 */
export const COSMETIC_DB_CATEGORIES = [
  '클렌징',
  '스킨케어',
  '선케어',
  '더모코스메틱',
  '마스크팩',
  '메이크업',
  '헤어케어',
];

export const COSMETIC_CATEGORY_ORDER = COSMETIC_DB_CATEGORIES;

export const COSMETIC_SEARCH_CATEGORIES = ['전체', ...COSMETIC_DB_CATEGORIES];

export const UNCATEGORIZED_LABEL = '미분류';

/** 사용 중 목록 설계 상한 — 이 범위 안에서 UI·렌더 비용을 맞춤 */
export const CURRENT_COSMETICS_FLAT_MAX = 6;
export const CURRENT_COSMETICS_PARTIAL_EXPAND_MAX = 12;

export const CURRENT_COSMETICS_LAYOUT = {
  FLAT: 'flat',
  PARTIAL: 'partial',
  COLLAPSED: 'collapsed',
};

export function getCurrentCosmeticsLayoutMode(count) {
  if (count <= CURRENT_COSMETICS_FLAT_MAX) return CURRENT_COSMETICS_LAYOUT.FLAT;
  if (count <= CURRENT_COSMETICS_PARTIAL_EXPAND_MAX) return CURRENT_COSMETICS_LAYOUT.PARTIAL;
  return CURRENT_COSMETICS_LAYOUT.COLLAPSED;
}

export function getDefaultExpandedCategoryCount(layoutMode) {
  if (layoutMode === CURRENT_COSMETICS_LAYOUT.PARTIAL) return 2;
  return 0;
}

const COSMETIC_CATEGORY_ICONS = {
  클렌징: 'water-outline',
  스킨케어: 'leaf-outline',
  선케어: 'sunny-outline',
  더모코스메틱: 'medkit-outline',
  마스크팩: 'ellipse-outline',
  메이크업: 'color-palette-outline',
  헤어케어: 'cut-outline',
  [UNCATEGORIZED_LABEL]: 'flask-outline',
};

export function getCosmeticCategoryIcon(category) {
  return COSMETIC_CATEGORY_ICONS[category] || 'grid-outline';
}

export function buildCategoryPreviewLabel(items, maxNames = 2) {
  if (!items?.length) return null;

  const names = items
    .map((item) => item?.product?.product_name?.trim())
    .filter(Boolean)
    .slice(0, maxNames);

  if (!names.length) return `제품 ${items.length}개`;

  const remaining = items.length - names.length;
  if (remaining > 0) return `${names.join(', ')} 외 ${remaining}개`;
  return names.join(', ');
}

/** 테스트·레거시 영문 category → DB 대분류 */
const LEGACY_CATEGORY_ALIASES = {
  Cleanser: '클렌징',
  cleanser: '클렌징',
  Cream: '스킨케어',
  cream: '스킨케어',
  Toner: '스킨케어',
  toner: '스킨케어',
  Serum: '스킨케어',
  serum: '스킨케어',
  Sunscreen: '선케어',
  sunscreen: '선케어',
};

export function normalizeCosmeticCategory(raw) {
  const trimmed = raw?.trim();
  if (!trimmed) return UNCATEGORIZED_LABEL;
  if (COSMETIC_DB_CATEGORIES.includes(trimmed)) return trimmed;
  return LEGACY_CATEGORY_ALIASES[trimmed] || trimmed;
}

export function getProductCategory(item) {
  return normalizeCosmeticCategory(item?.product?.category);
}

export function groupCosmeticsByCategory(items) {
  const groups = new Map();

  for (const item of items) {
    const category = getProductCategory(item);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  }

  const ordered = [];
  const seen = new Set();

  for (const category of COSMETIC_CATEGORY_ORDER) {
    const categoryItems = groups.get(category);
    if (categoryItems?.length) {
      ordered.push({ category, items: categoryItems });
      seen.add(category);
    }
  }

  const uncategorizedItems = groups.get(UNCATEGORIZED_LABEL);
  if (uncategorizedItems?.length) {
    ordered.push({ category: UNCATEGORIZED_LABEL, items: uncategorizedItems });
    seen.add(UNCATEGORIZED_LABEL);
  }

  for (const [category, categoryItems] of groups) {
    if (!seen.has(category) && categoryItems.length) {
      ordered.push({ category, items: categoryItems });
    }
  }

  return ordered;
}

function formatUsageDate(dateStr) {
  if (!dateStr) return null;
  return formatKoreanDate(dateStr) || dateStr;
}

/** 칩 전용 짧은 날짜 — "6월 23일" */
function formatShortDate(dateStr) {
  if (!dateStr) return null;
  const d = parseDateString(dateStr);
  if (!d) return dateStr;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 사용 중 탭 — 시작일 + 사용 일수 */
export function getCurrentUsageCaption(item) {
  const startShort = formatShortDate(item?.started_at);
  if (!startShort) {
    return { primary: '시작일 미기록', secondary: null, usageDays: null };
  }

  const start = parseDateString(item.started_at);
  let usageDays = null;
  if (start) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 0) usageDays = diffDays;
  }

  return {
    primary: startShort,
    secondary: usageDays ? `${usageDays}일째 사용` : null,
    usageDays,
  };
}

function getUsageDurationDays(startedAt, endedAt) {
  const start = parseDateString(startedAt);
  const end = parseDateString(endedAt);
  if (!start || !end) return null;
  const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return diffDays > 0 ? diffDays : null;
}

/** 사용 종료 탭 — 시작~종료 기간 */
export function getPastUsageCaption(item) {
  const startLabel = formatUsageDate(item?.started_at);
  const endLabel = formatUsageDate(item?.ended_at);

  const usageDays = getUsageDurationDays(item?.started_at, item?.ended_at);

  if (startLabel && endLabel) {
    return {
      primary: `${startLabel} ~ ${endLabel}`,
      secondary: usageDays ? `총 ${usageDays}일 사용` : '사용 기간',
      usageDays,
    };
  }
  if (endLabel) {
    return {
      primary: `${endLabel} 종료`,
      secondary: startLabel ? `시작 ${startLabel}` : null,
      usageDays: null,
    };
  }
  if (startLabel) {
    return { primary: `${startLabel}부터`, secondary: '종료일 미기록', usageDays: null };
  }
  return { primary: '기간 미기록', secondary: null, usageDays: null };
}

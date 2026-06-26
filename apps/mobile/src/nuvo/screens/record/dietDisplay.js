/** 본식 끼니 (간식 제외) */
export const MAIN_MEALS = ['아침', '점심', '저녁'];

/** 식사 종류별 Ionicons 아이콘 이름 */
export const MEAL_ICONS = {
  아침: 'sunny-outline',
  점심: 'partly-sunny-outline',
  저녁: 'moon-outline',
  간식: 'cafe-outline',
};

/** 목록 API food_names 또는 구형 items 응답 모두 지원 */
export function getFoodNames(log) {
  if (Array.isArray(log?.food_names) && log.food_names.length > 0) {
    return log.food_names;
  }
  const items = Array.isArray(log?.items) ? log.items : [];
  return items.map((item) => item?.custom_food_name || item?.food_item?.name || '음식명 없음');
}

export function formatFoodNames(log) {
  const names = getFoodNames(log);
  return names.length > 0 ? names.join(', ') : '';
}

/**
 * food_names가 비어있고 사진이 있으면 AI가 아직 분석 중인 상태.
 * 사용자가 직접 이름을 입력한 경우는 해당 없음.
 */
export function isAiEnrichPending(log) {
  const hasPhoto = !!log?.photo_url;
  const hasNames = Array.isArray(log?.food_names) && log.food_names.length > 0;
  const hasItemNames = Array.isArray(log?.items) && log.items.some(
    (item) => item?.custom_food_name || item?.food_item?.name
  );
  return hasPhoto && !hasNames && !hasItemNames;
}

const MEAL_ORDER = { 아침: 0, 점심: 1, 저녁: 2, 간식: 3 };

export function getRecordedMainMeals(logs) {
  if (!Array.isArray(logs)) return [];
  return MAIN_MEALS.filter((meal) => logs.some((log) => log.meal_type === meal));
}

export function getSnackCount(logs) {
  if (!Array.isArray(logs)) return 0;
  return logs.filter((log) => log.meal_type === '간식').length;
}

/** 기록 탭·상세 배너용: "아침 · 점심" 또는 "아침 · 간식 1건" */
export function formatDietSummary(logs) {
  const mainMeals = getRecordedMainMeals(logs);
  const snackCount = getSnackCount(logs);

  if (mainMeals.length === 0 && snackCount === 0) return null;

  const parts = [];
  if (mainMeals.length > 0) parts.push(mainMeals.join(' · '));
  if (snackCount > 0) parts.push(`간식 ${snackCount}건`);

  return parts.join(' · ');
}

export function sortDietLogs(logs) {
  if (!Array.isArray(logs)) return [];
  return [...logs].sort((a, b) => (MEAL_ORDER[a.meal_type] ?? 9) - (MEAL_ORDER[b.meal_type] ?? 9));
}

/**
 * 기록 탭 식단 카드 텍스트: "아침 2  ·  점심 3  ·  저녁 1"
 * 같은 meal_type 로그는 묶어서 음식 수 합산
 */
export function formatDietLines(logs) {
  if (!Array.isArray(logs) || logs.length === 0) return [];

  // meal_type 별로 묶기
  const grouped = {};
  for (const log of logs) {
    const type = log.meal_type ?? "기타";
    if (!grouped[type]) grouped[type] = { count: 0, hasPending: false };
    const names = getFoodNames(log);
    if (names.length > 0) {
      grouped[type].count += names.length;
    } else if (isAiEnrichPending(log)) {
      grouped[type].hasPending = true;
    } else {
      grouped[type].count += 1;
    }
  }

  return Object.entries(grouped)
    .sort(([a], [b]) => (MEAL_ORDER[a] ?? 9) - (MEAL_ORDER[b] ?? 9))
    .map(([type, { count, hasPending }]) => {
      const display = hasPending && count === 0 ? "?" : count;
      return `${type} ${display}`;
    });
}

/** 기록 탭 식단 썸네일 슬롯 (아침·점심·저녁) — API SAS photo_url 사용 */
export function buildMealSlots(logs) {
  if (!Array.isArray(logs)) {
    return MAIN_MEALS.map((label) => ({ label, hasLog: false, imageUri: null }));
  }
  return MAIN_MEALS.map((meal) => {
    const log = logs.find((item) => item.meal_type === meal);
    return {
      label: meal,
      hasLog: !!log,
      imageUri: log?.photo_url ?? null,
    };
  });
}

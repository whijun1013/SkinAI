export const skinTypeOptions = ["건성", "지성", "복합성", "민감성", "중성"];
export const skinTypeModeOptions = [
  { label: "네, 알아요", value: "known" },
  { label: "잘 모르겠어요", value: "unknown" },
];
export const skinConcernOptions = [
  "자주 당기거나 건조해요",
  "번들거리거나 모공이 넓어요",
  "트러블/여드름이 자주 나요",
  "쉽게 붉어지거나 따가워요",
  "코/이마는 번들거리고 볼은 건조해요",
  "특별한 고민이 없어요",
];
export const MAX_SKIN_CONCERNS = 2;
export const NO_SKIN_CONCERN_OPTION = "특별한 고민이 없어요";

export function normalizeSkinConcernsForSave(concerns) {
  if (!Array.isArray(concerns) || concerns.length === 0) return [];
  if (concerns.includes(NO_SKIN_CONCERN_OPTION)) return [];
  return concerns.slice(0, MAX_SKIN_CONCERNS);
}

export const genderOptions = ["남", "여"];
export const regularityOptions = ["규칙적", "불규칙", "잘 모르겠어요"];
export const cosmeticCategories = ["클렌저", "토너", "세럼", "크림", "선크림", "기타"];
export const cosmeticFilterCategories = ["전체", ...cosmeticCategories];
export const cosmeticCategorySearchKeywords = {
  클렌저: "클렌징",
  토너: "토너",
  세럼: "세럼",
  크림: "크림",
  선크림: "선크림",
};
export const defaultCosmeticBrands = [
  "라운드랩",
  "토리든",
  "이니스프리",
  "닥터지",
  "코스알엑스",
  "라로슈포제",
  "에스트라",
];
export const DEFAULT_RESULT_LIMIT = 20;
export const CHIP_SEARCH_RESULT_LIMIT = 50;
export const VISIBLE_RESULT_LIMIT = 5;

export const categoryTone = {
  클렌저: "#EEF0E4",
  토너: "#F3EFE5",
  세럼: "#EAF1EC",
  크림: "#F1E8DF",
  선크림: "#F2F1E5",
  기타: "#ECEAE3",
};

export const getCosmeticImageUrl = (item) =>
  item?.imageUrl ||
  item?.image_url ||
  item?.product?.image_url ||
  item?.cosmetic?.image_url ||
  "";

export const getCosmeticBrand = (item) =>
  item?.brand || item?.product?.brand || item?.cosmetic?.brand || "";

export const getCosmeticProductName = (item) => {
  const name =
    item?.product_name ||
    item?.productName ||
    item?.product?.product_name ||
    item?.cosmetic?.product_name ||
    item?.name ||
    "";
  return name.replace(/<\/?b>/gi, "");
};

export const getCosmeticCategory = (item) =>
  item?.category || item?.product?.category || item?.cosmetic?.category || "";

const matchesCosmeticCategory = (item, selectedCategory) => {
  if (selectedCategory === "전체") return true;

  const category = getCosmeticCategory(item).toLowerCase();
  if (!category) return selectedCategory === "기타";

  const categoryMatchers = {
    클렌저: ["클렌저", "클렌징", "클렌징폼", "클렌징오일"],
    토너: ["토너", "스킨"],
    세럼: ["세럼", "앰플", "에센스"],
    크림: ["크림", "로션", "밤"],
    선크림: ["선크림", "썬크림", "선케어", "자외선", "uv", "spf"],
  };

  const matchesKnownCategory = Object.entries(categoryMatchers).some(
    ([uiCategory, keywords]) =>
      uiCategory === selectedCategory &&
      keywords.some((keyword) => category.includes(keyword.toLowerCase()))
  );

  if (selectedCategory !== "기타") return matchesKnownCategory;

  return !Object.values(categoryMatchers)
    .flat()
    .some((keyword) => category.includes(keyword.toLowerCase()));
};

export const getCosmeticFallbackStyleKey = (item) => {
  if (matchesCosmeticCategory(item, "클렌저")) return "cleanser";
  if (matchesCosmeticCategory(item, "토너")) return "toner";
  if (matchesCosmeticCategory(item, "세럼")) return "serum";
  if (matchesCosmeticCategory(item, "크림")) return "cream";
  if (matchesCosmeticCategory(item, "선크림")) return "sunscreen";
  return "etc";
};

export const formatCosmeticName = (product) =>
  [getCosmeticBrand(product), getCosmeticProductName(product)]
    .filter(Boolean)
    .join(" ");

export const formatMedicationName = (medication) =>
  [medication?.name, medication?.form].filter(Boolean).join(" ");

export const formatDateInput = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
};

export const isValidCalendarDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date <= today;
};

export const normalizeUserCosmetic = (item) => ({
  id: item.id,
  productId: item.product_id,
  product_id: item.product_id,
  userCosmeticId: item.id || item.user_cosmetic_id || item.user_cos_id,
  imageUrl: getCosmeticImageUrl(item),
  brand: getCosmeticBrand(item),
  productName: getCosmeticProductName(item) || String(item.product_id),
  name: formatCosmeticName(item) || String(item.product_id),
  category: getCosmeticCategory(item),
  isCurrent: item.is_current,
});

export const normalizeUserMedication = (item) => ({
  id: item.id,
  medicationId: item.medication_id,
  medication_id: item.medication_id,
  userMedId: item.id || item.user_med_id || item.user_medication_id,
  name: formatMedicationName(item.medication) || String(item.medication_id),
  form: item.medication?.form || "",
  isCurrent: item.is_current,
});

export const inferSkinTypeFromConcerns = (concerns) => {
  if (concerns.includes("코/이마는 번들거리고 볼은 건조해요")) {
    return "복합성";
  }
  if (concerns.includes("쉽게 붉어지거나 따가워요")) {
    return "민감성";
  }
  if (
    concerns.includes("자주 당기거나 건조해요") &&
    concerns.includes("번들거리거나 모공이 넓어요")
  ) {
    return "복합성";
  }
  if (
    concerns.includes("번들거리거나 모공이 넓어요") ||
    concerns.includes("트러블/여드름이 자주 나요")
  ) {
    return "지성";
  }
  if (concerns.includes("자주 당기거나 건조해요")) {
    return "건성";
  }
  if (concerns.includes("특별한 고민이 없어요")) {
    return "중성";
  }

  if (concerns.length > 0) {
    return "중성";
  }

  return "";
};

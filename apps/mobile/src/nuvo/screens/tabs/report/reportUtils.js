// ─── 상수 ────────────────────────────────────────────────────────────────────
export const LOOKBACK_DAYS = 14;
export const REQUIRED_SKIN_LOG_DAYS = 7;
export const REANALYSIS_COOLDOWN_DAYS = 7;
export const IN_PROGRESS_STATUSES = new Set(["pending", "processing"]);
export const ANALYSIS_POLL_INTERVAL_MS = 6000;
export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// ─── 날짜 유틸 ───────────────────────────────────────────────────────────────
export const toLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const toDateKey = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toLocalDateKey(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : toLocalDateKey(d);
  }
  return null;
};

export const parseDateKey = (dateKey) => {
  if (!dateKey) return null;
  const [year, month, day] = String(dateKey).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

export const formatKoreanDate = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) return "오늘";
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};

export const isFutureDateKey = (dateKey) => {
  const date = parseDateKey(dateKey);
  const today = parseDateKey(toLocalDateKey(new Date()));
  if (!date || !today) return false;
  return date > today;
};

export const isWithinLookbackFromBase = (value, baseDateKey, days) => {
  const key = toDateKey(value);
  const baseDate = parseDateKey(baseDateKey);
  const target = parseDateKey(key);
  if (!baseDate || !target) return false;
  const start = addDays(baseDate, -(days - 1));
  return target >= start && target <= baseDate;
};

export const getLookbackDateKeys = (baseDateKey, days) => {
  const base = parseDateKey(baseDateKey) ?? new Date();
  return Array.from({ length: days }, (_, index) =>
    toLocalDateKey(addDays(base, index - (days - 1)))
  );
};

export const getCalendarDays = (monthDate) => {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    return {
      dateKey: toLocalDateKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === monthDate.getMonth(),
    };
  });
};

// ─── 스킨 로그 유틸 ──────────────────────────────────────────────────────────
export const isAnalyzableSkinLog = (log) =>
  log?.overall_score !== null && log?.overall_score !== undefined;

export const countUniqueLogDays = (logs) => {
  if (!Array.isArray(logs)) return 0;
  return new Set(logs.map((log) => toDateKey(log?.logged_at)).filter(Boolean)).size;
};

export const getTrailingRecordStreak = (dateKeys, recordDateKeys) => {
  if (!Array.isArray(dateKeys) || !recordDateKeys) return 0;
  let count = 0;
  for (let index = dateKeys.length - 1; index >= 0; index -= 1) {
    if (!recordDateKeys.has(dateKeys[index])) break;
    count += 1;
  }
  return count;
};

const getTimestamp = (value) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const getLogTime = (log) =>
  Math.max(
    getTimestamp(log?.updated_at),
    getTimestamp(log?.created_at),
    getTimestamp(log?.logged_at)
  );

export const getLatestSkinLogOnOrBefore = (logs, baseDateKey) => {
  const baseDate = parseDateKey(baseDateKey);
  if (!baseDate || !Array.isArray(logs) || logs.length === 0) return null;
  return (
    [...logs]
      .filter((log) => {
        const date = parseDateKey(toDateKey(log?.logged_at));
        return date && date <= baseDate;
      })
      .sort((a, b) => getLogTime(b) - getLogTime(a))[0] ?? null
  );
};

export const getLatestLogChangedAt = (logs) => {
  if (!Array.isArray(logs) || logs.length === 0) return 0;
  return Math.max(...logs.map(getLogTime));
};

// ─── 분석 유틸 ───────────────────────────────────────────────────────────────
export const getAnalysisTimestamp = (analysis) => {
  if (!analysis) return 0;
  const result = analysis?.result ?? analysis?.analysis_result ?? {};
  return Math.max(
    getTimestamp(analysis?.completed_at),
    getTimestamp(analysis?.updated_at),
    getTimestamp(analysis?.requested_at),
    getTimestamp(analysis?.created_at),
    getTimestamp(result?.created_at),
    getTimestamp(result?.updated_at)
  );
};

export const isCompletedAnalysis = (item) => {
  const result = item?.result ?? item?.analysis_result ?? null;
  return item?.status === "done" || !!result;
};

export const findCompletedAnalysis = (items) =>
  items.find(isCompletedAnalysis) ?? null;

/**
 * effectiveBaseDateKey 기준으로 가장 적절한 완료 분석을 반환합니다.
 * - base_date <= effectiveBaseDateKey 인 완료 분석 중
 * - base_date가 가장 큰 것 (같은 base_date이면 request_id가 큰 것)을 선택
 * - baseDateKey가 없으면 최신 완료 분석 반환 (기존 동작과 동일)
 */
export const findRelevantCompletedAnalysis = (items, baseDateKey) => {
  const completed = Array.isArray(items) ? items.filter(isCompletedAnalysis) : [];
  if (completed.length === 0) return null;
  if (!baseDateKey) return completed[0] ?? null;

  const eligible = completed.filter((item) => {
    const dateKey = getAnalysisDateKey(item);
    return !dateKey || dateKey <= baseDateKey;
  });

  if (eligible.length === 0) return null;

  return eligible.reduce((best, item) => {
    const itemDateKey = getAnalysisDateKey(item) ?? "";
    const bestDateKey = getAnalysisDateKey(best) ?? "";
    if (itemDateKey > bestDateKey) return item;
    if (itemDateKey === bestDateKey) {
      const itemId = item?.request_id ?? item?.id ?? 0;
      const bestId = best?.request_id ?? best?.id ?? 0;
      return itemId > bestId ? item : best;
    }
    return best;
  });
};

export const getAnalysisDateKey = (analysis) => {
  // base_date: 백엔드가 skin_log.logged_at 기반으로 내려주는 정확한 기준일
  const candidate =
    analysis?.base_date ??
    analysis?.target_date ??
    analysis?.skin_log?.logged_at ??
    analysis?.requested_at ??
    analysis?.created_at;
  return toDateKey(candidate);
};

export const getAnalysisBasisLabel = (analysis) => {
  const dateKey = getAnalysisDateKey(analysis);
  return dateKey ? formatKoreanDate(dateKey) : "";
};

export const getAnalysisHistoryTitle = (analysis) => {
  const dateKey = getAnalysisDateKey(analysis);
  return dateKey ? `${formatKoreanDate(dateKey)} 기준` : "이전 리포트";
};

export const normalizeAnalysisList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

export const getSkinSummaryValue = (days) => {
  if (days <= 0) return "아직 없음";
  return `${days}일`;
};

// ─── 텍스트 유틸 ─────────────────────────────────────────────────────────────
export const getSafeText = (value) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : "";

// ─── 에러 유틸 ───────────────────────────────────────────────────────────────
export const ANALYSIS_TIMEOUT_MS_MESSAGE =
  "응답이 지연되고 있어요. 잠시 후 다시 확인해 주세요.";

const getErrorDetailText = (error) => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((item) => item?.msg ?? item?.message ?? JSON.stringify(item)).join(" ");
  if (detail && typeof detail === "object")
    return detail.message ?? detail.msg ?? JSON.stringify(detail);
  return error?.message ?? "";
};

const getNormalizedErrorText = (error) => getErrorDetailText(error).toLowerCase();

export const isTimeoutError = (error) => {
  const message = String(error?.message ?? "").toLowerCase();
  return error?.code === "ECONNABORTED" || message.includes("timeout");
};

export const isAnalysisRequestDuplicate = (error) => {
  const text = getNormalizedErrorText(error);
  return text.includes("analysis request already exists") || text.includes("already exists");
};

export const isReanalysisLocked = (error) =>
  error?.response?.status === 429 ||
  getNormalizedErrorText(error).includes("reanalysis locked");

export const getAnalysisRequestErrorMessage = (error) => {
  const text = getNormalizedErrorText(error);
  const status = error?.response?.status;

  if (isTimeoutError(error)) return ANALYSIS_TIMEOUT_MS_MESSAGE;
  if (isAnalysisRequestDuplicate(error)) return "이미 만들고 있는 피부 리포트가 있어요.";
  if (isReanalysisLocked(error)) return "새 기록이 7일 쌓이면 다시 만들 수 있어요.";
  if (text.includes("at least 7 skin log days are required"))
    return "피부 리포트를 만들려면 기록이 조금 더 필요해요.";
  if (text.includes("skin log not found") || text.includes("not found"))
    return "기준일 이전의 피부 기록을 찾지 못했어요.";
  if (status === 401 || status === 403 || text.includes("token"))
    return "다시 로그인한 뒤 시도해 주세요.";
  return "피부 리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.";
};

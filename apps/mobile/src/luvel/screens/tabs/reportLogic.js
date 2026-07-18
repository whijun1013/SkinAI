export const LOOKBACK_DAYS = 14;
export const REQUIRED_SKIN_LOG_DAYS = 7;
export const IN_PROGRESS_STATUSES = new Set(["pending", "processing"]);
export const ANALYSIS_TIMEOUT_MESSAGE = "응답이 지연되고 있어요. 잠시 후 다시 확인해 주세요.";
export const ANALYSIS_POLL_INTERVAL_MS = 6000;

export const normalizeAnalysisList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

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
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : toLocalDateKey(date);
  }
  return null;
};

export const parseDateKey = (dateKey) => {
  if (!dateKey) return null;
  const [year, month, day] = String(dateKey).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

export const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

export const formatKoreanDate = (dateKey) => {
  const date = parseDateKey(dateKey);
  return date ? `${date.getMonth() + 1}월 ${date.getDate()}일` : "오늘";
};

export const isFutureDateKey = (dateKey, now = new Date()) => {
  const date = parseDateKey(dateKey);
  const today = parseDateKey(toLocalDateKey(now));
  return Boolean(date && today && date > today);
};

export const isWithinLookbackFromBase = (value, baseDateKey, days) => {
  const baseDate = parseDateKey(baseDateKey);
  const target = parseDateKey(toDateKey(value));
  if (!baseDate || !target || !Number.isInteger(days) || days < 1) return false;
  return target >= addDays(baseDate, -(days - 1)) && target <= baseDate;
};

export const getLookbackDateKeys = (baseDateKey, days) => {
  const base = parseDateKey(baseDateKey) ?? new Date();
  return Array.from({ length: days }, (_, index) => toLocalDateKey(addDays(base, index - (days - 1))));
};

export const getCalendarDays = (monthDate) => {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    return { dateKey: toLocalDateKey(date), day: date.getDate(), inMonth: date.getMonth() === monthDate.getMonth() };
  });
};

export const isAnalyzableSkinLog = (log) => log?.overall_score !== null && log?.overall_score !== undefined;

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

const getLogTime = (log) => Math.max(getTimestamp(log?.updated_at), getTimestamp(log?.created_at), getTimestamp(log?.logged_at));

export const getLatestSkinLogOnOrBefore = (logs, baseDateKey) => {
  const baseDate = parseDateKey(baseDateKey);
  if (!baseDate || !Array.isArray(logs) || logs.length === 0) return null;
  return [...logs]
    .filter((log) => {
      const date = parseDateKey(toDateKey(log?.logged_at));
      return date && date <= baseDate;
    })
    .sort((a, b) => getLogTime(b) - getLogTime(a))[0] ?? null;
};

export const getLatestLogChangedAt = (logs) => {
  if (!Array.isArray(logs) || logs.length === 0) return 0;
  return Math.max(...logs.map(getLogTime));
};

export const getAnalysisTimestamp = (analysis) => {
  if (!analysis) return 0;
  const result = analysis?.result ?? analysis?.analysis_result ?? {};
  return Math.max(
    getTimestamp(analysis?.completed_at),
    getTimestamp(analysis?.updated_at),
    getTimestamp(analysis?.requested_at),
    getTimestamp(analysis?.created_at),
    getTimestamp(result?.created_at),
    getTimestamp(result?.updated_at),
  );
};

export const isCompletedAnalysis = (item) => item?.status === "done" || Boolean(item?.result ?? item?.analysis_result);

export const findCompletedAnalysis = (items) => {
  if (!Array.isArray(items)) return null;
  return [...items].filter(isCompletedAnalysis).sort((a, b) => getAnalysisTimestamp(b) - getAnalysisTimestamp(a))[0] ?? null;
};

export const getAnalysisDateKey = (analysis) => toDateKey(
  analysis?.base_date ?? analysis?.target_date ?? analysis?.skin_log?.logged_at ?? analysis?.requested_at ?? analysis?.created_at,
);

export const getAnalysisBasisLabel = (analysis) => {
  const dateKey = getAnalysisDateKey(analysis);
  return dateKey ? formatKoreanDate(dateKey) : "";
};

export const getAnalysisHistoryTitle = (analysis) => {
  const dateKey = getAnalysisDateKey(analysis);
  return dateKey ? `${formatKoreanDate(dateKey)} 기준` : "이전 인사이트";
};

export const getReportState = ({
  loading,
  isCreatingAnalysis,
  inProgressAnalysis,
  recentSkinLogDays,
  completedAnalysis,
  analysisIsStale,
  failedAnalysis,
  failedAnalysisIsLatest,
  analysisReady,
}) => {
  if (loading) return "loading";
  if (isCreatingAnalysis || inProgressAnalysis) return "creating";
  if (recentSkinLogDays === 0) return "no_record";
  if (failedAnalysis && failedAnalysisIsLatest) return "failed";
  if (completedAnalysis && analysisIsStale) return "stale";
  if (completedAnalysis) return "complete";
  if (failedAnalysis) return "failed";
  if (analysisReady) return "ready";
  return "insufficient";
};

const getErrorDetailText = (error) => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg ?? item?.message ?? JSON.stringify(item)).join(" ");
  if (detail && typeof detail === "object") return detail.message ?? detail.msg ?? JSON.stringify(detail);
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

export const getAnalysisRequestErrorMessage = (error) => {
  const text = getNormalizedErrorText(error);
  const status = error?.response?.status;
  if (isTimeoutError(error)) return ANALYSIS_TIMEOUT_MESSAGE;
  if (isAnalysisRequestDuplicate(error)) return "이미 만들고 있는 참고 인사이트가 있어요.";
  if (text.includes("at least 7 skin log days are required")) return "참고 인사이트를 만들 기록이 조금 더 필요해요.";
  if (text.includes("skin log not found") || text.includes("not found")) return "기준일 이전의 피부 기록을 찾지 못했어요.";
  if (status === 401 || status === 403 || text.includes("token")) return "다시 로그인한 뒤 시도해 주세요.";
  return "참고 인사이트를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
};

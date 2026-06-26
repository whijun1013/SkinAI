import { formatKoreanDate, parseDateString } from '../../components/search/searchDateUtils';

function formatMedDate(dateStr) {
  if (!dateStr) return null;
  return formatKoreanDate(dateStr) || dateStr;
}

function getUsageDays(startedAt, endedAt = null) {
  const start = parseDateString(startedAt);
  if (!start) return null;

  const end = endedAt ? parseDateString(endedAt) : new Date();
  if (!end) return null;

  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((endDay - start) / (1000 * 60 * 60 * 24)) + 1;
  return diffDays > 0 ? diffDays : null;
}

/** 복용 중 — 시작일 + 예상 종료 + 일수 */
export function getCurrentMedicationCaption(item) {
  const startLabel = formatMedDate(item?.started_at);
  const expectedEndLabel = formatMedDate(item?.expected_end_at);
  const usageDays = getUsageDays(item?.started_at);

  if (!startLabel) {
    return {
      primary: '시작일 미기록',
      secondary: expectedEndLabel ? `종료 예정 ${expectedEndLabel}` : null,
      usageDays: null,
    };
  }

  const secondaryParts = [];
  if (usageDays) secondaryParts.push(`${usageDays}일째 복용`);
  if (expectedEndLabel) secondaryParts.push(`종료 예정 ${expectedEndLabel}`);

  return {
    primary: `${startLabel}부터`,
    secondary: secondaryParts.length ? secondaryParts.join(' · ') : null,
    usageDays,
  };
}

/** 복용 종료 — 시작~종료 기간 */
export function getPastMedicationCaption(item) {
  const startLabel = formatMedDate(item?.started_at);
  const endLabel = formatMedDate(item?.ended_at);
  const usageDays = getUsageDays(item?.started_at, item?.ended_at);

  if (startLabel && endLabel) {
    return {
      primary: `${startLabel} ~ ${endLabel}`,
      secondary: usageDays ? `총 ${usageDays}일 복용` : '복용 기간',
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

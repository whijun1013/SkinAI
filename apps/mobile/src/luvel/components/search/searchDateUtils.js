export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function getTodayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function isValidCalendarDate(dateStr) {
  if (!DATE_REGEX.test(dateStr)) return false;
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const dateObj = new Date(year, month - 1, day);
  return (
    dateObj.getFullYear() === year && dateObj.getMonth() === month - 1 && dateObj.getDate() === day
  );
}

export function parseDateString(dateStr) {
  if (!isValidCalendarDate(dateStr)) return null;
  const [year, month, day] = dateStr.split('-').map((part) => parseInt(part, 10));
  return new Date(year, month - 1, day);
}

export function dateToString(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatKoreanDate(dateStr) {
  const date = parseDateString(dateStr);
  if (!date) return '';
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY_LABELS[date.getDay()]})`;
}

export function isTodayDate(dateStr) {
  return dateStr === getTodayString();
}

/** 날짜 피커 하한 — 스피너/휠 무한 스크롤 방지용 */
export function getDefaultMinimumDate(yearsBack = 10) {
  const today = new Date();
  return new Date(today.getFullYear() - yearsBack, today.getMonth(), today.getDate());
}

export function clampDate(date, minimumDate, maximumDate) {
  if (date < minimumDate) return minimumDate;
  if (date > maximumDate) return maximumDate;
  return date;
}

import { SCORE_COLORS, SCORE_LABELS } from './skinConstants';

export { SCORE_COLORS as SLEEP_QUALITY_COLORS, SCORE_LABELS as SLEEP_QUALITY_LABELS };

export const STRESS_LABELS = {
  1: '매우 낮음',
  2: '낮음',
  3: '보통',
  4: '높음',
  5: '매우 높음',
};

export const STRESS_COLORS = {
  1: { bg: '#E8EEDD', border: '#A9B99C', active: '#4F603C' },
  2: { bg: '#EDF3E8', border: '#B5C9A0', active: '#6B8F4E' },
  3: { bg: '#F5F0E8', border: '#D9D0C0', active: '#9A8B72' },
  4: { bg: '#FDF0E4', border: '#E8C49A', active: '#D4893A' },
  5: { bg: '#FCE8E6', border: '#E8A99E', active: '#C45C4A' },
};

export function formatBehaviorSummary(log) {
  if (!log) return null;
  const parts = [];
  if (log.sleep_hours != null) parts.push(`수면 ${log.sleep_hours}시간`);
  if (log.sleep_quality != null) parts.push(`수면 질 ${log.sleep_quality}점`);
  if (log.stress_level != null) parts.push(`스트레스 ${log.stress_level}점`);
  if (log.exercise_yn) {
    if (log.exercise_duration_min) {
      parts.push(`운동 ${log.exercise_duration_min}분`);
    } else {
      parts.push('운동');
    }
  }
  if (log.water_intake_ml) parts.push(`수분 ${log.water_intake_ml}ml`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

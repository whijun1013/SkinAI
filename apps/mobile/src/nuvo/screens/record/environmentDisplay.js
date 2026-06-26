import { formatFoodNames } from './dietDisplay';

const SOURCE_LABELS = {
  app_camera: '카메라 촬영',
  exif: '사진 메타데이터',
  manual: '직접 입력',
  retroactive: '소급 생성',
};

const SOURCE_ICONS = {
  app_camera: 'camera-outline',
  exif: 'images-outline',
  manual: 'create-outline',
  retroactive: 'time-outline',
};

const METRIC_DEFS = [
  {
    key: 'temperature',
    label: '기온',
    icon: 'thermometer-outline',
    format: (v) => (v != null ? `${v}℃` : '-'),
  },
  {
    key: 'humidity',
    label: '습도',
    icon: 'water-outline',
    format: (v) => (v != null ? `${v}%` : '-'),
  },
  {
    key: 'uv_index',
    label: '자외선',
    icon: 'sunny-outline',
    format: (v) => (v != null ? String(v) : '-'),
  },
  { key: 'weather', label: '날씨', icon: 'cloud-outline', format: (v) => v || '이상 없음' },
  { key: 'pm10', label: 'PM10', icon: 'cloudy-outline', format: (v) => (v != null ? `${v}` : '-') },
  {
    key: 'pm25',
    label: 'PM2.5',
    icon: 'cloudy-night-outline',
    format: (v) => (v != null ? `${v}` : '-'),
  },
];

export function getSourceLabel(source) {
  return SOURCE_LABELS[source] || source || '알 수 없음';
}

export function getSourceIcon(source) {
  return SOURCE_ICONS[source] || 'help-circle-outline';
}

/** 연결된 식단 사진 설명 — 예: "점심 김치찌개 사진" */
export function buildRelatedDietText(dietLog) {
  if (!dietLog) return null;

  const meal = dietLog.meal_type || '식단';
  const foods = formatFoodNames(dietLog);

  if (foods) {
    const shortFoods = foods.length > 24 ? `${foods.slice(0, 24)}…` : foods;
    return `${meal} ${shortFoods} 사진`;
  }
  if (dietLog.photo_url) return `${meal} 식단 사진`;
  return `${meal} 식단`;
}

export function formatCapturedTime(capturedAt) {
  if (!capturedAt) return '';
  const d = new Date(capturedAt);
  if (Number.isNaN(d.getTime())) return String(capturedAt);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export function getPm25Level(pm25) {
  if (pm25 == null) return null;
  if (pm25 <= 15) return { label: '좋음', tone: 'good' };
  if (pm25 <= 35) return { label: '보통', tone: 'normal' };
  if (pm25 <= 75) return { label: '나쁨', tone: 'bad' };
  return { label: '매우 나쁨', tone: 'veryBad' };
}

export function getUvLevel(uv) {
  if (uv == null) return null;
  if (uv <= 2) return { label: '낮음', tone: 'good' };
  if (uv <= 5) return { label: '보통', tone: 'normal' };
  if (uv <= 7) return { label: '높음', tone: 'bad' };
  return { label: '매우 높음', tone: 'veryBad' };
}

export function buildEnvironmentMetrics(log) {
  if (!log) return [];
  return METRIC_DEFS.map((def) => ({
    ...def,
    value: def.format(log[def.key]),
    raw: log[def.key],
  }));
}

export function buildEnvironmentSummary(log) {
  if (!log) return null;
  const parts = [];
  if (log.temperature != null) parts.push(`${log.temperature}℃`);
  if (log.humidity != null) parts.push(`습도 ${log.humidity}%`);
  if (log.weather) parts.push(log.weather);
  const pm = getPm25Level(log.pm25);
  if (pm) parts.push(`미세먼지 ${pm.label}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function sortEnvironmentLogs(logs) {
  return [...logs].sort((a, b) => {
    const ta = new Date(a.captured_at || 0).getTime();
    const tb = new Date(b.captured_at || 0).getTime();
    return tb - ta;
  });
}

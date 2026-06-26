export const SCORE_LABELS = {
  1: '매우 나쁨',
  2: '나쁨',
  3: '보통',
  4: '좋음',
  5: '매우 좋음',
};

export const SCORE_COLORS = {
  1: { bg: '#FCE8E6', border: '#E8A99E', active: '#C45C4A' },
  2: { bg: '#FDF0E4', border: '#E8C49A', active: '#D4893A' },
  3: { bg: '#F5F0E8', border: '#D9D0C0', active: '#9A8B72' },
  4: { bg: '#EDF3E8', border: '#B5C9A0', active: '#6B8F4E' },
  5: { bg: '#E8EEDD', border: '#A9B99C', active: '#4F603C' },
};

export const SKIN_TAG_OPTIONS = [
  '여드름',
  '뾰루지',
  '블랙헤드',
  '모공',
  '건조',
  '유분',
  '붉은기',
  '각질',
  '민감',
  '가려움',
  '다크서클',
  '칙칙함',
];

export const SKIN_TAG_CATEGORIES = [
  {
    id: 'trouble',
    label: '트러블',
    tags: ['여드름', '뾰루지', '블랙헤드'],
  },
  {
    id: 'texture',
    label: '결·유분',
    tags: ['모공', '건조', '유분', '각질'],
  },
  {
    id: 'tone',
    label: '색·민감',
    tags: ['붉은기', '민감', '가려움', '다크서클', '칙칙함'],
  },
];

/** API condition_tags — 배열 또는 AI 분석 객체 */
export function parseConditionTags(conditionTags) {
  if (Array.isArray(conditionTags)) return conditionTags;
  if (conditionTags && typeof conditionTags === 'object') {
    return Object.keys(conditionTags).filter((key) => conditionTags[key]);
  }
  return [];
}

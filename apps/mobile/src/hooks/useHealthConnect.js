/**
 * useHealthConnect.js — iOS(Apple Health) + Android(Samsung Health) 통합 훅
 *
 * ─── Android (react-native-health-connect) ────────────────────────────────────
 *  SleepSession       → { startTime, endTime, stages?: [{startTime, endTime, stage}] }
 *  ExerciseSession    → { startTime, endTime, exerciseType: number }
 *  Steps              → { startTime, endTime, count: number }
 *  MenstruationPeriod → { time }  ← InstantaneousRecord (startTime 없음!)
 *
 *  SleepStageType: UNKNOWN=0, AWAKE=1, SLEEPING=2, OUT_OF_BED=3, LIGHT=4, DEEP=5, REM=6
 *  ExerciseType:   RUNNING=56, WALKING=79, YOGA=83, BIKING=8, SWIMMING_POOL=74 ...
 *
 * ─── iOS (react-native-health / AppleHealthKit) ───────────────────────────────
 *  getSleepSamples     → [{ value: "INBED"|"ASLEEP"|"CORE"|"DEEP"|"REM",
 *                            startDate, endDate }]
 *                        INBED  = 침대에 누운 시간 (수면 아님 → 제외)
 *                        ASLEEP = 전체 수면 (워치 없을 때)
 *                        CORE/DEEP/REM = 수면 단계 (Apple Watch 착용 시)
 *
 *  getAnchoredWorkouts → { data: [{ activityName: string, duration: number(초),
 *                                   start, end, calories, distance }] }
 *                        duration은 초 단위 (ms 아님!)
 *                        activityName은 문자열 ("Running", "Walking" 등)
 *
 *  getStepCount        → { value: number }  (하루 합계)
 *
 *  getMenstrualFlowSamples → [{ value: 0~4, startDate }]
 *                             0=없음, 1=점상, 2=소량, 3=보통, 4=다량
 */

import { useState, useCallback } from 'react';
import { Platform } from 'react-native';

let HC = null;
let AppleHealthKit = null;

try {
  if (Platform.OS === 'android') {
    HC = require('react-native-health-connect');
  } else if (Platform.OS === 'ios') {
    const mod = require('react-native-health');
    AppleHealthKit = mod.default ?? mod.AppleHealthKit ?? mod;
  }
} catch (_) {}

// ── ExerciseType 번호 → 한국어 (실제 Health Connect 상수 기준) ────────────────
const EXERCISE_TYPE_MAP = {
  0: '기타 운동',
  8: '사이클',
  9: '실내 사이클',
  11: '복싱',
  13: '맨몸 운동',
  16: '댄스',
  25: '일립티컬',
  26: '운동 클래스',
  36: 'HIIT',
  37: '하이킹',
  38: '아이스하키',
  39: '스케이팅',
  41: '줄넘기',
  44: '무술',
  48: '필라테스',
  51: '암벽등반',
  53: '조정',
  55: '럭비',
  56: '달리기',
  57: '러닝머신',
  61: '스키',
  62: '스노보드',
  64: '축구',
  66: '스쿼시',
  68: '계단 오르기',
  70: '근력 운동',
  71: '스트레칭',
  73: '수영 (오픈워터)',
  74: '수영 (실내)',
  75: '탁구',
  76: '테니스',
  78: '배구',
  79: '걷기',
  81: '역도',
  83: '요가',
};

// ── 수면 단계 코드 (실제 SleepStageType 상수 기준) ────────────────────────────
// UNKNOWN=0, AWAKE=1, SLEEPING=2, OUT_OF_BED=3, LIGHT=4, DEEP=5, REM=6
const SLEEP_STAGES = new Set([2, 4, 5, 6]); // 실제 수면 단계 (AWAKE, OUT_OF_BED 제외)

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function msToHours(ms) {
  return Math.round((ms / 3600000) * 10) / 10;
}
function msToMinutes(ms) {
  return Math.round(ms / 60000);
}
// targetDate 기준 날짜 범위 유틸
function dayAt(base, hour = 0) {
  const d = new Date(base);
  d.setHours(hour, 0, 0, 0);
  return d;
}
function prevDayAt18(base) {
  const d = new Date(base);
  d.setDate(d.getDate() - 1);
  d.setHours(18, 0, 0, 0);
  return d;
}
function daysBeforeBase(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(base) {
  const d = new Date(base);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ── Android (Health Connect) ──────────────────────────────────────────────────

async function fetchAndroid(targetDate = new Date()) {
  const result = {
    sleepHours: null,
    exerciseYn: false,
    exerciseDurationMin: null,
    exerciseType: null,
    steps: null,
    periodStartDate: null,
  };

  const initialized = await HC.initialize();
  if (!initialized) return result;

  await HC.requestPermission([
    { accessType: 'read', recordType: 'SleepSession' },
    { accessType: 'read', recordType: 'ExerciseSession' },
    { accessType: 'read', recordType: 'Steps' },
    { accessType: 'read', recordType: 'MenstruationPeriod' },
  ]);

  const range = (start, end) => ({
    operator: 'between',
    startTime: start.toISOString(),
    endTime: (end ?? endOfDay(targetDate)).toISOString(),
  });

  // ── 수면 ─────────────────────────────────────────────────────────────────
  // SleepSession = IntervalRecord → startTime, endTime 있음
  // stages 있으면 실제 수면 단계만 합산, 없으면 전체 세션 시간 사용
  try {
    const { records = [] } = await HC.readRecords('SleepSession', {
      timeRangeFilter: range(prevDayAt18(targetDate)),
    });
    if (records.length > 0) {
      const longest = records.reduce((a, b) =>
        new Date(b.endTime) - new Date(b.startTime) > new Date(a.endTime) - new Date(a.startTime)
          ? b
          : a
      );
      const stages = longest.stages ?? [];
      if (stages.length > 0) {
        // 실제 수면 단계(SLEEPING/LIGHT/DEEP/REM)만 합산
        const sleepMs = stages
          .filter((s) => SLEEP_STAGES.has(s.stage))
          .reduce((sum, s) => sum + (new Date(s.endTime) - new Date(s.startTime)), 0);
        result.sleepHours = msToHours(sleepMs);
      } else {
        // 단계 정보 없으면 전체 세션 시간
        result.sleepHours = msToHours(new Date(longest.endTime) - new Date(longest.startTime));
      }
    }
  } catch (_) {}

  // ── 운동 ─────────────────────────────────────────────────────────────────
  // ExerciseSession = IntervalRecord → startTime, endTime, exerciseType(number)
  try {
    const { records = [] } = await HC.readRecords('ExerciseSession', {
      timeRangeFilter: range(dayAt(targetDate, 0)),
    });
    if (records.length > 0) {
      result.exerciseYn = true;
      const totalMs = records.reduce(
        (sum, r) => sum + (new Date(r.endTime) - new Date(r.startTime)),
        0
      );
      result.exerciseDurationMin = msToMinutes(totalMs);
      const typeCode = records[0]?.exerciseType ?? 0;
      result.exerciseType = EXERCISE_TYPE_MAP[typeCode] ?? '기타 운동';
    }
  } catch (_) {}

  // ── 걸음수 ───────────────────────────────────────────────────────────────
  // Steps = IntervalRecord → count: number
  try {
    const { records = [] } = await HC.readRecords('Steps', {
      timeRangeFilter: range(dayAt(targetDate, 0)),
    });
    const total = records.reduce((sum, r) => sum + (r.count ?? 0), 0);
    if (total > 0) result.steps = total;
  } catch (_) {}

  // ── 생리주기 ──────────────────────────────────────────────────────────────
  // MenstruationPeriod = InstantaneousRecord → time 필드 (startTime 없음!)
  try {
    const { records = [] } = await HC.readRecords('MenstruationPeriod', {
      timeRangeFilter: range(daysBeforeBase(targetDate, 30)),
    });
    if (records.length > 0) {
      const latest = records.reduce((a, b) => (new Date(b.time) > new Date(a.time) ? b : a));
      result.periodStartDate = latest.time.split('T')[0];
    }
  } catch (_) {}

  return result;
}

// ── iOS (Apple HealthKit) ─────────────────────────────────────────────────────
//
// 실제 Apple Health API 반환 형식:
//
// getSleepSamples →
//   [{ value: "INBED"|"ASLEEP"|"CORE"|"DEEP"|"REM", startDate, endDate }]
//   - INBED  : 침대에 누운 전체 시간 (수면 아님, 제외)
//   - ASLEEP : 총 수면 (워치 없을 때 — CORE/DEEP/REM 없음)
//   - CORE   : 얕은 수면 (Light sleep, 워치 있을 때)
//   - DEEP   : 깊은 수면 (워치 있을 때)
//   - REM    : 렘수면 (워치 있을 때)
//
// getAnchoredWorkouts →
//   { data: [{ activityName: string, duration: number(초), start, end, calories }] }
//   - activityName: 문자열 "Running", "Walking", "Traditional Strength Training" 등
//   - duration: 초 단위 (ms 아님!)
//
// getStepCount → { value: number }  ← 하루 합계 한 번에
//
// getMenstrualFlowSamples →
//   [{ value: 0~4 (0=없음, 1=점상, 2=소량, 3=보통, 4=다량), startDate }]

async function fetchIOS(targetDate = new Date()) {
  const result = {
    sleepHours: null,
    sleepQuality: null, // DEEP+REM 비율로 계산 (1~5), 워치 있을 때만
    exerciseYn: false,
    exerciseDurationMin: null,
    exerciseType: null,
    steps: null,
    periodStartDate: null,
  };

  await new Promise((resolve, reject) => {
    AppleHealthKit.initHealthKit(
      {
        permissions: {
          read: [
            AppleHealthKit.Constants.Permissions.SleepAnalysis,
            AppleHealthKit.Constants.Permissions.StepCount,
            AppleHealthKit.Constants.Permissions.Workout,
            AppleHealthKit.Constants.Permissions.MenstrualFlow,
          ],
          write: [],
        },
      },
      (err) => (err ? reject(new Error(err)) : resolve())
    );
  });

  const endTime = endOfDay(targetDate);

  // ── 수면 ─────────────────────────────────────────────────────────────────
  // INBED 제외, 실제 수면(ASLEEP/CORE/DEEP/REM)만 합산
  // 워치 있으면 CORE/DEEP/REM 세분화 → 수면 질 계산 가능
  try {
    const samples = await new Promise((resolve) => {
      AppleHealthKit.getSleepSamples(
        { startDate: prevDayAt18(targetDate).toISOString(), endDate: endTime.toISOString() },
        (err, res) => resolve(err ? [] : (res ?? []))
      );
    });

    const SLEEP_VALUES = ['ASLEEP', 'CORE', 'DEEP', 'REM'];
    const sleepSamples = samples.filter((s) => SLEEP_VALUES.includes(s.value));

    if (sleepSamples.length > 0) {
      const totalMs = sleepSamples.reduce(
        (sum, s) => sum + (new Date(s.endDate) - new Date(s.startDate)),
        0
      );
      result.sleepHours = msToHours(totalMs);

      // 수면 질: CORE/DEEP/REM이 있으면 (워치 사용) DEEP+REM 비율로 계산
      const deepRem = sleepSamples.filter((s) => s.value === 'DEEP' || s.value === 'REM');
      if (deepRem.length > 0 && sleepSamples.some((s) => s.value !== 'ASLEEP')) {
        const deepRemMs = deepRem.reduce(
          (sum, s) => sum + (new Date(s.endDate) - new Date(s.startDate)),
          0
        );
        const ratio = deepRemMs / totalMs; // 0.0 ~ 1.0
        // DEEP+REM 비율 → 1~5 품질 점수
        if (ratio >= 0.3) result.sleepQuality = 5;
        else if (ratio >= 0.22) result.sleepQuality = 4;
        else if (ratio >= 0.15) result.sleepQuality = 3;
        else if (ratio >= 0.08) result.sleepQuality = 2;
        else result.sleepQuality = 1;
      }
      // ASLEEP만 있으면 (워치 없음) → 시간만 있고 질은 null (수동 입력)
    }
  } catch (_) {}

  // ── 걸음수 ───────────────────────────────────────────────────────────────
  // getStepCount: { value: number } — 하루 합계 한 번에 반환
  try {
    const stepsResult = await new Promise((resolve) => {
      AppleHealthKit.getStepCount(
        { startDate: dayAt(targetDate, 0).toISOString(), endDate: endTime.toISOString() },
        (err, res) => resolve(err ? null : res)
      );
    });
    if (stepsResult?.value > 0) result.steps = Math.round(stepsResult.value);
  } catch (_) {}

  // ── 운동 ─────────────────────────────────────────────────────────────────
  // getAnchoredWorkouts: activityName은 문자열, duration은 초 단위
  try {
    const workoutResult = await new Promise((resolve) => {
      AppleHealthKit.getAnchoredWorkouts(
        { startDate: dayAt(targetDate, 0).toISOString(), endDate: endTime.toISOString() },
        (err, res) => resolve(err ? { data: [] } : (res ?? { data: [] }))
      );
    });
    const workouts = workoutResult?.data ?? [];
    if (workouts.length > 0) {
      result.exerciseYn = true;
      // duration은 초 단위 → 분으로 변환
      const totalSec = workouts.reduce((sum, w) => sum + (w.duration ?? 0), 0);
      result.exerciseDurationMin = Math.round(totalSec / 60);
      result.exerciseType = workouts[0]?.activityName ?? '기타 운동';
    }
  } catch (_) {}

  // ── 생리주기 ──────────────────────────────────────────────────────────────
  // getMenstrualFlowSamples: value 1~4 (0은 데이터 없음)
  try {
    const flowResult = await new Promise((resolve) => {
      AppleHealthKit.getMenstrualFlowSamples(
        { startDate: daysBeforeBase(targetDate, 30).toISOString(), endDate: endTime.toISOString() },
        (err, res) => resolve(err ? [] : (res ?? []))
      );
    });
    // value > 0 인 것만 (실제 생리 있음)
    const active = (flowResult || []).filter((f) => (f.value ?? 0) > 0);
    if (active.length > 0) {
      const latest = active.reduce((a, b) =>
        new Date(b.startDate) > new Date(a.startDate) ? b : a
      );
      result.periodStartDate = latest.startDate.split('T')[0];
    }
  } catch (_) {}

  return result;
}

// ── 공개 훅 ───────────────────────────────────────────────────────────────────

export default function useHealthConnect() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [healthData, setHealthData] = useState(null);

  const isAvailable =
    (Platform.OS === 'android' && HC !== null) ||
    (Platform.OS === 'ios' && AppleHealthKit !== null);

  const platform = isAvailable ? Platform.OS : null;

  const fetchHealthData = useCallback(
    async (targetDate = new Date()) => {
      if (!isAvailable) return null;
      setLoading(true);
      setError(null);
      try {
        const data =
          Platform.OS === 'ios' ? await fetchIOS(targetDate) : await fetchAndroid(targetDate);
        setHealthData(data);
        return data;
      } catch (err) {
        setError(
          Platform.OS === 'ios'
            ? 'Apple Health 접근 권한이 없거나 지원되지 않습니다.'
            : err?.message?.includes('not installed')
              ? 'Health Connect가 설치되어 있지 않습니다.'
              : '건강 데이터를 불러오지 못했습니다.'
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [isAvailable]
  );

  return { isAvailable, platform, loading, error, healthData, fetchHealthData };
}

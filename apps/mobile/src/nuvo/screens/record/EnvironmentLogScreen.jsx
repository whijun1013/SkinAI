import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDietLogsQuery, useEnvironmentLogsQuery } from '../../../hooks/useRecordQueries';
import useRecordCacheStore from '../../../stores/recordCacheStore';
import { toDateStr } from './components/DateNavigator';
import {
  buildEnvironmentMetrics,
  buildEnvironmentSummary,
  formatCapturedTime,
  getPm25Level,
  buildRelatedDietText,
  getSourceLabel,
  getUvLevel,
  sortEnvironmentLogs,
} from './environmentDisplay';
import {
  RECORD_COLORS,
  SectionCard,
  StatusBanner,
  SubScreenRoot,
  SubScreenTopBar,
  useRecordScreenInsets,
  styles as layoutStyles,
} from './components/SubScreenLayout';

const ENV_ACCENT = '#477A7F';
const ENV_SOFT   = '#D8E8EA';
const ENV_MID    = '#90C0C4';
const ENV_MUTED  = '#6B9FA6';


const LEVEL_COLORS = {
  good:    { bg: '#D8F0EA', text: '#2E7A60', border: 'rgba(46, 122, 96, 0.2)'   },
  normal:  { bg: '#F5F0E4', text: '#8A7340', border: 'rgba(138, 115, 64, 0.2)'  },
  bad:     { bg: '#FBE8DF', text: '#C45C4A', border: 'rgba(196, 92, 74, 0.2)'   },
  veryBad: { bg: '#F5D9D4', text: '#A83D2E', border: 'rgba(168, 61, 46, 0.25)'  },
};

function LevelChip({ level }) {
  if (!level) return null;
  const palette = LEVEL_COLORS[level.tone] || LEVEL_COLORS.normal;
  return (
    <View style={[styles.levelChip, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.levelChipText, { color: palette.text }]}>{level.label}</Text>
    </View>
  );
}

function MetricTile({ icon, label, value, hint }) {
  return (
    <View style={styles.metricTile}>
      <View style={styles.metricIcon}>
        <Ionicons name={icon} size={16} color={ENV_ACCENT} />
      </View>
      <Text style={styles.metricValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {hint ? <LevelChip level={hint} /> : null}
    </View>
  );
}

function RecordMetaStrip({ log, index, total, relatedDiet }) {
  const order = total - index;
  const relatedText = buildRelatedDietText(relatedDiet);

  return (
    <Text style={styles.metaLine}>
      <Text style={styles.metaOrder}>{order}번째</Text>
      <Text style={styles.metaSep}> · </Text>
      <Text style={styles.metaSource}>{getSourceLabel(log.source)}</Text>
      {relatedText ? (
        <>
          <Text style={styles.metaSep}> · </Text>
          <Text style={styles.metaRelated}>{relatedText}</Text>
        </>
      ) : null}
    </Text>
  );
}

function EnvironmentLogCard({ log, index, total, relatedDiet }) {
  const metrics = buildEnvironmentMetrics(log);
  const pmLevel = getPm25Level(log.pm25);
  const uvLevel = getUvLevel(log.uv_index);
  const capturedTime = formatCapturedTime(log.captured_at);

  return (
    <SectionCard
      title={log.location_name || '위치 정보 없음'}
      subtitle={capturedTime ? `${capturedTime} 측정` : undefined}
    >
      <RecordMetaStrip log={log} index={index} total={total} relatedDiet={relatedDiet} />

      <View style={styles.metricGrid}>
        {metrics.map((metric) => {
          let hint = null;
          if (metric.key === 'pm25') hint = pmLevel;
          if (metric.key === 'uv_index') hint = uvLevel;
          return (
            <MetricTile
              key={metric.key}
              icon={metric.icon}
              label={metric.label}
              value={metric.value}
              hint={hint}
            />
          );
        })}
      </View>
    </SectionCard>
  );
}

export default function EnvironmentLogScreen({ onBack, selectedDate }) {
  const { scrollPaddingBottom } = useRecordScreenInsets();
  const date = selectedDate ?? new Date();
  const dateStr = toDateStr(date);
  const isToday = dateStr === toDateStr(new Date());

  const { data: logs = [], isInitialLoad, error } = useEnvironmentLogsQuery(dateStr);
  const { data: dietLogs = [] } = useDietLogsQuery(dateStr);
  const sortedLogs = useMemo(() => sortEnvironmentLogs(logs), [logs]);
  const dietById = useMemo(() => {
    const map = new Map();
    dietLogs.forEach((diet) => map.set(diet.id, diet));
    return map;
  }, [dietLogs]);
  const latestLog = sortedLogs[0] ?? null;
  const summaryText = buildEnvironmentSummary(latestLog);

  const emptyGuide = isToday
    ? '위치가 포함된 식단을 저장하면 그 시간·장소의 기상·대기 정보가 자동으로 쌓여요.'
    : '이 날짜에 위치 포함 식단 기록이 있으면 환경 로그가 함께 생성됩니다.';

  const statusText = (() => {
    if (isInitialLoad) return '환경 로그를 불러오는 중...';
    if (error) return '환경 로그를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
    if (sortedLogs.length > 0) {
      return summaryText
        ? `${isToday ? '오늘' : dateStr} · ${summaryText}`
        : `${isToday ? '오늘' : dateStr} · 환경 기록 ${sortedLogs.length}건`;
    }
    return emptyGuide;
  })();

  return (
    <SubScreenRoot onBack={onBack}>
      <SubScreenTopBar
        title="주변 환경"
        dateLabel={isToday ? '오늘' : dateStr}
        onBack={onBack}
        accentColor="#477A7F"
          trailing={
          isInitialLoad ? <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" /> : null
        }
      />

      <ScrollView
        contentContainerStyle={[layoutStyles.scrollContent, { paddingBottom: scrollPaddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        {error && !isInitialLoad ? (
          <View style={styles.errorBannerWrap}>
            <StatusBanner
              icon="alert-circle-outline"
              text="환경 로그를 불러오지 못했어요."
              variant="error"
            />
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => useRecordCacheStore.getState().invalidateEnvironment(dateStr)}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={15} color={ENV_ACCENT} />
              <Text style={styles.retryBtnText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : sortedLogs.length === 0 && !isInitialLoad ? (
          <StatusBanner
            icon="cloud-offline-outline"
            text={statusText}
            variant="empty"
          />
        ) : null}

        {latestLog ? (
          <SectionCard
            title={isToday ? '오늘 환경 한눈에' : `${dateStr} 환경 요약`}
            subtitle="가장 최근 기록 기준"
            style={styles.summaryCard}
          >
            <View style={styles.summaryGrid}>
              {buildEnvironmentMetrics(latestLog)
                .slice(0, 4)
                .map((metric) => (
                  <View key={metric.key} style={styles.summaryItem}>
                    <Ionicons name={metric.icon} size={15} color={ENV_ACCENT} />
                    <Text style={styles.summaryValue}>{metric.value}</Text>
                    <Text style={styles.summaryLabel}>{metric.label}</Text>
                  </View>
                ))}
            </View>
          </SectionCard>
        ) : null}

        {sortedLogs.length === 0 && !isInitialLoad ? null : (
          sortedLogs.map((log, index) => (
            <EnvironmentLogCard
              key={log.id}
              log={log}
              index={index}
              total={sortedLogs.length}
              relatedDiet={log.diet_log_id ? dietById.get(log.diet_log_id) : null}
            />
          ))
        )}

        <SectionCard title="어떻게 쌓이나요?" subtitle="직접 입력하는 화면은 없어요">
          <View style={styles.guideList}>
            <GuideRow
              icon="restaurant-outline"
              text="식단 기록을 저장할 때 촬영 위치·지역명을 함께 보냅니다."
            />
            <GuideRow
              icon="cloud-download-outline"
              text="그 시점의 기온, 습도, 자외선, 미세먼지, 날씨를 자동으로 가져옵니다."
            />
            <GuideRow
              icon="time-outline"
              text="하루에 식단을 여러 번 남기면 장소별로 여러 건이 쌓일 수 있어요."
            />
          </View>
        </SectionCard>
      </ScrollView>
    </SubScreenRoot>
  );
}

function GuideRow({ icon, text }) {
  return (
    <View style={styles.guideRow}>
      <View style={styles.guideIcon}>
        <Ionicons name={icon} size={16} color={ENV_ACCENT} />
      </View>
      <Text style={styles.guideText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryCard: {
    borderColor: ENV_MID,
    borderWidth: 1.5,
  },
  summaryItem: {
    flex: 1,
    minHeight: 78,
    borderRadius: 14,
    backgroundColor: RECORD_COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '900',
    color: RECORD_COLORS.text,
  },
  summaryLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: RECORD_COLORS.muted,
  },
  summaryCaption: {
    marginTop: 12,
    fontSize: 12.5,
    fontWeight: '700',
    color: RECORD_COLORS.muted,
    lineHeight: 18,
  },

  metaLine: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(217, 214, 204, 0.55)',
  },
  metaOrder: {
    fontWeight: '900',
    color: ENV_ACCENT,
  },
  metaSep: {
    fontWeight: '700',
    color: RECORD_COLORS.muted,
  },
  metaSource: {
    fontWeight: '700',
    color: ENV_MUTED,
  },
  metaRelated: {
    fontWeight: '700',
    color: RECORD_COLORS.text,
  },

  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricTile: {
    width: '48%',
    backgroundColor: RECORD_COLORS.chip,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    padding: 12,
    gap: 4,
  },
  metricIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ENV_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '900',
    color: RECORD_COLORS.text,
    marginTop: 2,
  },
  metricLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: RECORD_COLORS.muted,
  },
  levelChip: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  levelChipText: {
    fontSize: 10,
    fontWeight: '800',
  },

  guideList: { gap: 12 },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guideIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ENV_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.text,
    lineHeight: 20,
    paddingTop: 5,
  },
  errorBannerWrap: { gap: 8 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: ENV_SOFT,
    borderWidth: 1,
    borderColor: ENV_MID,
    marginBottom: 4,
  },
  retryBtnText: { fontSize: 13, fontWeight: '800', color: ENV_ACCENT },
});

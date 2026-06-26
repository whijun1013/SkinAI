import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatAnalysisStats, getSafetyGradeConfig } from '../cosmeticAnalysisDisplay';
import { useCosmeticAnalysis } from '../hooks/useCosmeticAnalysis';
import { RECORD_COLORS } from '../../record/components/SubScreenLayout';

const COSMETICS_ACCENT = '#6B5F88';

export default function CosmeticAnalysisInline({ cosmeticId, enabled = true, onPressDetail }) {
  const { analysis, loading, error } = useCosmeticAnalysis(cosmeticId, enabled && !!cosmeticId);

  if (!cosmeticId || !enabled) return null;

  if (loading) {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={COSMETICS_ACCENT} />
        <Text style={styles.loadingText}>성분 분석 불러오는 중...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.row, styles.errorRow]}>
        <Ionicons name="alert-circle-outline" size={14} color={RECORD_COLORS.hint} />
        <Text style={styles.errorText} numberOfLines={1}>
          성분 분석을 불러오지 못했습니다.
        </Text>
      </View>
    );
  }

  if (!analysis) return null;

  const grade = getSafetyGradeConfig(analysis.safety_grade, analysis);
  const stats = formatAnalysisStats(analysis);

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: grade.bg }]}
      onPress={onPressDetail}
      activeOpacity={0.78}
      disabled={!onPressDetail}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={grade.icon} size={16} color={grade.color} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color: grade.color }]} numberOfLines={1}>
          {grade.label}
        </Text>
        <Text style={styles.stats} numberOfLines={1}>
          {stats}
        </Text>
      </View>
      {onPressDetail ? (
        <>
          <Text style={styles.detailLink}>자세히</Text>
          <Ionicons name="chevron-forward" size={14} color={COSMETICS_ACCENT} />
        </>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1, gap: 2 },
  label: { fontSize: 13, fontWeight: '800' },
  stats: { fontSize: 11, fontWeight: '600', color: RECORD_COLORS.muted },
  loadingText: { fontSize: 12, fontWeight: '600', color: RECORD_COLORS.muted },
  detailLink: { fontSize: 12, fontWeight: '700', color: COSMETICS_ACCENT },
  errorRow: { backgroundColor: RECORD_COLORS.chip },
  errorText: { fontSize: 12, fontWeight: '600', color: RECORD_COLORS.muted, flex: 1 },
});

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getWeeklyNutrientSummary } from '../../api/report';

const RECORD_COLORS = {
  bg: '#F8F7F2',
  surface: '#FFFCF7',
  surfaceSoft: '#FCFAF6',
  line: '#DED9CD',
  olive: '#4F603C',
  oliveSoft: '#E8EEDD',
  oliveMuted: '#AAB39B',
  text: '#1F2520',
  muted: '#8B9184',
  warning: '#A45F48',
};

export default function WeeklyNutrientCard({ selectedDate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedDate) return;
    
    let isMounted = true;
    const fetchSummary = async () => {
      setLoading(true);
      try {
        const result = await getWeeklyNutrientSummary(selectedDate);
        if (isMounted) setData(result);
      } catch (err) {
        console.warn('주간 영양소 요약 조회 실패:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchSummary();
    
    return () => { isMounted = false; };
  }, [selectedDate]);

  if (loading && !data) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color={RECORD_COLORS.olive} />
      </View>
    );
  }

  if (!data) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="nutrition-outline" size={18} color={RECORD_COLORS.olive} />
        <Text style={styles.title}>주간 영양소 요약 (피부 부담 체크)</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.row}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>총 당류</Text>
            <Text style={styles.statValue}>{data.total_sugar_g}g</Text>
            <Text style={styles.statSub}>주의: {data.high_sugar_days}일 초과</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>총 나트륨</Text>
            <Text style={styles.statValue}>{data.total_sodium_mg}mg</Text>
            <Text style={styles.statSub}>주의: {data.high_sodium_days}일 초과</Text>
          </View>
        </View>

        {data.signals && data.signals.length > 0 && (
          <View style={styles.signalsContainer}>
            {data.signals.map((signal, index) => (
              <View key={index} style={styles.signalItem}>
                <Ionicons name="alert-circle-outline" size={14} color={RECORD_COLORS.warning} />
                <Text style={styles.signalText}>{signal}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: RECORD_COLORS.text,
  },
  content: {
    flexDirection: 'column',
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: RECORD_COLORS.line,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: RECORD_COLORS.text,
  },
  statSub: {
    fontSize: 11,
    fontWeight: '500',
    color: RECORD_COLORS.warning,
  },
  signalsContainer: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: RECORD_COLORS.line,
    borderTopStyle: 'dashed',
    gap: 6,
  },
  signalItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  signalText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: RECORD_COLORS.warning,
  },
});

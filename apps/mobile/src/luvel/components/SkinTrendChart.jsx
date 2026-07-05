import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const COLORS = {
  active_lesion: '#E57373', // Red for trouble
  redness: '#FFB74D',       // Orange for redness
  barrier: '#64B5F6',       // Blue for barrier
  bg: '#F8F7F2',
  text: '#1F2520',
  muted: '#8B9184',
};

const LABELS = {
  active_lesion: '트러블',
  redness: '홍조',
  barrier: '각질',
};

export default function SkinTrendChart({ data = [] }) {
  if (!data || data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>데이터가 없습니다.</Text>
      </View>
    );
  }

  // Find max value to normalize bar heights
  let maxValue = 1;
  data.forEach((d) => {
    Object.keys(LABELS).forEach((key) => {
      if (d[key] && d[key] > maxValue) {
        maxValue = d[key];
      }
    });
  });

  return (
    <View style={styles.container}>
      <View style={styles.chartArea}>
        {data.map((item, index) => (
          <View key={index} style={styles.barGroup}>
            {Object.keys(LABELS).map((key) => {
              const val = item[key] || 0;
              const heightPct = Math.max((val / maxValue) * 100, 5); // min 5% height for visibility if 0

              return (
                <View
                  key={key}
                  style={[
                    styles.bar,
                    { height: `${heightPct}%`, backgroundColor: COLORS[key] },
                    val === 0 && { opacity: 0.2 },
                  ]}
                />
              );
            })}
            <Text style={styles.dateLabel}>{item.dateLabel}</Text>
          </View>
        ))}
      </View>
      <View style={styles.legendArea}>
        {Object.entries(LABELS).map(([key, label]) => (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: COLORS[key] }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(217, 214, 204, 0.4)',
    marginVertical: 8,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 14,
  },
  chartArea: {
    flexDirection: 'row',
    height: 120,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 24, // Space for date labels
  },
  barGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: '100%',
    flex: 1,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  bar: {
    width: 8,
    borderRadius: 4,
  },
  dateLabel: {
    position: 'absolute',
    bottom: 0,
    fontSize: 10,
    color: COLORS.muted,
    textAlign: 'center',
    width: '100%',
  },
  legendArea: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: COLORS.text,
  },
});

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';

export default function StepDots({ total = 3, active = 0, style }) {
  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: total }).map((_, idx) => (
        <View key={idx} style={[styles.dot, idx === active ? styles.active : styles.inactive]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  active: {
    backgroundColor: COLORS.olive,
  },
  inactive: {
    backgroundColor: '#E1E3D8',
  },
});

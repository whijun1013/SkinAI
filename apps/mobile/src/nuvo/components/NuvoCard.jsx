import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';
import { RADIUS, SHADOW, s } from '../constants/theme';

export default function NuvoCard({ children, style, soft = false }) {
  return (
    <View style={[styles.shadowLayer, soft && styles.softShadow, style]}>
      <View style={styles.highlight} />
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowLayer: {
    backgroundColor: 'rgba(255,255,252,0.86)',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.88)',
    overflow: 'hidden',
    ...SHADOW.floating,
  },

  softShadow: {
    ...SHADOW.card,
  },

  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
    backgroundColor: 'rgba(255,255,255,0.34)',
  },

  cardBody: {
    flex: 1,
    padding: s(0),
  },
});

import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOWS } from '../constants/theme';

export default function NuvoButton({ title, onPress, style, arrow = true, textStyle }) {
  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={[styles.wrap, style]}>
      <View style={styles.sheen} />
      <Text style={[styles.text, textStyle]}>{title}</Text>
      {arrow ? (
        <Feather name="chevron-right" size={26} color="#FFFFFF" style={styles.icon} />
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 72,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.olive,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    ...SHADOWS.button,
  },
  sheen: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 8,
    height: 26,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  icon: {
    position: 'absolute',
    right: 22,
    top: 23,
  },
});

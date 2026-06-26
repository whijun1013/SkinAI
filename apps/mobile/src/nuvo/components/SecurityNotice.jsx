import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { s } from '../constants/theme';

export default function SecurityNotice({ text, style }) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.iconCircle}>
        <Ionicons name="shield-checkmark-outline" size={s(18)} color={COLORS.oliveDeep} />
      </View>
      <Text style={styles.text}>{text || 'NUVO는 당신의 데이터를 안전하게 보호합니다.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },

  iconCircle: {
    width: s(30),
    height: s(30),
    borderRadius: s(15),
    backgroundColor: COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: s(10),
  },

  text: {
    fontSize: s(12.5),
    lineHeight: s(21),
    color: COLORS.textSoft,
    textAlign: 'center',
    fontWeight: '600',
  },
});

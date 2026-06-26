import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { RADIUS } from '../constants/theme';

export default function NuvoInput({ icon, placeholder, secure, rightIcon }) {
  return (
    <View style={styles.box}>
      <Ionicons name={icon} size={17} color={COLORS.olive} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        secureTextEntry={secure}
      />
      {rightIcon && <Ionicons name={rightIcon} size={17} color={COLORS.textMuted} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 50,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: 'rgba(255,255,255,0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    marginBottom: 12,
  },

  input: {
    flex: 1,
    height: 48,
    marginLeft: 10,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
});

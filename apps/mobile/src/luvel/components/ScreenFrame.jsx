import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BotanicalBackground from './BotanicalBackground';
import { COLORS } from '../constants/colors';
import { LAYOUT, SCREEN } from '../constants/theme';

export default function ScreenFrame({ children, variant = 'flow', fixed = false }) {
  if (fixed) {
    return (
      <SafeAreaView style={styles.root} edges={['left', 'right']}>
        <BotanicalBackground variant={variant} />
        <View style={styles.fixedPhone}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right']}>
      <BotanicalBackground variant={variant} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.phone}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
  },

  fixedPhone: {
    width: '100%',
    maxWidth: LAYOUT.maxWidth,
    height: SCREEN.height,
    alignItems: 'center',
    position: 'relative',
  },

  scroll: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 40,
  },

  phone: {
    width: '100%',
    maxWidth: LAYOUT.maxWidth,
    alignItems: 'center',
    paddingHorizontal: 22,
    minHeight: SCREEN.height,
  },
});

import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const BASE = {
  card:    '#FFFCF7',
  line:    '#D9D6CC',
  text:    '#1F2520',
  muted:   '#8B9184',
  white:   '#FFFFFF',
  defaultMain: '#4F603C',
  defaultSoft: '#E8EEDD',
};

const shadow = Platform.OS === 'ios'
  ? { shadowColor: '#1A2410', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } }
  : { elevation: 3 };

export default function RecordCard({
  title,
  description,
  icon,
  badge = false,
  onPress,
  compact = false,
  accent = null,
}) {
  const main = accent?.main ?? BASE.defaultMain;
  const soft = accent?.soft ?? BASE.defaultSoft;
  const Wrap = onPress ? TouchableOpacity : View;
  const wrapProps = onPress ? { activeOpacity: 0.86, onPress } : {};

  /* ── compact: 관리 카드 — 왼쪽 컬러 스트라이프 ── */
  if (compact) {
    return (
      <Wrap style={styles.compactCard} {...wrapProps}>
        <View style={[styles.compactStripe, { backgroundColor: main }]} />
        <View style={[styles.compactIcon, { backgroundColor: soft }]}>
          <Ionicons name={icon} size={18} color={main} />
        </View>
        <View style={styles.compactBody}>
          <Text style={styles.compactTitle}>{title}</Text>
          <Text style={styles.compactDesc} numberOfLines={1}>{description}</Text>
        </View>
        {onPress && <Ionicons name="chevron-forward" size={16} color={BASE.muted} />}
      </Wrap>
    );
  }

  /* ── regular: 기록 카드 — 컬러 헤더 밴드 ── */
  const headerBg    = badge ? main : soft;
  const headerText  = badge ? BASE.white : main;
  const iconBg      = badge ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.07)';
  const chevronColor = badge ? 'rgba(255,255,255,0.55)' : main;

  return (
    <Wrap style={styles.card} {...wrapProps}>
      {/* 컬러 헤더 */}
      <View style={[styles.header, { backgroundColor: headerBg }]}>
        <View style={[styles.headerIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={headerText} />
        </View>
        <Text style={[styles.headerTitle, { color: headerText }]}>{title}</Text>
        {badge && (
          <View style={styles.donePill}>
            <Text style={styles.donePillText}>완료</Text>
          </View>
        )}
        {onPress && <Ionicons name="chevron-forward" size={15} color={chevronColor} />}
      </View>

      {/* 설명 바디 */}
      <View style={styles.body}>
        <Text style={styles.bodyText} numberOfLines={2}>{description}</Text>
      </View>
    </Wrap>
  );
}

const styles = StyleSheet.create({
  /* ── 일반 카드 ── */
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: BASE.card,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BASE.line,
    ...shadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  donePill: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  donePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: BASE.white,
    letterSpacing: 0.3,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  bodyText: {
    fontSize: 13,
    fontWeight: '500',
    color: BASE.muted,
    lineHeight: 19,
  },

  /* ── compact 카드 ── */
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BASE.card,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 9,
    borderWidth: 1,
    borderColor: BASE.line,
    paddingRight: 14,
    paddingVertical: 12,
    gap: 12,
    ...shadow,
  },
  compactStripe: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 0,
  },
  compactIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactBody: { flex: 1 },
  compactTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: BASE.text,
    letterSpacing: -0.1,
  },
  compactDesc: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: BASE.muted,
  },
});

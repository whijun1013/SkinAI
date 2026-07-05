import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  card: '#FFFCF7',
  chip: '#FCFAF6',
  line: '#D9D6CC',
  olive: '#4F603C',
  oliveSoft: '#E8EEDD',
  text: '#1F2520',
  muted: '#8B9184',
};

export default function RecordCard({
  title,
  description,
  icon,
  badge = false,
  onPress,
  compact = false,
}) {
  const Wrapper = onPress ? TouchableOpacity : View;
  const wrapperProps = onPress ? { activeOpacity: 0.82, onPress } : {};

  return (
    <Wrapper style={[styles.card, compact && styles.cardCompact]} {...wrapperProps}>
      <View style={[styles.iconCircle, compact && styles.iconCircleCompact]}>
        <Ionicons name={icon} size={compact ? 20 : 23} color={COLORS.olive} />
      </View>
      <View style={styles.cardText}>
        <View style={styles.titleRow}>
          <Text style={[styles.cardTitle, compact && styles.cardTitleCompact]}>{title}</Text>
          {badge && <View style={styles.badgeDot} />}
        </View>
        <Text
          style={[styles.cardDescription, compact && styles.cardDescriptionCompact]}
          numberOfLines={2}
        >
          {description}
        </Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />}
    </Wrapper>
  );
}

const shadowCard =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#D7D0C2',
        shadowOpacity: 0.15,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 7 },
      }
    : { elevation: 4 };

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 18,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadowCard,
  },
  cardCompact: {
    padding: 14,
    marginBottom: 10,
    borderRadius: 18,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconCircleCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  cardText: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 0,
  },
  cardTitleCompact: { fontSize: 15, lineHeight: 20 },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.olive,
  },
  cardDescription: {
    marginTop: 5,
    fontSize: 13.2,
    lineHeight: 20,
    fontWeight: '600',
    color: COLORS.muted,
    letterSpacing: 0,
  },
  cardDescriptionCompact: { fontSize: 12.5, lineHeight: 18, marginTop: 3 },
});

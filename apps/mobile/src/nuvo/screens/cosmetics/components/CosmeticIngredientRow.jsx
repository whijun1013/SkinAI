import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getIngredientFlags } from '../cosmeticAnalysisDisplay';
import { RECORD_COLORS } from '../../record/components/SubScreenLayout';

export default function CosmeticIngredientRow({ ingredient, compact = false }) {
  const flags = getIngredientFlags(ingredient);
  const hasFlag = flags.length > 0;

  return (
    <View style={[styles.row, hasFlag && styles.rowFlagged, compact && styles.rowCompact]}>
      <View style={styles.info}>
        <Text style={[styles.name, hasFlag && styles.nameFlagged]} numberOfLines={2}>
          {ingredient.name}
        </Text>
        {ingredient.english_name && !compact ? (
          <Text style={styles.english} numberOfLines={1}>
            {ingredient.english_name}
          </Text>
        ) : null}
      </View>
      {flags.length > 0 ? (
        <View style={styles.badges}>
          {flags.map((flag) => (
            <View
              key={flag.key}
              style={[styles.badge, flag.tone === 'red' ? styles.badgeRed : styles.badgeYellow]}
            >
              <Text
                style={[
                  styles.badgeText,
                  flag.tone === 'red' ? styles.badgeTextRed : styles.badgeTextYellow,
                ]}
              >
                {flag.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(217,214,204,0.4)',
  },
  rowCompact: { paddingVertical: 8 },
  rowFlagged: {
    backgroundColor: 'rgba(196,92,74,0.05)',
    borderRadius: 12,
    borderBottomWidth: 0,
    marginBottom: 4,
    paddingHorizontal: 10,
  },
  info: { flex: 1, marginRight: 8 },
  name: { fontSize: 14, fontWeight: '700', color: RECORD_COLORS.text, lineHeight: 20 },
  nameFlagged: { fontWeight: '900' },
  english: { marginTop: 2, fontSize: 11.5, fontWeight: '600', color: RECORD_COLORS.muted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeRed: { backgroundColor: 'rgba(196,92,74,0.12)' },
  badgeYellow: { backgroundColor: 'rgba(196,154,43,0.12)' },
  badgeText: { fontSize: 10, fontWeight: '900' },
  badgeTextRed: { color: RECORD_COLORS.hint },
  badgeTextYellow: { color: '#C49A2B' },
});

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { searchStyles } from '../../../components/search/SearchScreenParts';
import { RECORD_COLORS } from '../../record/components/SubScreenLayout';

const MED_ACCENT = '#8C4444';
const MED_SOFT   = '#F5EAEA';
const MED_MID    = '#D4A0A0';

export default function MedicationSearchResultCard({ item, onRegister, onPreview }) {
  return (
    <View style={searchStyles.flatCard}>
      <View style={searchStyles.resultRow}>
        <TouchableOpacity
          activeOpacity={0.82}
          style={searchStyles.resultMainTap}
          onPress={() => onRegister(item)}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="medkit-outline" size={20} color={MED_ACCENT} />
          </View>

          <View style={searchStyles.resultBody}>
            <Text style={searchStyles.productName} numberOfLines={2}>
              {item.name}
            </Text>
            {item.form ? (
              <Text style={[searchStyles.productMeta, styles.formText]} numberOfLines={1}>
                {item.form}
              </Text>
            ) : null}
            <View style={searchStyles.addHint}>
              <Ionicons name="add-circle-outline" size={12} color={MED_ACCENT} />
              <Text style={[searchStyles.addHintText, styles.hintText]}>탭하여 복용 정보 입력</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={searchStyles.resultActions}>
          {onPreview ? (
            <TouchableOpacity
              style={[searchStyles.iconActionBtn, styles.previewBtn]}
              onPress={() => onPreview(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="성분 정보"
            >
              <Ionicons name="sparkles-outline" size={16} color={MED_ACCENT} />
            </TouchableOpacity>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color={RECORD_COLORS.muted} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: MED_SOFT,
    borderWidth: 1,
    borderColor: MED_MID,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  formText: {
    color: RECORD_COLORS.muted,
  },
  hintText: {
    color: MED_ACCENT,
  },
  previewBtn: {
    backgroundColor: MED_SOFT,
    borderWidth: 1,
    borderColor: MED_MID,
    borderRadius: 8,
  },
});

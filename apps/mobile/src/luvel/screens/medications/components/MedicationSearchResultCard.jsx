import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { searchStyles } from '../../../components/search/SearchScreenParts';
import { RECORD_COLORS } from '../../record/components/SubScreenLayout';

export default function MedicationSearchResultCard({ item, onRegister, onPreview }) {
  return (
    <View style={searchStyles.flatCard}>
      <View style={searchStyles.resultRow}>
        <TouchableOpacity
          activeOpacity={0.82}
          style={searchStyles.resultMainTap}
          onPress={() => onRegister(item)}
        >
          <View style={[searchStyles.thumb, searchStyles.thumbPlaceholder]}>
            <Ionicons name="medkit-outline" size={22} color={RECORD_COLORS.muted} />
          </View>

          <View style={searchStyles.resultBody}>
            <Text style={searchStyles.productName} numberOfLines={2}>
              {item.name}
            </Text>
            {item.form || item.license_status ? (
              <Text style={searchStyles.productMeta} numberOfLines={1}>
                {[item.license_status === '취하' ? '[취하]' : null, item.form].filter(Boolean).join(' ')}
              </Text>
            ) : null}
            <View style={searchStyles.addHint}>
              <Ionicons name="add-circle-outline" size={12} color={RECORD_COLORS.olive} />
              <Text style={searchStyles.addHintText}>탭하여 복용 정보 입력</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={searchStyles.resultActions}>
          {onPreview ? (
            <TouchableOpacity
              style={searchStyles.iconActionBtn}
              onPress={() => onPreview(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="성분 정보"
            >
              <Ionicons name="sparkles-outline" size={18} color={RECORD_COLORS.olive} />
            </TouchableOpacity>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color={RECORD_COLORS.muted} />
        </View>
      </View>
    </View>
  );
}

import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { searchStyles } from '../../../components/search/SearchScreenParts';
import { RECORD_COLORS } from '../../record/components/SubScreenLayout';

export default function CosmeticSearchResultCard({ item, onRegister, onPreview }) {
  const metaParts = [item.brand, item.category].filter(Boolean);

  return (
    <View style={searchStyles.flatCard}>
      <View style={searchStyles.resultRow}>
        <TouchableOpacity
          activeOpacity={0.82}
          style={searchStyles.resultMainTap}
          onPress={() => onRegister(item)}
        >
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={searchStyles.thumb} resizeMode="cover" />
          ) : (
            <View style={[searchStyles.thumb, searchStyles.thumbPlaceholder]}>
              <Ionicons name="flask-outline" size={22} color={RECORD_COLORS.muted} />
            </View>
          )}

          <View style={searchStyles.resultBody}>
            <Text style={searchStyles.productName} numberOfLines={2}>
              {item.product_name?.replace(/<\/?b>/gi, '')}
            </Text>
            {metaParts.length > 0 ? (
              <Text style={searchStyles.productMeta} numberOfLines={1}>
                {metaParts.join(' · ')}
              </Text>
            ) : null}
            <View style={searchStyles.addHint}>
              <Ionicons name="add-circle-outline" size={12} color={RECORD_COLORS.olive} />
              <Text style={searchStyles.addHintText}>탭하여 내 제품에 추가</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={searchStyles.resultActions}>
          <TouchableOpacity
            style={searchStyles.iconActionBtn}
            onPress={() => onPreview(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="성분 분석"
          >
            <Ionicons name="sparkles-outline" size={18} color={RECORD_COLORS.olive} />
          </TouchableOpacity>
          <Ionicons name="chevron-forward" size={18} color={RECORD_COLORS.muted} />
        </View>
      </View>
    </View>
  );
}

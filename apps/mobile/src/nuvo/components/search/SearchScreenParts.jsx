import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatKoreanDate, getTodayString } from './searchDateUtils';
import { SEARCH_COLORS, searchShadow } from './searchTheme';
import { RECORD_COLORS } from '../../screens/record/components/SubScreenLayout';

export const SEARCH_DEBOUNCE_MS = 300;

export { SEARCH_COLORS } from './searchTheme';
export {
  DATE_REGEX,
  dateToString,
  formatKoreanDate,
  getTodayString,
  isValidCalendarDate,
  parseDateString,
} from './searchDateUtils';
export { default as RegisterDatePickerSheet } from './RegisterDatePickerSheet';
export { default as RegisterDatePickerOverlay } from './RegisterDatePickerOverlay';

export function SearchSectionHeader({ title, subtitle, trailing = null, style }) {
  return (
    <View style={[searchStyles.sectionHeader, style]}>
      <View style={searchStyles.sectionHeaderText}>
        <Text style={searchStyles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={searchStyles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

export function SearchHintBanner({ icon = 'information-circle-outline', text }) {
  return (
    <View style={searchStyles.hintBanner}>
      <Ionicons name={icon} size={18} color={RECORD_COLORS.olive} />
      <Text style={searchStyles.hintBannerText}>{text}</Text>
    </View>
  );
}

export function SearchInputField({ value, onChangeText, onClear, placeholder, onSubmit, accentColor, accentSoft, iconBg: iconBgProp, iconColor: iconColorProp }) {
  const iconColor = iconColorProp ?? accentColor ?? RECORD_COLORS.olive;
  const iconBg    = iconBgProp   ?? accentSoft  ?? RECORD_COLORS.oliveSoft;
  return (
    <View style={searchStyles.searchWrap}>
      <View style={[searchStyles.searchIconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name="search-outline" size={18} color={iconColor} />
      </View>
      <TextInput
        style={searchStyles.searchInput}
        placeholder={placeholder}
        placeholderTextColor={RECORD_COLORS.muted}
        value={value}
        onChangeText={onChangeText}
        autoFocus
        returnKeyType="search"
        onSubmitEditing={onSubmit}
      />
      {value.length > 0 ? (
        <TouchableOpacity activeOpacity={0.7} onPress={onClear} style={searchStyles.clearBtn}>
          <Ionicons name="close-circle" size={18} color={RECORD_COLORS.muted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function SearchEmptyBox({ icon = 'search-outline', title, description }) {
  return (
    <View style={searchStyles.emptyBox}>
      <View style={searchStyles.emptyIcon}>
        <Ionicons name={icon} size={28} color={RECORD_COLORS.olive} />
      </View>
      <Text style={searchStyles.emptyTitle}>{title}</Text>
      {description ? <Text style={searchStyles.emptyDesc}>{description}</Text> : null}
    </View>
  );
}

export function CategoryChipRow({ categories, selected, onSelect, accentColor, accentSoft, inactiveBg, inactiveText }) {
  return (
    <View style={searchStyles.categoryRow}>
      {categories.map((category) => {
        const active = selected === category;
        const activeStyle = accentColor
          ? { backgroundColor: accentSoft ?? RECORD_COLORS.oliveSoft, borderColor: accentColor, borderWidth: 1 }
          : searchStyles.categoryChipActive;
        const activeTextStyle = accentColor
          ? { color: accentColor, fontWeight: '800' }
          : searchStyles.categoryChipTextActive;
        const inactiveStyle = inactiveBg
          ? { backgroundColor: inactiveBg }
          : null;
        const inactiveTextStyle = inactiveText
          ? { color: inactiveText }
          : null;
        return (
          <TouchableOpacity
            key={category}
            style={[searchStyles.categoryChip, inactiveStyle, active && activeStyle]}
            onPress={() => onSelect(category)}
            activeOpacity={0.78}
          >
            <Text style={[searchStyles.categoryChipText, inactiveTextStyle, active && activeTextStyle]}>
              {category}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** 사용 화장품 목록(CosmeticCategoryHeader)과 같은 톤의 결과 헤더 */
export function SearchResultsSection({ loading, count, isEmpty, emptyText, children, accentColor }) {
  const showLoading = loading && count === 0;
  const titleColor  = accentColor ?? RECORD_COLORS.olive;

  return (
    <View style={searchStyles.resultsSection}>
      <View style={searchStyles.resultsHeader}>
        <Text style={[searchStyles.resultsTitle, { color: titleColor }]}>검색 결과</Text>
        {showLoading ? (
          <ActivityIndicator size="small" color={titleColor} />
        ) : (
          <Text style={searchStyles.resultsCount}>{count}개</Text>
        )}
      </View>

      {showLoading ? (
        <Text style={searchStyles.resultsLoadingText}>검색 중...</Text>
      ) : isEmpty ? (
        <Text style={searchStyles.resultsEmptyText}>
          {emptyText || '검색 결과가 없어요. 다른 키워드나 카테고리로 다시 시도해 보세요.'}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

export function RegisterDateField({ value, onChangeText, editable = true, hint }) {
  return (
    <>
      <Text style={searchStyles.panelLabel}>사용 시작일</Text>
      <View style={searchStyles.dateInputWrap}>
        <View style={searchStyles.searchIconCircle}>
          <Ionicons name="calendar-outline" size={17} color={RECORD_COLORS.olive} />
        </View>
        <TextInput
          style={searchStyles.dateInput}
          value={value}
          onChangeText={onChangeText}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={RECORD_COLORS.muted}
          editable={editable}
          keyboardType="numbers-and-punctuation"
        />
      </View>
      {hint ? <Text style={searchStyles.panelHint}>{hint}</Text> : null}
    </>
  );
}

/** 날짜 선택 UI — 탭 시 화면에서 OS 기본 DateTimePicker를 띄움 */
export function RegisterDateSection({ value, onChange, editable = true, hint, onPressSelectDate }) {
  const displayLabel = formatKoreanDate(value) || '날짜를 선택해 주세요';

  return (
    <>
      <Text style={searchStyles.panelLabel}>사용 시작일</Text>

      <TouchableOpacity
        style={searchStyles.datePickerButton}
        onPress={() => {
          if (editable) onPressSelectDate?.();
        }}
        disabled={!editable}
        activeOpacity={0.82}
      >
        <View style={searchStyles.searchIconCircle}>
          <Ionicons name="calendar-outline" size={17} color={RECORD_COLORS.olive} />
        </View>
        <View style={searchStyles.datePickerTextWrap}>
          <Text style={searchStyles.datePickerLabel}>{displayLabel}</Text>
          <Text style={searchStyles.datePickerSub}>탭하여 날짜 변경</Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={RECORD_COLORS.muted} />
      </TouchableOpacity>

      {hint ? <Text style={searchStyles.panelHint}>{hint}</Text> : null}
    </>
  );
}

/** 검색창 + 카테고리를 한 카드에 묶는 패널 */
export function SearchFilterPanel({
  query,
  onChangeText,
  onClear,
  onSubmit,
  placeholder,
  categories,
  selectedCategory,
  onCategorySelect,
  hintText,
  errorText,
  accentColor,
  accentSoft,
  iconBg,
  iconColor,
  inactiveBg,
  inactiveText,
}) {
  return (
    <View style={searchStyles.filterPanel}>
      <SearchInputField
        value={query}
        onChangeText={onChangeText}
        onClear={onClear}
        placeholder={placeholder}
        onSubmit={onSubmit}
        accentColor={accentColor}
        accentSoft={accentSoft}
        iconBg={iconBg}
        iconColor={iconColor}
      />

      <View style={searchStyles.panelDivider} />

      <Text style={searchStyles.panelLabel}>카테고리</Text>
      <CategoryChipRow
        categories={categories}
        selected={selectedCategory}
        onSelect={onCategorySelect}
        accentColor={accentColor}
        accentSoft={accentSoft}
        inactiveBg={inactiveBg}
        inactiveText={inactiveText}
      />

      {errorText ? <Text style={searchStyles.panelError}>{errorText}</Text> : null}
      {!errorText && hintText ? <Text style={searchStyles.panelHint}>{hintText}</Text> : null}
    </View>
  );
}

export const searchStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  sectionHeaderText: { flex: 1 },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: RECORD_COLORS.text,
  },
  sectionSubtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    color: RECORD_COLORS.muted,
  },
  sectionTrailing: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: RECORD_COLORS.olive,
  },

  searchHeroCard: {
    borderRadius: 20,
    backgroundColor: SEARCH_COLORS.card,
    borderWidth: 1,
    borderColor: SEARCH_COLORS.border,
    padding: 16,
    marginBottom: 16,
    ...searchShadow,
  },

  filterPanel: {
    borderRadius: 20,
    backgroundColor: SEARCH_COLORS.card,
    borderWidth: 1,
    borderColor: SEARCH_COLORS.border,
    padding: 16,
    marginBottom: 16,
    gap: 12,
    ...searchShadow,
  },
  panelDivider: {
    height: 1,
    backgroundColor: SEARCH_COLORS.border,
    marginVertical: 2,
  },
  panelLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: RECORD_COLORS.text,
  },
  panelHint: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    color: RECORD_COLORS.muted,
  },
  panelError: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: RECORD_COLORS.hint,
  },

  resultsSection: {
    marginTop: 2,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  resultsTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: RECORD_COLORS.olive,
    letterSpacing: 0.2,
  },
  resultsCount: {
    fontSize: 12,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
  },
  resultsLoadingText: {
    fontSize: 12,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
    paddingVertical: 28,
  },
  resultsEmptyText: {
    fontSize: 12,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
    lineHeight: 18,
    paddingVertical: 28,
    paddingHorizontal: 12,
  },

  hintBanner: {
    borderRadius: 16,
    backgroundColor: SEARCH_COLORS.oliveLight,
    borderWidth: 1,
    borderColor: '#D9DEC9',
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 16,
  },
  hintBannerText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: SEARCH_COLORS.oliveMuted,
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    borderRadius: 16,
    backgroundColor: SEARCH_COLORS.cardAlt,
    borderWidth: 1,
    borderColor: SEARCH_COLORS.border,
    paddingHorizontal: 12,
  },
  searchIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: RECORD_COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: RECORD_COLORS.text,
    paddingVertical: 0,
  },
  clearBtn: { padding: 2 },

  dateInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    borderRadius: 16,
    backgroundColor: SEARCH_COLORS.cardAlt,
    borderWidth: 1,
    borderColor: SEARCH_COLORS.border,
    paddingHorizontal: 12,
  },
  dateInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: RECORD_COLORS.text,
    paddingVertical: 0,
  },

  dateQuickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dateQuickChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: SEARCH_COLORS.chip,
    borderWidth: 0.5,
    borderColor: SEARCH_COLORS.chipBorder,
  },
  dateQuickChipActive: {
    backgroundColor: RECORD_COLORS.oliveSoft,
    borderColor: RECORD_COLORS.olive,
    borderWidth: 1,
  },
  dateQuickChipText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: SEARCH_COLORS.chipText,
  },
  dateQuickChipTextActive: {
    color: RECORD_COLORS.olive,
    fontWeight: '700',
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: SEARCH_COLORS.cardAlt,
    borderWidth: 1,
    borderColor: SEARCH_COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  datePickerTextWrap: { flex: 1 },
  datePickerLabel: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: RECORD_COLORS.text,
  },
  datePickerSub: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    color: RECORD_COLORS.muted,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewRowText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.olive,
  },

  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: SEARCH_COLORS.chip,
    borderWidth: 0.5,
    borderColor: SEARCH_COLORS.chipBorder,
  },
  categoryChipActive: {
    backgroundColor: RECORD_COLORS.oliveSoft,
    borderColor: RECORD_COLORS.olive,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: SEARCH_COLORS.chipText,
  },
  categoryChipTextActive: { color: RECORD_COLORS.olive, fontWeight: '700' },

  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 150,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SEARCH_COLORS.border,
    borderStyle: 'dashed',
    backgroundColor: SEARCH_COLORS.cardAlt,
    padding: 22,
    gap: 8,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: RECORD_COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: RECORD_COLORS.olive,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
  },

  resultRow: { flexDirection: 'row', alignItems: 'center' },
  resultMainTap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  flatCard: {
    borderRadius: 16,
    backgroundColor: SEARCH_COLORS.card,
    borderWidth: 1,
    borderColor: SEARCH_COLORS.border,
    padding: 12,
    marginBottom: 8,
    ...searchShadow,
  },
  thumb: {
    width: 62,
    height: 62,
    borderRadius: 14,
    backgroundColor: RECORD_COLORS.oliveSoft,
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  resultBody: { flex: 1, marginLeft: 12, marginRight: 8 },
  productName: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: RECORD_COLORS.text,
  },
  productMeta: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    color: RECORD_COLORS.muted,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: SEARCH_COLORS.chip,
    borderWidth: 0.5,
    borderColor: SEARCH_COLORS.chipBorder,
  },
  categoryText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    color: SEARCH_COLORS.chipText,
  },
  addHint: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addHintText: {
    fontSize: 11,
    fontWeight: '600',
    color: RECORD_COLORS.oliveMuted,
  },
  resultActions: { alignItems: 'center', gap: 8 },
  iconActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: RECORD_COLORS.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

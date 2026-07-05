import React from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SwipeBackView from '../../../components/SwipeBackView';
import useSubScreenLayout from '../../../../hooks/useSubScreenLayout';

export const RECORD_COLORS = {
  bg: '#F8F7F2',
  card: '#FFFCF7',
  chip: '#FCFAF6',
  line: '#D9D6CC',
  olive: '#4F603C',
  oliveSoft: '#E8EEDD',
  oliveMuted: '#6B7F58',
  text: '#1F2520',
  muted: '#8B9184',
  white: '#FFFFFF',
  hint: '#C45C4A',
};

export const shadowCard =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#D7D0C2',
        shadowOpacity: 0.14,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
      }
    : { elevation: 3 };

export function SubScreenTopBar({
  title,
  dateLabel,
  onBack,
  trailing = null,
  headerPaddingTop: headerPaddingTopOverride,
}) {
  const { headerPaddingTop: defaultHeaderPaddingTop } = useSubScreenLayout();
  const headerPaddingTop = headerPaddingTopOverride ?? defaultHeaderPaddingTop;

  return (
    <View style={[styles.topBar, { paddingTop: headerPaddingTop }]}>
      <View style={styles.topBarRow}>
        <View style={styles.topBarSide}>
          <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.75}>
            <Ionicons name="chevron-back" size={22} color={RECORD_COLORS.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.topBarSide}>
          {trailing ? (
            <View style={styles.trailingSlot}>{trailing}</View>
          ) : (
            <View style={styles.topBarSpacer} />
          )}
        </View>
        <View style={styles.topBarCenter} pointerEvents="none">
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {title}
          </Text>
          {dateLabel ? (
            <View style={styles.dateChip}>
              <Text style={styles.dateChipText}>{dateLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function StatusBanner({ icon, text, variant = 'info', onPress }) {
  const isEmpty = variant === 'empty';
  const isError = variant === 'error';
  const iconColor = isError ? '#B15A3B' : isEmpty ? RECORD_COLORS.muted : RECORD_COLORS.olive;
  const textStyle = isError
    ? styles.statusBannerTextError
    : isEmpty
      ? styles.statusBannerTextMuted
      : styles.statusBannerText;
  const bannerStyle = [
    styles.statusBanner,
    isEmpty && styles.statusBannerEmpty,
    isError && styles.statusBannerError,
  ];

  if (onPress) {
    return (
      <TouchableOpacity style={bannerStyle} onPress={onPress} activeOpacity={0.8}>
        <Ionicons name={icon} size={16} color={iconColor} />
        <Text style={[textStyle, styles.statusBannerFlex]}>{text}</Text>
        <Ionicons name="close-outline" size={16} color={iconColor} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={bannerStyle}>
      <Ionicons name={icon} size={16} color={iconColor} />
      <Text style={textStyle}>{text}</Text>
    </View>
  );
}

export function SectionCard({ title, subtitle, children, style, trailing, headerContent }) {
  return (
    <View style={[styles.sectionCard, style]}>
      {headerContent ? (
        <View style={styles.sectionCardHeader}>{headerContent}</View>
      ) : (
        <View style={styles.sectionCardHeader}>
          <View style={styles.sectionCardHeaderLeft}>
            <Text style={styles.sectionCardTitle}>{title}</Text>
            {subtitle ? <Text style={styles.sectionCardSubtitle}>{subtitle}</Text> : null}
          </View>
          {trailing ? <View style={styles.sectionCardHeaderTrailing}>{trailing}</View> : null}
        </View>
      )}
      {children}
    </View>
  );
}

export function SubScreenFooter({
  label,
  onPress,
  disabled,
  saving,
  icon = 'checkmark-circle-outline',
  footerPaddingBottom: footerPaddingBottomOverride,
}) {
  const { footerPaddingBottom: defaultFooterPaddingBottom } = useSubScreenLayout();
  const footerPaddingBottom = footerPaddingBottomOverride ?? defaultFooterPaddingBottom;

  return (
    <View style={[styles.footer, { paddingBottom: footerPaddingBottom }]}>
      <TouchableOpacity
        style={[styles.saveButton, disabled && styles.saveButtonDisabled]}
        onPress={onPress}
        disabled={disabled || saving}
        activeOpacity={0.85}
      >
        {saving ? (
          <ActivityIndicator color={RECORD_COLORS.white} />
        ) : (
          <>
            <Ionicons name={icon} size={20} color={RECORD_COLORS.white} />
            <Text style={styles.saveButtonText}>{label}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

/** 상세 화면 공통 래퍼: SwipeBack + flex root */
export function SubScreenRoot({ onBack, children, enabled = true, style }) {
  return (
    <SwipeBackView onBack={onBack} style={[styles.root, style]} enabled={enabled}>
      {children}
    </SwipeBackView>
  );
}

export function useRecordScreenInsets() {
  return useSubScreenLayout();
}

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: RECORD_COLORS.bg },

  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: RECORD_COLORS.bg,
  },
  topBarRow: {
    minHeight: 40,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarSide: {
    width: 40,
    zIndex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RECORD_COLORS.card,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  topBarCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 48,
    zIndex: 0,
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: RECORD_COLORS.text,
    textAlign: 'center',
  },
  dateChip: {
    backgroundColor: RECORD_COLORS.oliveSoft,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dateChipText: { fontSize: 12, fontWeight: '800', color: RECORD_COLORS.olive },
  trailingSlot: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarSpacer: { width: 40, height: 40 },

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: RECORD_COLORS.oliveSoft,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  statusBannerEmpty: { backgroundColor: RECORD_COLORS.chip },
  statusBannerError: {
    backgroundColor: '#FBE8DF',
    borderWidth: 1,
    borderColor: 'rgba(196, 92, 74, 0.25)',
  },
  statusBannerFlex: { flex: 1 },
  statusBannerText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: RECORD_COLORS.olive,
    lineHeight: 18,
  },
  statusBannerTextMuted: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: RECORD_COLORS.muted,
  },
  statusBannerTextError: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#B15A3B',
    lineHeight: 18,
  },

  sectionCard: {
    backgroundColor: RECORD_COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    padding: 18,
    marginBottom: 14,
    ...shadowCard,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionCardHeaderLeft: { flex: 1, marginRight: 8 },
  sectionCardHeaderTrailing: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  sectionCardTitle: { fontSize: 16, fontWeight: '900', color: RECORD_COLORS.text },
  sectionCardSubtitle: {
    marginTop: 4,
    fontSize: 12.5,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
    lineHeight: 18,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: RECORD_COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(217, 214, 204, 0.5)',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: RECORD_COLORS.olive,
    height: 52,
    borderRadius: 26,
    ...shadowCard,
  },
  saveButtonDisabled: { opacity: 0.45 },
  saveButtonText: { color: RECORD_COLORS.white, fontSize: 16, fontWeight: '900' },

  input: {
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    borderRadius: 14,
    height: 50,
    paddingHorizontal: 16,
    fontSize: 15,
    color: RECORD_COLORS.text,
  },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4 },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { cosmeticsAPI } from '../../../../api/cosmetics';

import useRecordCacheStore from '../../../../stores/recordCacheStore';

import useSubScreenLayout, { useModalScreenLayout } from '../../../../hooks/useSubScreenLayout';

import {
  getTodayString,
  isValidCalendarDate,
  parseDateString,
  RegisterDateSection,
  searchStyles,
} from '../../../components/search/SearchScreenParts';

import RegisterDatePickerSheet from '../../../components/search/RegisterDatePickerSheet';

import { SEARCH_COLORS } from '../../../components/search/searchTheme';

import CosmeticAnalysisInline from './CosmeticAnalysisInline';

import CosmeticAnalysisSheet from './CosmeticAnalysisSheet';

import {
  RECORD_COLORS,
  StatusBanner,
  SubScreenFooter,
  SubScreenRoot,
  SubScreenTopBar,
  shadowCard,
} from '../../record/components/SubScreenLayout';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDE_OFFSET = SCREEN_WIDTH;

const COSMETICS_ACCENT = '#6B5F88';
const COSMETICS_SOFT   = '#EAE4F2';
const COSMETICS_MID    = '#B8ACCC';

function CosmeticProductHero({ product }) {
  const brand    = product.brand?.trim();
  const category = product.category?.trim();

  return (
    <View style={styles.heroBlock}>
      {/* 제품 이미지 — 풀폭 */}
      <View style={styles.imageFrame}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.heroImage} resizeMode="contain" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <View style={styles.imagePlaceholderIcon}>
              <Ionicons name="flask-outline" size={36} color={COSMETICS_ACCENT} />
            </View>
            <Text style={styles.imagePlaceholderText}>이미지 없음</Text>
          </View>
        )}
      </View>

      {/* 제품명 + 브랜드 + 카테고리 */}
      <View style={styles.heroTextBlock}>
        {brand ? (
          <Text style={styles.heroBrand} numberOfLines={1}>{brand}</Text>
        ) : null}
        <Text style={styles.heroName} numberOfLines={2}>
          {product.product_name}
        </Text>
        {category ? (
          <View style={styles.heroCategoryBadge}>
            <Text style={styles.heroCategoryBadgeText}>{category}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function RegisterSuccessPanel({
  product,
  onContinueSearch,
  onGoToList,
  onClose,
  headerPaddingTop,
  footerPaddingBottom = 0,
}) {
  return (
    <View style={styles.successRoot}>
      <SubScreenRoot onBack={onClose}>
        <SubScreenTopBar title="제품 등록" onBack={onClose} accentColor={COSMETICS_ACCENT} headerPaddingTop={headerPaddingTop} />

        <View style={[styles.successBody, { paddingBottom: footerPaddingBottom + 20 }]}>
          {/* 성공 아이콘 */}
          <View style={styles.successIconWrap}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark" size={36} color={COSMETICS_ACCENT} />
            </View>
            <Text style={styles.successTitle}>등록 완료!</Text>
            <Text style={styles.successProductName} numberOfLines={2}>
              {product.product_name}
            </Text>
            {product.brand ? (
              <Text style={styles.successBrand}>{product.brand}</Text>
            ) : null}
          </View>

          {/* 액션 버튼 */}
          <View style={styles.successActions}>
            <TouchableOpacity style={styles.successPrimaryBtn} onPress={onGoToList} activeOpacity={0.85}>
              <Ionicons name="albums-outline" size={18} color="#fff" />
              <Text style={styles.successPrimaryBtnText}>내 목록 보기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.successSecondaryBtn} onPress={onContinueSearch} activeOpacity={0.78}>
              <Ionicons name="search-outline" size={16} color={COSMETICS_ACCENT} />
              <Text style={styles.successSecondaryBtnText}>다른 제품 계속 검색</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SubScreenRoot>
    </View>
  );
}

/**

 * @param {"modal"|"overlay"} presentation

 *   overlay — 검색 등 서브화면 위 절대배치, 오른쪽에서 슬라이드 (RN Modal 스택 크래시 방지)

 *   modal   — 독립 fullScreen Modal (온보딩 등)

 */

export default function CosmeticRegisterModal({
  visible,

  product,

  onClose,

  onContinueSearch,

  onRegistered,

  presentation = 'modal',

  defaultStartDate,
}) {
  const modalLayout = useModalScreenLayout();

  const screenLayout = useSubScreenLayout();

  const layout = presentation === 'overlay' ? screenLayout : modalLayout;

  const headerPaddingTop = layout.headerPaddingTop;

  const [startedAt, setStartedAt] = useState(defaultStartDate || '');

  const [saving, setSaving] = useState(false);

  const [registrationComplete, setRegistrationComplete] = useState(false);

  const [previewId, setPreviewId] = useState(null);

  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const [panelRendered, setPanelRendered] = useState(false);
  const panelTranslateX = useRef(new Animated.Value(SLIDE_OFFSET)).current;

  const pickerDate = useMemo(
    () => parseDateString(startedAt) || parseDateString(getTodayString()) || new Date(),

    [startedAt]
  );

  useEffect(() => {
    if (visible && product) {
      const candidate = (defaultStartDate || '').trim();
      setStartedAt(
        candidate && isValidCalendarDate(candidate) ? candidate : getTodayString()
      );

      setPreviewId(null);

      setDatePickerOpen(false);

      setRegistrationComplete(false);
    }
  }, [visible, product?.id, defaultStartDate]);

  useEffect(() => {
    if (presentation !== 'overlay') return undefined;

    if (visible) {
      setPanelRendered(true);
      panelTranslateX.setValue(SLIDE_OFFSET);
      Animated.timing(panelTranslateX, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return undefined;
    }

    if (!panelRendered) return undefined;

    const closeAnim = Animated.timing(panelTranslateX, {
      toValue: SLIDE_OFFSET,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    closeAnim.start(({ finished }) => {
      if (finished) setPanelRendered(false);
    });
    return () => closeAnim.stop();
  }, [visible, presentation, panelRendered, panelTranslateX]);

  const handleClose = useCallback(() => {
    if (saving) return;

    setRegistrationComplete(false);

    onClose?.();
  }, [saving, onClose]);

  const handleContinueSearch = useCallback(() => {
    setRegistrationComplete(false);

    if (onContinueSearch) onContinueSearch();
    else onClose?.();
  }, [onContinueSearch, onClose]);

  const handleGoToList = useCallback(() => {
    onRegistered?.({ goToList: true });
  }, [onRegistered]);

  const handleRegister = async () => {
    if (!product || saving) return;

    const start = startedAt.trim();

    if (start && !isValidCalendarDate(start)) {
      Alert.alert('입력 오류', '사용 시작일이 올바르지 않습니다.');

      return;
    }

    setSaving(true);

    try {
      await cosmeticsAPI.addMyCosmetic(product.id, true, start || null);

      useRecordCacheStore.getState().invalidateCosmeticsTab('current');
      onRegistered?.({ keepSearchOpen: true });

      setRegistrationComplete(true);
    } catch (err) {
      const detail = err.response?.data?.detail || '등록에 실패했습니다.';

      Alert.alert('오류', typeof detail === 'string' ? detail : '등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const isDetailOpen = previewId !== null;

  const isOpen = visible && product != null;

  if (presentation === 'overlay' && !isOpen && !panelRendered) return null;
  if (presentation === 'modal' && (!isOpen || !product)) return null;
  if (!product) return null;

  const registerDatePicker = (
    <RegisterDatePickerSheet
      visible={datePickerOpen}
      value={pickerDate}
      maximumDate={new Date()}
      onConfirm={setStartedAt}
      onDismiss={() => setDatePickerOpen(false)}
    />
  );

  const analysisSheet = (
    <CosmeticAnalysisSheet
      visible={isDetailOpen}
      cosmeticId={previewId}
      onClose={() => setPreviewId(null)}
      variant="register"
      embedded={presentation === 'overlay'}
    />
  );

  const content = registrationComplete ? (
    <View
      style={[
        styles.root,
        presentation === 'modal' ? modalLayout.rootStyle : styles.overlayRoot,
      ]}
    >
      <RegisterSuccessPanel
        product={product}
        onContinueSearch={handleContinueSearch}
        onGoToList={handleGoToList}
        onClose={handleClose}
        headerPaddingTop={headerPaddingTop}
        footerPaddingBottom={layout.footerPaddingBottom}
      />
    </View>
  ) : (
    <View
      style={[
        styles.root,
        presentation === 'modal' ? modalLayout.rootStyle : styles.overlayRoot,
      ]}
    >
      <SubScreenRoot onBack={handleClose} enabled={!isDetailOpen && !datePickerOpen}>
        <SubScreenTopBar
          title="제품 등록"
          onBack={handleClose}
          accentColor={COSMETICS_ACCENT}
          headerPaddingTop={headerPaddingTop}
        />

        <View style={styles.body}>
          {/* 제품 히어로 */}
          <CosmeticProductHero product={product} />

          <View style={styles.divider} />

          {/* 성분 분석 인라인 */}
          <CosmeticAnalysisInline
            cosmeticId={product.id}
            enabled={isOpen}
            onPressDetail={() => setPreviewId(product.id)}
          />

          <View style={styles.divider} />

          {/* 사용 시작일 */}
          <View style={styles.dateSection}>
            <RegisterDateSection
              value={startedAt}
              onChange={setStartedAt}
              editable={!saving}
              onPressSelectDate={() => setDatePickerOpen(true)}
            />
          </View>
        </View>

        <SubScreenFooter
          label="등록하기"
          onPress={handleRegister}
          saving={saving}
          icon="checkmark-circle-outline"
          color={COSMETICS_ACCENT}
          footerPaddingBottom={layout.footerPaddingBottom}
        />
      </SubScreenRoot>

      {presentation === 'modal' ? registerDatePicker : null}
      {presentation === 'modal' ? analysisSheet : null}
    </View>
  );

  if (presentation === 'overlay') {
    return (
      <View style={styles.overlayShell} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.panelWrap,
            { transform: [{ translateX: panelTranslateX }] },
          ]}
          pointerEvents="box-none"
        >
          {content}
        </Animated.View>

        {registerDatePicker}
        {analysisSheet}
      </View>
    );
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayShell: { ...StyleSheet.absoluteFillObject, zIndex: 30 },
  panelWrap: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  overlayRoot: { flex: 1 },
  root: { flex: 1, backgroundColor: RECORD_COLORS.bg },
  successRoot: { flex: 1 },

  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: RECORD_COLORS.line,
    marginVertical: 20,
  },

  dateSection: { gap: 10 },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: RECORD_COLORS.text,
    letterSpacing: -0.3,
  },

  // ── 제품 히어로 ──────────────────────────────────────────────────────────────
  heroBlock: { gap: 14 },

  imageFrame: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    backgroundColor: COSMETICS_SOFT,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImage: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  imagePlaceholderIcon: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: COSMETICS_MID,
  },
  imagePlaceholderText: { fontSize: 12, fontWeight: '600', color: COSMETICS_ACCENT },

  heroTextBlock: { gap: 5 },
  heroBrand: { fontSize: 12, fontWeight: '700', color: '#5A6070' },
  heroName: { fontSize: 18, lineHeight: 25, fontWeight: '900', color: RECORD_COLORS.text, letterSpacing: -0.4 },
  heroCategoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COSMETICS_SOFT,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginTop: 2,
  },
  heroCategoryBadgeText: { fontSize: 11, fontWeight: '800', color: COSMETICS_ACCENT },

  // ── 성공 화면 ────────────────────────────────────────────────────────────────
  successBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 32,
  },
  successIconWrap: { alignItems: 'center', gap: 14 },
  successIconCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: COSMETICS_SOFT,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COSMETICS_MID,
    ...shadowCard,
  },
  successTitle: { fontSize: 22, fontWeight: '900', color: RECORD_COLORS.text, letterSpacing: -0.5 },
  successProductName: {
    fontSize: 15, fontWeight: '700', color: RECORD_COLORS.text,
    textAlign: 'center', lineHeight: 22,
  },
  successBrand: { fontSize: 13, fontWeight: '600', color: '#5A6070' },

  successActions: { gap: 10 },
  successPrimaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 54, borderRadius: 27,
    backgroundColor: COSMETICS_ACCENT,
    ...shadowCard,
  },
  successPrimaryBtnText: { fontSize: 16, fontWeight: '900', color: '#fff' },
  successSecondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, height: 50, borderRadius: 25,
    borderWidth: 1.5, borderColor: COSMETICS_MID,
    backgroundColor: COSMETICS_SOFT,
  },
  successSecondaryBtnText: { fontSize: 14, fontWeight: '700', color: COSMETICS_ACCENT },
});

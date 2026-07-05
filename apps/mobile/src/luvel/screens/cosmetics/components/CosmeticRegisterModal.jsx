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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

function CosmeticProductHero({ product }) {
  const metaParts = [product.brand, product.category].filter(Boolean);

  return (
    <View style={styles.heroBlock}>
      <View style={styles.imageFrame}>
        {product.image_url ? (
          <Image
            source={{ uri: product.image_url }}
            style={styles.heroImage}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="flask-outline" size={36} color={RECORD_COLORS.muted} />

            <Text style={styles.imagePlaceholderText}>이미지 없음</Text>
          </View>
        )}
      </View>

      <View style={styles.heroTextBlock}>
        <Text style={styles.heroName} numberOfLines={2}>
          {product.product_name}
        </Text>

        {metaParts.length > 0 ? (
          <Text style={styles.heroMeta} numberOfLines={1}>
            {metaParts.join(' · ')}
          </Text>
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
  footerPaddingBottom = 0,
}) {
  return (
    <View style={styles.successRoot}>
      <SubScreenRoot onBack={onClose}>
        <SubScreenTopBar title="제품 등록" onBack={onClose} />

        <View
          style={[
            styles.successBody,
            { paddingBottom: footerPaddingBottom + 20 },
          ]}
        >
          <View style={[searchStyles.filterPanel, styles.registerPanel]}>
            <CosmeticProductHero product={product} />

            <StatusBanner
              icon="checkmark-circle"
              text="내 화장품 목록에 추가됐어요."
            />

            <View style={searchStyles.panelDivider} />

            <TouchableOpacity
              style={styles.successPrimaryBtn}
              onPress={onGoToList}
              activeOpacity={0.85}
            >
              <Ionicons name="albums-outline" size={18} color="#fff" />
              <Text style={styles.successPrimaryBtnText}>목록 보기</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.successSecondaryBtn}
              onPress={onContinueSearch}
              activeOpacity={0.78}
            >
              <Ionicons name="search-outline" size={16} color={RECORD_COLORS.olive} />
              <Text style={styles.successSecondaryBtnText}>다른 제품 계속 검색</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SubScreenRoot>
    </View>
  );
}

function PendingRegistrationPanel({ product, onClose, onRegistered, footerPaddingBottom = 0 }) {
  const [brand, setBrand] = useState('');
  const [productName, setProductName] = useState(product?.query || '');
  const [saving, setSaving] = useState(false);

  const handleRegister = async () => {
    if (!brand.trim() || !productName.trim()) {
      Alert.alert('입력 오류', '브랜드와 제품명을 모두 입력해 주세요.');
      return;
    }
    setSaving(true);
    try {
      await cosmeticsAPI.requestRegistration(brand, productName);
      Alert.alert('요청 완료', '제품 등록 요청이 완료되었습니다.');
      onRegistered?.({ keepSearchOpen: true });
    } catch (err) {
      Alert.alert('오류', '등록 요청에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.successRoot}>
      <SubScreenRoot onBack={onClose}>
        <SubScreenTopBar title="제품 등록 요청" onBack={onClose} />
        <View style={styles.body}>
          <Text style={styles.heroName}>직접 제품 등록하기</Text>
          <Text style={styles.heroMeta}>원하시는 제품이 없다면 직접 등록을 요청해 주세요.</Text>
          
          <View style={{ marginTop: 24, gap: 16 }}>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '700', marginBottom: 8, color: RECORD_COLORS.text }}>브랜드</Text>
              <TextInput
                style={styles.inputField}
                placeholder="예: 라운드랩"
                value={brand}
                onChangeText={setBrand}
                placeholderTextColor={RECORD_COLORS.muted}
              />
            </View>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '700', marginBottom: 8, color: RECORD_COLORS.text }}>제품명</Text>
              <TextInput
                style={styles.inputField}
                placeholder="예: 자작나무 수분 크림"
                value={productName}
                onChangeText={setProductName}
                placeholderTextColor={RECORD_COLORS.muted}
              />
            </View>
          </View>
        </View>

        <SubScreenFooter
          label="요청하기"
          onPress={handleRegister}
          saving={saving}
          icon="paper-plane-outline"
          footerPaddingBottom={footerPaddingBottom}
        />
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
  const insets = useSafeAreaInsets();
  const modalLayout = useModalScreenLayout();

  const screenLayout = useSubScreenLayout();

  const layout = presentation === 'overlay' ? screenLayout : modalLayout;

  const overlayRootStyle =
    presentation === 'overlay' ? { paddingTop: insets.top } : null;

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

  let content;
  if (product.isNewRegistrationRequest) {
    content = (
      <View
        style={[
          styles.root,
          presentation === 'modal' ? modalLayout.rootStyle : styles.overlayRoot,
          overlayRootStyle,
        ]}
      >
        <PendingRegistrationPanel
          product={product}
          onClose={handleClose}
          onRegistered={onRegistered}
          footerPaddingBottom={
            layout.footerPaddingBottom + (presentation === 'overlay' ? insets.bottom : 0)
          }
        />
      </View>
    );
  } else {
    content = registrationComplete ? (
      <View
        style={[
          styles.root,
          presentation === 'modal' ? modalLayout.rootStyle : styles.overlayRoot,
          overlayRootStyle,
        ]}
      >
        <RegisterSuccessPanel
          product={product}
          onContinueSearch={handleContinueSearch}
          onGoToList={handleGoToList}
          onClose={handleClose}
          footerPaddingBottom={
            layout.footerPaddingBottom + (presentation === 'overlay' ? insets.bottom : 0)
          }
        />
      </View>
    ) : (
      <View
        style={[
          styles.root,
          presentation === 'modal' ? modalLayout.rootStyle : styles.overlayRoot,
          overlayRootStyle,
        ]}
      >
        <SubScreenRoot onBack={handleClose} enabled={!isDetailOpen && !datePickerOpen}>
          <SubScreenTopBar
            title="제품 등록"
            onBack={handleClose}
            headerPaddingTop={layout.headerPaddingTop}
          />

          <View style={styles.body}>
            <View style={[searchStyles.filterPanel, styles.registerPanel]}>
              <CosmeticProductHero product={product} />

              <CosmeticAnalysisInline
                cosmeticId={product.id}
                enabled={isOpen}
                onPressDetail={() => setPreviewId(product.id)}
              />

              <View style={searchStyles.panelDivider} />

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
            footerPaddingBottom={
              layout.footerPaddingBottom + (presentation === 'overlay' ? insets.bottom : 0)
            }
          />
        </SubScreenRoot>

        {presentation === 'modal' ? registerDatePicker : null}
        {presentation === 'modal' ? analysisSheet : null}
      </View>
    );
  }

  if (presentation === 'overlay') {
    return (
      <View style={styles.overlayShell} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.panelWrap,
            {
              transform: [{ translateX: panelTranslateX }],
              backgroundColor: RECORD_COLORS.bg,
            },
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
  overlayShell: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },

  panelWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },

  overlayRoot: {
    flex: 1,
  },

  root: {
    flex: 1,
    backgroundColor: RECORD_COLORS.bg,
  },

  successRoot: {
    flex: 1,
  },

  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  successBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  successPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 26,
    backgroundColor: RECORD_COLORS.olive,
    ...shadowCard,
  },

  successPrimaryBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
  },

  successSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    backgroundColor: RECORD_COLORS.surface,
  },

  successSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: RECORD_COLORS.olive,
  },

  registerPanel: {
    marginBottom: 0,
  },

  heroBlock: {
    gap: 10,
  },

  imageFrame: {
    width: '100%',

    height: 168,

    borderRadius: 18,

    backgroundColor: SEARCH_COLORS.cardAlt,

    borderWidth: 1,

    borderColor: SEARCH_COLORS.border,

    overflow: 'hidden',

    alignItems: 'center',

    justifyContent: 'center',
  },

  heroImage: {
    width: '100%',

    height: '100%',
  },

  imagePlaceholder: {
    alignItems: 'center',

    justifyContent: 'center',

    gap: 6,
  },

  imagePlaceholderText: {
    fontSize: 12,

    fontWeight: '600',

    color: RECORD_COLORS.muted,
  },

  heroTextBlock: {
    gap: 4,
  },

  heroName: {
    fontSize: 16,

    lineHeight: 22,

    fontWeight: '700',

    color: RECORD_COLORS.text,
  },

  heroMeta: {
    fontSize: 12,

    lineHeight: 17,

    fontWeight: '500',

    color: RECORD_COLORS.muted,
  },
  inputField: {
    height: 52,
    borderWidth: 1,
    borderColor: '#D9D6CC',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#1F2520',
    backgroundColor: '#FFFFFF',
  },
});

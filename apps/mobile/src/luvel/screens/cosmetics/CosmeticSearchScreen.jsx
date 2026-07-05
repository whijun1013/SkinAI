import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cosmeticsAPI } from '../../../api/cosmetics';
import {
  SearchFilterPanel,
  SearchResultsSection,
  SEARCH_DEBOUNCE_MS,
} from '../../components/search/SearchScreenParts';
import CosmeticAnalysisSheet from './components/CosmeticAnalysisSheet';
import CosmeticRegisterModal from './components/CosmeticRegisterModal';
import CosmeticSearchResultCard from './components/CosmeticSearchResultCard';
import { COSMETIC_SEARCH_CATEGORIES } from './cosmeticDisplay';
import {
  RECORD_COLORS,
  SubScreenRoot,
  SubScreenTopBar,
  styles as layoutStyles,
} from '../record/components/SubScreenLayout';

export default function CosmeticSearchScreen({ onBack, onAdded, isModal = false, selectedDate }) {
  const insets = useSafeAreaInsets();
  const paddingTop = isModal ? insets.top : 0;
  const scrollPaddingBottom = (isModal ? insets.bottom : 0) + 20;

  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const debounceRef = useRef(null);
  const scrollRef = useRef(null);

  const [registerProduct, setRegisterProduct] = useState(null);
  const [isPendingRegister, setIsPendingRegister] = useState(false);
  const pendingRegisterRef = useRef(null);
  const [previewId, setPreviewId] = useState(null);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const doSearch = useCallback(
    async (text, category = selectedCategory) => {
      const trimmed = text.trim();
      const apiCategory = category && category !== '전체' ? category : null;

      if (!trimmed && !apiCategory) {
        setResults([]);
        setSearched(false);
        setSearchError('');
        return;
      }

      setLoading(true);
      setSearched(true);
      setSearchError('');
      try {
        const data = await cosmeticsAPI.searchCosmetics(trimmed || null, 30, apiCategory);
        setResults(data);
      } catch (err) {
        console.warn('화장품 검색 실패:', err.message);
        setResults([]);
        setSearchError('검색에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        setLoading(false);
      }
    },
    [selectedCategory]
  );

  const handleChange = (text) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text, selectedCategory), SEARCH_DEBOUNCE_MS);
  };

  const handleClearSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery('');
    setResults([]);
    setSearched(false);
    setSearchError('');
  };

  const handleCategoryPress = (category) => {
    setSelectedCategory(category);
    doSearch(query, category);
  };

  const showEmptyResults = searched && results.length === 0 && !loading && !searchError;

  const panelHintText = useMemo(() => {
    if (searched || loading) return null;
    if (selectedCategory !== '전체') {
      return `${selectedCategory} 카테고리가 선택됐어요. 칩을 다시 탭하거나 검색어를 입력해 보세요.`;
    }
    return '검색어를 입력하거나 카테고리를 선택해 보세요.';
  }, [searched, loading, selectedCategory]);

  const isOverlayOpen =
    previewId !== null || registerProduct !== null || isPendingRegister;

  const handleAnalysisSheetClosed = useCallback(() => {
    const item = pendingRegisterRef.current;
    if (!item) return;
    pendingRegisterRef.current = null;
    setIsPendingRegister(false);
    setRegisterProduct(item);
  }, []);

  const handleRegistered = useCallback(
    (options = {}) => {
      if (options.keepSearchOpen) {
        onAdded?.({ keepSearchOpen: true });
        return;
      }
      if (options.goToList && onAdded) {
        onAdded();
        return;
      }
      setRegisterProduct(null);
    },
    [onAdded]
  );

  const handleContinueSearch = useCallback(() => {
    setRegisterProduct(null);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, []);

  return (
    <View style={[styles.screenRoot, { paddingTop }]}>
      <SubScreenRoot onBack={onBack} enabled={!isOverlayOpen}>
        <SubScreenTopBar
          title="제품 검색"
          onBack={onBack}
          trailing={loading ? <ActivityIndicator size="small" color={RECORD_COLORS.olive} /> : null}
        />

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            layoutStyles.scrollContent,
            { paddingBottom: scrollPaddingBottom },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <SearchFilterPanel
            query={query}
            onChangeText={handleChange}
            onClear={handleClearSearch}
            placeholder="브랜드·제품명 검색"
            onSubmit={() => doSearch(query, selectedCategory)}
            categories={COSMETIC_SEARCH_CATEGORIES}
            selectedCategory={selectedCategory}
            onCategorySelect={handleCategoryPress}
            hintText={panelHintText}
            errorText={searchError || null}
          />

          {searchError ? (
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => doSearch(query, selectedCategory)}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={16} color={RECORD_COLORS.olive} />
              <Text style={styles.retryBtnText}>다시 검색</Text>
            </TouchableOpacity>
          ) : null}

          {searched && !searchError ? (
            <SearchResultsSection
              loading={loading}
              count={results.length}
              isEmpty={showEmptyResults}
            >
              {results.map((item) => (
                <CosmeticSearchResultCard
                  key={item.id}
                  item={item}
                  onRegister={(product) => {
                    Keyboard.dismiss();
                    setRegisterProduct(product);
                  }}
                  onPreview={() => {
                    Keyboard.dismiss();
                    setPreviewId(item.id);
                  }}
                />
              ))}
            </SearchResultsSection>
          ) : null}

          {showEmptyResults ? (
            <TouchableOpacity
              style={styles.requestRegisterBtn}
              onPress={() => {
                Keyboard.dismiss();
                // We'll open a modal or navigate to a screen for requesting registration
                setRegisterProduct({ isNewRegistrationRequest: true, query });
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={20} color={RECORD_COLORS.olive} />
              <Text style={styles.requestRegisterBtnText}>원하는 제품이 없나요? 직접 등록 요청하기</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </SubScreenRoot>

      <CosmeticAnalysisSheet
        visible={previewId !== null}
        cosmeticId={previewId}
        variant="search"
        onClose={() => setPreviewId(null)}
        onClosed={handleAnalysisSheetClosed}
        onAddProduct={(product) => {
          const item = results.find((row) => row.id === product.id) || product;
          pendingRegisterRef.current = item;
          setIsPendingRegister(true);
          setPreviewId(null);
        }}
      />

      <CosmeticRegisterModal
        visible={registerProduct !== null}
        product={registerProduct}
        presentation="overlay"
        onClose={() => setRegisterProduct(null)}
        onContinueSearch={handleContinueSearch}
        onRegistered={handleRegistered}
        defaultStartDate={
          selectedDate
            ? typeof selectedDate === 'string'
              ? selectedDate
              : selectedDate.toISOString().slice(0, 10)
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: RECORD_COLORS.bg },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: RECORD_COLORS.oliveSoft,
    borderWidth: 1,
    borderColor: RECORD_COLORS.olive,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: RECORD_COLORS.olive },
  requestRegisterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: RECORD_COLORS.olive,
  },
  requestRegisterBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: RECORD_COLORS.olive,
  },
});

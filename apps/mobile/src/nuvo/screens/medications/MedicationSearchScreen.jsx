import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { medicationsAPI } from '../../../api/medications';
import {
  SearchInputField,
  SearchResultsSection,
  SEARCH_DEBOUNCE_MS,
  searchStyles,
} from '../../components/search/SearchScreenParts';
import MedicationDetailModal from './components/MedicationDetailModal';
import MedicationRegisterSheet from './components/MedicationRegisterSheet';
import MedicationSearchResultCard from './components/MedicationSearchResultCard';
import {
  RECORD_COLORS,
  SubScreenRoot,
  SubScreenTopBar,
  styles as layoutStyles,
} from '../record/components/SubScreenLayout';

export default function MedicationSearchScreen({ onBack, onAdded, isModal = false }) {
  const insets = useSafeAreaInsets();
  const paddingTop = isModal ? insets.top : 0;
  const scrollPaddingBottom = (isModal ? insets.bottom : 0) + 20;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const debounceRef = useRef(null);
  const scrollRef = useRef(null);

  const [registerMedication, setRegisterMedication] = useState(null);
  const [previewId, setPreviewId] = useState(null);

  const doSearch = useCallback(async (text) => {
    const trimmed = text.trim();
    if (trimmed.length < 1) {
      setResults([]);
      setSearched(false);
      setSearchError('');
      return;
    }

    setLoading(true);
    setSearched(true);
    setSearchError('');
    try {
      const data = await medicationsAPI.searchMedications(trimmed, 30);
      setResults(data);
    } catch (err) {
      console.warn('약물 검색 실패:', err.message);
      setResults([]);
      setSearchError('검색에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (text) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text), SEARCH_DEBOUNCE_MS);
  };

  const handleClearSearch = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
    setSearchError('');
  };

  const panelHintText = useMemo(() => {
    if (searched || loading) return null;
    return '약물명으로 검색해 보세요.';
  }, [searched, loading]);

  const showEmptyResults = searched && results.length === 0 && !loading && !searchError;
  const isOverlayOpen = previewId !== null || registerMedication !== null;

  const handleRegistered = useCallback(
    (options) => {
      if (options?.refreshOnly) {
        onAdded?.({ keepSearchOpen: true });
        return;
      }

      setRegisterMedication(null);
      if (options?.goToList) {
        onAdded?.();
      } else {
        onAdded?.({ keepSearchOpen: true });
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        });
      }
    },
    [onAdded]
  );

  const handleContinueSearch = useCallback(() => {
    setRegisterMedication(null);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, []);

  return (
    <View style={[styles.screenRoot, { paddingTop }]}>
      <SubScreenRoot onBack={onBack} enabled={!isOverlayOpen}>
        <SubScreenTopBar
          title="약물 검색"
          onBack={onBack}
          accentColor="#8C4444"
          trailing={loading ? <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" /> : null}
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
          <View style={searchStyles.filterPanel}>
            <SearchInputField
              value={query}
              onChangeText={handleChange}
              onClear={handleClearSearch}
              placeholder="예: 이소트레티노인, 항히스타민"
              onSubmit={() => doSearch(query)}
              iconBg="#F5EAEA"
              iconColor="#8C4444"
            />
            {searchError ? <Text style={searchStyles.panelError}>{searchError}</Text> : null}
            {!searchError && panelHintText ? (
              <Text style={searchStyles.panelHint}>{panelHintText}</Text>
            ) : null}
          </View>

          {searched && !searchError ? (
            <SearchResultsSection
              loading={loading}
              count={results.length}
              isEmpty={showEmptyResults}
            >
              {results.map((item) => (
                <MedicationSearchResultCard
                  key={item.id}
                  item={item}
                  onRegister={(med) => {
                    Keyboard.dismiss();
                    setRegisterMedication(med);
                  }}
                  onPreview={(med) => {
                    Keyboard.dismiss();
                    setPreviewId(med.id);
                  }}
                />
              ))}
            </SearchResultsSection>
          ) : null}
        </ScrollView>
      </SubScreenRoot>

      <MedicationDetailModal
        visible={previewId !== null}
        medicationId={previewId}
        onClose={() => setPreviewId(null)}
      />

      <MedicationRegisterSheet
        visible={registerMedication !== null}
        medication={registerMedication}
        presentation="overlay"
        onClose={() => setRegisterMedication(null)}
        onContinueSearch={handleContinueSearch}
        onRegistered={handleRegistered}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: RECORD_COLORS.bg },
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet from '../../../components/BottomSheet';
import { sy } from '../../../../utils/responsive';
import { formatAnalysisStats, getSafetyGradeConfig } from '../cosmeticAnalysisDisplay';
import { useCosmeticAnalysis } from '../hooks/useCosmeticAnalysis';
import CosmeticIngredientRow from './CosmeticIngredientRow';
import { RECORD_COLORS } from '../../record/components/SubScreenLayout';

/** 기종별 화면 높이·safe area 기준 시트 레이아웃 */
function useAnalysisSheetLayout() {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const usableHeight = Math.max(windowHeight - insets.top, sy(480));
    const dragZoneHeight = Math.round(sy(72));
    const defaultSummary = Math.round(
      Math.min(Math.max(usableHeight * 0.52, sy(300)), usableHeight * 0.62)
    );
    const fullList = Math.round(Math.min(usableHeight * 0.76, usableHeight - sy(40)));
    const maxSummary = Math.min(fullList, Math.round(usableHeight * 0.68));
    const loadingPanelMin = Math.round(Math.max(defaultSummary * 0.38, sy(120)));

    return {
      dragZoneHeight,
      defaultSummary,
      fullList,
      maxSummary,
      loadingPanelMin,
    };
  }, [windowHeight, insets.top]);
}

/** X 버튼(우측)과 타이틀 헤더 — 닫기 버튼은 드래그 영역 밖 */
function SheetHeader({ title, subtitle, onClose }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const closePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => false,
        onPanResponderRelease: () => onCloseRef.current?.(),
        onPanResponderTerminate: () => onCloseRef.current?.(),
      }),
    []
  );

  return (
    <View style={styles.sheetHeader}>
      <View style={styles.headerPlaceholder} />
      <View style={styles.sheetHeaderCenter}>
        <Text style={styles.sheetHeaderTitle} numberOfLines={subtitle ? 1 : 2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.sheetHeaderSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.closeBtn} {...closePanResponder.panHandlers}>
        <Ionicons name="close" size={20} color={RECORD_COLORS.muted} />
      </View>
    </View>
  );
}

/**
 * @param {"search"|"register"|"list"} variant
 */
export default function CosmeticAnalysisSheet({
  visible,
  cosmeticId,
  onClose,
  onClosed,
  variant = 'list',
  onAddProduct,
  embedded = false,
}) {
  const sheetLayout = useAnalysisSheetLayout();
  const [view, setView] = useState('summary');
  const [summaryHeight, setSummaryHeight] = useState(sheetLayout.defaultSummary);
  const { analysis, detail, loading, error, retry, riskIngredients, ingredientCount, product } =
    useCosmeticAnalysis(cosmeticId, visible);

  useEffect(() => {
    if (!visible) {
      setView('summary');
      return;
    }
    setSummaryHeight(sheetLayout.defaultSummary);
  }, [visible, cosmeticId, sheetLayout.defaultSummary]);

  const handleClose = () => {
    // 전성분(확장) 상태에서 바로 닫으면 BottomSheet backdrop이 남을 수 있음 → 먼저 접기
    if (view === 'fullList') {
      setView('summary');
      requestAnimationFrame(() => onClose?.());
      return;
    }
    onClose?.();
  };

  const handleSummaryLayout = (event) => {
    if (loading) return;
    const contentHeight = Math.ceil(event.nativeEvent.layout.height);
    if (contentHeight <= 0) return;
    const measured = contentHeight + sheetLayout.dragZoneHeight;
    setSummaryHeight((prev) => {
      const next = Math.max(prev, measured);
      return Math.min(next, sheetLayout.maxSummary);
    });
  };

  const grade = analysis ? getSafetyGradeConfig(analysis.safety_grade, analysis) : null;
  const ingredients = detail?.ingredients_list || [];

  const primaryAction =
    variant === 'search'
      ? {
          label: '등록하기',
          icon: 'add-circle-outline',
          onPress: () => {
            const payload = product || (cosmeticId ? { id: cosmeticId } : null);
            if (payload) onAddProduct?.(payload);
            else handleClose();
          },
        }
      : variant === 'register'
        ? { label: '등록 계속하기', icon: 'checkmark-circle-outline', onPress: handleClose }
        : null;

  const renderSummary = () => {
    if (loading) {
      return (
        <View style={styles.summaryRoot}>
          <View
            style={[
              styles.centerBox,
              styles.loadingPanel,
              { minHeight: sheetLayout.loadingPanelMin },
            ]}
          >
            <ActivityIndicator size="small" color={RECORD_COLORS.olive} />
            <Text style={styles.loadingText}>성분을 분석하는 중...</Text>
          </View>
          {primaryAction ? (
            <View style={styles.footer}>
              <View style={[styles.primaryBtn, styles.primaryBtnGhost]} pointerEvents="none">
                <Ionicons name={primaryAction.icon} size={18} color="rgba(255,255,255,0.5)" />
                <Text style={[styles.primaryBtnText, styles.primaryBtnTextGhost]}>
                  {primaryAction.label}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={28} color={RECORD_COLORS.hint} />
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.errorBtns}>
            <TouchableOpacity style={styles.retryBtn} onPress={retry}>
              <Ionicons name="refresh-outline" size={15} color={RECORD_COLORS.olive} />
              <Text style={styles.retryBtnText}>다시 시도</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleClose}>
              <Text style={styles.secondaryBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (!analysis || !grade) return null;

    return (
      <View style={styles.summaryRoot}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={[styles.gradeCard, { backgroundColor: grade.bg }]}>
            <Ionicons name={grade.icon} size={22} color={grade.color} />
            <View style={styles.gradeTextWrap}>
              <Text style={[styles.gradeLabel, { color: grade.color }]}>{grade.label}</Text>
              <Text style={styles.gradeSummary}>{grade.summary}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <Text style={styles.statsText}>{formatAnalysisStats(analysis)}</Text>
          </View>

          <Text style={styles.sectionTitle}>
            {riskIngredients.length > 0
              ? `주의 성분 ${riskIngredients.length}개`
              : '주의 성분 없음'}
          </Text>

          {riskIngredients.length > 0 ? (
            <View style={styles.riskList}>
              {riskIngredients.slice(0, 8).map((ing) => (
                <CosmeticIngredientRow key={ing.id} ingredient={ing} compact />
              ))}
              {riskIngredients.length > 8 ? (
                <Text style={styles.moreHint}>
                  외 {riskIngredients.length - 8}개 — 전성분에서 확인할 수 있어요
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.emptyRisk}>자극·코메도·금지 성분이 눈에 띄지 않아요.</Text>
          )}

          {ingredientCount > 0 ? (
            <TouchableOpacity
              style={styles.fullListLink}
              onPress={() => setView('fullList')}
              activeOpacity={0.78}
            >
              <Text style={styles.fullListLinkText}>전성분 {ingredientCount}개 보기</Text>
              <Ionicons name="chevron-up" size={16} color={RECORD_COLORS.olive} />
            </TouchableOpacity>
          ) : null}
        </ScrollView>

        {primaryAction ? (
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={primaryAction.onPress}
              activeOpacity={0.82}
            >
              <Ionicons name={primaryAction.icon} size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>{primaryAction.label}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  const renderFullList = () => (
    <View style={styles.fullListRoot}>
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={RECORD_COLORS.olive} />
          <Text style={styles.loadingText}>성분 목록을 불러오는 중...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.fullScroll}
          contentContainerStyle={styles.fullScrollContent}
          showsVerticalScrollIndicator
        >
          {grade && analysis ? (
            <View style={styles.fullSummaryBlock}>
              <Text style={styles.fullSummary}>
                {grade.label} · {formatAnalysisStats(analysis)}
              </Text>
            </View>
          ) : null}

          {ingredients.length > 0 ? (
            <View>
              <Text style={styles.fullCountLabel}>총 {ingredientCount}개 성분</Text>
              {ingredients.map((ing) => (
                <CosmeticIngredientRow key={ing.id} ingredient={ing} />
              ))}
            </View>
          ) : (
            <Text style={styles.emptyRisk}>등록된 전성분 데이터가 없어요.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );

  const sheetTitle =
    view === 'fullList' ? '전성분 목록' : product?.product_name || '성분 분석';
  const sheetSubtitle =
    view === 'fullList' ? product?.product_name || null : product?.brand || null;

  return (
    <BottomSheet
      visible={visible}
      onDismiss={handleClose}
      onClosed={onClosed}
      embedded={embedded}
      expanded={view === 'fullList'}
      collapsedHeight={summaryHeight}
      expandedHeight={sheetLayout.fullList}
      backgroundColor={RECORD_COLORS.surface}
      dimFullScreen={view === 'fullList'}
      draggable
      onExpand={() => setView('fullList')}
      onCollapse={() => setView('summary')}
      header={
        <SheetHeader title={sheetTitle} subtitle={sheetSubtitle} onClose={handleClose} />
      }
    >
      <View
        style={[styles.sheetInner, view === 'fullList' && styles.sheetInnerFill]}
        onLayout={view === 'summary' ? handleSummaryLayout : undefined}
      >
        {view === 'fullList' ? renderFullList() : renderSummary()}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetInner: {
    backgroundColor: RECORD_COLORS.surface,
    paddingBottom: 24,
  },
  sheetInnerFill: {
    flex: 1,
    paddingBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: RECORD_COLORS.line,
  },
  headerPlaceholder: { width: 32 },
  sheetHeaderCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
  },
  sheetHeaderTitle: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
    color: RECORD_COLORS.text,
  },
  sheetHeaderSubtitle: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRoot: { flexGrow: 0 },
  fullListRoot: { flex: 1 },
  fullScroll: { flex: 1 },
  fullScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
  },
  fullSummaryBlock: {
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: RECORD_COLORS.chip,
  },
  fullSummary: {
    fontSize: 12,
    fontWeight: '700',
    color: RECORD_COLORS.olive,
    textAlign: 'center',
  },
  fullCountLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
    marginBottom: 8,
  },
  scroll: { flexGrow: 0 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  centerBox: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  loadingPanel: {
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '700',
    color: RECORD_COLORS.hint,
    textAlign: 'center',
    lineHeight: 20,
  },
  gradeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    padding: 14,
    marginTop: 0,
  },
  gradeTextWrap: { flex: 1, gap: 4 },
  gradeLabel: { fontSize: 16, fontWeight: '900' },
  gradeSummary: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  statsRow: { marginTop: 12 },
  statsText: {
    fontSize: 13,
    fontWeight: '700',
    color: RECORD_COLORS.olive,
  },
  sectionTitle: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: '800',
    color: RECORD_COLORS.text,
  },
  riskList: { marginTop: 8 },
  emptyRisk: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },
  moreHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
  },
  fullListLink: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: RECORD_COLORS.oliveSoft,
  },
  fullListLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: RECORD_COLORS.olive,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: RECORD_COLORS.olive,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  primaryBtnGhost: {
    opacity: 0.45,
  },
  primaryBtnTextGhost: {
    color: 'rgba(255,255,255,0.85)',
  },
  errorBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  retryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: RECORD_COLORS.olive,
    backgroundColor: RECORD_COLORS.oliveSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: RECORD_COLORS.olive,
  },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: RECORD_COLORS.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: RECORD_COLORS.text,
  },
});

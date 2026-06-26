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

const COSMETICS_ACCENT = '#6B5F88';
const COSMETICS_SOFT   = '#EAE4F2';
const COSMETICS_MID    = '#B8ACCC';

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

    return { dragZoneHeight, defaultSummary, fullList, maxSummary, loadingPanelMin };
  }, [windowHeight, insets.top]);
}

/** 닫기 버튼 + 타이틀 헤더 */
function SheetHeader({ title, subtitle, onClose }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

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

/** 통계 칩 — 자극/코메도/금지 각각 */
function StatChip({ label, count, tone }) {
  const bg   = tone === 'red'    ? 'rgba(196,92,74,0.10)'  : 'rgba(196,154,43,0.10)';
  const color = tone === 'red'   ? '#C45C4A'               : '#C49A2B';
  return (
    <View style={[styles.statChip, { backgroundColor: bg }]}>
      <Text style={[styles.statChipText, { color }]}>{label} {count}</Text>
    </View>
  );
}

/** @param {"search"|"register"|"list"} variant */
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
    if (!visible) { setView('summary'); return; }
    setSummaryHeight(sheetLayout.defaultSummary);
  }, [visible, cosmeticId, sheetLayout.defaultSummary]);

  const handleClose = () => {
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

  const hasIssues = analysis
    ? (analysis.irritant_count > 0 || analysis.comedogenic_count > 0 || analysis.banned_count > 0)
    : false;

  const renderSummary = () => {
    if (loading) {
      return (
        <View style={styles.summaryRoot}>
          <View style={[styles.centerBox, styles.loadingPanel, { minHeight: sheetLayout.loadingPanelMin }]}>
            <ActivityIndicator size="small" color={COSMETICS_ACCENT} />
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
              <Ionicons name="refresh-outline" size={15} color={COSMETICS_ACCENT} />
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
          {/* ── 등급 카드 ── */}
          <View style={[styles.gradeCard, { backgroundColor: grade.bg }]}>
            <View style={[styles.gradeIconCircle, { backgroundColor: grade.color + '1A' }]}>
              <Ionicons name={grade.icon} size={28} color={grade.color} />
            </View>
            <View style={styles.gradeTextWrap}>
              <Text style={[styles.gradeLabel, { color: grade.color }]}>{grade.label}</Text>
              <Text style={styles.gradeSummary}>{grade.summary}</Text>
            </View>
          </View>

          {/* ── 통계 칩 행 ── */}
          {hasIssues ? (
            <View style={styles.statRow}>
              {analysis.irritant_count > 0 && (
                <StatChip label="자극" count={analysis.irritant_count} tone="red" />
              )}
              {analysis.comedogenic_count > 0 && (
                <StatChip label="코메도" count={analysis.comedogenic_count} tone="yellow" />
              )}
              {analysis.banned_count > 0 && (
                <StatChip label="금지" count={analysis.banned_count} tone="red" />
              )}
            </View>
          ) : null}

          {/* ── 주의 성분 섹션 ── */}
          <View style={styles.riskHeader}>
            <Text style={styles.sectionTitle}>
              {riskIngredients.length > 0 ? `주의 성분 ${riskIngredients.length}개` : '주의 성분'}
            </Text>
          </View>

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
            <View style={styles.emptyRiskBox}>
              <View style={styles.emptyRiskIcon}>
                <Ionicons name="checkmark" size={18} color="#3D8B37" />
              </View>
              <Text style={styles.emptyRiskText}>자극·코메도·금지 성분이 없어요</Text>
            </View>
          )}

          {/* ── 전성분 보기 링크 ── */}
          {ingredientCount > 0 ? (
            <TouchableOpacity
              style={styles.fullListLink}
              onPress={() => setView('fullList')}
              activeOpacity={0.78}
            >
              <Ionicons name="list-outline" size={15} color={COSMETICS_ACCENT} />
              <Text style={styles.fullListLinkText}>전성분 {ingredientCount}개 보기</Text>
              <Ionicons name="chevron-up" size={15} color={COSMETICS_ACCENT} />
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
          <ActivityIndicator size="small" color={COSMETICS_ACCENT} />
          <Text style={styles.loadingText}>성분 목록을 불러오는 중...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.fullScroll}
          contentContainerStyle={styles.fullScrollContent}
          showsVerticalScrollIndicator
        >
          {/* 요약 뱃지 */}
          {grade && analysis ? (
            <View style={[styles.fullSummaryBadge, { backgroundColor: grade.bg }]}>
              <Ionicons name={grade.icon} size={14} color={grade.color} />
              <Text style={[styles.fullSummaryText, { color: grade.color }]}>
                {grade.label}
              </Text>
              {hasIssues ? (
                <Text style={styles.fullSummaryStats}> · {formatAnalysisStats(analysis)}</Text>
              ) : null}
            </View>
          ) : null}

          {ingredients.length > 0 ? (
            <>
              <Text style={styles.fullCountLabel}>총 {ingredientCount}개 성분</Text>
              {ingredients.map((ing) => (
                <CosmeticIngredientRow key={ing.id} ingredient={ing} />
              ))}
            </>
          ) : (
            <Text style={styles.emptyRiskText}>등록된 전성분 데이터가 없어요.</Text>
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

  // ── 헤더 ─────────────────────────────────────────────────────────────────────
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

  // ── 스크롤 영역 ───────────────────────────────────────────────────────────────
  summaryRoot: { flexGrow: 0 },
  scroll: { flexGrow: 0 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },

  // ── 등급 카드 ─────────────────────────────────────────────────────────────────
  gradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    padding: 16,
  },
  gradeIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeTextWrap: { flex: 1, gap: 5 },
  gradeLabel: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  gradeSummary: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
  },

  // ── 통계 칩 ──────────────────────────────────────────────────────────────────
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  statChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  statChipText: { fontSize: 12, fontWeight: '800' },

  // ── 주의 성분 섹션 ────────────────────────────────────────────────────────────
  riskHeader: { marginTop: 20, marginBottom: 8 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: RECORD_COLORS.text,
    letterSpacing: -0.2,
  },
  riskList: { gap: 0 },
  emptyRiskBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(61,139,55,0.08)',
  },
  emptyRiskIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(61,139,55,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRiskText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3D8B37',
  },
  moreHint: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
    color: RECORD_COLORS.muted,
    textAlign: 'center',
  },

  // ── 전성분 보기 버튼 ──────────────────────────────────────────────────────────
  fullListLink: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COSMETICS_SOFT,
  },
  fullListLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: COSMETICS_ACCENT,
  },

  // ── 액션 버튼 ─────────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  primaryBtn: {
    height: 50,
    borderRadius: 16,
    backgroundColor: COSMETICS_ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  primaryBtnGhost: { opacity: 0.45 },
  primaryBtnTextGhost: { color: 'rgba(255,255,255,0.85)' },

  // ── 에러 상태 ─────────────────────────────────────────────────────────────────
  centerBox: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  loadingPanel: { justifyContent: 'center' },
  loadingText: { fontSize: 13, fontWeight: '600', color: RECORD_COLORS.muted },
  errorText: {
    fontSize: 14,
    fontWeight: '700',
    color: RECORD_COLORS.hint,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  retryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COSMETICS_MID,
    backgroundColor: COSMETICS_SOFT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  retryBtnText: { fontSize: 14, fontWeight: '800', color: COSMETICS_ACCENT },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: RECORD_COLORS.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: RECORD_COLORS.text },

  // ── 전성분 목록 뷰 ────────────────────────────────────────────────────────────
  fullListRoot: { flex: 1 },
  fullScroll: { flex: 1 },
  fullScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
  },
  fullSummaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 14,
  },
  fullSummaryText: { fontSize: 13, fontWeight: '800' },
  fullSummaryStats: { fontSize: 12, fontWeight: '600', color: RECORD_COLORS.muted },
  fullCountLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: RECORD_COLORS.muted,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
});

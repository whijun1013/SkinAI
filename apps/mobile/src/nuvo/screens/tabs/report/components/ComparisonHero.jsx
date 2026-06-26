import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, FONT } from "../reportTheme";

const shadow =
  Platform.OS === "ios"
    ? { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }
    : { elevation: 2 };

// ─── 상태별 뱃지 ─────────────────────────────────────────────────────────────
const STATE_BADGE = {
  loading:      { label: "확인 중",   bg: COLORS.oliveSoft,   text: COLORS.olive },
  creating:     { label: "진행 중",   bg: "#FFF3D6",          text: "#A07020" },
  ready:        { label: "준비 완료", bg: COLORS.oliveSoft,   text: COLORS.olive },
  stale:        { label: "업데이트",  bg: COLORS.oliveSoft,   text: COLORS.olive },
  complete:     { label: "완료",      bg: COLORS.oliveSoft,   text: COLORS.olive },
  failed:       { label: "오류",      bg: "#FDEAE6",          text: "#A83030" },
  no_record:    { label: "기록 필요", bg: COLORS.oliveSoft,   text: COLORS.olive },
  insufficient: { label: "기록 중",   bg: COLORS.oliveSoft,   text: COLORS.olive },
  locked:       { label: "기록 중",   bg: COLORS.oliveSoft,   text: COLORS.olive },
};

// ─── 상태별 메시지 ────────────────────────────────────────────────────────────
function getStateContent(isPageLoading, isCreating, hasResults, relationshipSummary, reportCopy) {
  if (isPageLoading) {
    return { icon: "hourglass-outline", headline: "기록을 맞춰보고 있어요", sub: "피부와 생활 기록을 불러오는 중이에요", showSpinner: true };
  }
  if (isCreating) {
    return { icon: "sparkles-outline", headline: "피부 리포트를 만들고 있어요", sub: "최근 기록을 바탕으로 흐름을 정리하는 중이에요", showSpinner: true };
  }
  if (!hasResults) {
    return { icon: "analytics-outline", headline: reportCopy.title, sub: reportCopy.description };
  }
  const { cautionCount, safeCount } = relationshipSummary;
  if (cautionCount > 0) {
    return { icon: "analytics-outline", headline: `최근 분석에서 ${cautionCount}가지 패턴이 발견됐어요`, sub: "피부와 생활 기록을 함께 살펴봤어요" };
  }
  if (safeCount > 0) {
    return { icon: "checkmark-circle-outline", headline: "이번 기간 피부가 안정적이었어요", sub: "기록된 생활 습관이 피부에 잘 맞고 있어요" };
  }
  return { icon: "eye-outline", headline: "조금 더 지켜볼게요", sub: "기록이 쌓일수록 더 정확한 분석이 가능해요" };
}

// ─── 패턴 행 ──────────────────────────────────────────────────────────────────
function PatternRow({ item, isLast }) {
  const isCaution = item.tone === "caution";
  const isSafe    = item.tone === "safe";
  const dotColor  = isCaution ? "#C0392B" : isSafe ? COLORS.olive : COLORS.muted;
  const badgeText = item.badge ?? "";

  return (
    <View>
      <View style={styles.patternRow}>
        <View style={[styles.patternDot, { backgroundColor: dotColor }]} />
        <View style={styles.patternBody}>
          <View style={styles.patternTitleRow}>
            <Text style={styles.patternTitle} numberOfLines={1}>{item.title}</Text>
            <View style={[styles.patternBadge, isCaution && styles.patternBadgeCaution, isSafe && styles.patternBadgeSafe]}>
              <Text style={[styles.patternBadgeText, isCaution && styles.patternBadgeTextCaution, isSafe && styles.patternBadgeTextSafe]}>
                {badgeText}
              </Text>
            </View>
          </View>
          <Text style={styles.patternDesc} numberOfLines={2}>{item.description}</Text>
        </View>
      </View>
      {!isLast && <View style={styles.patternDivider} />}
    </View>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function ComparisonHero({
  isPageLoading,
  reportState,
  isCreatingAnalysis,
  relationshipSummary,
  reportCopy,
  showInsightActionPanel,
  primaryCtaLabel,
  completedAnalysisId,
  analysisRequestMessage,
  analysisRequestError,
  onPrimaryAction,
  onOpenDetail,
}) {
  const hasResults = relationshipSummary.cards.length > 0;
  const isCreating = reportState === "creating";
  const content    = getStateContent(isPageLoading, isCreating, hasResults, relationshipSummary, reportCopy);
  const badge      = STATE_BADGE[reportState] ?? STATE_BADGE.loading;

  return (
    <View style={styles.container}>

      {/* ── 메인 상태 카드 ── */}
      <View style={styles.card}>
        {/* 카드 헤더 */}
        <View style={styles.cardHead}>
          <View style={styles.cardHeadIcon}>
            {content.showSpinner
              ? <ActivityIndicator size="small" color={COLORS.olive} />
              : <Ionicons name={content.icon} size={16} color={COLORS.olive} />
            }
          </View>
          <Text style={styles.cardHeadLabel}>AI 리포트</Text>
          <View style={[styles.stateBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.stateBadgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>

        {/* 카드 바디 */}
        <View style={styles.cardBody}>
          <Text style={styles.headline}>{content.headline}</Text>
          <Text style={styles.sub}>{content.sub}</Text>

          {/* 패턴 목록 */}
          {!isPageLoading && !isCreating && hasResults && (
            <View style={styles.patternList}>
              {relationshipSummary.cards.map((item, idx) => (
                <PatternRow
                  key={item.key}
                  item={item}
                  isLast={idx === relationshipSummary.cards.length - 1}
                />
              ))}
            </View>
          )}

          {/* 메시지 */}
          {analysisRequestMessage ? (
            <Text style={styles.successMsg}>{analysisRequestMessage}</Text>
          ) : analysisRequestError ? (
            <Text style={styles.errorMsg}>{analysisRequestError}</Text>
          ) : null}

          {/* CTA */}
          {showInsightActionPanel && !isPageLoading && !!primaryCtaLabel && (
            <View style={styles.ctaWrap}>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (reportState === "creating" || isCreatingAnalysis) && styles.primaryBtnDisabled,
                  pressed && styles.pressed,
                ]}
                onPress={onPrimaryAction}
                disabled={isCreatingAnalysis || reportState === "creating"}
              >
                {isCreatingAnalysis ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>{primaryCtaLabel}</Text>
                    <Ionicons name="chevron-forward" size={15} color="#fff" />
                  </>
                )}
              </Pressable>

              {reportCopy.secondaryCta && completedAnalysisId ? (
                <Pressable
                  style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                  onPress={() => onOpenDetail(completedAnalysisId)}
                >
                  <Text style={styles.secondaryBtnText}>{reportCopy.secondaryCta}</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },

  // ── 카드 (기록 페이지 SectionCard와 동일한 언어) ──
  card: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface,
    overflow: "hidden",
    ...shadow,
  },

  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: COLORS.surface,
  },
  cardHeadIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeadLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONT.extraBold,
    color: COLORS.olive,
    letterSpacing: -0.2,
  },
  stateBadge: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  stateBadgeText: {
    fontSize: 11,
    fontFamily: FONT.bold,
  },

  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
    gap: 6,
  },

  headline: {
    fontSize: 14.5,
    fontFamily: FONT.extraBold,
    color: COLORS.text,
    lineHeight: 21,
    letterSpacing: -0.2,
    marginTop: 8,
  },
  sub: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.muted,
    lineHeight: 18,
    marginBottom: 4,
  },

  // ── 패턴 목록 ──
  patternList: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: COLORS.bg,
    overflow: "hidden",
  },
  patternRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  patternDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  patternBody: { flex: 1, minWidth: 0 },
  patternTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 3,
  },
  patternTitle: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: FONT.extraBold,
    color: COLORS.text,
    letterSpacing: -0.1,
  },
  patternBadge: {
    borderRadius: 8,
    backgroundColor: "#EDEEE9",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  patternBadgeCaution: { backgroundColor: "#FDEAE6" },
  patternBadgeSafe:    { backgroundColor: COLORS.oliveSoft },
  patternBadgeText:        { fontSize: 9.5, fontFamily: FONT.bold, color: COLORS.muted },
  patternBadgeTextCaution: { color: "#C0392B" },
  patternBadgeTextSafe:    { color: COLORS.olive },
  patternDesc: {
    fontSize: 11.5,
    fontFamily: FONT.medium,
    color: COLORS.muted,
    lineHeight: 17,
  },
  patternDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.line,
    marginLeft: 29,
  },

  // ── CTA ──
  ctaWrap: { marginTop: 10, gap: 8 },
  primaryBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.olive,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnText: {
    fontSize: 14.5,
    fontFamily: FONT.extraBold,
    color: "#fff",
    letterSpacing: -0.2,
  },
  secondaryBtn: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.olive,
  },

  // ── 메시지 ──
  successMsg: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: FONT.bold,
    color: COLORS.olive,
    textAlign: "center",
    lineHeight: 18,
  },
  errorMsg: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: FONT.bold,
    color: COLORS.warning,
    textAlign: "center",
    lineHeight: 18,
  },
  pressed: { opacity: 0.72 },
});

import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { countUniqueLogDays, getSafeText } from "./reportUtils";
import { COLORS, FONT, shadowCard } from "./reportTheme";

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Card({ children }) {
  return <View style={styles.card}>{children}</View>;
}

function CardRow({ children, isLast }) {
  return (
    <>
      <View style={styles.row}>{children}</View>
      {!isLast && <View style={styles.rowDivider} />}
    </>
  );
}

function CardHead({ icon, label, badge, badgeBg, badgeText }) {
  return (
    <View style={styles.cardHead}>
      <View style={styles.cardHeadIcon}>
        <Ionicons name={icon} size={16} color={COLORS.olive} />
      </View>
      <Text style={styles.cardHeadLabel}>{label}</Text>
      {badge ? (
        <View style={[styles.cardHeadBadge, badgeBg && { backgroundColor: badgeBg }]}>
          <Text style={[styles.cardHeadBadgeText, badgeText && { color: badgeText }]}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function VerdictRow({ item, isLast }) {
  const { label: verdictLabel, color: verdictColor } = getVerdictMeta(item.verdict);
  const detail = buildVerdictDetail(item);
  const factorLabel = getDisplayFactorText(item.label) || getDisplayFactorText(item.factor_key);
  const isPositive = item.verdict === "confirmed" || item.verdict === "partial";
  return (
    <CardRow isLast={isLast}>
      <View style={[styles.dot, { backgroundColor: isPositive ? COLORS.olive : COLORS.line }]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{factorLabel}</Text>
        {detail ? <Text style={styles.rowDesc}>{detail}</Text> : null}
      </View>
      <View style={[styles.badge, { backgroundColor: verdictColor.bg }]}>
        <Text style={[styles.badgeText, { color: verdictColor.text }]}>{verdictLabel}</Text>
      </View>
    </CardRow>
  );
}

function PatternRow({ item, isLast }) {
  const { label: evidenceLabel, color: evidenceColor } = getEvidenceMeta(item.evidence_level);
  const signalLabel = getSafeText(item.affected_signal_label) || getSafeText(item.affected_signal) || "";
  const description = [getSafeText(item.pattern), signalLabel ? `영향 신호: ${signalLabel}` : ""]
    .filter(Boolean).join("  ·  ");
  const isStrong = item.evidence_level === "strong" || item.evidence_level === "moderate";
  return (
    <CardRow isLast={isLast}>
      <View style={[styles.dot, { backgroundColor: isStrong ? COLORS.olive : COLORS.line }]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>
          {getDisplayFactorText(item.label) || getDisplayFactorText(item.factor_key)}
        </Text>
        {description ? <Text style={styles.rowDesc}>{description}</Text> : null}
      </View>
      <View style={[styles.badge, { backgroundColor: evidenceColor.bg }]}>
        <Text style={[styles.badgeText, { color: evidenceColor.text }]}>{evidenceLabel}</Text>
      </View>
    </CardRow>
  );
}

function FactorRow({ item, isLast }) {
  return (
    <CardRow isLast={isLast}>
      <View style={[styles.dot, { backgroundColor: COLORS.line }]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        {item.description ? <Text style={styles.rowDesc}>{item.description}</Text> : null}
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{item.badge}</Text>
      </View>
    </CardRow>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function ReportDetailView({
  detailLoading,
  detailError,
  detailRequestId,
  selectedAnalysis,
  allSkinLogs,
  onRetry,
}) {
  if (detailLoading) {
    return (
      <View style={styles.detailState}>
        <ActivityIndicator size="small" color={COLORS.olive} />
        <Text style={styles.detailStateText}>피부 리포트를 불러오고 있어요.</Text>
      </View>
    );
  }

  if (detailError) {
    return (
      <View style={styles.detailState}>
        <Ionicons name="cloud-offline-outline" size={28} color={COLORS.muted} />
        <Text style={styles.detailStateText}>피부 리포트를 불러오지 못했어요.</Text>
        {detailRequestId ? (
          <Pressable
            style={({ pressed }) => [styles.detailRetryButton, pressed && styles.pressedItem]}
            onPress={onRetry}
          >
            <Text style={styles.detailRetryText}>다시 시도</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const detail = buildAnalysisDetailViewModel(selectedAnalysis, allSkinLogs);

  return (
    <>
      {/* 요약 */}
      <View style={styles.section}>
        <SectionLabel>요약</SectionLabel>
        <Card>
          <CardHead icon="document-text-outline" label="분석 요약" />
          <View style={styles.cardBody}>
            <Text style={styles.bodyText}>{detail.summary}</Text>
          </View>
        </Card>
      </View>

      {/* 패턴 없음 안내 */}
      {detail.isSparseContent ? (
        <View style={styles.section}>
          <Card>
            <View style={styles.sparsePanel}>
              <View style={styles.cardHeadIcon}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.olive} />
              </View>
              <View style={styles.sparseText}>
                <Text style={styles.sparseTitleText}>아직 뚜렷한 패턴이 없어요</Text>
                <Text style={styles.sparseBodyText}>
                  기록을 조금 더 이어가면 함께 보이는 흐름을 정리할 수 있어요.
                </Text>
              </View>
            </View>
          </Card>
        </View>
      ) : null}

      {/* 내가 적은 의심 요인 */}
      {detail.concernVerdicts.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel>내가 적은 의심 요인</SectionLabel>
          <Card>
            <CardHead icon="create-outline" label="관심 요인 분석" />
            <View style={styles.cardBody}>
              {detail.concernVerdicts.map((item, index) => (
                <VerdictRow
                  key={`verdict-${item.factor_key}-${index}`}
                  item={item}
                  isLast={index === detail.concernVerdicts.length - 1}
                />
              ))}
            </View>
          </Card>
        </View>
      ) : null}

      {/* 발견된 패턴 */}
      {detail.discoveredPatterns.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel>발견된 패턴</SectionLabel>
          <Card>
            <CardHead icon="analytics-outline" label="패턴 분석" />
            <View style={styles.cardBody}>
              {detail.discoveredPatterns.map((item, index) => (
                <PatternRow
                  key={`pattern-${item.factor_key}-${index}`}
                  item={item}
                  isLast={index === detail.discoveredPatterns.length - 1}
                />
              ))}
            </View>
          </Card>
        </View>
      ) : null}

      {/* 함께 보인 항목 (파이프라인 없을 때) */}
      {!detail.hasPipeline && !detail.isSparseContent ? (
        <View style={styles.section}>
          <SectionLabel>함께 보인 항목</SectionLabel>
          <Card>
            <CardHead icon="layers-outline" label="연관 항목" />
            <View style={styles.cardBody}>
              {detail.candidateFactors.map((item, index) => (
                <FactorRow
                  key={`${item.title}-${index}`}
                  item={item}
                  isLast={index === detail.candidateFactors.length - 1}
                />
              ))}
            </View>
          </Card>
        </View>
      ) : null}

      {/* 다음 관찰 포인트 */}
      <View style={styles.section}>
        <SectionLabel>다음 관찰 포인트</SectionLabel>
        <Card>
          <CardHead icon="eye-outline" label="앞으로 살펴볼 것" />
          <View style={styles.cardBody}>
            <Text style={styles.nextTitle}>{detail.nextObsTitle}</Text>
            <Text style={styles.nextBody}>{detail.nextObsBody}</Text>
          </View>
        </Card>
      </View>

      {/* 안내 */}
      <View style={styles.section}>
        <Card>
          <View style={styles.noticePanel}>
            <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.muted} />
            <Text style={styles.noticeText}>{detail.notice}</Text>
          </View>
        </Card>
      </View>
    </>
  );
}

// ─── 뷰모델 빌더 ─────────────────────────────────────────────────────────────
const getAnalysisResultPayload = (analysis) => {
  const result = analysis?.result ?? analysis?.analysis_result ?? analysis ?? {};
  return result && typeof result === "object" ? result : {};
};

const buildAnalysisDetailViewModel = (analysis, allSkinLogs) => {
  const result = getAnalysisResultPayload(analysis);
  const reportText = getSafeText(result?.report_text);
  const concernVerdicts = Array.isArray(result?.concern_verdicts) ? result.concern_verdicts : [];
  const discoveredPatterns = Array.isArray(result?.discovered_patterns) ? result.discovered_patterns : [];
  const hasPipeline = concernVerdicts.length > 0 || discoveredPatterns.length > 0;
  const candidateFactors = hasPipeline ? [] : getCandidateFactorItems(result);

  const { title: nextObsTitle, body: nextObsBody } = buildNextObservation(result);
  return {
    summary: reportText || "최근 기록을 바탕으로 함께 보인 흐름을 정리했어요.",
    concernVerdicts,
    discoveredPatterns,
    hasPipeline,
    isSparseContent: !hasPipeline && concernVerdicts.length === 0 && discoveredPatterns.length === 0,
    candidateFactors:
      !hasPipeline && candidateFactors.length === 0
        ? [
            {
              title: "최근 피부 기록",
              description: `${countUniqueLogDays(allSkinLogs)}일의 피부 기록을 참고했어요.`,
              badge: "참고",
            },
          ]
        : candidateFactors,
    nextObsTitle,
    nextObsBody,
    notice:
      "이 내용은 사용자가 남긴 기록을 바탕으로 정리한 참고용 리포트예요. 불편한 변화가 있거나 걱정되는 증상이 있으면 전문가와 상담해 주세요.",
  };
};

const getSummaryPreview = (text) => {
  const safeText = getSafeText(text);
  if (!safeText) return "";
  return safeText.length > 130 ? `${safeText.slice(0, 127).trim()}...` : safeText;
};

export const buildAnalysisTeaser = (analysis, IN_PROGRESS_STATUSES) => {
  if (analysis?.status === "failed") {
    return { title: "리포트를 만들지 못했어요", description: "다시 시도해볼 수 있어요." };
  }
  if (IN_PROGRESS_STATUSES.has(analysis?.status)) {
    return {
      title: "만들고 있어요",
      description: "최근 기록을 바탕으로 흐름을 정리하고 있어요.",
    };
  }
  const result = getAnalysisResultPayload(analysis);
  const reportText = getSummaryPreview(getSafeText(result?.report_text));
  return {
    title: "피부 리포트",
    description: reportText || "최근 기록에서 함께 보인 흐름을 확인해보세요.",
  };
};

const getCandidateFactorItems = (result) => {
  const items = [];
  const primary = getDisplayFactorText(result?.primary_cause);
  if (primary) {
    items.push({
      title: primary,
      description: "최근 기록에서 함께 보인 항목으로 정리됐어요.",
      badge: "참고",
    });
  }
  getAgentResultItems(result).forEach((agent) => {
    const label = getDomainLabel(agent?.agent_type ?? agent?.type ?? agent?.name);
    const suspiciousItems = Array.isArray(agent?.suspicious_items) ? agent.suspicious_items : [];
    suspiciousItems.forEach((item) => {
      const title =
        getDisplayFactorText(item?.label) ||
        getDisplayFactorText(item?.factor_key) ||
        label;
      if (!title || items.some((existing) => existing.title === title)) return;
      items.push({
        title,
        description: `${label} 기록과 함께 확인할 수 있어요.`,
        badge: "흐름",
      });
    });
  });
  return items.slice(0, 4);
};

const getAgentResultItems = (result) => {
  if (Array.isArray(result?.agent_results)) return result.agent_results;
  if (Array.isArray(result?.agent_result)) return result.agent_result;
  return [];
};

const buildNextObservation = (result) => {
  const patterns = Array.isArray(result?.discovered_patterns) ? result.discovered_patterns : [];
  const verdicts = Array.isArray(result?.concern_verdicts) ? result.concern_verdicts : [];

  // 발견된 패턴이 있을 때: 가장 강한 패턴 기반 검증 메시지
  const topPattern = patterns[0];
  if (topPattern) {
    const label = getDisplayFactorText(topPattern.label) || getDisplayFactorText(topPattern.factor_key);
    return {
      title: `${label}, 다음 7일도 관찰해보세요`,
      body:
        topPattern.pattern
          ? `${topPattern.pattern} 이 흐름이 다음 기록에서도 반복된다면 더 확실한 근거가 돼요.`
          : `${label} 섭취·노출 후 1~3일 사이 피부 변화를 특히 기록해주세요. 패턴이 반복될수록 원인 확률이 높아져요.`,
    };
  }

  // concern_verdict 중 confirmed/partial 있을 때
  const confirmedVerdict = verdicts.find((v) => v.verdict === "confirmed" || v.verdict === "partial");
  if (confirmedVerdict) {
    const label =
      getDisplayFactorText(confirmedVerdict.label) || getDisplayFactorText(confirmedVerdict.factor_key);
    return {
      title: `${label} 흐름, 계속 추적해볼게요`,
      body: `이번 기록에서 ${label}과 피부 변화가 함께 보였어요. 다음 7일도 기록하면 패턴이 더 선명해져요.`,
    };
  }

  // 후보 요인이라도 있을 때
  const candidates = getCandidateFactorItems(result);
  const top = candidates[0];
  if (top) {
    return {
      title: `${top.title}, 이번엔 진짜일까요?`,
      body: `이번 기록에서 ${top.title}이 함께 보였어요. 7일 더 기록하면 우연인지 패턴인지 확인할 수 있어요.`,
    };
  }

  // 아무것도 없을 때
  return {
    title: "피부 기록과 생활 기록을 이어가 보세요",
    body: "기록이 쌓일수록 반복되는 흐름이 보여요. 다음 7일도 피부 상태와 생활 기록을 함께 남겨주세요.",
  };
};

const DOMAIN_LABELS = {
  behavior: "생활 기록",
  diet: "식단 기록",
  cosmetic: "화장품 사용",
  medication: "복용 기록",
  environment: "환경 기록",
  skin: "피부 기록",
};

const getDomainLabel = (value) => {
  const key = getSafeText(value).toLowerCase();
  const match = Object.keys(DOMAIN_LABELS).find((domain) => key.includes(domain));
  return match ? DOMAIN_LABELS[match] : "기록 항목";
};

export const getDisplayFactorText = (value) => {
  const text = getSafeText(value);
  if (!text) return "";
  if (/^[a-z0-9_ -]+$/i.test(text) && text.includes("_")) return "기록 항목";
  return text.replace(/_/g, " ");
};

const getVerdictMeta = (verdict) => {
  const map = {
    confirmed: { label: "영향 확인", color: { bg: "#E8EEDD", text: "#4F603C" } },
    partial:   { label: "부분적 영향", color: { bg: "#EEF0E8", text: "#5A6B46" } },
    weak:      { label: "약한 영향", color: { bg: "#F2F1EC", text: "#8B9184" } },
    low:       { label: "영향 없음", color: { bg: "#F2F1EC", text: "#8B9184" } },
    inconclusive: { label: "기록 부족", color: { bg: "#F2F1EC", text: "#8B9184" } },
  };
  return map[verdict] ?? { label: verdict ?? "확인 중", color: { bg: "#F2F1EC", text: "#8B9184" } };
};

const getEvidenceMeta = (level) => {
  const map = {
    strong:   { label: "강한 근거", color: { bg: "#E8EEDD", text: "#4F603C" } },
    moderate: { label: "보통 근거", color: { bg: "#EEF0E8", text: "#5A6B46" } },
    weak:     { label: "약한 근거", color: { bg: "#F2F1EC", text: "#8B9184" } },
  };
  return map[level] ?? { label: level ?? "근거 있음", color: { bg: "#F2F1EC", text: "#8B9184" } };
};

const getConcernSignalLabel = (signal) => {
  const labels = { active_lesion: "트러블", redness: "홍조", barrier: "피부 장벽" };
  return labels[signal] ?? getSafeText(signal);
};

const buildVerdictDetail = (item) => {
  const parts = [];
  const signalLabel = getConcernSignalLabel(item.signal);
  if (signalLabel) parts.push(`영향 신호: ${signalLabel}`);
  if (item.exposure_days != null) parts.push(`노출 ${item.exposure_days}일`);
  return parts.join(" · ");
};

// ─── 스타일 ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── 섹션 ──
  section: { marginTop: 20 },
  sectionLabel: {
    marginBottom: 8,
    paddingHorizontal: 2,
    fontSize: 11,
    fontFamily: FONT.extraBold,
    color: COLORS.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  // ── 카드 ──
  card: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface,
    overflow: "hidden",
    ...shadowCard,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 13,
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
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  cardHeadBadge: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
    backgroundColor: COLORS.oliveSoft,
  },
  cardHeadBadgeText: {
    fontSize: 11,
    fontFamily: FONT.bold,
    color: COLORS.olive,
  },
  cardBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
  },

  // ── 바디 텍스트 (요약/안내) ──
  bodyText: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 13.5,
    fontFamily: FONT.medium,
    color: COLORS.text,
    lineHeight: 22,
  },

  // ── 행 ──
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.line,
    marginLeft: 34,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 6,
    flexShrink: 0,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: {
    fontSize: 14,
    fontFamily: FONT.extraBold,
    color: COLORS.text,
    letterSpacing: -0.1,
    lineHeight: 20,
  },
  rowDesc: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.muted,
    lineHeight: 17,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#EDEEE9",
    alignSelf: "flex-start",
    marginTop: 2,
  },
  badgeText: {
    fontSize: 10.5,
    fontFamily: FONT.bold,
    color: COLORS.muted,
  },

  // ── 패턴 없음 ──
  sparsePanel: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
  },
  sparseText: { flex: 1, gap: 4 },
  sparseTitleText: {
    fontSize: 14.5,
    fontFamily: FONT.extraBold,
    color: COLORS.text,
    lineHeight: 20,
  },
  sparseBodyText: {
    fontSize: 12.5,
    fontFamily: FONT.medium,
    color: COLORS.muted,
    lineHeight: 18,
  },

  // ── 다음 관찰 ──
  nextTitle: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    fontSize: 14,
    fontFamily: FONT.extraBold,
    color: COLORS.olive,
    lineHeight: 20,
  },
  nextBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    fontSize: 12.5,
    fontFamily: FONT.medium,
    color: COLORS.text,
    lineHeight: 20,
  },

  // ── 안내 ──
  noticePanel: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 14,
  },
  noticeText: {
    flex: 1,
    fontSize: 11.5,
    fontFamily: FONT.medium,
    color: COLORS.muted,
    lineHeight: 18,
  },

  // ── 로딩/에러 상태 ──
  detailState: {
    marginTop: 24,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    padding: 24,
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    ...shadowCard,
  },
  detailStateText: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.muted,
    textAlign: "center",
  },
  detailRetryButton: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.oliveSoft,
  },
  detailRetryText: {
    fontSize: 13.5,
    fontFamily: FONT.bold,
    color: COLORS.olive,
  },
  pressedItem: { opacity: 0.72 },
});


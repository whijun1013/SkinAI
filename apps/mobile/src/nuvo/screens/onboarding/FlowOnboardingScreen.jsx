import React from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { sx, sy, s } from "../../../utils/responsive";

// ─── 색상 (1단계와 동일 다크 올리브 배경) ────────────────────────────────────────
const C = {
  bg:        "#222E1C",
  text:      "#F4F1EA",
  textSub:   "rgba(244,241,234,0.72)",
  accent:    "#B2CF8E",
  dot:       "rgba(255,255,255,0.22)",
  dotActive: "#F4F1EA",
  btnBg:     "#EEF1E8",
  btnText:   "#222E1C",
};

// ─── 피처 카드 데이터 ─────────────────────────────────────────────────────────
const CARDS = [
  {
    key: "skin",
    icon: "camera-outline",
    label: "피부 기록",
    desc: "매일 사진 한 장과 컨디션 점수를 남겨요",
    tags: ["사진", "점수", "태그"],
    cardBg: "rgba(178,207,142,0.13)",
    cardBorder: "rgba(178,207,142,0.28)",
    iconBg: "rgba(178,207,142,0.22)",
    iconColor: "#B2CF8E",
    tagBg: "rgba(178,207,142,0.18)",
    tagColor: "#B2CF8E",
  },
  {
    key: "life",
    icon: "leaf-outline",
    label: "식단 · 생활",
    desc: "수면, 식사, 스트레스, 날씨를 함께 기록해요",
    tags: ["수면", "식단", "날씨", "운동"],
    cardBg: "rgba(210,160,100,0.12)",
    cardBorder: "rgba(210,160,100,0.26)",
    iconBg: "rgba(210,160,100,0.20)",
    iconColor: "#D4A870",
    tagBg: "rgba(210,160,100,0.16)",
    tagColor: "#D4A870",
  },
  {
    key: "ai",
    icon: "sparkles",
    label: "AI 인사이트",
    desc: "쌓인 기록을 분석해 피부 변화 원인을 찾아요",
    tags: ["패턴 분석", "리포트"],
    cardBg: "rgba(120,160,200,0.11)",
    cardBorder: "rgba(120,160,200,0.24)",
    iconBg: "rgba(120,160,200,0.20)",
    iconColor: "#90B8D8",
    tagBg: "rgba(120,160,200,0.16)",
    tagColor: "#90B8D8",
  },
];

// ─── 메인 ─────────────────────────────────────────────────────────────────────
export default function FlowOnboardingScreen({ onNext }) {
  return (
    <View style={styles.root}>
      <BackgroundDecorations />

      <View style={styles.body}>

        {/* ── 상단 여백 ── */}
        <View style={styles.spacerTop} />

        {/* ── 헤드라인 ── */}
        <View style={styles.headlineWrap}>
          <Text style={styles.eyebrow}>DAILY LOG</Text>
          <Text style={styles.headline}>피부, 식단, 생활을</Text>
          <Text style={styles.headline}>
            <Text style={styles.headlineAccent}>한 곳</Text>에서 기록해요
          </Text>
          <Text style={styles.sub}>
            매일의 작은 기록이 쌓여{"\n"}변화의 이유를 알려줘요
          </Text>
        </View>

        {/* ── 피처 카드 3개 ── */}
        <View style={styles.cardList}>
          {CARDS.map((card) => (
            <FeatureCard key={card.key} card={card} />
          ))}
        </View>

        {/* ── 하단 여백 ── */}
        <View style={styles.spacerBottom} />

        {/* ── CTA 영역 ── */}
        <View style={styles.ctaArea}>
          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.ctaBtn}
            onPress={onNext}
          >
            <Text style={styles.ctaText}>다음</Text>
            <Ionicons
              name="chevron-forward"
              size={s(21)}
              color={C.btnText}
              style={styles.ctaIcon}
            />
          </TouchableOpacity>

          {/* 선형 진행 표시 */}
          <View style={styles.progressRow}>
            <View style={styles.progressSeg} />
            <View style={[styles.progressSeg, styles.progressSegActive]} />
            <View style={styles.progressSeg} />
          </View>
        </View>

      </View>
    </View>
  );
}

// ─── 피처 카드 ─────────────────────────────────────────────────────────────────
function FeatureCard({ card }) {
  return (
    <View style={[styles.card, { backgroundColor: card.cardBg, borderColor: card.cardBorder }]}>
      <View style={styles.cardLeft}>
        <View style={[styles.cardIconWrap, { backgroundColor: card.iconBg }]}>
          <Ionicons name={card.icon} size={s(16)} color={card.iconColor} />
        </View>
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.cardLabel}>{card.label}</Text>
        <Text style={styles.cardDesc}>{card.desc}</Text>
        <View style={styles.tagRow}>
          {card.tags.map((tag) => (
            <View key={tag} style={[styles.tag, { backgroundColor: card.tagBg }]}>
              <Text style={[styles.tagText, { color: card.tagColor }]}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── 배경 데코 ─────────────────────────────────────────────────────────────────
function BackgroundDecorations() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.bgBase} />
      <View style={styles.glowTopLeft} />
      <View style={styles.glowBottomRight} />
      <Image
        source={require("../../../../assets/leaf-left.png")}
        style={styles.leafLeft}
        resizeMode="contain"
      />
      <Image
        source={require("../../../../assets/leaf-shadow-right.png")}
        style={styles.leafRight}
        resizeMode="contain"
      />
      <View style={styles.bottomFade} />
    </View>
  );
}

// ─── 스타일 ────────────────────────────────────────────────────────────────────
const shadowBtn = Platform.OS === "ios"
  ? { shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: s(18), shadowOffset: { width: 0, height: s(8) } }
  : { elevation: 7 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  bgBase: { ...StyleSheet.absoluteFillObject, backgroundColor: C.bg },
  glowTopLeft: {
    position: "absolute",
    top: sy(-60),
    left: sx(-80),
    width: sx(260),
    height: sx(260),
    borderRadius: sx(130),
    backgroundColor: "rgba(90,130,55,0.18)",
  },
  glowBottomRight: {
    position: "absolute",
    bottom: sy(80),
    right: sx(-70),
    width: sx(220),
    height: sx(220),
    borderRadius: sx(110),
    backgroundColor: "rgba(70,105,40,0.14)",
  },
  leafLeft: {
    position: "absolute",
    top: sy(260),
    left: sx(-54),
    width: sx(160),
    height: sy(360),
    opacity: 0.15,
  },
  leafRight: {
    position: "absolute",
    top: sy(30),
    right: sx(-42),
    width: sx(185),
    height: sy(420),
    opacity: 0.09,
    transform: [{ rotate: "180deg" }],
  },
  bottomFade: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: sy(200),
    backgroundColor: "rgba(14,20,10,0.38)",
  },

  body: {
    flex: 1,
    paddingHorizontal: sx(24),
  },

  spacerTop:    { flex: 0.6 },
  spacerBottom: { flex: 1 },

  // 헤드라인
  headlineWrap: { marginBottom: sy(24) },
  eyebrow: {
    fontSize: s(10.5),
    fontWeight: "700",
    color: C.accent,
    letterSpacing: 2.2,
    marginBottom: sy(12),
  },
  headline: {
    fontSize: s(27),
    lineHeight: s(38),
    fontWeight: "800",
    color: C.text,
    letterSpacing: -0.6,
  },
  headlineAccent: { color: C.accent },
  sub: {
    marginTop: sy(14),
    fontSize: s(13.5),
    lineHeight: s(21),
    color: C.textSub,
    fontWeight: "500",
    letterSpacing: -0.15,
  },

  // 피처 카드
  cardList: { gap: sy(10) },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: s(16),
    borderWidth: 1,
    paddingHorizontal: sx(16),
    paddingVertical: sy(14),
    gap: sx(14),
  },
  cardLeft: { paddingTop: sy(2) },
  cardIconWrap: {
    width: s(36),
    height: s(36),
    borderRadius: s(10),
    alignItems: "center",
    justifyContent: "center",
  },
  cardRight: { flex: 1 },
  cardLabel: {
    fontSize: s(14),
    fontWeight: "800",
    color: C.text,
    letterSpacing: -0.2,
    marginBottom: sy(4),
  },
  cardDesc: {
    fontSize: s(12),
    lineHeight: s(18),
    color: C.textSub,
    fontWeight: "500",
    marginBottom: sy(8),
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: sx(5) },
  tag: {
    borderRadius: 100,
    paddingHorizontal: sx(9),
    paddingVertical: sy(3),
  },
  tagText: {
    fontSize: s(10.5),
    fontWeight: "700",
  },

  // CTA
  ctaArea: { paddingBottom: sy(18) },
  ctaBtn: {
    height: sy(56),
    borderRadius: sy(28),
    backgroundColor: C.btnBg,
    alignItems: "center",
    justifyContent: "center",
    ...shadowBtn,
  },
  ctaText: {
    fontSize: s(16),
    fontWeight: "800",
    color: C.btnText,
    letterSpacing: -0.2,
  },
  ctaIcon: {
    position: "absolute",
    right: sx(22),
  },

  // progress
  progressRow: {
    flexDirection: "row",
    gap: sx(6),
    justifyContent: "center",
    alignItems: "center",
    marginTop: sy(20),
    paddingBottom: sy(6),
  },
  progressSeg: {
    width: sx(22),
    height: sy(3),
    borderRadius: 2,
    backgroundColor: C.dot,
  },
  progressSegActive: {
    width: sx(40),
    backgroundColor: C.dotActive,
  },
});

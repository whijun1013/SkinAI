import React from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { sx, sy, s } from "../../../utils/responsive";

// ─── 색상 ─────────────────────────────────────────────────────────────────────
const C = {
  bg:           "#222E1C",  // 딥 포레스트 올리브
  text:         "#F4F1EA",  // 따뜻한 크림 화이트
  textSub:      "rgba(244,241,234,0.72)",
  textMuted:    "rgba(244,241,234,0.45)",
  accent:       "#B2CF8E",  // 라이트 세이지 그린
  pill:         "rgba(255,255,255,0.08)",
  pillBorder:   "rgba(255,255,255,0.14)",
  btnBg:        "#EEF1E8",  // 크림 (인버티드 버튼)
  btnText:      "#222E1C",  // 딥 올리브
  dot:          "rgba(255,255,255,0.22)",
  dotActive:    "#F4F1EA",
};

// ─── 피처 pills 데이터 ─────────────────────────────────────────────────────────
const FEATURES = [
  { icon: "camera-outline",     label: "피부 기록" },
  { icon: "restaurant-outline", label: "식단 · 생활" },
  { icon: "sparkles",           label: "AI 인사이트" },
];

// ─── 메인 ─────────────────────────────────────────────────────────────────────
export default function OnboardingScreen({ onNext }) {
  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <BackgroundDecorations />

      <View style={styles.body}>

        {/* ── 로고 ── */}
        <View style={styles.logoWrap}>
          <Image
            source={require("../../../../assets/logo-nuvo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* ── 상단 여백 ── */}
        <View style={styles.spacerTop} />

        {/* ── 헤드라인 ── */}
        <View style={styles.headlineWrap}>
          <Text style={styles.eyebrow}>SKIN AI JOURNAL</Text>
          <Text style={styles.headline}>피부가 달라졌다면,</Text>
          <Text style={styles.headline}>
            <Text style={styles.headlineAccent}>AI와 함께</Text>
            {" "}이유를 찾아봐요
          </Text>
          <Text style={styles.sub}>
            피부 사진과 생활 기록을 함께 분석해{"\n"}
            변화의 흐름을 인사이트로 보여드려요
          </Text>
        </View>

        {/* ── 피처 Pills ── */}
        <View style={styles.pillRow}>
          {FEATURES.map((f) => (
            <View key={f.label} style={styles.pill}>
              <Ionicons name={f.icon} size={s(13)} color={C.accent} />
              <Text style={styles.pillText}>{f.label}</Text>
            </View>
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
            <Text style={styles.ctaText}>NUVO 시작하기</Text>
            <Ionicons
              name="chevron-forward"
              size={s(21)}
              color={C.btnText}
              style={styles.ctaIcon}
            />
          </TouchableOpacity>

          {/* 선형 진행 표시 */}
          <View style={styles.progressRow}>
            <View style={[styles.progressSeg, styles.progressSegActive]} />
            <View style={styles.progressSeg} />
            <View style={styles.progressSeg} />
          </View>
        </View>

      </View>
    </SafeAreaView>
  );
}

// ─── 배경 데코 ─────────────────────────────────────────────────────────────────
function BackgroundDecorations() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.bgBase} />

      {/* 상단 우측 빛 번짐 */}
      <View style={styles.glowTopRight} />

      {/* 중앙 빛 번짐 */}
      <View style={styles.glowCenter} />

      {/* 좌측 나뭇잎 */}
      <Image
        source={require("../../../../assets/leaf-left.png")}
        style={styles.leafLeft}
        resizeMode="contain"
      />

      {/* 우측 잎 그림자 */}
      <Image
        source={require("../../../../assets/leaf-shadow-right.png")}
        style={styles.leafRight}
        resizeMode="contain"
      />

      {/* 하단 어두운 페이드 */}
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

  // 배경
  bgBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.bg,
  },
  glowTopRight: {
    position: "absolute",
    top: sy(-70),
    right: sx(-90),
    width: sx(300),
    height: sx(300),
    borderRadius: sx(150),
    backgroundColor: "rgba(90,130,55,0.22)",
  },
  glowCenter: {
    position: "absolute",
    top: sy(220),
    alignSelf: "center",
    width: sx(360),
    height: sx(360),
    borderRadius: sx(180),
    backgroundColor: "rgba(70,105,40,0.14)",
  },
  leafLeft: {
    position: "absolute",
    top: sy(300),
    left: sx(-56),
    width: sx(168),
    height: sy(380),
    opacity: 0.20,
  },
  leafRight: {
    position: "absolute",
    top: sy(40),
    right: sx(-44),
    width: sx(190),
    height: sy(440),
    opacity: 0.11,
    transform: [{ rotate: "180deg" }],
  },
  bottomFade: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: sy(220),
    backgroundColor: "rgba(14,20,10,0.40)",
  },

  // 바디 레이아웃
  body: {
    flex: 1,
    paddingHorizontal: sx(28),
  },

  logoWrap: {
    paddingTop: sy(14),
    alignItems: "flex-start",
  },
  logo: {
    width: sx(108),
    height: sy(38),
  },

  spacerTop:    { flex: 1 },
  spacerBottom: { flex: 1.4 },

  // 헤드라인
  headlineWrap: {},
  eyebrow: {
    fontSize: s(10.5),
    fontWeight: "700",
    color: C.accent,
    letterSpacing: 2.2,
    marginBottom: sy(14),
  },
  headline: {
    fontSize: s(30),
    lineHeight: s(41),
    fontWeight: "800",
    color: C.text,
    letterSpacing: -0.7,
  },
  headlineAccent: {
    color: C.accent,
  },
  sub: {
    marginTop: sy(18),
    fontSize: s(14),
    lineHeight: s(22),
    color: C.textSub,
    fontWeight: "500",
    letterSpacing: -0.15,
  },

  // 피처 pills
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sx(8),
    marginTop: sy(28),
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sx(6),
    backgroundColor: C.pill,
    borderWidth: 1,
    borderColor: C.pillBorder,
    borderRadius: 100,
    paddingHorizontal: sx(13),
    paddingVertical: sy(7),
  },
  pillText: {
    fontSize: s(12),
    fontWeight: "700",
    color: C.textSub,
    letterSpacing: -0.1,
  },

  // CTA
  ctaArea: {
    paddingBottom: sy(18),
  },
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

  // 선형 progress
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

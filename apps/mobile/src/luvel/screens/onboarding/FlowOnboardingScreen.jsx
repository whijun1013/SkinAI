import React from "react";
import {
  Dimensions,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BASE_WIDTH, sx, sy, s } from "../../../utils/responsive";

const { height } = Dimensions.get("window");

const TUNING = {
  // 1번 페이지와 동일한 상단 기준
  logoTop: 84,
  logoWidth: 198,
  logoHeight: 76,

  titleTop: 158,
  titleFontSize: 26.4,
  titleLineHeight: 37,

  descTop: 218,
  descFontSize: 14.4,
  descLineHeight: 24,

  // 2번 페이지 중앙 그래픽
  circleTop: 304,
  circleSize: 366,

  leftLeafTop: 284,
  leftLeafLeft: -50,
  leftLeafWidth: 166,
  leftLeafHeight: 405,

  rightShadowTop: 50,
  rightShadowRight: -42,
  rightShadowWidth: 178,
  rightShadowHeight: 430,

  // 카드 영역
  cardWidth: 302,

  recordCardTop: 322,
  recordCardHeight: 118,

  habitCardTop: 454,
  habitCardHeight: 166,

  insightCardTop: 636,
  insightCardHeight: 122,

  // 1번 페이지 하단 버튼 크기/위치감 기준
  buttonBottom: 80,
  buttonWidth: 326,
  buttonHeight: 52,

  dotsBottom: 40,
};

const COLORS = {
  bg: "#F8F7F2",
  text: "#292D2B",
  muted: "#7E867C",
  olive: "#4F603C",
  oliveDeep: "#3F5633",
  oliveSoft: "#E9EDE0",
  card: "rgba(255, 255, 252, 0.90)",
  cardBorder: "rgba(255, 255, 255, 0.75)",
  button: "#4B6A38",
  white: "#FFFFFF",
};

export default function FlowOnboardingScreen({ onNext }) {
  return (
    <View style={styles.root}>
      <BackgroundDecorations />

      <Image
        source={require("../../../../assets/logo-luvel.png")}
        style={styles.logo}
        resizeMode="contain"
      />

      <View style={styles.descriptionBlock}>
        <Text style={styles.description}>
          수면 · 식단 · 날씨 · 습도와 함께
        </Text>
        <Text style={styles.description}>
          피부 변화의 힌트를 찾아보세요
        </Text>
      </View>

      <View style={styles.visualArea}>
        <View style={styles.largeCircle} />
        <View style={styles.centerLine} />
        <View style={[styles.connectionDot, styles.connectionDotOne]} />
        <View style={[styles.connectionDot, styles.connectionDotTwo]} />
        <View style={[styles.connectionDot, styles.connectionDotThree]} />
      </View>

      <Image
        source={require("../../../../assets/leaf-left.png")}
        style={styles.leafLeft}
        resizeMode="contain"
      />

      <Image
        source={require("../../../../assets/leaf-shadow-right.png")}
        style={styles.leafShadowRight}
        resizeMode="contain"
      />

      <RecordCard />
      <HabitCard />
      <InsightCard />

      <TouchableOpacity
        activeOpacity={0.88}
        style={styles.ctaButton}
        onPress={onNext}
      >
        <Text style={styles.ctaText}>다음</Text>
        <Ionicons
          name="chevron-forward"
          size={s(24)}
          color={COLORS.white}
          style={styles.ctaIcon}
        />
      </TouchableOpacity>

      <View style={styles.dots}>
        <View style={styles.dot} />
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
      </View>
    </View>
  );
}

function BackgroundDecorations() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.bgBase} />

      <Image
        source={require("../../../../assets/leaf-shadow-right.png")}
        style={styles.topLeftShadow}
        resizeMode="contain"
      />

      <View style={styles.leftSoftCircle} />
      <View style={styles.rightSoftCircle} />
      <View style={styles.bottomGlow} />
    </View>
  );
}

function RecordCard() {
  return (
    <View style={[styles.card, styles.recordCard]}>
      <View style={styles.cardHeaderRow}>
        <Ionicons
          name="camera-outline"
          size={s(20)}
          color={COLORS.oliveDeep}
          style={styles.cardIcon}
        />
        <Text style={styles.cardTitle}>피부 기록</Text>
      </View>

      <Text style={styles.compactDescFirst}>매일 피부 상태를</Text>
      <Text style={styles.compactDesc}>사진으로 기록해요</Text>

      <Image
        source={require("../../../../assets/cream-texture.png")}
        style={styles.creamImage}
        resizeMode="cover"
      />
    </View>
  );
}

function HabitCard() {
  const habits = [
    { icon: "moon", label: "수면" },
    { icon: "restaurant-outline", label: "식단" },
    { icon: "sunny-outline", label: "날씨" },
    { icon: "water-outline", label: "습도" },
  ];

  return (
    <View style={[styles.card, styles.habitCard]}>
      <View style={[styles.cardHeaderRow, styles.habitHeaderRow]}>
        <Ionicons
          name="leaf-outline"
          size={s(20)}
          color={COLORS.oliveDeep}
          style={styles.cardIcon}
        />
        <Text style={styles.cardTitle}>생활 습관</Text>
      </View>

      <Text style={styles.habitDesc}>일상의 작은 변화들도</Text>
      <Text style={styles.habitDesc}>함께 기록해보세요</Text>

      <View style={styles.habitIconsRow}>
        {habits.map((item) => (
          <View key={item.label} style={styles.habitItem}>
            <View style={styles.habitIconCircle}>
              <Ionicons
                name={item.icon}
                size={s(24)}
                color={COLORS.oliveDeep}
              />
            </View>
            <Text style={styles.habitLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function InsightCard() {
  return (
    <View style={[styles.card, styles.insightCard]}>
      <View style={styles.cardHeaderRow}>
        <Ionicons
          name="sparkles"
          size={s(21)}
          color={COLORS.oliveDeep}
          style={styles.cardIcon}
        />
        <Text style={styles.cardTitle}>AI 인사이트</Text>
      </View>

      <Text style={styles.compactDescFirst}>AI가 데이터를 연결해</Text>
      <Text style={styles.compactDesc}>변화 흐름을 함께 정리해드려요</Text>

      <View style={styles.insightGraphic}>
        <View style={styles.insightCircle} />
        <View style={styles.insightLine} />
        <View style={styles.insightPoint} />
      </View>
    </View>
  );
}

const shadowCard =
  Platform.OS === "ios"
    ? {
        shadowColor: "#D7D0C2",
        shadowOpacity: 0.16,
        shadowRadius: s(18),
        shadowOffset: {
          width: 0,
          height: s(8),
        },
      }
    : {
        elevation: 5,
      };

const shadowButton =
  Platform.OS === "ios"
    ? {
        shadowColor: "#4C5D3B",
        shadowOpacity: 0.12,
        shadowRadius: s(14),
        shadowOffset: {
          width: 0,
          height: s(7),
        },
      }
    : {
        elevation: 5,
      };

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    maxWidth: sx(BASE_WIDTH),
    height,
    alignSelf: "center",
    position: "relative",
    overflow: "hidden",
    backgroundColor: COLORS.bg,
  },

  bgBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
  },

  topLeftShadow: {
    position: "absolute",
    top: sy(-34),
    left: sx(-48),
    width: sx(220),
    height: sy(250),
    opacity: 0.18,
    transform: [{ rotate: "180deg" }],
  },

  leftSoftCircle: {
    position: "absolute",
    top: sy(300),
    left: sx(-92),
    width: sx(196),
    height: sx(196),
    borderRadius: sx(98),
    backgroundColor: "rgba(203, 209, 190, 0.08)",
  },

  rightSoftCircle: {
    position: "absolute",
    top: sy(390),
    right: sx(-78),
    width: sx(170),
    height: sx(170),
    borderRadius: sx(85),
    backgroundColor: "rgba(203, 209, 190, 0.05)",
  },

  bottomGlow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: sy(260),
    backgroundColor: "rgba(248, 247, 242, 0.24)",
  },

  logo: {
    position: "absolute",
    top: sy(TUNING.logoTop),
    alignSelf: "center",
    width: sx(TUNING.logoWidth),
    height: sy(TUNING.logoHeight),
    zIndex: 5,
  },

  titleBlock: {
    position: "absolute",
    top: sy(TUNING.titleTop),
    width: "100%",
    alignItems: "center",
    zIndex: 5,
  },

  title: {
    fontSize: s(TUNING.titleFontSize),
    lineHeight: s(TUNING.titleLineHeight),
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    letterSpacing: -0.9,
  },

  titleAccent: {
    color: COLORS.olive,
    fontWeight: "800",
  },

  descriptionBlock: {
    position: "absolute",
    top: sy(TUNING.descTop),
    width: "100%",
    alignItems: "center",
    zIndex: 5,
  },

  description: {
    fontSize: s(TUNING.descFontSize),
    lineHeight: s(TUNING.descLineHeight),
    fontWeight: "500",
    color: COLORS.muted,
    textAlign: "center",
    letterSpacing: -0.2,
  },

  visualArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  largeCircle: {
    position: "absolute",
    top: sy(TUNING.circleTop),
    alignSelf: "center",
    width: sx(TUNING.circleSize),
    height: sx(TUNING.circleSize),
    borderRadius: sx(TUNING.circleSize / 2),
    backgroundColor: "rgba(224, 230, 211, 0.62)",
    zIndex: 1,
  },

  centerLine: {
    position: "absolute",
    top: sy(TUNING.recordCardTop + TUNING.recordCardHeight - 4),
    alignSelf: "center",
    width: sx(2),
    height: sy(342),
    backgroundColor: "rgba(255, 255, 255, 0.62)",
    zIndex: 2,
  },

  connectionDot: {
    position: "absolute",
    alignSelf: "center",
    width: s(12),
    height: s(12),
    borderRadius: s(6),
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "rgba(229,232,216,0.72)",
    zIndex: 3,
  },

  connectionDotOne: {
    top: sy(TUNING.recordCardTop + TUNING.recordCardHeight - 8),
  },

  connectionDotTwo: {
    top: sy(TUNING.habitCardTop + TUNING.habitCardHeight - 8),
  },

  connectionDotThree: {
    top: sy(TUNING.insightCardTop - 12),
  },

  leafLeft: {
    position: "absolute",
    top: sy(TUNING.leftLeafTop),
    left: sx(TUNING.leftLeafLeft),
    width: sx(TUNING.leftLeafWidth),
    height: sy(TUNING.leftLeafHeight),
    opacity: 0.96,
    zIndex: 4,
  },

  leafShadowRight: {
    position: "absolute",
    top: sy(TUNING.rightShadowTop),
    right: sx(TUNING.rightShadowRight),
    width: sx(TUNING.rightShadowWidth),
    height: sy(TUNING.rightShadowHeight),
    opacity: 0.32,
    zIndex: 0,
  },

  card: {
    position: "absolute",
    alignSelf: "center",
    width: sx(TUNING.cardWidth),
    borderRadius: s(18),
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    zIndex: 5,
    ...shadowCard,
  },

  recordCard: {
    top: sy(TUNING.recordCardTop),
    height: sy(TUNING.recordCardHeight),
    paddingHorizontal: sx(22),
    paddingTop: sy(24),
  },

  habitCard: {
    top: sy(TUNING.habitCardTop),
    height: sy(TUNING.habitCardHeight),
    paddingHorizontal: sx(22),
    paddingTop: sy(24),
  },

  insightCard: {
    top: sy(TUNING.insightCardTop),
    height: sy(TUNING.insightCardHeight),
    paddingHorizontal: sx(22),
    paddingTop: sy(24),
  },

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  habitHeaderRow: {
  transform: [{ translateY: sy(-4) }],
  },
  
  cardIcon: {
    marginRight: sx(12),
  },

  cardTitle: {
    fontSize: s(16.2),
    lineHeight: s(23),
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: -0.45,
  },

  cardDesc: {
    marginTop: sy(11),
    fontSize: s(12.4),
    lineHeight: s(21),
    fontWeight: "500",
    color: COLORS.muted,
    letterSpacing: -0.25,
  },

  compactDescFirst: {
    marginTop: sy(8),
    fontSize: s(12.4),
    lineHeight: s(18),
    fontWeight: "500",
    color: COLORS.muted,
    letterSpacing: -0.25,
  },

  compactDesc: {
    marginTop: sy(1),
    fontSize: s(12.4),
    lineHeight: s(18),
    fontWeight: "500",
    color: COLORS.muted,
    letterSpacing: -0.25,
  },

  creamImage: {
    position: "absolute",
    right: sx(20),
    top: sy(24),
    width: sx(74),
    height: sx(74),
    borderRadius: s(16),
    opacity: 0.94,
  },

  habitIconsRow: {
    position: "absolute",
    left: sx(28),
    right: sx(28),
    bottom: sy(10),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },

  habitItem: {
    alignItems: "center",
  },

  habitDesc: {
    marginTop: sy(2),
    fontSize: s(12.2),
    lineHeight: s(19),
    fontWeight: "500",
    color: COLORS.muted,
    letterSpacing: -0.25,
  },

  habitIconCircle: {
    width: s(32),
    height: s(32),
    borderRadius: s(17.5),
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  habitLabel: {
    marginTop: sy(4),
    fontSize: s(10.6),
    lineHeight: s(17),
    color: COLORS.muted,
    fontWeight: "500",
  },

  insightGraphic: {
    position: "absolute",
    right: sx(24),
    top: sy(38),
    width: sx(86),
    height: sy(58),
    alignItems: "center",
    justifyContent: "center",
  },

  insightCircle: {
    position: "absolute",
    width: sx(54),
    height: sx(54),
    borderRadius: sx(27),
    backgroundColor: "rgba(232, 236, 224, 0.78)",
  },

  insightLine: {
    position: "absolute",
    width: sx(78),
    height: sy(2),
    backgroundColor: COLORS.oliveDeep,
    transform: [{ rotate: "-9deg" }],
  },

  insightPoint: {
    position: "absolute",
    right: sx(14),
    width: s(9),
    height: s(9),
    borderRadius: s(4.5),
    backgroundColor: COLORS.white,
  },

  ctaButton: {
    position: "absolute",
    bottom: sy(TUNING.buttonBottom),
    alignSelf: "center",
    width: sx(TUNING.buttonWidth),
    height: sy(TUNING.buttonHeight),
    borderRadius: sy(TUNING.buttonHeight / 2),
    backgroundColor: COLORS.button,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 8,
    ...shadowButton,
  },

  ctaText: {
    color: COLORS.white,
    fontSize: s(15.6),
    fontWeight: "700",
    letterSpacing: -0.15,
  },

  ctaIcon: {
    position: "absolute",
    right: sx(22),
  },

  dots: {
    position: "absolute",
    bottom: sy(TUNING.dotsBottom),
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 8,
  },

  dot: {
    width: s(8.5),
    height: s(8.5),
    borderRadius: s(4.25),
    backgroundColor: "#E0E4D8",
    marginHorizontal: sx(7),
  },

  dotActive: {
    backgroundColor: COLORS.oliveDeep,
  },
});

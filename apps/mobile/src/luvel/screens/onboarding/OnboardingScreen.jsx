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
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BASE_WIDTH, sx, sy, s } from "../../../utils/responsive";

const { height } = Dimensions.get("window");

/**
 * 최종 목표 1번 온보딩 화면 기준
 * - iPhone 15 Pro Max 캡처 이미지 비율 기준
 * - 체크무늬 중앙 이미지는 나중에 교체 예정
 */
const TUNING = {
  logoTop: 66,
  logoWidth: 190,
  logoHeight: 72,

  titleTop: 158,
  titleFontSize: 26.4,
  titleLineHeight: 37,

  descTop: 238,
  descFontSize: 12.8,
  descLineHeight: 21.5,

  circleTop: 338,
  circleSize: 326,

  leftLeafTop: 404,
  leftLeafLeft: -42,
  leftLeafWidth: 166,
  leftLeafHeight: 382,

  rightShadowTop: 326,
  rightShadowRight: -36,
  rightShadowWidth: 178,
  rightShadowHeight: 520,

  bottomPanelTop: 676,
  bottomPanelWidth: 430,
  bottomPanelHeight: 198,

  sparkleTop: 24,
  panelTextTop: 64,

  buttonTop: 124,
  buttonWidth: 326,
  buttonHeight: 52,

  dotsTop: 884,
};

const COLORS = {
  bg: "#F8F7F2",
  text: "#292D2B",
  muted: "#7E867C",
  olive: "#4F603C",
  oliveDeep: "#3F5633",
  oliveButton: "#4B6A38",
  panel: "rgba(250, 249, 244, 0.92)",
  panelBorder: "rgba(244, 241, 233, 0.75)",
  white: "#FFFFFF",
};

export default function OnboardingScreen({ onNext }) {
  return (
    <SafeAreaView style={styles.root} edges={["left", "right"]}>
      <View style={styles.phone}>
        <BackgroundDecorations />

        {/* 상단 Luvel 로고 */}
        <Image
          source={require("../../../../assets/logo-luvel.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        {/* 메인 타이틀 */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>피부가 달라졌다면,</Text>
          <Text style={styles.title}>
            <Text style={styles.titleAccent}>AI와 함께</Text> 이유를 찾아봐요
          </Text>
        </View>

        {/* 설명문 */}
        <View style={styles.descriptionBlock}>
          <Text style={styles.description}>
            피부 사진과 생활 기록을 함께 분석해
          </Text>
          <Text style={styles.description}>
            변화의 흐름을 인사이트로 보여드려요
          </Text>
        </View>

        {/* 중앙 원형 그래픽 */}
        <View style={styles.circleWrap}>
          <View style={styles.circleBackLarge} />
          <View style={styles.circleBackMid} />

          <Image
            source={require("../../../../assets/central-circle-asset.png")}
            style={styles.circleAsset}
            resizeMode="contain"
          />
        </View>

        {/* 좌측 실제 나뭇잎 */}
        <Image
          source={require("../../../../assets/leaf-left.png")}
          style={styles.leafLeft}
          resizeMode="contain"
        />

        {/* 우측 흐릿한 잎 그림자 */}
        <Image
          source={require("../../../../assets/leaf-shadow-right.png")}
          style={styles.leafShadowRight}
          resizeMode="contain"
        />

        {/* 하단 반투명 패널 */}
        <View style={styles.bottomPanel}>
          <Ionicons
            name="sparkles"
            size={s(21)}
            color={COLORS.oliveDeep}
            style={styles.sparkleIcon}
          />

          <View style={styles.panelTextBlock}>
            <Text style={styles.panelText}>
              수면, 식단, 날씨, 활동 습관까지
            </Text>
            <Text style={styles.panelText}>
              모든 변화가 피부에 연결되어 있어요
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.ctaButton}
            onPress={onNext}
          >
            <Text style={styles.ctaText}>Luvel 시작하기</Text>
            <Ionicons
              name="chevron-forward"
              size={s(24)}
              color={COLORS.white}
              style={styles.ctaIcon}
            />
          </TouchableOpacity>
        </View>

        {/* 페이지 도트 */}
        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function BackgroundDecorations() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.bgBase} />

      {/* 상단 흐릿한 잎/원형 쉐도우 */}
      <Image
        source={require("../../../../assets/leaf-shadow-right.png")}
        style={styles.topLeafShadow}
        resizeMode="contain"
      />

      <View style={styles.leftSoftCircleLarge} />
      <View style={styles.leftSoftCircleSmall} />
      <View style={styles.rightSoftCircle} />
      <View style={styles.bottomSoftCircle} />
      <View style={styles.bottomGlow} />
    </View>
  );
}

const shadowPanel =
  Platform.OS === "ios"
    ? {
        shadowColor: "#D9D3C6",
        shadowOpacity: 0.10,
        shadowRadius: s(18),
        shadowOffset: {
          width: 0,
          height: s(-3),
        },
      } 
    : {
        elevation: 3,
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
    backgroundColor: COLORS.bg,
    alignItems: "center",
  },

  phone: {
    width: "100%",
    maxWidth: sx(BASE_WIDTH),
    height,
    position: "relative",
    overflow: "hidden",
    backgroundColor: COLORS.bg,
  },

  bgBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
  },

  topLeafShadow: {
    position: "absolute",
    top: sy(-42),
    left: sx(-34),
    width: sx(210),
    height: sy(250),
    opacity: 0.22,
    transform: [{ rotate: "180deg" }],
  },

  leftSoftCircleLarge: {
    position: "absolute",
    top: sy(104),
    left: sx(-88),
    width: sx(198),
    height: sx(198),
    borderRadius: sx(99),
    backgroundColor: "rgba(203, 209, 190, 0.08)",
  },

  leftSoftCircleSmall: {
    position: "absolute",
    top: sy(60),
    left: sx(52),
    width: sx(102),
    height: sx(102),
    borderRadius: sx(51),
    backgroundColor: "rgba(203, 209, 190, 0.045)",
  },

  rightSoftCircle: {
    position: "absolute",
    top: sy(404),
    right: sx(-82),
    width: sx(170),
    height: sx(170),
    borderRadius: sx(85),
    backgroundColor: "rgba(203, 209, 190, 0.05)",
  },

  bottomSoftCircle: {
    position: "absolute",
    bottom: sy(150),
    alignSelf: "center",
    width: sx(350),
    height: sx(350),
    borderRadius: sx(175),
    backgroundColor: "rgba(238, 235, 222, 0.14)",
  },

  bottomGlow: {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  height: sy(240),
  backgroundColor: "rgba(248, 247, 242, 0.20)",
},

  logo: {
    position: "absolute",
    top: sy(TUNING.logoTop),
    alignSelf: "center",
    width: sx(TUNING.logoWidth),
    height: sy(TUNING.logoHeight),
  },

  titleBlock: {
    position: "absolute",
    top: sy(TUNING.titleTop),
    width: "100%",
    alignItems: "center",
  },

  title: {
    fontSize: s(TUNING.titleFontSize),
    lineHeight: s(TUNING.titleLineHeight),
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    letterSpacing: -0.95,
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
  },

  description: {
    fontSize: s(TUNING.descFontSize),
    lineHeight: s(TUNING.descLineHeight),
    color: COLORS.muted,
    textAlign: "center",
    fontWeight: "500",
    letterSpacing: -0.25,
  },

  circleWrap: {
    position: "absolute",
    top: sy(TUNING.circleTop),
    alignSelf: "center",
    width: sx(TUNING.circleSize),
    height: sx(TUNING.circleSize),
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },

  circleBackLarge: {
    position: "absolute",
    width: sx(TUNING.circleSize + 16),
    height: sx(TUNING.circleSize + 16),
    borderRadius: sx((TUNING.circleSize + 16) / 2),
    backgroundColor: "rgba(229, 232, 216, 0.14)",
  },

  circleBackMid: {
    position: "absolute",
    width: sx(TUNING.circleSize + 4),
    height: sx(TUNING.circleSize + 4),
    borderRadius: sx((TUNING.circleSize + 4) / 2),
    backgroundColor: "rgba(241, 239, 228, 0.20)",
  },

  circleAsset: {
    width: sx(TUNING.circleSize),
    height: sx(TUNING.circleSize),
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
    opacity: 0.42,
    zIndex: 1,
  },

  bottomPanel: {
  position: "absolute",
  top: sy(TUNING.bottomPanelTop),
  alignSelf: "center",
  width: sx(TUNING.bottomPanelWidth),
  height: sy(TUNING.bottomPanelHeight),
  borderTopLeftRadius: s(58),
  borderTopRightRadius: s(58),
  backgroundColor: COLORS.panel,
  borderTopWidth: 1,
  borderColor: COLORS.panelBorder,
  alignItems: "center",
  zIndex: 6,
  overflow: "hidden",
  ...shadowPanel,
},

  sparkleIcon: {
    position: "absolute",
    top: sy(TUNING.sparkleTop),
    alignSelf: "center",
  },

  panelTextBlock: {
    position: "absolute",
    top: sy(TUNING.panelTextTop),
    alignSelf: "center",
    alignItems: "center",
  },

  panelText: {
    fontSize: s(12.7),
    lineHeight: s(21.5),
    color: COLORS.muted,
    textAlign: "center",
    fontWeight: "500",
    letterSpacing: -0.25,
  },

  ctaButton: {
    position: "absolute",
    top: sy(TUNING.buttonTop),
    alignSelf: "center",
    width: sx(TUNING.buttonWidth),
    height: sy(TUNING.buttonHeight),
    borderRadius: sy(TUNING.buttonHeight / 2),
    backgroundColor: COLORS.oliveButton,
    alignItems: "center",
    justifyContent: "center",
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
    top: sy(TUNING.dotsTop),
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
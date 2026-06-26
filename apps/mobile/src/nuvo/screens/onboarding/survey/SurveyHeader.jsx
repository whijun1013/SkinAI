import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { s, sx, sy } from "../../../../utils/responsive";
import COLORS from "./surveyColors";

const STEPS = [
  { num: 1, label: "기본정보" },
  { num: 2, label: "화장품" },
  { num: 3, label: "건강" },
];

export function Header({ currentStep, onLogout }) {
  return (
    <View style={styles.header}>
      {onLogout ? (
        <TouchableOpacity
          style={styles.logoutButton}
          activeOpacity={0.74}
          onPress={onLogout}
          accessibilityRole="button"
          accessibilityLabel="로그아웃"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.logoutButtonText}>로그아웃</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.logo}>NUVO</Text>

      {/* ── Step indicator ─────────────────────────────────────── */}
      <View style={styles.stepsRow}>
        {STEPS.map((step, idx) => {
          const isDone = currentStep > step.num;
          const isActive = currentStep === step.num;
          return (
            <React.Fragment key={step.num}>
              <View style={styles.stepItem}>
                <View
                  style={[
                    styles.stepDot,
                    isDone && styles.stepDotDone,
                    isActive && styles.stepDotActive,
                  ]}
                >
                  {isDone ? (
                    <Ionicons name="checkmark" size={s(12)} color="#FFF" />
                  ) : (
                    <Text
                      style={[
                        styles.stepNum,
                        isActive && styles.stepNumActive,
                      ]}
                    >
                      {step.num}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    isDone && styles.stepLabelDone,
                    isActive && styles.stepLabelActive,
                  ]}
                >
                  {step.label}
                </Text>
              </View>
              {idx < STEPS.length - 1 && (
                <View
                  style={[
                    styles.stepConnector,
                    isDone && styles.stepConnectorDone,
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

export function SkinGoalPanel({
  title = "지금 NUVO로 알고 싶은 변화는?",
  description = "가장 신경 쓰는 피부 고민을 자유롭게 적어 주세요. 적어 주신 내용이 기록과 분석의 출발점이 됩니다.",
}) {
  return (
    <View style={[styles.contextPanel, styles.skinGoalPanel]}>
      <View style={styles.contextCopy}>
        <View style={styles.panelTagRow}>
          <Ionicons name="leaf-outline" size={s(12)} color={COLORS.olive} />
          <Text style={styles.panelTag}>피부 목표</Text>
        </View>
        {!!title ? <Text style={styles.contextTitle}>{title}</Text> : null}
        {!!description ? (
          <Text style={styles.contextDescription}>{description}</Text>
        ) : null}
      </View>

      {/* Concentric ring graphic – varied green shades */}
      <View style={styles.goalGraphic}>
        <View style={styles.goalRingOuter} />
        <View style={styles.goalRingMid} />
        <View style={styles.goalRingInner} />
        <View style={styles.goalCenterDot} />
        <View style={styles.goalAccentDot1} />
        <View style={styles.goalAccentDot2} />
      </View>
    </View>
  );
}

export function RoutinePanel({
  title = "바르는 화장품도 변화의 단서예요",
  description = "성분과 사용 시기를 알면, 트러블과 좋은 변화를 구분하기 쉬워져요.",
}) {
  return (
    <View style={[styles.contextPanel, styles.routinePanel]}>
      <View style={styles.contextCopy}>
        <View style={styles.panelTagRow}>
          <Ionicons name="flask-outline" size={s(12)} color={COLORS.olive} />
          <Text style={styles.panelTag}>화장품 루틴</Text>
        </View>
        {!!title ? <Text style={styles.contextTitle}>{title}</Text> : null}
        {!!description ? (
          <Text style={styles.contextDescription}>{description}</Text>
        ) : null}
      </View>
      <View style={styles.routineGraphic}>
        <View style={styles.productShelf} />
        <View style={[styles.productBottleMini, styles.productCleanser]}>
          <View style={styles.productCapMini} />
          <View style={styles.productLabelMini} />
        </View>
        <View style={[styles.productBottleMini, styles.productSerum]}>
          <View style={styles.dropperCapMini} />
          <View style={styles.productLabelMini} />
        </View>
        <View style={[styles.productJarMini, styles.productCream]}>
          <View style={styles.jarLidMini} />
        </View>
        <View style={styles.routineLabels}>
          <Text style={styles.routineLabel}>Cleanser</Text>
          <Text style={styles.routineLabel}>Serum</Text>
          <Text style={styles.routineLabel}>Cream</Text>
        </View>
      </View>
    </View>
  );
}

export function HealthPanel({
  title = "복용 약물도 피부 변화와 연결돼요",
  description = "약물은 민감도·유분에 영향을 줄 수 있어요. 함께 기록해 두면 분석이 더 정확해져요.",
}) {
  return (
    <View style={[styles.contextPanel, styles.healthPanel]}>
      <View style={styles.contextCopy}>
        <View style={styles.panelTagRow}>
          <Ionicons name="fitness-outline" size={s(12)} color={COLORS.olive} />
          <Text style={styles.panelTag}>건강 정보</Text>
        </View>
        {!!title ? <Text style={styles.contextTitle}>{title}</Text> : null}
        {!!description ? (
          <Text style={styles.contextDescription}>{description}</Text>
        ) : null}
      </View>
      <View style={styles.healthGraphic}>
        <View style={styles.medicationCard}>
          <View style={styles.medicationHeader} />
          <View style={styles.medicationLine} />
          <View style={[styles.medicationLine, styles.medicationLineShort]} />
        </View>
        <View style={styles.pillCapsule}>
          <View style={styles.pillSplit} />
        </View>
        <View style={styles.noteBadge}>
          <View style={styles.noteBadgeLine} />
          <View style={[styles.noteBadgeLine, styles.noteBadgeLineShort]} />
        </View>
        <View style={styles.healthDots}>
          <View style={styles.healthDot} />
          <View style={[styles.healthDot, styles.healthDotMid]} />
          <View style={[styles.healthDot, styles.healthDotMuted]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    marginBottom: sy(28),
    position: "relative",
  },
  logoutButton: {
    paddingHorizontal: 2,
    paddingVertical: 4,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1,
  },
  logoutButtonText: {
    color: COLORS.muted,
    fontSize: s(14),
    fontWeight: "600",
  },
  logo: {
    color: COLORS.oliveDark,
    fontSize: s(22),
    fontWeight: "800",
    letterSpacing: 5,
    textAlign: "center",
  },

  // ── Step indicator ────────────────────────────────────────────────────────
  stepsRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: sy(16),
    paddingHorizontal: sx(4),
  },
  stepItem: {
    alignItems: "center",
    gap: sy(5),
    width: sx(72),
  },
  stepDot: {
    alignItems: "center",
    backgroundColor: COLORS.olivePale,
    borderRadius: s(15),
    height: s(30),
    justifyContent: "center",
    width: s(30),
  },
  stepDotDone: {
    backgroundColor: COLORS.oliveSage,
  },
  stepDotActive: {
    backgroundColor: COLORS.olive,
    shadowColor: COLORS.olive,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.32,
    shadowRadius: 6,
    elevation: 4,
  },
  stepNum: {
    color: COLORS.subtle,
    fontSize: s(13),
    fontWeight: "700",
  },
  stepNumActive: {
    color: "#FFFFFF",
  },
  stepConnector: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.line,
    flex: 1,
    height: 1.5,
    marginHorizontal: sx(2),
    marginTop: s(14),
  },
  stepConnectorDone: {
    backgroundColor: COLORS.oliveLight,
  },
  stepLabel: {
    color: COLORS.subtle,
    fontSize: s(10),
    fontWeight: "500",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  stepLabelDone: {
    color: COLORS.oliveSage,
  },
  stepLabelActive: {
    color: COLORS.olive,
    fontWeight: "700",
  },

  // ── Context panels (shared) ────────────────────────────────────────────────
  contextPanel: {
    borderColor: COLORS.panelBorder,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    marginBottom: sy(28),
    minHeight: sy(96),
    overflow: "hidden",
    padding: s(14),
  },
  skinGoalPanel: {
    backgroundColor: COLORS.panelSkin,
  },
  routinePanel: {
    backgroundColor: COLORS.panelRoutine,
  },
  healthPanel: {
    backgroundColor: COLORS.panelHealth,
  },
  panelTagRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: sx(4),
    marginBottom: sy(4),
  },
  panelTag: {
    color: COLORS.olive,
    fontSize: s(10),
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  contextCopy: {
    flex: 1,
    justifyContent: "center",
    paddingRight: s(10),
  },
  contextTitle: {
    color: COLORS.text,
    fontSize: s(16),
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: s(23),
  },
  contextDescription: {
    color: COLORS.muted,
    fontSize: s(13),
    lineHeight: s(19),
    marginTop: sy(4),
  },

  // ── SkinGoal graphic (concentric rings – varied green shades) ─────────────
  goalGraphic: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.30)",
    borderRadius: 999,
    height: s(82),
    justifyContent: "center",
    width: s(82),
  },
  goalRingOuter: {
    borderColor: "rgba(168,204,136,0.38)",
    borderRadius: s(36),
    borderWidth: 1.5,
    height: s(72),
    position: "absolute",
    width: s(72),
  },
  goalRingMid: {
    borderColor: "rgba(127,170,94,0.50)",
    borderRadius: s(24),
    borderWidth: 1.5,
    height: s(48),
    position: "absolute",
    width: s(48),
  },
  goalRingInner: {
    borderColor: "rgba(74,94,52,0.60)",
    borderRadius: s(13),
    borderWidth: 1.5,
    height: s(26),
    position: "absolute",
    width: s(26),
  },
  goalCenterDot: {
    backgroundColor: COLORS.olive,
    borderRadius: s(5),
    height: s(10),
    position: "absolute",
    width: s(10),
  },
  goalAccentDot1: {
    backgroundColor: COLORS.oliveSage,
    borderRadius: s(4),
    height: s(8),
    position: "absolute",
    right: s(9),
    top: s(9),
    width: s(8),
  },
  goalAccentDot2: {
    backgroundColor: COLORS.oliveLight,
    borderRadius: s(3),
    bottom: s(10),
    height: s(6),
    left: s(10),
    position: "absolute",
    width: s(6),
  },

  // ── RoutinePanel graphic ──────────────────────────────────────────────────
  routineGraphic: {
    backgroundColor: "rgba(255, 252, 247, 0.65)",
    borderColor: COLORS.line,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    height: 92,
    justifyContent: "space-between",
    overflow: "hidden",
    padding: 10,
    width: 82,
  },
  productShelf: {
    backgroundColor: "rgba(74,94,52,0.20)",
    borderRadius: 4,
    bottom: 32,
    height: 4,
    left: 12,
    position: "absolute",
    right: 12,
  },
  productBottleMini: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.line,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 35,
    position: "absolute",
    width: 20,
  },
  productCleanser: {
    height: 42,
    left: 12,
    transform: [{ rotate: "-7deg" }],
  },
  productSerum: {
    height: 52,
    left: 32,
  },
  productJarMini: {
    alignItems: "center",
    backgroundColor: "#F1E8DF",
    borderColor: COLORS.line,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 35,
    height: 27,
    justifyContent: "flex-start",
    position: "absolute",
    right: 12,
    width: 24,
  },
  productCapMini: {
    alignSelf: "center",
    backgroundColor: COLORS.oliveDark,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    height: 7,
    width: 13,
  },
  dropperCapMini: {
    alignSelf: "center",
    backgroundColor: COLORS.oliveDark,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    height: 10,
    width: 12,
  },
  productLabelMini: {
    alignSelf: "center",
    backgroundColor: COLORS.oliveSoft,
    borderRadius: 5,
    height: 12,
    marginTop: 13,
    width: 11,
  },
  jarLidMini: {
    backgroundColor: COLORS.oliveDark,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    height: 8,
    width: 20,
  },
  routineLabels: {
    display: "none",
  },
  routineLabel: {
    color: COLORS.muted,
    fontSize: s(9),
    fontWeight: "600",
    letterSpacing: 0.35,
  },

  // ── HealthPanel graphic ───────────────────────────────────────────────────
  healthGraphic: {
    backgroundColor: "rgba(255, 252, 247, 0.65)",
    borderColor: COLORS.line,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    height: 92,
    justifyContent: "space-between",
    overflow: "hidden",
    padding: 10,
    width: 82,
  },
  medicationCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.line,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    paddingHorizontal: 8,
    paddingTop: 9,
    width: 54,
  },
  medicationHeader: {
    backgroundColor: COLORS.oliveDark,
    borderRadius: 5,
    height: 9,
    marginBottom: 10,
    width: 22,
  },
  medicationLine: {
    backgroundColor: COLORS.oliveSoft,
    borderRadius: 3,
    height: 4,
    width: 34,
  },
  medicationLineShort: {
    marginTop: 7,
    width: 22,
  },
  pillCapsule: {
    backgroundColor: COLORS.oliveSoft,
    borderColor: COLORS.line,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    height: 20,
    position: "absolute",
    right: 9,
    top: 37,
    transform: [{ rotate: "-18deg" }],
    width: 34,
  },
  pillSplit: {
    backgroundColor: "rgba(255, 252, 247, 0.7)",
    height: "100%",
    left: 20,
    position: "absolute",
    width: 1,
  },
  noteBadge: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.line,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 28,
    height: 26,
    paddingHorizontal: 6,
    paddingTop: 7,
    position: "absolute",
    right: 8,
    width: 36,
  },
  noteBadgeLine: {
    backgroundColor: COLORS.line,
    borderRadius: 2,
    height: 3,
    width: 22,
  },
  noteBadgeLineShort: {
    marginTop: 5,
    width: 13,
  },
  healthDots: {
    flexDirection: "row",
    gap: 5,
    marginTop: 4,
  },
  healthDot: {
    backgroundColor: COLORS.olive,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  healthDotMid: {
    backgroundColor: COLORS.oliveSage,
  },
  healthDotMuted: {
    backgroundColor: COLORS.line,
  },
});

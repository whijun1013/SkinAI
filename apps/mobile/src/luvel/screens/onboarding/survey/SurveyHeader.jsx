import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { s, sy } from "../../../../utils/responsive";
import COLORS from "./surveyColors";

export function Header({ currentStep, onLogout }) {
  const stepCopy = {
    1: { label: "기본 정보" },
    2: { label: "화장품 루틴" },
    3: { label: "건강 정보" },
    4: { label: "마지막 단계" },
  };

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

      <Text style={styles.logo}>Luvel</Text>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${(currentStep / 4) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {currentStep} / 4 · {stepCopy[currentStep]?.label || ""}
        </Text>
      </View>
    </View>
  );
}

export function SkinGoalPanel({
  title = "지금 Luvel로 알고 싶은 변화는?",
  description = "가장 신경 쓰는 피부 고민을 자유롭게 적어 주세요. 적어 주신 내용이 기록과 분석의 출발점이 됩니다.",
}) {
  return (
    <View style={[styles.contextPanel, styles.skinGoalPanel]}>
      <View style={styles.contextCopy}>
        {!!title ? <Text style={styles.contextTitle}>{title}</Text> : null}
        {!!description ? (
          <Text style={styles.contextDescription}>{description}</Text>
        ) : null}
      </View>
      <View style={styles.goalGraphic}>
        <View style={styles.goalRingOuter} />
        <View style={styles.goalRingInner} />
        <View style={styles.goalCenterDot} />
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
          <View style={[styles.healthDot, styles.healthDotMuted]} />
          <View style={[styles.healthDot, styles.healthDotMuted]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: sy(28),
    position: "relative",
  },
  logoutButton: {
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1,
    paddingVertical: 4,
    paddingHorizontal: 2,
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
  progressRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: sy(16),
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.line,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.olive,
  },
  progressText: {
    color: COLORS.subtle,
    fontSize: s(13),
  },
  contextPanel: {
    backgroundColor: COLORS.oliveSoft,
    borderColor: COLORS.line,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    marginBottom: sy(28),
    minHeight: sy(100),
    overflow: "hidden",
    padding: s(14),
  },
  skinGoalPanel: {
    backgroundColor: "#EDF0E6",
  },
  routinePanel: {
    backgroundColor: "#EBF0E4",
  },
  healthPanel: {
    backgroundColor: "#EDF0E6",
  },
  contextCopy: {
    flex: 1,
    justifyContent: "center",
    paddingRight: s(12),
  },
  contextTitle: {
    color: COLORS.text,
    fontSize: s(17),
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: s(24),
    marginTop: sy(6),
  },
  contextDescription: {
    color: COLORS.muted,
    fontSize: s(13),
    lineHeight: s(19),
    marginTop: sy(4),
  },
  goalGraphic: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 252, 247, 0.7)",
    borderColor: COLORS.line,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 78,
    justifyContent: "center",
    width: 78,
  },
  goalRingOuter: {
    borderColor: "rgba(79, 96, 60, 0.18)",
    borderRadius: 28,
    borderWidth: 1.5,
    height: 56,
    position: "absolute",
    width: 56,
  },
  goalRingInner: {
    borderColor: "rgba(79, 96, 60, 0.35)",
    borderRadius: 16,
    borderWidth: 1.5,
    height: 32,
    position: "absolute",
    width: 32,
  },
  goalCenterDot: {
    backgroundColor: COLORS.olive,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  routineGraphic: {
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 252, 247, 0.7)",
    borderColor: COLORS.line,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "space-between",
    padding: 10,
    width: 82,
  },
  productShelf: {
    backgroundColor: "rgba(79, 96, 60, 0.2)",
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
  healthGraphic: {
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 252, 247, 0.7)",
    borderColor: COLORS.line,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "space-between",
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
  healthDots: {
    flexDirection: "row",
    gap: 5,
    marginTop: 4,
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
  healthDot: {
    backgroundColor: COLORS.olive,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  healthDotMuted: {
    backgroundColor: COLORS.line,
  },
});

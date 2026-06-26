import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, FONT, shadowCard } from "../reportTheme";
import { ANALYSIS_TIMEOUT_MS_MESSAGE } from "../reportUtils";

function Row({ icon = null, title, description, trailing = "", onPress = null }) {
  const content = (
    <>
      {icon ? (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={17} color={COLORS.olive} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {description ? (
          <Text style={styles.rowDescription} numberOfLines={2}>{description}</Text>
        ) : null}
      </View>
      {trailing ? <Text style={styles.rowTrailing}>{trailing}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={COLORS.muted} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressedItem]}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

export default function InsightSection({
  failedAnalysis,
  completedAnalysis,
  completedAnalysisId,
  analysisError,
  onOpenDetail,
  onLoadStats,
}) {
  const showFailureSupport = failedAnalysis && completedAnalysis;
  if (!showFailureSupport && !analysisError) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>피부 리포트</Text>
      <View style={styles.group}>
        {showFailureSupport ? (
          <Row
            title="최근 다시 만들기가 완료되지 않았어요"
            description="기존 리포트는 계속 확인할 수 있어요."
            trailing="최근 결과 보기"
            onPress={() => onOpenDetail(completedAnalysisId)}
          />
        ) : null}
        {showFailureSupport && analysisError ? <Divider /> : null}
        {analysisError ? (
          <Row
            title="리포트를 불러오지 못했어요"
            description={
              analysisError === "timeout"
                ? ANALYSIS_TIMEOUT_MS_MESSAGE
                : "잠시 후 다시 시도해 주세요."
            }
            trailing="새로고침"
            onPress={() => onLoadStats()}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section:      { marginTop: 16 },
  sectionTitle: { marginBottom: 8, paddingHorizontal: 2, fontSize: 12, lineHeight: 17, fontFamily: FONT.bold, color: COLORS.muted, letterSpacing: 0.4 },

  group: {
    borderRadius: 18, backgroundColor: COLORS.surface, overflow: "hidden",
    borderWidth: 1, borderColor: COLORS.line, ...shadowCard,
  },
  row:           { minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 15, paddingVertical: 10 },
  rowIcon:       { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 8 },
  rowText:       { flex: 1, minWidth: 0 },
  rowTitle:      { fontSize: 14.5, lineHeight: 20, fontFamily: FONT.bold, color: COLORS.text, letterSpacing: 0 },
  rowDescription:{ marginTop: 2, fontSize: 12.1, lineHeight: 17, fontFamily: FONT.medium, color: COLORS.muted, letterSpacing: 0 },
  rowTrailing:   { marginLeft: 10, fontSize: 11.8, lineHeight: 16, fontFamily: FONT.bold, color: COLORS.olive, letterSpacing: 0 },
  divider:       { height: 1, backgroundColor: COLORS.line, marginLeft: 15, opacity: 0.78 },
  pressedItem:   { opacity: 0.72 },
});

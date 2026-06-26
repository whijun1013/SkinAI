import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, FONT } from "../reportTheme";

const shadow =
  Platform.OS === "ios"
    ? { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }
    : { elevation: 2 };

export default function RecordOverview({ recentSkinLogDays, analysisReadySkinLogDays, photoCount }) {
  const items = [
    { icon: "water-outline",            value: `${recentSkinLogDays}일`,        label: "피부 기록" },
    { icon: "checkmark-circle-outline", value: `${analysisReadySkinLogDays}일`, label: "점수 포함" },
    { icon: "images-outline",           value: `${photoCount}장`,               label: "사진" },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>기록 현황</Text>
      <View style={styles.card}>
        {/* 카드 헤더 */}
        <View style={styles.cardHead}>
          <View style={styles.cardHeadIcon}>
            <Ionicons name="layers-outline" size={16} color={COLORS.olive} />
          </View>
          <Text style={styles.cardHeadLabel}>최근 14일 기록</Text>
        </View>

        {/* 스탯 행 */}
        <View style={styles.statRow}>
          {items.map((item, index) => (
            <React.Fragment key={item.label}>
              {index > 0 && <View style={styles.statDivider} />}
              <View style={styles.statItem}>
                <Ionicons name={item.icon} size={14} color={COLORS.olive} />
                <Text style={styles.statValue}>{item.value}</Text>
                <Text style={styles.statLabel}>{item.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section:      { marginTop: 20 },
  sectionLabel: {
    marginBottom: 8,
    paddingHorizontal: 2,
    fontSize: 11,
    fontFamily: FONT.extraBold,
    color: COLORS.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

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
    fontSize: 15,
    fontFamily: FONT.extraBold,
    color: COLORS.text,
    letterSpacing: -0.2,
  },

  statRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
    backgroundColor: COLORS.bg,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.line,
  },
  statValue: {
    fontSize: 16,
    fontFamily: FONT.extraBold,
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 10.5,
    fontFamily: FONT.medium,
    color: COLORS.muted,
  },
});

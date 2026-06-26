import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MealSlotsVisual, SkinStatusVisual } from "./RecordStatusVisuals";

const BASE = {
  card: "#FFFCF7",
  line: "#D9D6CC",
  text: "#1F2520",
  muted: "#8B9184",
  defaultMain: "#4F603C",
  defaultSoft: "#E8EEDD",
};

const shadowCard =
  Platform.OS === "ios"
    ? { shadowColor: "#1A2410", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } }
    : { elevation: 3 };

function CardHeader({ title, icon, badge, badgePartial, accent, onPress }) {
  const main = accent?.main ?? BASE.defaultMain;
  const soft = accent?.soft ?? BASE.defaultSoft;

  // 완료=진한 색, 부분완료=앰버 소프트, 미완료=soft
  const headerBg    = badge ? main : badgePartial ? "#F5EBD8" : soft;
  const headerText  = badge ? BASE.white : badgePartial ? "#C97C2A" : main;
  const iconBg      = badge ? "rgba(255,255,255,0.18)" : badgePartial ? "rgba(201,124,42,0.14)" : "rgba(0,0,0,0.07)";
  const chevronC    = badge ? "rgba(255,255,255,0.55)" : badgePartial ? "#C97C2A" : main;

  return (
    <View style={[styles.header, { backgroundColor: headerBg }]}>
      <View style={[styles.headerIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={headerText} />
      </View>
      <Text style={[styles.headerTitle, { color: headerText }]}>{title}</Text>
      {badge && (
        <View style={styles.donePill}>
          <Text style={styles.donePillText}>완료</Text>
        </View>
      )}
      {!badge && badgePartial && (
        <View style={[styles.donePill, { backgroundColor: "rgba(201,124,42,0.18)" }]}>
          <Text style={[styles.donePillText, { color: "#C97C2A" }]}>기록 중</Text>
        </View>
      )}
      {onPress && <Ionicons name="chevron-forward" size={15} color={chevronC} />}
    </View>
  );
}

/**
 * @param {"skin"|"meals"} visualType
 * @param {{ score?: number|null, tags?: string[], hasPhoto?: boolean }} [skinStatus]
 * @param {object|null} [skinAiStatus]
 * @param {Array<{label:string,hasLog:boolean,imageUri:string|null}>} [mealSlots]
 * @param {{ main: string, soft: string } | null} [accent]
 */
export default function RecordVisualCard({
  title,
  description,
  icon,
  badge = false,
  badgePartial = false,
  visualType,
  skinStatus,
  skinAiStatus = null,
  skinEmptyLabel = "피부 상태를 기록해 보세요",
  mealSlots = [],
  onPress,
  accent = null,
}) {
  return (
    <TouchableOpacity activeOpacity={0.86} style={styles.card} onPress={onPress}>
      <CardHeader
        title={title}
        icon={icon}
        badge={badge}
        badgePartial={badgePartial}
        accent={accent}
        onPress={onPress}
      />

      <View style={styles.body}>
        {visualType === "skin" ? (
          <SkinStatusVisual
            skinStatus={skinStatus}
            skinAiStatus={skinAiStatus}
            emptyLabel={skinEmptyLabel}
          />
        ) : null}

        {visualType === "meals" ? (
          <MealSlotsVisual slots={mealSlots} accentMain={accent?.main} accentSoft={accent?.soft} />
        ) : null}

        {description ? (
          <Text style={styles.bodyDesc}>{description}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: BASE.card,
    borderWidth: 1,
    borderColor: BASE.line,
    marginBottom: 12,
    ...shadowCard,
  },
  /* 컬러 헤더 밴드 */
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  donePill: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  donePillText: {
    fontSize: 10,
    fontWeight: "800",
    color: BASE.white,
    letterSpacing: 0.3,
  },
  /* 비주얼 바디 */
  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  bodyDesc: {
    fontSize: 13,
    fontWeight: "500",
    color: BASE.muted,
    lineHeight: 19,
  },
});

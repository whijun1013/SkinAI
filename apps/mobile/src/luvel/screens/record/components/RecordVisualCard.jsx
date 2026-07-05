import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MealSlotsVisual, SkinStatusVisual } from "./RecordStatusVisuals";

const COLORS = {
  card: "#FFFCF7",
  line: "#D9D6CC",
  olive: "#4F603C",
  oliveSoft: "#E8EEDD",
  text: "#1F2520",
  muted: "#8B9184",
};

const shadowCard =
  Platform.OS === "ios"
    ? {
        shadowColor: "#D7D0C2",
        shadowOpacity: 0.14,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
      }
    : { elevation: 3 };

function CardHeader({ title, icon, badge, badgePartial, onPress }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={20} color={COLORS.olive} />
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {badge ? <View style={styles.badgeDot} /> : null}
          {!badge && badgePartial ? <View style={styles.badgeDotPartial} /> : null}
        </View>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={COLORS.muted} /> : null}
    </View>
  );
}

/**
 * @param {"skin"|"meals"} visualType
 * @param {{ score?: number|null, tags?: string[], hasPhoto?: boolean }} [skinStatus]
 * @param {Array<{label:string,hasLog:boolean,imageUri:string|null}>} [mealSlots]
 */
export default function RecordVisualCard({
  title,
  description,
  icon,
  badge = false,
  badgePartial = false,
  visualType,
  skinStatus,
  skinEmptyLabel = "피부 상태를 기록해 보세요",
  mealSlots = [],
  onPress,
}) {
  return (
    <TouchableOpacity activeOpacity={0.82} style={styles.card} onPress={onPress}>
      <CardHeader
        title={title}
        icon={icon}
        badge={badge}
        badgePartial={badgePartial}
        onPress={onPress}
      />

      {visualType === "skin" ? (
        <SkinStatusVisual skinStatus={skinStatus} emptyLabel={skinEmptyLabel} />
      ) : null}

      {visualType === "meals" ? <MealSlotsVisual slots={mealSlots} /> : null}

      {description ? <Text style={styles.cardDescription}>{description}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 16,
    marginBottom: 14,
    ...shadowCard,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "900", color: COLORS.text },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.olive,
  },
  badgeDotPartial: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D4A72C",
  },
  cardDescription: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: COLORS.muted,
  },
});


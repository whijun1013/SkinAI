import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AuthImage from "../../../components/AuthImage";
import { SCORE_COLORS, SCORE_LABELS } from "../skinConstants";
import { MEAL_ICONS } from "../dietDisplay";

const COLORS = {
  card: "#FFFCF7",
  chip: "#FCFAF6",
  line: "#D9D6CC",
  olive: "#4F603C",
  oliveSoft: "#E8EEDD",
  text: "#1F2520",
  muted: "#8B9184",
};

export function SkinStatusVisual({ skinStatus, emptyLabel }) {
  const score = skinStatus?.score;
  const tags = skinStatus?.tags ?? [];
  const hasPhoto = skinStatus?.hasPhoto;

  if (!score) {
    return (
      <View style={styles.skinEmpty}>
        <View style={styles.skinEmptyIcon}>
          <Ionicons name="sparkles-outline" size={24} color={COLORS.olive} />
        </View>
        <Text style={styles.skinEmptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  const palette = SCORE_COLORS[score] ?? SCORE_COLORS[3];
  const label = SCORE_LABELS[score] ?? "";

  return (
    <View style={styles.skinStatus}>
      <View style={styles.skinStatusMain}>
        <View
          style={[
            styles.scoreCircle,
            { backgroundColor: palette.active, borderColor: palette.border },
          ]}
        >
          <Text style={styles.scoreNumber}>{score}</Text>
        </View>
        <View style={styles.skinStatusInfo}>
          <Text style={styles.scoreLabel}>{label}</Text>
          <Text style={styles.scoreSub}>피부 점수 {score}점</Text>
          {hasPhoto ? (
            <View style={styles.photoHint}>
              <Ionicons name="camera" size={12} color={COLORS.muted} />
              <Text style={styles.photoHintText}>사진 기록됨 · 상세에서 확인</Text>
            </View>
          ) : (
            <View style={styles.photoHint}>
              <Ionicons name="alert-circle-outline" size={12} color="#D4A72C" />
              <Text style={[styles.photoHintText, styles.photoHintPartial]}>
                점수만 기록 · 사진 추가 가능
              </Text>
            </View>
          )}
        </View>
      </View>
      {tags.length > 0 ? (
        <View style={styles.tagRow}>
          {tags.slice(0, 3).map((tag, tagIndex) => (
            <View key={`skin-tag-${String(tagIndex)}-${String(tag ?? "tag")}`} style={styles.tagChip}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
          {tags.length > 3 ? (
            <Text style={styles.tagMore}>+{tags.length - 3}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function MealSlotsVisual({ slots }) {
  return (
    <View style={styles.mealRow}>
      {slots.map((slot, slotIndex) => (
        <View key={`meal-slot-${String(slotIndex)}-${String(slot?.label ?? "slot")}`} style={styles.mealSlot}>
          {slot.imageUri ? (
            <AuthImage uri={slot.imageUri} style={styles.mealThumb} />
          ) : (
            <View style={[styles.mealPlaceholder, slot.hasLog && styles.mealPlaceholderFilled]}>
              <Ionicons
                name={MEAL_ICONS[slot.label] || "restaurant-outline"}
                size={18}
                color={slot.hasLog ? COLORS.olive : COLORS.muted}
              />
            </View>
          )}
          <Text style={[styles.mealLabel, slot.hasLog && styles.mealLabelActive]}>
            {slot.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skinStatus: {
    borderRadius: 16,
    backgroundColor: COLORS.chip,
    padding: 14,
    gap: 12,
  },
  skinStatusMain: { flexDirection: "row", alignItems: "center", gap: 14 },
  scoreCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreNumber: { fontSize: 22, fontWeight: "900", color: COLORS.card },
  skinStatusInfo: { flex: 1, gap: 3 },
  scoreLabel: { fontSize: 16, fontWeight: "900", color: COLORS.text },
  scoreSub: { fontSize: 12.5, fontWeight: "600", color: COLORS.muted },
  photoHint: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  photoHintText: { fontSize: 11.5, fontWeight: "600", color: COLORS.muted },
  photoHintPartial: { color: "#D4A72C" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  tagChip: {
    backgroundColor: COLORS.oliveSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  tagText: { fontSize: 11.5, fontWeight: "800", color: COLORS.olive },
  tagMore: { fontSize: 11.5, fontWeight: "700", color: COLORS.muted },
  skinEmpty: {
    height: 96,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderStyle: "dashed",
    backgroundColor: COLORS.chip,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  skinEmptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  skinEmptyText: { fontSize: 12.5, fontWeight: "700", color: COLORS.muted },
  mealRow: { flexDirection: "row", gap: 8 },
  mealSlot: { flex: 1, alignItems: "center", gap: 6 },
  mealThumb: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: COLORS.chip,
  },
  mealPlaceholder: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  mealPlaceholderFilled: {
    backgroundColor: COLORS.oliveSoft,
    borderColor: "rgba(79, 96, 60, 0.25)",
  },
  mealLabel: { fontSize: 11.5, fontWeight: "800", color: COLORS.muted },
  mealLabelActive: { color: COLORS.olive },
});


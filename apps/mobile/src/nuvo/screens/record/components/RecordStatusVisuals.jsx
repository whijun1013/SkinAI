import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
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

const OBS_LABELS = {
  active_lesion: "트러블",
  redness: "홍반",
  barrier: "피부 장벽",
};

// ─── AI 상태 칩 ──────────────────────────────────────────────────────────────
function AiStatusChip({ skinAiStatus }) {
  const status = skinAiStatus?.status;
  if (!status || status === "not_requested" || status === "none") return null;

  if (status === "pending" || status === "running") {
    return (
      <View style={styles.aiChip}>
        <ActivityIndicator size={10} color={COLORS.olive} />
        <Text style={styles.aiChipText}>AI 분석 중</Text>
      </View>
    );
  }
  if (status === "failed") {
    return (
      <View style={[styles.aiChip, styles.aiChipWarn]}>
        <Ionicons name="alert-circle-outline" size={11} color="#B45309" />
        <Text style={[styles.aiChipText, { color: "#B45309" }]}>분석 실패</Text>
      </View>
    );
  }
  if (status === "done") {
    const obs = skinAiStatus?.observations;
    if (!obs) return (
      <View style={[styles.aiChip, styles.aiChipDone]}>
        <Ionicons name="sparkles" size={11} color={COLORS.olive} />
        <Text style={styles.aiChipText}>분석 완료</Text>
      </View>
    );
    const allNone = Object.keys(OBS_LABELS).every(k => !obs[k] || obs[k].score === "none");
    const summary = allNone
      ? "이상 없음"
      : Object.entries(OBS_LABELS)
          .filter(([k]) => obs?.[k] && obs[k].score !== "none")
          .map(([k]) => `${obs[k].label ?? OBS_LABELS[k]} ${obs[k].level_label ?? ""}`.trim())
          .join(" · ") || "분석 완료";
    return (
      <View style={[styles.aiChip, styles.aiChipDone]}>
        <Ionicons name="sparkles" size={11} color={COLORS.olive} />
        <Text style={styles.aiChipText} numberOfLines={1}>{summary}</Text>
      </View>
    );
  }
  return null;
}

// ─── SkinStatusVisual ─────────────────────────────────────────────────────────
export function SkinStatusVisual({ skinStatus, skinAiStatus, emptyLabel }) {
  const score    = skinStatus?.score;
  const tags     = skinStatus?.tags ?? [];
  const hasPhoto = skinStatus?.hasPhoto;

  if (!score) {
    return (
      <View style={styles.skinEmpty}>
        <View style={styles.skinEmptyIcon}>
          <Ionicons name="sparkles-outline" size={20} color={COLORS.olive} />
        </View>
        <Text style={styles.skinEmptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  const palette = SCORE_COLORS[score] ?? SCORE_COLORS[3];
  const label   = SCORE_LABELS[score] ?? "";

  const parts = [`${label} ${score}점`];
  if (tags.length > 0) parts.push(tags.slice(0, 3).join(" · "));
  if (!hasPhoto) parts.push("사진 없음");

  return (
    <View style={styles.skinTextWrap}>
      <Text style={[styles.skinText, { color: palette.active }]} numberOfLines={2}>
        {parts.join("  ·  ")}
      </Text>
      <AiStatusChip skinAiStatus={skinAiStatus} />
    </View>
  );
}

// ─── MealSlotsVisual ──────────────────────────────────────────────────────────
export function MealSlotsVisual({ slots, accentMain, accentSoft }) {
  const filledBg    = accentSoft ?? "#F5EBD8";
  const filledColor = accentMain ?? "#C97C2A";
  const filledBorder = accentMain ? `${accentMain}40` : "rgba(201,124,42,0.25)";

  return (
    <View style={styles.mealRow}>
      {slots.map((slot, slotIndex) => (
        <View key={`meal-slot-${String(slotIndex)}-${String(slot?.label ?? "slot")}`} style={styles.mealSlot}>
          {slot.imageUri ? (
            <AuthImage uri={slot.imageUri} style={styles.mealThumb} />
          ) : (
            <View
              style={[
                styles.mealPlaceholder,
                slot.hasLog && { backgroundColor: filledBg, borderColor: filledBorder },
              ]}
            >
              <Ionicons
                name={MEAL_ICONS[slot.label] || "restaurant-outline"}
                size={18}
                color={slot.hasLog ? filledColor : COLORS.muted}
              />
            </View>
          )}
          <Text style={[styles.mealLabel, slot.hasLog && { color: filledColor }]}>
            {slot.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Skin 텍스트 요약 ──────────────────────────────────────────────────────────
  skinTextWrap: { gap: 6 },
  skinText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },

  // ── AI 상태 칩 ────────────────────────────────────────────────────────────────
  aiChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: COLORS.oliveSoft,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  aiChipWarn: { backgroundColor: "#FEF3C7" },
  aiChipDone: { backgroundColor: "#EEF5E8" },
  aiChipText: { fontSize: 11, fontWeight: "700", color: COLORS.olive },

  // ── Skin empty ───────────────────────────────────────────────────────────────
  skinEmpty: {
    height: 72,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderStyle: "dashed",
    backgroundColor: COLORS.chip,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  skinEmptyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  skinEmptyText: { fontSize: 12, fontWeight: "700", color: COLORS.muted },

  // ── Meals ────────────────────────────────────────────────────────────────────
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

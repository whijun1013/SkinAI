import React from "react";
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  bg: "#F7F8F5",
  olive: "#4F603C",
  text: "#1A1F17",
  border: "#E2E5DA",
  rightBg: "#E4EBD8",
  muted: "#8A9080",
};

export default function ScreenHeader({
  title,
  onBack,
  rightLabel,
  onRightPress,
  rightDisabled = false,
  secondaryRightLabel,
  onSecondaryRightPress,
  secondaryRightDisabled = false,
}) {
  const { width } = useWindowDimensions();
  const isCompact = width <= 390;
  const hasSecondaryAction = !!(secondaryRightLabel && onSecondaryRightPress);

  return (
    <View style={[styles.header, isCompact && styles.headerCompact]}>
      <View style={[styles.headerRow, isCompact && styles.headerRowCompact]}>
        <View style={styles.leftSlot}>
          <TouchableOpacity
            onPress={onBack}
            activeOpacity={0.7}
            style={[styles.backButton, isCompact && styles.backButtonCompact]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.rightSlot, hasSecondaryAction && styles.rightSlotWide]}>
          {hasSecondaryAction ? (
            <TouchableOpacity
              activeOpacity={0.76}
              style={styles.secondaryButton}
              onPress={onSecondaryRightPress}
              disabled={secondaryRightDisabled}
            >
              <Text style={[styles.secondaryText, secondaryRightDisabled && styles.actionDisabled]}>
                {secondaryRightLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
          {rightLabel && onRightPress ? (
            <TouchableOpacity
              activeOpacity={0.76}
              style={[styles.rightButton, rightDisabled && styles.rightButtonDisabled]}
              onPress={onRightPress}
              disabled={rightDisabled}
            >
              <Text style={[styles.rightText, rightDisabled && styles.rightTextDisabled]}>
                {rightLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View
          style={[
            styles.titleOverlay,
            isCompact && styles.titleOverlayCompact,
            hasSecondaryAction && styles.titleOverlayWideRight,
            hasSecondaryAction && isCompact && styles.titleOverlayWideRightCompact,
          ]}
          pointerEvents="none"
        >
          <Text style={[styles.title, isCompact && styles.titleCompact]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerCompact: {
    paddingHorizontal: 16,
  },
  headerRow: {
    position: "relative",
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerRowCompact: {
    minHeight: 52,
  },
  leftSlot: { zIndex: 1 },
  rightSlot: {
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    minHeight: 40,
  },
  rightSlotWide: { minWidth: 104 },
  titleOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 88,
    zIndex: 0,
  },
  titleOverlayCompact: { paddingHorizontal: 76 },
  titleOverlayWideRight: { paddingHorizontal: 120 },
  titleOverlayWideRightCompact: { paddingHorizontal: 108 },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#F2F4EE",
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonCompact: { width: 34, height: 34, borderRadius: 10 },
  title: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 0,
    textAlign: "center",
  },
  titleCompact: { fontSize: 16, lineHeight: 22 },
  secondaryButton: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    color: COLORS.muted,
    letterSpacing: 0,
  },
  actionDisabled: { opacity: 0.4 },
  rightButton: {
    minWidth: 48,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.rightBg,
  },
  rightButtonDisabled: { opacity: 0.45 },
  rightText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: COLORS.olive,
    letterSpacing: 0,
  },
  rightTextDisabled: { color: COLORS.muted },
});

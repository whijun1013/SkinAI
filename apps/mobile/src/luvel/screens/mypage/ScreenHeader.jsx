import React from "react";
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  background: "#F8F7F2",
  olive: "#4F603C",
  text: "#2F312D",
  border: "#E5E1D6",
  rightBg: "#EEF0E6",
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
            style={[styles.sideButton, isCompact && styles.sideButtonCompact]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={26} color={COLORS.olive} />
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
              <Text
                style={[
                  styles.secondaryText,
                  secondaryRightDisabled && styles.secondaryTextDisabled,
                ]}
              >
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
    backgroundColor: COLORS.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 24,
  },
  headerCompact: {
    paddingHorizontal: 18,
  },
  headerRow: {
    position: "relative",
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerRowCompact: {
    minHeight: 54,
  },
  leftSlot: {
    zIndex: 1,
  },
  rightSlot: {
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    minHeight: 40,
  },
  rightSlotWide: {
    minWidth: 104,
  },
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
  titleOverlayCompact: {
    paddingHorizontal: 76,
  },
  titleOverlayWideRight: {
    paddingHorizontal: 120,
  },
  titleOverlayWideRightCompact: {
    paddingHorizontal: 108,
  },
  sideButton: {
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  sideButtonCompact: {
    width: 36,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 0,
    textAlign: "center",
  },
  titleCompact: {
    fontSize: 17,
    lineHeight: 23,
  },
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
    color: COLORS.text,
    letterSpacing: 0,
  },
  secondaryTextDisabled: {
    opacity: 0.55,
  },
  rightButton: {
    minWidth: 48,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.rightBg,
  },
  rightText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: COLORS.olive,
    letterSpacing: 0,
  },
  rightButtonDisabled: {
    opacity: 0.55,
  },
  rightTextDisabled: {
    color: COLORS.text,
  },
});

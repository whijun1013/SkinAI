import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, FONT } from "../reportTheme";
import { IN_PROGRESS_STATUSES, getAnalysisHistoryTitle } from "../reportUtils";
import { buildAnalysisTeaser } from "../ReportDetailView";

const STATUS_CONFIG = {
  done:        { label: "완료",   color: COLORS.olive },
  inProgress:  { label: "정리 중", color: "#C9A864" },
  failed:      { label: "미완료",  color: COLORS.warning },
};

export default function HistorySection({ historyItems, onOpenDetail }) {
  if (historyItems.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>이전 리포트</Text>

      <View style={styles.listContainer}>
        {historyItems.map((item, index) => {
          const id           = item?.request_id ?? item?.id;
          const teaser       = buildAnalysisTeaser(item, IN_PROGRESS_STATUSES);
          const isFailed     = item?.status === "failed";
          const isInProgress = IN_PROGRESS_STATUSES.has(item?.status);
          const cfg          = isFailed ? STATUS_CONFIG.failed
                             : isInProgress ? STATUS_CONFIG.inProgress
                             : STATUS_CONFIG.done;
          const isLast       = index === historyItems.length - 1;

          return (
            <Pressable
              key={`analysis-${String(id ?? index)}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={id ? () => onOpenDetail(id) : null}
              disabled={!id}
            >
              {/* 상태 점 */}
              <View style={[styles.dot, { backgroundColor: cfg.color }]} />

              {/* 텍스트 */}
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowDate}>{getAnalysisHistoryTitle(item)}</Text>
                  <View style={[styles.badge, { backgroundColor: `${cfg.color}18` }]}>
                    <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
                {teaser.description ? (
                  <Text style={styles.rowDesc} numberOfLines={1}>{teaser.description}</Text>
                ) : null}
              </View>

              <Ionicons name="chevron-forward" size={14} color={COLORS.line} />

              {/* 구분선 */}
              {!isLast && <View style={styles.divider} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section:      { marginTop: 20, marginBottom: 8 },
  sectionLabel: {
    marginBottom: 8,
    paddingHorizontal: 2,
    fontSize: 11,
    fontFamily: FONT.extraBold,
    color: COLORS.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  listContainer: {
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    overflow: "hidden",
    ...Platform.select({
      ios:     { shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
    }),
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowPressed: { backgroundColor: "rgba(0,0,0,0.03)" },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },

  rowBody: { flex: 1, gap: 3 },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowDate: {
    fontSize: 14,
    fontFamily: FONT.extraBold,
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  rowDesc: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.muted,
    lineHeight: 17,
  },

  badge: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: FONT.bold,
  },

  divider: {
    position: "absolute",
    bottom: 0,
    left: 36,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.line,
  },
});

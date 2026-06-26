import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { s, sx, sy } from "../../../../utils/responsive";
import COLORS from "./surveyColors";

export function Section({ badge, title, description, children, variant }) {
  const showHeader = !!badge || !!title || !!description;

  return (
    <View style={styles.section}>
      {showHeader ? (
        <View style={styles.sectionHeader}>
          {!!badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
          <View style={styles.sectionCopy}>
            {!!title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
            {!!description ? (
              <Text style={styles.sectionDescription}>{description}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      <View
        style={[
          styles.groupedSurface,
          variant === "skinType" && styles.skinTypeSurface,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export function Field({ label, helper, error, required, noBorder, children }) {
  return (
    <View style={[styles.field, noBorder && styles.fieldNoBorder]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {required ? <Text style={styles.requiredDot}> *</Text> : null}
      </View>
      {!!helper && <Text style={styles.helper}>{helper}</Text>}
      {children}
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

export function Input({
  value,
  onChangeText,
  onFocus,
  onBlur,
  onSubmitEditing,
  placeholder,
  keyboardType,
  returnKeyType,
  maxLength,
  hasError,
  isFocused,
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      placeholderTextColor={COLORS.placeholder}
      keyboardType={keyboardType}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
      maxLength={maxLength}
      accessibilityLabel={placeholder}
      style={[
        styles.input,
        isFocused && styles.inputFocused,
        hasError && styles.inputError,
      ]}
    />
  );
}

export function InlinePanel({ title, description, children }) {
  return (
    <View style={styles.inlinePanel}>
      {!!title ? <Text style={styles.inlineTitle}>{title}</Text> : null}
      {!!description ? (
        <Text style={styles.inlineDescription}>{description}</Text>
      ) : null}
      <View style={styles.inlineBody}>{children}</View>
    </View>
  );
}

export function ChipGrid({ children }) {
  return <View style={styles.chipGrid}>{children}</View>;
}

export function Chip({ label, selected, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : styles.chipIdle,
        pressed && styles.pressed,
      ]}
    >
      {selected ? (
        <Ionicons
          name="checkmark"
          size={s(12)}
          color="#F7F7F2"
          style={styles.chipCheck}
        />
      ) : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ConcernAnswer({ label, selected, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.concernAnswer,
        selected && styles.concernAnswerSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.concernAnswerText,
          selected && styles.concernAnswerTextSelected,
        ]}
      >
        {label}
      </Text>
      {selected ? (
        <View style={styles.concernCheck}>
          <Ionicons name="checkmark" size={s(13)} color={COLORS.olive} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function SegmentedControl({ options, value, onChange }) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const optionValue =
          typeof option === "string" ? option : option.value;
        const label = typeof option === "string" ? option : option.label;
        const selected = value === optionValue;

        return (
          <Pressable
            accessibilityRole="button"
            key={label}
            onPress={() => onChange(optionValue)}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[styles.segmentText, selected && styles.segmentTextSelected]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SurveyStatusBanner({ message, tone = "error" }) {
  if (!message) return null;

  const isError = tone === "error";
  return (
    <View
      style={[
        styles.statusBanner,
        isError ? styles.statusBannerError : styles.statusBannerSuccess,
      ]}
    >
      <Text
        style={[
          styles.statusBannerText,
          isError ? styles.statusBannerTextError : styles.statusBannerTextSuccess,
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

export function SurveyLoadErrorBanner({ message, onRetry }) {
  if (!message) return null;

  return (
    <View style={styles.loadErrorBox}>
      <Text style={styles.loadErrorText}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="데이터 다시 불러오기"
        onPress={onRetry}
        style={({ pressed }) => [
          styles.loadErrorRetry,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.loadErrorRetryText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

export function SurveySearchButton({
  label = "제품 검색하기",
  onPress,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.surveySearchButton,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name="search-outline" size={s(18)} color={COLORS.olive} />
      <Text style={styles.surveySearchButtonText}>{label}</Text>
      <Ionicons name="chevron-forward" size={s(16)} color={COLORS.muted} />
    </Pressable>
  );
}

export function StepFooter({
  previousLabel = "이전",
  nextLabel = "다음",
  onPrevious,
  onNext,
  showPrevious = Boolean(onPrevious),
  prominent = false,
  disabled = false,
}) {
  const showBack = showPrevious && onPrevious;

  return (
    <View style={[styles.stepFooter, prominent && styles.stepFooterProminent]}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPrevious}
          style={({ pressed }) => [
            styles.stepFooterBack,
            prominent && styles.stepFooterBackProminent,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-back" size={s(16)} color={COLORS.muted} />
          <Text style={styles.stepFooterBackText}>{previousLabel}</Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        onPress={disabled ? undefined : onNext}
        disabled={disabled}
        style={({ pressed }) => [
          styles.stepFooterNext,
          !showBack && styles.stepFooterNextFull,
          prominent && styles.stepFooterNextProminent,
          disabled && styles.stepFooterNextDisabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <Text style={styles.stepFooterNextText}>{nextLabel}</Text>
        {!disabled ? (
          <Ionicons name="chevron-forward" size={s(18)} color={COLORS.ctaText} />
        ) : null}
      </Pressable>
    </View>
  );
}

export function OptionalEmptyState({ title, description, buttonLabel, onPress }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!description && (
        <Text style={styles.emptyDescription}>{description}</Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.optionalSkipButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.optionalSkipButtonText}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

const shadowCard = Platform.OS === "ios"
  ? { shadowColor: "#BEC8AE", shadowOpacity: 0.18, shadowRadius: s(14), shadowOffset: { width: 0, height: s(5) } }
  : { elevation: 3 };

const shadowButton = Platform.OS === "ios"
  ? { shadowColor: "#3A4E28", shadowOpacity: 0.22, shadowRadius: s(12), shadowOffset: { width: 0, height: s(4) } }
  : { elevation: 5 };

const styles = StyleSheet.create({
  // ── Section ───────────────────────────────────────────────────────────────
  section: {
    marginBottom: sy(28),
  },
  sectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  badge: {
    alignItems: "center",
    backgroundColor: COLORS.oliveMid,
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    marginTop: 1,
    width: 24,
  },
  badgeText: {
    color: "#F7F7F2",
    fontSize: s(13),
    fontWeight: "700",
  },
  sectionCopy: {
    flex: 1,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: s(19),
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: s(26),
  },
  sectionDescription: {
    color: COLORS.muted,
    fontSize: s(14),
    lineHeight: s(20),
    marginTop: sy(4),
  },

  // ── Grouped surface card ──────────────────────────────────────────────────
  groupedSurface: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.cardBorder,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: sy(14),
    overflow: "hidden",
    paddingHorizontal: sx(16),
    paddingVertical: 2,
    ...shadowCard,
  },
  skinTypeSurface: {
    paddingVertical: sy(16),
  },

  // ── Field ─────────────────────────────────────────────────────────────────
  field: {
    borderBottomColor: COLORS.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: sy(15),
  },
  fieldNoBorder: {
    borderBottomWidth: 0,
    paddingBottom: sy(8),
  },
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: sy(8),
  },
  label: {
    color: COLORS.olive,
    fontSize: s(13),
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  requiredDot: {
    color: COLORS.olive,
    fontSize: s(15),
    fontWeight: "700",
  },
  helper: {
    color: COLORS.subtle,
    fontSize: s(13),
    lineHeight: s(19),
    marginBottom: sy(8),
  },
  errorText: {
    color: COLORS.error,
    fontSize: s(13),
    lineHeight: s(19),
    marginTop: sy(7),
  },

  // ── Input ─────────────────────────────────────────────────────────────────
  input: {
    backgroundColor: COLORS.input,
    borderColor: COLORS.line,
    borderRadius: sy(23),
    borderWidth: 1,
    color: COLORS.body,
    fontSize: s(16),
    height: sy(50),
    paddingHorizontal: sx(14),
  },
  inputFocused: {
    borderColor: COLORS.olive,
    borderWidth: 1.5,
  },
  inputError: {
    borderColor: COLORS.error,
  },

  // ── InlinePanel ───────────────────────────────────────────────────────────
  inlinePanel: {
    backgroundColor: COLORS.oliveSofter,
    borderColor: COLORS.cardBorder,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: sy(14),
    marginTop: sy(20),
    padding: s(16),
  },
  inlineTitle: {
    color: COLORS.text,
    fontSize: s(17),
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  inlineDescription: {
    color: COLORS.muted,
    fontSize: s(13),
    lineHeight: s(19),
    marginTop: sy(4),
  },
  inlineBody: {
    marginTop: sy(16),
  },

  // ── Chip ──────────────────────────────────────────────────────────────────
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    alignItems: "center",
    borderRadius: 100,
    flexDirection: "row",
    gap: sx(4),
    height: sy(42),
    justifyContent: "center",
    minWidth: sx(76),
    paddingHorizontal: sx(16),
  },
  chipIdle: {
    backgroundColor: COLORS.chip,
    borderColor: COLORS.chipBorder,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: COLORS.olive,
    paddingHorizontal: sx(13),
  },
  chipCheck: {
    marginRight: -sx(2),
  },
  chipText: {
    color: COLORS.muted,
    fontSize: s(15),
    fontWeight: "500",
  },
  chipTextSelected: {
    color: "#F7F7F2",
    fontWeight: "600",
  },

  // ── ConcernAnswer ─────────────────────────────────────────────────────────
  concernAnswer: {
    alignItems: "center",
    backgroundColor: COLORS.chip,
    borderColor: COLORS.chipBorder,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: sy(52),
    paddingHorizontal: sx(16),
    paddingVertical: sy(13),
  },
  concernAnswerSelected: {
    backgroundColor: COLORS.oliveSofter,
    borderColor: COLORS.olive,
    borderWidth: 1.5,
  },
  concernAnswerText: {
    color: COLORS.muted,
    flex: 1,
    fontSize: s(15),
    fontWeight: "500",
    lineHeight: s(21),
  },
  concernAnswerTextSelected: {
    color: COLORS.oliveDark,
    fontWeight: "600",
  },
  concernCheck: {
    alignItems: "center",
    backgroundColor: COLORS.oliveSoft,
    borderRadius: 10,
    height: s(24),
    justifyContent: "center",
    marginLeft: sx(8),
    width: s(24),
  },

  // ── SegmentedControl ──────────────────────────────────────────────────────
  segmented: {
    backgroundColor: COLORS.chip,
    borderRadius: 16,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  segment: {
    alignItems: "center",
    borderRadius: 13,
    flex: 1,
    height: sy(46),
    justifyContent: "center",
  },
  segmentSelected: {
    backgroundColor: COLORS.olive,
    ...Platform.select({
      ios: {
        shadowColor: "#3A4E28",
        shadowOpacity: 0.18,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 3 },
    }),
  },
  segmentText: {
    color: COLORS.muted,
    fontSize: s(15),
    fontWeight: "500",
  },
  segmentTextSelected: {
    color: "#F7F7F2",
    fontWeight: "700",
  },

  // ── Status banners ────────────────────────────────────────────────────────
  statusBanner: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: sy(4),
    paddingHorizontal: sx(16),
    paddingVertical: sy(10),
  },
  statusBannerError: {
    backgroundColor: COLORS.dangerBg,
    borderColor: COLORS.error,
  },
  statusBannerSuccess: {
    backgroundColor: COLORS.oliveSoft,
    borderColor: COLORS.olive,
  },
  statusBannerText: {
    fontSize: s(13),
    fontWeight: "600",
    lineHeight: s(18),
    textAlign: "center",
  },
  statusBannerTextError: {
    color: COLORS.danger,
  },
  statusBannerTextSuccess: {
    color: COLORS.olive,
  },

  // ── SurveySearchButton ────────────────────────────────────────────────────
  surveySearchButton: {
    alignItems: "center",
    backgroundColor: COLORS.input,
    borderColor: COLORS.line,
    borderRadius: sy(23),
    borderWidth: 1,
    flexDirection: "row",
    gap: sx(10),
    height: sy(50),
    paddingHorizontal: sx(14),
  },
  surveySearchButtonText: {
    color: COLORS.body,
    flex: 1,
    fontSize: s(16),
    fontWeight: "500",
  },

  // ── StepFooter ────────────────────────────────────────────────────────────
  stepFooter: {
    flexDirection: "row",
    gap: sx(10),
    marginTop: sy(28),
  },
  stepFooterProminent: {
    marginTop: sy(32),
  },
  stepFooterBack: {
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderColor: COLORS.line,
    borderRadius: sy(28),
    borderWidth: 1,
    flexDirection: "row",
    gap: sx(2),
    height: sy(56),
    justifyContent: "center",
    paddingHorizontal: sx(14),
    width: sx(108),
  },
  stepFooterBackProminent: {
    height: sy(60),
    width: sx(112),
  },
  stepFooterBackText: {
    color: COLORS.muted,
    fontSize: s(15),
    fontWeight: "600",
  },
  stepFooterNext: {
    alignItems: "center",
    backgroundColor: COLORS.oliveDark,
    borderRadius: sy(28),
    flex: 1,
    flexDirection: "row",
    gap: sx(4),
    height: sy(56),
    justifyContent: "center",
    paddingHorizontal: sx(18),
    ...shadowButton,
  },
  stepFooterNextFull: {
    flex: 0,
    width: "100%",
  },
  stepFooterNextProminent: {
    height: sy(60),
  },
  stepFooterNextDisabled: {
    backgroundColor: COLORS.oliveDisabled,
    opacity: 0.85,
  },
  stepFooterNextText: {
    color: COLORS.ctaText,
    fontSize: s(17),
    fontWeight: "700",
  },

  // ── OptionalEmptyState ────────────────────────────────────────────────────
  emptyState: {
    paddingVertical: sy(8),
  },
  emptyTitle: {
    color: COLORS.muted,
    fontSize: s(14),
    fontWeight: "500",
    lineHeight: s(20),
  },
  emptyDescription: {
    color: COLORS.subtle,
    fontSize: s(13),
    lineHeight: s(19),
    marginTop: sy(6),
  },
  optionalSkipButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: COLORS.oliveSoft,
    borderColor: COLORS.olive,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: "center",
    marginTop: sy(14),
    minHeight: sy(52),
    paddingHorizontal: sx(16),
    paddingVertical: sy(13),
  },
  optionalSkipButtonText: {
    color: COLORS.olive,
    fontSize: s(15),
    fontWeight: "700",
  },

  // ── Load error ────────────────────────────────────────────────────────────
  loadErrorBox: {
    alignItems: "center",
    backgroundColor: COLORS.dangerBg,
    borderColor: COLORS.error,
    borderRadius: 12,
    borderWidth: 1,
    gap: sy(10),
    marginBottom: sy(12),
    paddingHorizontal: sx(16),
    paddingVertical: sy(12),
  },
  loadErrorText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    textAlign: "center",
  },
  loadErrorRetry: {
    alignItems: "center",
    backgroundColor: COLORS.oliveSoft,
    borderColor: COLORS.olive,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: sy(40),
    minWidth: sx(120),
    paddingHorizontal: sx(20),
    paddingVertical: sy(10),
  },
  loadErrorRetryText: {
    color: COLORS.olive,
    fontSize: 14,
    fontWeight: "800",
  },

  pressed: {
    opacity: 0.72,
  },
});

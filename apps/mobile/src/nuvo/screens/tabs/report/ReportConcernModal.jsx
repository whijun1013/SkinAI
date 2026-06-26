import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, FONT } from "./reportTheme";

export default function ReportConcernModal({
  visible,
  concernNote,
  concernModalError,
  isCreatingAnalysis,
  lastContributingFactors,
  onChangeNote,
  onClose,
  onSkip,
  onConfirm,
}) {
  const factors = Array.isArray(lastContributingFactors) ? lastContributingFactors : [];
  const factorLabel =
    factors.length >= 2
      ? `'${factors[0]}'·'${factors[1]}'`
      : factors.length === 1
        ? `'${factors[0]}'`
        : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {factorLabel ? (
            <View style={styles.prevPatternHint}>
              <Ionicons name="trending-up-outline" size={15} color={COLORS.olive} />
              <Text style={styles.prevPatternText}>
                지난 리포트에서 {factorLabel} 흐름이 보였어요.{"\n"}
                이번에도 같은 흐름인지, 아니면 다른 게 더 궁금한지 적어보세요.
              </Text>
            </View>
          ) : null}

          <Text style={styles.title}>
            {factorLabel ? "이번엔 어떤 점이 신경 쓰이나요?" : "어떤 점이 걱정되시나요?"}
          </Text>
          <Text style={styles.description}>
            특정 화장품, 식단, 수면 등 신경 쓰이는 게 있다면 적어주세요.{"\n"}
            없으면 건너뛰어도 괜찮아요.
          </Text>

          <TextInput
            style={styles.input}
            value={concernNote}
            onChangeText={onChangeNote}
            placeholder="예: 요즘 새로운 크림 쓰기 시작했어요"
            placeholderTextColor={COLORS.muted}
            multiline
            maxLength={100}
            returnKeyType="done"
            blurOnSubmit
          />

          {concernModalError ? (
            <Text style={styles.errorText}>{concernModalError}</Text>
          ) : null}

          <View style={styles.buttons}>
            <Pressable
              style={({ pressed }) => [
                styles.skipBtn,
                isCreatingAnalysis && styles.btnDisabled,
                pressed && styles.pressed,
              ]}
              onPress={onSkip}
              disabled={isCreatingAnalysis}
            >
              <Text style={styles.skipText}>건너뛰기</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.confirmBtn,
                isCreatingAnalysis && styles.btnDisabled,
                pressed && styles.pressed,
              ]}
              onPress={onConfirm}
              disabled={isCreatingAnalysis}
            >
              {isCreatingAnalysis ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.confirmText}>시작하기</Text>
              )}
            </Pressable>
          </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,20,15,0.40)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  sheet: {
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 20,
  },
  prevPatternHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    backgroundColor: COLORS.oliveSoft,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 14,
  },
  prevPatternText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: FONT.bold,
    color: COLORS.olive,
  },
  title: {
    fontSize: 17,
    lineHeight: 24,
    fontFamily: FONT.extraBold,
    color: COLORS.text,
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONT.medium,
    color: COLORS.muted,
    marginBottom: 14,
  },
  input: {
    borderRadius: 14,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONT.medium,
    color: COLORS.text,
    minHeight: 88,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  errorText: {
    marginBottom: 10,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: FONT.bold,
    color: COLORS.warning,
  },
  buttons: { flexDirection: "row", gap: 10 },
  skipBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: {
    fontSize: 14,
    fontFamily: FONT.extraBold,
    color: COLORS.olive,
  },
  confirmBtn: {
    flex: 2,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: COLORS.olive,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: {
    fontSize: 14,
    fontFamily: FONT.extraBold,
    color: COLORS.white,
  },
  btnDisabled: { opacity: 0.60 },
  pressed:     { opacity: 0.72 },
});

import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { sx, s } from "../../../../utils/responsive";
import TermsOfServiceScreen from "../../mypage/TermsOfServiceScreen";
import PrivacyPolicyScreen from "../../mypage/PrivacyPolicyScreen";

const COLORS = {
  text: "#1F2520",
  oliveDeep: "#4F603C",
  line: "#D9D6CC",
  card: "#FFFCF7",
  cardBorder: "#D9D6CC",
  inputBg: "#FCFAF6",
  white: "#FFFFFF",
  bg: "#F8F7F2",
};

const shadowCard =
  Platform.OS === "ios"
    ? {
        shadowColor: "#4C5D3B",
        shadowOpacity: 0.1,
        shadowRadius: s(14),
        shadowOffset: { width: 0, height: s(9) },
      }
    : { elevation: 4 };

export default function AuthTermsConsent({
  termsAgreed,
  privacyAgreed,
  onTermsAgreedChange,
  onPrivacyAgreedChange,
  style,
}) {
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  return (
    <>
      <View style={[styles.termsCard, style]}>
        <TouchableOpacity
          activeOpacity={0.78}
          style={styles.termsRow}
          onPress={() => onTermsAgreedChange(!termsAgreed)}
        >
          <View style={[styles.termsCheck, termsAgreed && styles.termsCheckActive]}>
            {termsAgreed ? (
              <Ionicons name="checkmark" size={s(12)} color={COLORS.white} />
            ) : null}
          </View>
          <Text style={styles.termsText} numberOfLines={1}>
            <Text style={styles.termsRequired}>[필수] </Text>
            이용약관 동의
          </Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              setTermsModalOpen(true);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {({ pressed }) => (
              <Text style={[styles.termsViewLink, pressed && { opacity: 0.6 }]}>
                전문 보기
              </Text>
            )}
          </Pressable>
        </TouchableOpacity>

        <View style={styles.termsDivider} />

        <TouchableOpacity
          activeOpacity={0.78}
          style={styles.termsRow}
          onPress={() => onPrivacyAgreedChange(!privacyAgreed)}
        >
          <View style={[styles.termsCheck, privacyAgreed && styles.termsCheckActive]}>
            {privacyAgreed ? (
              <Ionicons name="checkmark" size={s(12)} color={COLORS.white} />
            ) : null}
          </View>
          <Text style={styles.termsText} numberOfLines={1}>
            <Text style={styles.termsRequired}>[필수] </Text>
            개인정보 처리방침 동의
          </Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              setPrivacyModalOpen(true);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {({ pressed }) => (
              <Text style={[styles.termsViewLink, pressed && { opacity: 0.6 }]}>
                전문 보기
              </Text>
            )}
          </Pressable>
        </TouchableOpacity>
      </View>

      <Modal
        visible={termsModalOpen}
        animationType="slide"
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        onRequestClose={() => setTermsModalOpen(false)}
        onDismiss={() => setTermsModalOpen(false)}
      >
        <SafeAreaView
          style={styles.modalSafeArea}
          edges={Platform.OS === "ios" ? ["bottom"] : ["top", "left", "right", "bottom"]}
        >
          <TermsOfServiceScreen onBack={() => setTermsModalOpen(false)} />
        </SafeAreaView>
      </Modal>

      <Modal
        visible={privacyModalOpen}
        animationType="slide"
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        onRequestClose={() => setPrivacyModalOpen(false)}
        onDismiss={() => setPrivacyModalOpen(false)}
      >
        <SafeAreaView
          style={styles.modalSafeArea}
          edges={Platform.OS === "ios" ? ["bottom"] : ["top", "left", "right", "bottom"]}
        >
          <PrivacyPolicyScreen onBack={() => setPrivacyModalOpen(false)} />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  termsCard: {
    width: "100%",
    maxWidth: sx(350),
    alignSelf: "center",
    borderRadius: s(20),
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: sx(18),
    paddingVertical: 4,
    ...shadowCard,
  },

  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: sx(10),
  },

  termsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.line,
  },

  termsCheck: {
    width: s(22),
    height: s(22),
    borderRadius: s(11),
    borderWidth: 1.5,
    borderColor: COLORS.line,
    backgroundColor: COLORS.inputBg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  termsCheckActive: {
    backgroundColor: COLORS.oliveDeep,
    borderColor: COLORS.oliveDeep,
  },

  termsText: {
    flex: 1,
    fontSize: s(13),
    lineHeight: s(18),
    color: COLORS.text,
    fontWeight: "600",
  },

  termsRequired: {
    color: COLORS.oliveDeep,
    fontWeight: "800",
  },

  termsViewLink: {
    fontSize: s(11.5),
    fontWeight: "700",
    color: COLORS.oliveDeep,
    textDecorationLine: "underline",
    flexShrink: 0,
  },

  modalSafeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
});

import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { sx, s } from "../../../../utils/responsive";
import TermsOfServiceScreen from "../../mypage/TermsOfServiceScreen";
import PrivacyPolicyScreen from "../../mypage/PrivacyPolicyScreen";

const C = {
  text:        "#1F2520",
  olive:       "#4F603C",
  line:        "#DDD9D0",
  fieldBg:     "rgba(255,252,247,0.92)",
  fieldBorder: "#D9D5CB",
  white:       "#FFFFFF",
  muted:       "#9E9A92",
  required:    "#4F603C",
  checkBorder: "#C6C1B6",
  modalBg:     "#F4F5F0",
};

const fieldShadow =
  Platform.OS === "ios"
    ? { shadowColor: "#C8C4BA", shadowOpacity: 0.10, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }
    : { elevation: 1 };

const SCREEN_H = Dimensions.get("window").height;
const ANIM_MS  = 320;

// ── 전문 보기 시트 ──────────────────────────────────────────────────────────────
function TermsDocumentSheet({ visible, onClose, children }) {
  const insets     = useSafeAreaInsets();
  const topMargin  = insets.top + 8;
  const sheetH     = SCREEN_H - topMargin;

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetY          = useRef(new Animated.Value(sheetH)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1, duration: ANIM_MS, useNativeDriver: true,
        }),
        Animated.timing(sheetY, {
          toValue: 0, duration: ANIM_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0, duration: 240, useNativeDriver: true,
        }),
        Animated.timing(sheetY, {
          toValue: sheetH, duration: 260, useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal
      visible={mounted}
      animationType="none"
      presentationStyle="overFullScreen"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* 딤 배경 — fade only */}
      <Animated.View
        style={[styles.sheetBackdrop, { opacity: backdropOpacity }]}
        pointerEvents="none"
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      {/* 시트 — slide only */}
      <Animated.View
        style={[
          styles.sheetContainer,
          { height: sheetH, marginTop: topMargin, transform: [{ translateY: sheetY }] },
        ]}
      >
        <SafeAreaView style={styles.sheetSafeArea} edges={["bottom"]}>
          {children}
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────────────────────
export default function AuthTermsConsent({
  termsAgreed,
  privacyAgreed,
  onTermsAgreedChange,
  onPrivacyAgreedChange,
  style,
}) {
  const [termsOpen,   setTermsOpen]   = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <>
      <View style={[styles.wrapper, style]}>
        {/* 이용약관 */}
        <TouchableOpacity
          activeOpacity={0.75}
          style={[styles.row, termsAgreed && styles.rowActive]}
          onPress={() => onTermsAgreedChange(!termsAgreed)}
        >
          <View style={[styles.check, termsAgreed && styles.checkActive]}>
            {termsAgreed && <Ionicons name="checkmark" size={s(11)} color={C.white} />}
          </View>
          <Text style={styles.rowText} numberOfLines={1}>
            <Text style={styles.required}>[필수] </Text>
            이용약관 동의
          </Text>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); setTermsOpen(true); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 4 }}
          >
            {({ pressed }) => (
              <View style={[styles.linkBtn, pressed && { opacity: 0.5 }]}>
                <Text style={styles.linkText}>전문 보기</Text>
                <Ionicons name="chevron-forward" size={s(10)} color={C.olive} />
              </View>
            )}
          </Pressable>
        </TouchableOpacity>

        <View style={styles.innerDivider} />

        {/* 개인정보 처리방침 */}
        <TouchableOpacity
          activeOpacity={0.75}
          style={[styles.row, privacyAgreed && styles.rowActive]}
          onPress={() => onPrivacyAgreedChange(!privacyAgreed)}
        >
          <View style={[styles.check, privacyAgreed && styles.checkActive]}>
            {privacyAgreed && <Ionicons name="checkmark" size={s(11)} color={C.white} />}
          </View>
          <Text style={styles.rowText} numberOfLines={1}>
            <Text style={styles.required}>[필수] </Text>
            개인정보 처리방침 동의
          </Text>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); setPrivacyOpen(true); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 4 }}
          >
            {({ pressed }) => (
              <View style={[styles.linkBtn, pressed && { opacity: 0.5 }]}>
                <Text style={styles.linkText}>전문 보기</Text>
                <Ionicons name="chevron-forward" size={s(10)} color={C.olive} />
              </View>
            )}
          </Pressable>
        </TouchableOpacity>
      </View>

      <TermsDocumentSheet visible={termsOpen}   onClose={() => setTermsOpen(false)}>
        <TermsOfServiceScreen onBack={() => setTermsOpen(false)} />
      </TermsDocumentSheet>

      <TermsDocumentSheet visible={privacyOpen} onClose={() => setPrivacyOpen(false)}>
        <PrivacyPolicyScreen onBack={() => setPrivacyOpen(false)} />
      </TermsDocumentSheet>
    </>
  );
}

const styles = StyleSheet.create({
  // ── 약관 컨테이너 ────────────────────────────────────────────────────────────
  wrapper: {
    width: "100%",
    maxWidth: sx(350),
    alignSelf: "center",
    backgroundColor: C.fieldBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.fieldBorder,
    overflow: "hidden",
    ...fieldShadow,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sx(10),
    paddingVertical: sx(13),
    paddingHorizontal: sx(16),
  },

  rowActive: { backgroundColor: "rgba(232,239,220,0.5)" },

  innerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.fieldBorder,
    marginHorizontal: sx(16),
  },

  check: {
    width: s(20),
    height: s(20),
    borderRadius: s(6),
    borderWidth: 1.5,
    borderColor: C.checkBorder,
    backgroundColor: "rgba(255,255,255,0.8)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  checkActive: { backgroundColor: C.olive, borderColor: C.olive },

  rowText: {
    flex: 1,
    fontSize: s(13),
    lineHeight: s(18),
    color: C.text,
    fontWeight: "600",
  },

  required: { color: C.required, fontWeight: "800" },

  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },

  linkText: {
    fontSize: s(11),
    fontWeight: "600",
    color: C.olive,
  },

  // ── 전문 보기 시트 ───────────────────────────────────────────────────────────
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(18,30,14,0.52)",
  },

  sheetContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.modalBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },

  sheetSafeArea: {
    flex: 1,
    backgroundColor: C.modalBg,
  },
});

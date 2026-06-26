import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import ScreenHeader from "./ScreenHeader";
import { APP_URLS } from "../../../constants/urls";

const COLORS = {
  bg: "#F7F8F5",
  olive: "#4F603C",
  oliveSoft: "#E4EBD8",
  oliveMid: "#C8D8A8",
  card: "#FFFFFF",
  chip: "#F2F4EE",
  text: "#1A1F17",
  muted: "#8A9080",
  line: "#E2E5DA",
};

const MENU_ITEMS = [
  {
    title: "이용약관",
    description: "서비스 이용 시 적용되는 약관을 확인해요.",
    icon: "document-text-outline",
    action: "termsOfService",
    tag: "필수 동의",
  },
  {
    title: "개인정보 처리방침",
    description: "수집하는 개인정보의 항목과 이용 목적을 안내해요.",
    icon: "lock-closed-outline",
    action: "privacyPolicy",
    tag: "필수 동의",
  },
  {
    title: "데이터 보호 안내",
    description: "데이터 보관 기간과 보호 정책을 확인해요.",
    icon: "shield-checkmark-outline",
    action: "dataProtection",
    tag: "권장 확인",
  },
  {
    title: "고객 지원",
    description: "서비스 이용 중 불편한 점을 문의하세요.",
    icon: "help-buoy-outline",
    action: "openSupport",
    tag: "문의",
  },
];

export default function TermsPrivacyMenuScreen({ onBack, onNavigate }) {
  return (
    <View style={styles.root}>
      <ScreenHeader title="약관 및 개인정보" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── 안내 배너 ── */}
        <View style={styles.banner}>
          <View style={styles.bannerIconWrap}>
            <Ionicons name="document-text" size={22} color={COLORS.olive} />
          </View>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>약관 및 개인정보</Text>
            <Text style={styles.bannerSub}>nuvo 서비스의 주요 약관과 정책을 확인하세요</Text>
          </View>
        </View>

        {/* ── 메뉴 카드 ── */}
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.action}
            style={styles.menuCard}
            activeOpacity={0.75}
            onPress={() => {
              if (item.action === "openSupport") {
                WebBrowser.openBrowserAsync(APP_URLS.support);
              } else {
                onNavigate?.(item.action);
              }
            }}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name={item.icon} size={22} color={COLORS.olive} />
            </View>

            <View style={styles.menuBody}>
              <View style={styles.menuTitleRow}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <View style={styles.menuTag}>
                  <Text style={styles.menuTagText}>{item.tag}</Text>
                </View>
              </View>
              <Text style={styles.menuDesc}>{item.description}</Text>
            </View>

            <View style={styles.menuArrow}>
              <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
            </View>
          </TouchableOpacity>
        ))}

        {/* ── 하단 안내 ── */}
        <View style={styles.footnote}>
          <Ionicons name="information-circle-outline" size={13} color={COLORS.muted} style={{ marginTop: 1 }} />
          <Text style={styles.footnoteText}>
            약관 및 정책은 서비스 변경에 따라 업데이트될 수 있어요.
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

const shadow = Platform.OS === "ios"
  ? { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }
  : { elevation: 2 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 48 },

  /* ── 배너 ── */
  banner: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: COLORS.card,
    borderRadius: 18, borderWidth: 1, borderColor: COLORS.line,
    paddingVertical: 16, paddingHorizontal: 16,
    marginBottom: 16,
    ...shadow,
  },
  bannerIconWrap: {
    width: 48, height: 48, borderRadius: 15,
    backgroundColor: COLORS.oliveSoft,
    borderWidth: 1, borderColor: COLORS.oliveMid,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text, marginBottom: 3, letterSpacing: -0.2 },
  bannerSub: { fontSize: 12, color: COLORS.muted, fontWeight: "500", lineHeight: 17 },

  /* ── 메뉴 카드 ── */
  menuCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.line,
    paddingVertical: 18, paddingHorizontal: 16,
    marginBottom: 8,
    gap: 14,
    ...shadow,
  },
  menuIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  menuBody: { flex: 1 },
  menuTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  menuTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  menuTag: {
    paddingHorizontal: 7, paddingVertical: 2,
    backgroundColor: COLORS.chip, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.line,
  },
  menuTagText: { fontSize: 10, fontWeight: "600", color: COLORS.muted },
  menuDesc: { fontSize: 12, color: COLORS.muted, fontWeight: "500", lineHeight: 17 },
  menuArrow: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: COLORS.chip,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },

  /* ── 안내 ── */
  footnote: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    marginTop: 8, paddingHorizontal: 2,
  },
  footnoteText: { flex: 1, fontSize: 12, color: COLORS.muted, fontWeight: "500", lineHeight: 18 },
});

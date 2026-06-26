import React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenHeader from "./ScreenHeader";

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

const SECTIONS = [
  {
    id: 1,
    icon: "lock-closed-outline",
    title: "데이터 암호화 및 안전한 저장",
    items: [
      "NUVO는 사용자의 개인정보와 피부 데이터를 안전하게 보호하기 위해 최신 암호화 기술을 적용하고 있습니다.",
      "서버와 클라이언트 간에 전송되는 모든 데이터는 안전한 보안 채널(SSL/TLS)을 통해 보호됩니다.",
    ],
  },
  {
    id: 2,
    icon: "key-outline",
    title: "접근 권한 통제",
    items: [
      "사용자 데이터에 대한 접근은 서비스 운영 및 기능 제공을 위해 필수적인 업무를 수행하는 최소한의 인력으로 엄격하게 제한됩니다.",
      "권한이 없는 접근을 원천적으로 차단하기 위한 내부 보안 가이드라인과 시스템 모니터링을 지속 운영하고 있습니다.",
    ],
  },
  {
    id: 3,
    icon: "search-outline",
    title: "보안 점검 및 모니터링",
    items: [
      "클라우드 인프라와 애플리케이션의 취약점을 정기적으로 분석하고 패치를 적용하여 외부 위협으로부터 데이터를 보호합니다.",
      "비정상적인 접근 시도를 탐지하고 신속하게 대응할 수 있도록 24시간 보안 관제 체계를 유지합니다.",
    ],
  },
  {
    id: 4,
    icon: "shield-checkmark-outline",
    title: "사용자 권장 보안 수칙",
    items: [
      "타인이 쉽게 유추할 수 없는 안전한 비밀번호를 설정하고 주기적으로 변경해 주세요.",
      "공용 와이파이 환경에서는 민감한 정보 전송에 유의해 주시기 바랍니다.",
    ],
  },
];

export default function DataProtectionScreen({ onBack }) {
  return (
    <View style={styles.root}>
      <ScreenHeader title="데이터 보호 안내" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* 보안 하이라이트 */}
        <View style={styles.highlights}>
          {[
            { icon: "lock-closed", label: "암호화 저장" },
            { icon: "shield-checkmark", label: "접근 통제" },
            { icon: "pulse", label: "24h 모니터링" },
          ].map((item) => (
            <View key={item.label} style={styles.highlightItem}>
              <View style={styles.highlightIconWrap}>
                <Ionicons name={item.icon} size={18} color={COLORS.olive} />
              </View>
              <Text style={styles.highlightLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* 섹션 카드 */}
        {SECTIONS.map((sec) => (
          <View key={sec.id} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name={sec.icon} size={16} color={COLORS.olive} />
              </View>
              <Text style={styles.sectionNum}>{`0${sec.id}`}</Text>
              <Text style={styles.sectionTitle}>{sec.title}</Text>
            </View>
            <View style={styles.bulletList}>
              {sec.items.map((text, i) => (
                <View key={i} style={styles.bulletItem}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{text}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.version}>최종 업데이트 2026.06.10  ·  버전 1.0.0</Text>
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

  /* 하이라이트 */
  highlights: {
    flexDirection: "row", gap: 8, marginBottom: 14,
  },
  highlightItem: {
    flex: 1, backgroundColor: COLORS.card,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.line,
    paddingVertical: 14, alignItems: "center", gap: 6,
    ...shadow,
  },
  highlightIconWrap: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center", justifyContent: "center",
  },
  highlightLabel: { fontSize: 11, fontWeight: "700", color: COLORS.text, textAlign: "center" },

  sectionCard: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.line,
    padding: 18, marginBottom: 8,
    ...shadow,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionIconWrap: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center", justifyContent: "center",
  },
  sectionNum: { fontSize: 11, fontWeight: "800", color: COLORS.oliveMid, letterSpacing: 0.5 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: COLORS.text },

  bulletList: { gap: 8 },
  bulletItem: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bulletDot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: COLORS.oliveMid, marginTop: 8, flexShrink: 0,
  },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 21, color: COLORS.text, fontWeight: "500" },

  version: { textAlign: "center", fontSize: 11, color: COLORS.muted, opacity: 0.6 },
});

import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenHeader from "./ScreenHeader";

const COLORS = {
  background: "#F8F7F2",
  olive: "#4F603C",
  oliveMuted: "#4A5D4E",
  oliveSoft: "#EEF0E6",
  card: "#FFFFFF",
  text: "#2D2D2D",
  muted: "#7A8A6A",
  border: "#E0DDD4",
};

const protectionContent = [
  {
    id: 1,
    title: "데이터 암호화 및 안전한 저장",
    icon: "lock-closed-outline",
    items: [
      "Luvel은 사용자의 개인정보와 피부 데이터를 안전하게 보호하기 위해 최신 암호화 기술을 적용하고 있습니다.",
      "서버와 클라이언트 간에 전송되는 모든 데이터는 안전한 보안 채널(SSL/TLS)을 통해 보호됩니다."
    ]
  },
  {
    id: 2,
    title: "접근 권한 통제",
    icon: "key-outline",
    items: [
      "사용자 데이터에 대한 접근은 서비스 운영 및 기능 제공을 위해 필수적인 업무를 수행하는 최소한의 인력으로 엄격하게 제한됩니다.",
      "권한이 없는 접근을 원천적으로 차단하기 위한 내부 보안 가이드라인과 시스템 모니터링을 지속 운영하고 있습니다."
    ]
  },
  {
    id: 3,
    title: "보안 점검 및 모니터링",
    icon: "search-outline",
    items: [
      "클라우드 인프라와 애플리케이션의 취약점을 정기적으로 분석하고 패치를 적용하여 외부 위협으로부터 데이터를 보호합니다.",
      "비정상적인 접근 시도를 탐지하고 신속하게 대응할 수 있도록 24시간 보안 관제 체계를 유지합니다."
    ]
  },
  {
    id: 4,
    title: "사용자 권장 보안 수칙",
    icon: "shield-checkmark-outline",
    items: [
      "타인이 쉽게 유추할 수 없는 안전한 비밀번호를 설정하고 주기적으로 변경해 주세요.",
      "공용 와이파이 환경에서는 민감한 정보 전송에 유의해 주시기 바랍니다."
    ]
  }
];

export default function DataProtectionScreen({ onBack }) {
  const { width } = useWindowDimensions();
  const isCompact = width <= 390;

  return (
    <View style={styles.root}>
      <ScreenHeader title="데이터 보호 안내" onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.content, isCompact && styles.contentCompact]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.titleSection, isCompact && styles.titleSectionCompact]}>
          <Text style={[styles.mainTitle, isCompact && styles.mainTitleCompact]}>데이터 보호 안내</Text>
          <Text style={[styles.subTitle, isCompact && styles.subTitleCompact]}>
            소중한 기록과 개인정보를 최우선으로 보호하기 위한{"\n"}Luvel의 보안 정책을 안내해 드립니다.
          </Text>
        </View>

        <View style={[styles.cardContainer, isCompact && styles.cardContainerCompact]}>
          {protectionContent.map((section, index) => (
            <View key={section.id} style={[styles.sectionItem, index !== protectionContent.length - 1 && styles.sectionDivider]}>
              <View style={styles.sectionHeader}>
                <View style={styles.iconCircle}>
                  <Ionicons name={section.icon} size={17} color={COLORS.olive} />
                </View>
                <Text style={[styles.sectionTitle, isCompact && styles.sectionTitleCompact]}>{`${section.id}. ${section.title}`}</Text>
              </View>
              
              <View style={styles.bulletList}>
                {section.items.map((text, idx) => (
                  <View key={idx} style={styles.bulletItem}>
                    <View style={styles.bulletPoint} />
                    <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}>{text}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

const shadowCard = Platform.OS === "ios" ? { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 } : { elevation: 2 };

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
  },
  contentCompact: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  titleSection: {
    marginBottom: 14,
  },
  titleSectionCompact: {
    marginBottom: 12,
  },
  mainTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 6,
  },
  mainTitleCompact: {
    fontSize: 22,
    lineHeight: 28,
  },
  subTitle: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.muted,
    fontWeight: "500",
  },
  subTitleCompact: {
    fontSize: 13,
    lineHeight: 20,
  },
  cardContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 18,
    paddingVertical: 4,
    ...shadowCard,
  },
  cardContainerCompact: {
    paddingHorizontal: 16,
  },
  sectionItem: {
    paddingVertical: 16,
  },
  sectionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: COLORS.text,
  },
  sectionTitleCompact: {
    fontSize: 15,
    lineHeight: 21,
  },
  bulletList: {
    paddingLeft: 2,
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 7,
  },
  bulletPoint: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.muted,
    marginTop: 8,
    marginRight: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.text,
    fontWeight: "500",
  },
  bulletTextCompact: {
    fontSize: 13,
    lineHeight: 21,
  }
});

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

const termsContent = [
  {
    id: 1,
    title: "서비스 목적",
    icon: "leaf-outline",
    items: [
      "Luvel은 사용자의 피부 및 라이프스타일 기록을 기반으로 맞춤형 인사이트와 리포트를 제공하여 더 나은 일상 관리를 돕는 서비스입니다.",
      "기타 회사가 추가 개발하거나 제휴계약 등을 통해 회원에게 제공하는 일체의 서비스를 포함합니다."
    ]
  },
  {
    id: 2,
    title: "계정 및 이용",
    icon: "person-outline",
    items: [
      "서비스 이용을 위해 계정 생성이 필요합니다.",
      "계정 정보는 정확하게 입력해 주시고, 타인과 공유하지 마세요.",
      "하나의 계정은 한 사용자가 이용하는 것을 원칙으로 합니다.",
      "타인의 사진을 무단으로 업로드하여 발생하는 초상권 및 개인정보 침해 책임은 사용자 본인에게 있습니다."
    ]
  },
  {
    id: 3,
    title: "데이터 및 피부 분석 정보 활용",
    icon: "bar-chart-outline",
    items: [
      "기록한 피부 및 생활 데이터는 분석 및 리포트 제공 목적으로 사용됩니다.",
      "데이터는 사용자의 동의 없이 외부에 제공되지 않습니다.",
      "보다 나은 서비스를 위해 익명화된 데이터가 통계 분석에 활용될 수 있습니다."
    ]
  },
  {
    id: 4,
    title: "유의 사항",
    icon: "shield-checkmark-outline",
    items: [
      "Luvel은 개인의 기록을 바탕으로 참고 정보를 제공합니다.",
      "본 서비스는 피부 고민 분석 및 트러블 케어 가이드를 제공하며, 전문의 진료를 대체하지 않습니다. 분석 알고리즘 특성상 오류가 있을 수 있습니다.",
      "사용자 본인의 판단과 책임 하에 서비스를 이용해 주세요.",
      "서비스 정책은 관련 법령 및 내부 정책에 따라 변경될 수 있으며, 중요 변경 시 사전 안내드립니다."
    ]
  }
];

export default function TermsOfServiceScreen({ onBack }) {
  const { width } = useWindowDimensions();
  const isCompact = width <= 390;

  return (
    <View style={styles.root}>
      <ScreenHeader title="이용약관" onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.content, isCompact && styles.contentCompact]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.titleSection, isCompact && styles.titleSectionCompact]}>
          <Text style={[styles.mainTitle, isCompact && styles.mainTitleCompact]}>이용약관</Text>
          <Text style={[styles.subTitle, isCompact && styles.subTitleCompact]}>
            Luvel 서비스를 이용하시기 전, 아래 내용을{"\n"}확인해 주세요.
          </Text>
        </View>

        <View style={[styles.cardContainer, isCompact && styles.cardContainerCompact]}>
          {termsContent.map((section, index) => (
            <View key={section.id} style={[styles.sectionItem, index !== termsContent.length - 1 && styles.sectionDivider]}>
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

        <View style={styles.footerBanner}>
          <View style={styles.bannerHeader}>
            <View style={styles.bannerIconCircle}>
              <Ionicons name="shield-checkmark" size={14} color="#FFFFFF" />
            </View>
            <Text style={styles.bannerText}>
              <Text style={{ fontWeight: "800", color: COLORS.olive }}>Luvel</Text>은 기록 데이터를 기반으로 한 관찰 및 참고 정보를 제공하는 서비스입니다. 피부 고민 분석 및 트러블 케어 가이드를 제공하며, 의학적 진단·처방을 목적으로 하지 않습니다. 건강 관련 결정은 반드시 전문가와 상담 후 진행해 주세요.
            </Text>
          </View>
        </View>

        <View style={styles.versionInfo}>
          <Text style={styles.versionText}>최종 업데이트 2026.06.10  |  버전 1.0.0</Text>
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
  },
  footerBanner: {
    marginTop: 16,
    backgroundColor: COLORS.oliveSoft,
    borderRadius: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: "#E2E5D5",
  },
  bannerHeader: {
    flexDirection: "row",
  },
  bannerIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.oliveMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 2,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.oliveMuted,
    fontWeight: "600",
  },
  versionInfo: {
    marginTop: 18,
    alignItems: "center",
  },
  versionText: {
    fontSize: 11,
    color: "#A0A0A0",
    fontWeight: "500",
  }
});

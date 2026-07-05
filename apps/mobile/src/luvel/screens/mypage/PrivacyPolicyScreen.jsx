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

export default function PrivacyPolicyScreen({ onBack }) {
  const { width } = useWindowDimensions();
  const isCompact = width <= 390;

  return (
    <View style={styles.root}>
      <ScreenHeader title="개인정보 처리방침" onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.content, isCompact && styles.contentCompact]}
        showsVerticalScrollIndicator={false}
      >
        
        <View style={[styles.topBanner, isCompact && styles.topBannerCompact]}>
          <View style={styles.bannerIconCircle}>
            <Ionicons name="shield-checkmark" size={17} color="#FFFFFF" />
          </View>
          <View style={styles.bannerTextWrap}>
            <Text style={[styles.bannerTitle, isCompact && styles.bannerTitleCompact]}>
              Luvel은 사용자의 개인정보를{"\n"}안전하게 보호하고, 투명하게 관리합니다.
            </Text>
            <Text style={[styles.bannerDesc, isCompact && styles.bannerDescCompact]}>
              Luvel은 관련 법령을 준수하며, 사용자의 소중한 개인정보를 안전하게 처리하기 위해 최선을 다합니다.
            </Text>
          </View>
        </View>

        <View style={[styles.cardContainer, isCompact && styles.cardContainerCompact]}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconCircle}>
              <Ionicons name="person-outline" size={17} color={COLORS.olive} />
            </View>
            <Text style={[styles.sectionTitle, isCompact && styles.sectionTitleCompact]}>1. 수집 항목</Text>
          </View>
          <Text style={[styles.sectionIntro, isCompact && styles.sectionIntroCompact]}>서비스 제공을 위해 다음 정보를 수집합니다.</Text>
          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <View style={styles.bulletPoint} />
              <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}><Text style={{fontWeight: '700'}}>계정 정보:</Text> 이메일 주소, 비밀번호(암호화), 닉네임, 성별</Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bulletPoint} />
              <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}><Text style={{fontWeight: '700'}}>피부 기록:</Text> 피부 타입, 얼굴 사진, 기록 및 분석 데이터</Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bulletPoint} />
              <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}><Text style={{fontWeight: '700'}}>생활 습관:</Text> 수면, 스트레스, 운동 등 환경 로그 정보</Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bulletPoint} />
              <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}><Text style={{fontWeight: '700'}}>식단 정보:</Text> 식사 기록, 영양 섭취 정보</Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bulletPoint} />
              <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}><Text style={{fontWeight: '700'}}>기기 및 이용 정보:</Text> 기기 정보, 앱 사용 기록, 접속 로그</Text>
            </View>
          </View>
          <Text style={[styles.noticeText, isCompact && styles.noticeTextCompact]}>* 얼굴 사진 등 민감정보는 명시적 동의 하에 수집됩니다.</Text>
        </View>

        <View style={[styles.cardContainer, isCompact && styles.cardContainerCompact]}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconCircle}>
              <Ionicons name="locate-outline" size={17} color={COLORS.olive} />
            </View>
            <Text style={[styles.sectionTitle, isCompact && styles.sectionTitleCompact]}>2. 이용 목적</Text>
          </View>
          <Text style={[styles.sectionIntro, isCompact && styles.sectionIntroCompact]}>수집한 개인정보는 다음의 목적을 위해 사용됩니다.</Text>
          
          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <View style={styles.bulletPoint} />
              <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}>개인 맞춤형 피부 분석 및 인사이트 제공</Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bulletPoint} />
              <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}>생활 습관 및 식단 기반 맞춤 리포트 제공</Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bulletPoint} />
              <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}>서비스 개선 및 AI 분석 알고리즘 고도화</Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bulletPoint} />
              <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}>고객 문의 응대 및 중요 공지 안내</Text>
            </View>
          </View>
        </View>

        <View style={[styles.cardContainer, isCompact && styles.cardContainerCompact]}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconCircle}>
              <Ionicons name="lock-closed-outline" size={17} color={COLORS.olive} />
            </View>
            <Text style={[styles.sectionTitle, isCompact && styles.sectionTitleCompact]}>3. 보관 기간 및 외부 위탁</Text>
          </View>
          <Text style={[styles.sectionIntro, isCompact && styles.sectionIntroCompact]}>개인정보는 수집 및 이용 목적이 달성된 후, 다음 기간 동안 보관합니다.</Text>
          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <View style={styles.bulletPoint} />
              <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}>회원 탈퇴 시: 즉시 파기</Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bulletPoint} />
              <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}>얼굴 사진: AI 분석 목적 달성 즉시 원칙적 파기</Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bulletPoint} />
              <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}>관련 법령에 따른 보존 필요 시: 법령에서 정한 기간 보관</Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bulletPoint} />
              <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}>위탁 업무: 피부 분석 및 식단 기록 분석 처리</Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bulletPoint} />
              <Text style={[styles.bulletText, isCompact && styles.bulletTextCompact]}>위탁 안내: 원활한 AI 분석을 위해 OpenAI, Gemini 등의 외부 서비스로 데이터가 암호화되어 전송될 수 있습니다.</Text>
            </View>
          </View>
        </View>

        <View style={[styles.cardContainer, isCompact && styles.cardContainerCompact]}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconCircle}>
              <Ionicons name="person-circle-outline" size={17} color={COLORS.olive} />
            </View>
            <Text style={[styles.sectionTitle, isCompact && styles.sectionTitleCompact]}>4. 사용자 권리</Text>
          </View>
          <Text style={[styles.sectionIntro, isCompact && styles.sectionIntroCompact]}>사용자는 언제든지 다음과 같은 권리를 행사할 수 있습니다.</Text>
          
          <View style={styles.actionGrid}>
            <View style={styles.actionBox}>
              <Ionicons name="eye-outline" size={18} color={COLORS.olive} />
              <Text style={[styles.actionText, isCompact && styles.actionTextCompact]}>내 정보 확인</Text>
            </View>
            <View style={styles.actionBox}>
              <Ionicons name="create-outline" size={18} color={COLORS.olive} />
              <Text style={[styles.actionText, isCompact && styles.actionTextCompact]}>정보 수정 요청</Text>
            </View>
            <View style={styles.actionBox}>
              <Ionicons name="download-outline" size={18} color={COLORS.olive} />
              <Text style={[styles.actionText, isCompact && styles.actionTextCompact]}>데이터 다운로드</Text>
            </View>
            <View style={styles.actionBox}>
              <Ionicons name="trash-outline" size={18} color={COLORS.olive} />
              <Text style={[styles.actionText, isCompact && styles.actionTextCompact]}>회원 탈퇴 및 삭제</Text>
            </View>
          </View>
          <Text style={[styles.noticeText, isCompact && styles.noticeTextCompact]}>권리 행사는 마이페이지 내 [권한] 또는 고객센터를 통해 요청하실 수 있습니다.</Text>
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
    paddingBottom: 34,
    paddingTop: 12,
  },
  contentCompact: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  topBanner: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginBottom: 14,
    ...shadowCard,
  },
  topBannerCompact: {
    padding: 16,
    marginBottom: 12,
  },
  bannerIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.oliveMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  bannerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.text,
    lineHeight: 24,
    marginBottom: 5,
  },
  bannerTitleCompact: {
    fontSize: 16,
    lineHeight: 22,
  },
  bannerDesc: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.muted,
    fontWeight: "500",
  },
  bannerDescCompact: {
    fontSize: 13,
    lineHeight: 20,
  },
  cardContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 12,
    ...shadowCard,
  },
  cardContainerCompact: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
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
  sectionIntro: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.text,
    fontWeight: "600",
    marginBottom: 9,
  },
  sectionIntroCompact: {
    fontSize: 13,
    lineHeight: 20,
  },
  bulletList: {
    paddingLeft: 4,
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
  noticeText: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: "#A0A0A0",
    fontWeight: "500",
  },
  noticeTextCompact: {
    fontSize: 11,
    lineHeight: 17,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  actionBox: {
    width: "48%",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    color: COLORS.text,
  }
  ,
  actionTextCompact: {
    fontSize: 10,
    lineHeight: 15,
  }
});

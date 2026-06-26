import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenHeader from "./ScreenHeader";

const C = {
  bg:        "#F4F5F0",
  text:      "#1A1F17",
  muted:     "#8A9080",
  olive:     "#4F603C",
  oliveSoft: "#E4EBD8",
  oliveMid:  "#7A9B58",
  line:      "#E0E3DA",
  chip:      "#ECEEE8",
  white:     "#FFFFFF",
};

const SECTIONS = [
  {
    id: 1,
    icon: "person-outline",
    title: "수집 항목",
    intro: "서비스 제공을 위해 다음 정보를 수집합니다.",
    items: [
      { label: "계정 정보",       value: "이메일, 비밀번호(암호화), 닉네임, 성별" },
      { label: "피부 기록",       value: "피부 타입, 얼굴 사진, 기록 및 분석 데이터" },
      { label: "생활 습관",       value: "수면, 스트레스, 운동 등 환경 로그" },
      { label: "식단 정보",       value: "식사 기록, 영양 섭취 정보" },
      { label: "기기 및 이용 정보", value: "기기 정보, 앱 사용 기록, 접속 로그" },
    ],
    notice: "얼굴 사진 등 민감정보는 명시적 동의 하에 수집됩니다.",
    type: "table",
  },
  {
    id: 2,
    icon: "locate-outline",
    title: "이용 목적",
    intro: "수집한 개인정보는 다음의 목적을 위해 사용됩니다.",
    items: [
      "개인 맞춤형 피부 분석 및 인사이트 제공",
      "생활 습관 및 식단 기반 맞춤 리포트 제공",
      "서비스 개선 및 AI 분석 알고리즘 고도화",
      "고객 문의 응대 및 중요 공지 안내",
    ],
    type: "bullet",
  },
  {
    id: 3,
    icon: "lock-closed-outline",
    title: "보관 기간 및 외부 위탁",
    intro: "개인정보는 수집 및 이용 목적 달성 후 아래 기간 동안 보관합니다.",
    items: [
      "회원 탈퇴 시: 즉시 파기",
      "얼굴 사진: AI 분석 완료 즉시 원칙적 파기",
      "관련 법령에 따른 보존 필요 시: 법령에서 정한 기간 보관",
      "위탁 안내: Azure OpenAI 등 외부 서비스로 데이터가 암호화되어 전송될 수 있습니다.",
    ],
    type: "bullet",
  },
  {
    id: 4,
    icon: "person-circle-outline",
    title: "사용자 권리",
    intro: "사용자는 언제든지 다음과 같은 권리를 행사할 수 있습니다.",
    items: [
      { label: "내 정보 확인",       value: "마이페이지에서 언제든지 내 계정·기록 정보를 확인할 수 있습니다." },
      { label: "정보 수정 요청",     value: "부정확한 개인정보는 수정을 요청할 수 있습니다." },
      { label: "데이터 다운로드",    value: "수집된 내 데이터를 내보내기 요청할 수 있습니다." },
      { label: "회원 탈퇴 및 삭제", value: "마이페이지에서 직접 탈퇴하거나 고객센터를 통해 삭제를 요청할 수 있습니다." },
    ],
    notice: "권리 행사는 마이페이지 내 [내 정보] 또는 고객센터를 통해 요청하실 수 있습니다.",
    type: "table",
  },
];

export default function PrivacyPolicyScreen({ onBack }) {
  return (
    <View style={styles.root}>
      <ScreenHeader title="개인정보 처리방침" onBack={onBack} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {SECTIONS.map((sec, idx) => (
          <View key={sec.id}>
            {/* 섹션 헤더 */}
            <View style={styles.secHeader}>
              <View style={styles.secIconWrap}>
                <Ionicons name={sec.icon} size={15} color={C.olive} />
              </View>
              <View style={styles.secTitleWrap}>
                <Text style={styles.secNum}>{String(sec.id).padStart(2, "0")}</Text>
                <Text style={styles.secTitle}>{sec.title}</Text>
              </View>
            </View>

            {sec.intro ? (
              <Text style={styles.secIntro}>{sec.intro}</Text>
            ) : null}

            {/* 테이블 형태 */}
            {sec.type === "table" && (
              <View style={styles.table}>
                {sec.items.map((item, i) => (
                  <View
                    key={i}
                    style={[styles.tableRow, i < sec.items.length - 1 && styles.tableRowBorder]}
                  >
                    <View style={styles.tableLabelWrap}>
                      <Text style={styles.tableLabel}>{item.label}</Text>
                    </View>
                    <Text style={styles.tableValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* 불릿 형태 */}
            {sec.type === "bullet" && (
              <View style={styles.bulletList}>
                {sec.items.map((text, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{text}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* 주의 메모 */}
            {sec.notice ? (
              <View style={styles.noticeInline}>
                <Ionicons name="alert-circle-outline" size={12} color={C.muted} style={{ marginTop: 1 }} />
                <Text style={styles.noticeInlineText}>{sec.notice}</Text>
              </View>
            ) : null}

            {idx < SECTIONS.length - 1 && <View style={styles.secDivider} />}
          </View>
        ))}

        <Text style={styles.version}>최종 업데이트 2026.06.10  ·  v 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 52 },

  secHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  secIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: C.oliveSoft,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  secTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  secNum: {
    fontSize: 10, fontWeight: "800",
    color: C.oliveMid, letterSpacing: 0.5,
  },
  secTitle: {
    fontSize: 15, fontWeight: "700",
    color: C.text, flex: 1,
  },
  secIntro: {
    fontSize: 12.5, lineHeight: 19,
    color: C.muted, fontWeight: "400",
    marginBottom: 10, paddingLeft: 44,
  },

  /* 테이블 */
  table: {
    marginLeft: 44,
    marginBottom: 4,
    gap: 6,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: C.chip,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tableRowBorder: {},
  tableLabelWrap: {
    backgroundColor: C.oliveSoft,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: "flex-start",
    flexShrink: 0,
  },
  tableLabel: { fontSize: 11, fontWeight: "700", color: C.olive },
  tableValue: { flex: 1, fontSize: 12.5, fontWeight: "400", color: C.text, lineHeight: 19 },

  /* 불릿 */
  bulletList: { paddingLeft: 44, gap: 8, marginBottom: 4 },
  bulletRow:  { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bulletDot:  {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: C.oliveMid, marginTop: 9, flexShrink: 0,
  },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 21, color: C.text, fontWeight: "400" },

  /* 인라인 주의 */
  noticeInline: {
    flexDirection: "row", alignItems: "flex-start",
    gap: 5, paddingLeft: 44, marginTop: 8,
  },
  noticeInlineText: {
    flex: 1, fontSize: 11.5, lineHeight: 17,
    color: C.muted, fontWeight: "400",
  },

  secDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.line,
    marginVertical: 20,
  },

  version: { textAlign: "center", fontSize: 11, color: C.muted, opacity: 0.55, marginTop: 16 },
});

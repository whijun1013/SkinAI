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
};

const SECTIONS = [
  {
    id: 1,
    icon: "leaf-outline",
    title: "서비스 목적",
    items: [
      "NUVO는 사용자의 피부 및 라이프스타일 기록을 기반으로 맞춤형 인사이트와 리포트를 제공하여 더 나은 일상 관리를 돕는 서비스입니다.",
      "기타 회사가 추가 개발하거나 제휴계약 등을 통해 회원에게 제공하는 일체의 서비스를 포함합니다.",
    ],
  },
  {
    id: 2,
    icon: "person-outline",
    title: "계정 및 이용",
    items: [
      "서비스 이용을 위해 계정 생성이 필요합니다.",
      "계정 정보는 정확하게 입력해 주시고, 타인과 공유하지 마세요.",
      "하나의 계정은 한 사용자가 이용하는 것을 원칙으로 합니다.",
      "타인의 사진을 무단으로 업로드하여 발생하는 초상권 및 개인정보 침해 책임은 사용자 본인에게 있습니다.",
    ],
  },
  {
    id: 3,
    icon: "bar-chart-outline",
    title: "데이터 및 피부 분석 정보 활용",
    items: [
      "기록한 피부 및 생활 데이터는 분석 및 리포트 제공 목적으로 사용됩니다.",
      "데이터는 사용자의 동의 없이 외부에 제공되지 않습니다.",
      "보다 나은 서비스를 위해 익명화된 데이터가 통계 분석에 활용될 수 있습니다.",
    ],
  },
  {
    id: 4,
    icon: "shield-checkmark-outline",
    title: "유의 사항",
    items: [
      "NUVO는 개인의 기록을 바탕으로 참고 정보를 제공합니다.",
      "본 서비스는 의학적 진단이나 치료를 대체하지 않으며, 분석 알고리즘 특성상 오류가 있을 수 있습니다.",
      "사용자 본인의 판단과 책임 하에 서비스를 이용해 주세요.",
      "서비스 정책은 관련 법령 및 내부 정책에 따라 변경될 수 있으며, 중요 변경 시 사전 안내드립니다.",
    ],
  },
];

export default function TermsOfServiceScreen({ onBack }) {
  return (
    <View style={styles.root}>
      <ScreenHeader title="이용약관" onBack={onBack} />
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

            {/* 항목 목록 */}
            <View style={styles.itemList}>
              {sec.items.map((text, i) => (
                <View key={i} style={styles.itemRow}>
                  <View style={styles.itemDot} />
                  <Text style={styles.itemText}>{text}</Text>
                </View>
              ))}
            </View>

            {idx < SECTIONS.length - 1 && <View style={styles.secDivider} />}
          </View>
        ))}

        {/* 면책 고지 */}
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={13} color={C.muted} style={{ marginTop: 1 }} />
          <Text style={styles.noticeText}>
            <Text style={{ fontWeight: "700", color: C.olive }}>NUVO</Text>는 관찰·참고 정보를 제공하는 서비스입니다. 의학적 진단·치료·처방을 목적으로 하지 않으며, 건강 관련 결정은 반드시 전문가와 상담 후 진행해 주세요.
          </Text>
        </View>

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
    marginBottom: 12,
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

  itemList: { paddingLeft: 44, gap: 8, marginBottom: 4 },
  itemRow:  { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  itemDot:  {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: C.oliveMid, marginTop: 9, flexShrink: 0,
  },
  itemText: { flex: 1, fontSize: 13, lineHeight: 21, color: C.text, fontWeight: "400" },

  secDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.line,
    marginVertical: 20,
  },

  notice: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: C.chip,
    borderRadius: 12,
    borderWidth: 1, borderColor: C.line,
    padding: 14,
    marginTop: 24, marginBottom: 16,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: C.muted, fontWeight: "400" },

  version: { textAlign: "center", fontSize: 11, color: C.muted, opacity: 0.55 },
});

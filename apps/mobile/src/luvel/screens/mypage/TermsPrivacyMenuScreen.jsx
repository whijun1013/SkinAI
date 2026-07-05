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

const menuItems = [
  {
    title: "이용약관",
    description: "서비스 이용약관을 확인할 수 있어요.",
    icon: "document-text-outline",
    action: "termsOfService",
  },
  {
    title: "개인정보 처리방침",
    description: "개인정보 수집 및 이용에 대한 안내",
    icon: "document-text-outline", // Using document-text since specific custom icon might not exist in Ionicons
    action: "privacyPolicy",
  },
  {
    title: "데이터 보호 안내",
    description: "데이터 보관 및 보호 정책 안내",
    icon: "shield-checkmark-outline",
    action: "dataProtection",
  }
];

export default function TermsPrivacyMenuScreen({ onBack, onNavigate }) {
  return (
    <View style={styles.root}>
      <ScreenHeader title="약관 및 개인정보" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.menuCard}>
          {menuItems.map((item, index) => {
            return (
              <TouchableOpacity
                key={item.title}
                style={[
                  styles.menuItem,
                  index !== menuItems.length - 1 && styles.menuDivider,
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  if (item.action) {
                    onNavigate?.(item.action);
                  }
                }}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name={item.icon} size={20} color={COLORS.olive} />
                </View>

                <View style={styles.itemTextWrap}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemDescription}>{item.description}</Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const shadowCard =
  Platform.OS === "ios"
    ? {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      }
    : {
        elevation: 2,
      };

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 40,
  },
  menuCard: {
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    ...shadowCard,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  itemTextWrap: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: COLORS.text,
  },
  itemDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: COLORS.muted,
  },
});

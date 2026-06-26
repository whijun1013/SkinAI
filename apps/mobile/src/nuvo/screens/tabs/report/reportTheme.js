import { Platform } from "react-native";

export const COLORS = {
  bg:        "#F7F8F5",
  surface:   "#FFFFFF",
  line:      "#E2E5DA",
  olive:     "#4F603C",
  oliveSoft: "#E4EBD8",
  text:      "#1A1F17",
  muted:     "#8A9080",
  warning:   "#A45F48",
  white:     "#FFFFFF",
};

export const FONT = {
  medium:    "Pretendard-Medium",
  bold:      "Pretendard-Bold",
  extraBold: "Pretendard-ExtraBold",
};

export const shadowCard =
  Platform.OS === "ios"
    ? {
        shadowColor:   "#000000",
        shadowOpacity: 0.07,
        shadowRadius:  10,
        shadowOffset:  { width: 0, height: 2 },
      }
    : { elevation: 2 };

export const getScoreMood = (score) => {
  if (score >= 5) return { emoji: "😊", label: "아주 좋아요" };
  if (score >= 4) return { emoji: "🙂", label: "좋아요" };
  if (score >= 3) return { emoji: "😐", label: "보통이에요" };
  if (score >= 2) return { emoji: "😕", label: "조금 아쉬워요" };
  if (score >= 1) return { emoji: "😣", label: "관리가 필요해요" };
  return { emoji: "○", label: "점수 없음" };
};

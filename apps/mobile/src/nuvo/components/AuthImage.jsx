import React, { useCallback, useEffect, useRef, useState } from "react";

import { ActivityIndicator, Animated, Image, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const RESIZE_MODE = {
  cover: "cover",
  contain: "contain",
  fill: "stretch",
  none: "center",
};

const PLACEHOLDER_COLOR = "#FCFAF6";
const ALLOWED_URI_PREFIXES = ["http://", "https://", "file://", "content://", "data:image/"];

export function isSupportedImageUri(uri) {
  if (typeof uri !== "string") return false;
  const trimmed = uri.trim();
  if (!trimmed || trimmed.startsWith("demo://")) return false;
  return ALLOWED_URI_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

/** 로컬 file:// 또는 API SAS photo_url 이미지 — 로딩 스피너·실패 fallback·페이드인 포함 */
export default function AuthImage({ uri, style, contentFit = "cover", ...props }) {
  const [status, setStatus] = useState("loading"); // "loading" | "loaded" | "error"
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // uri가 바뀌면 상태를 초기화해 이전 이미지가 잔상으로 남지 않도록 함
  useEffect(() => {
    setStatus("loading");
    fadeAnim.setValue(0);
  }, [uri, fadeAnim]);

  const handleLoad = useCallback(() => {
    setStatus("loaded");
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleError = useCallback(() => {
    setStatus("error");
  }, []);

  if (!isSupportedImageUri(uri)) return null;

  return (
    <View style={[style, styles.wrap]}>
      {/* 로딩 중: 배경색 위에 스피너 */}
      {status === "loading" && (
        <View style={styles.overlay}>
          <ActivityIndicator size="small" color="#B8B09A" />
        </View>
      )}

      {/* 실패: 카메라 아이콘 */}
      {status === "error" && (
        <View style={styles.overlay}>
          <Ionicons name="image-outline" size={28} color="#C8C0A8" />
        </View>
      )}

      {/* 이미지: 페이드인 */}
      <Animated.Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, styles.image, { opacity: fadeAnim }]}
        resizeMode={RESIZE_MODE[contentFit] ?? "cover"}
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    backgroundColor: PLACEHOLDER_COLOR,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PLACEHOLDER_COLOR,
  },
});

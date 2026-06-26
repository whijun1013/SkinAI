import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import useAuthStore from "../../../stores/authStore";
import { sx, sy, s, BASE_HEIGHT, scaleY } from "../../../utils/responsive";
import AuthTermsConsent from "./components/AuthTermsConsent";

// 작은 화면에서 세로 여백을 더 줄임 (932pt 기준)
const vy = (value) => sy(value * (scaleY < 0.82 ? 0.72 : 1));


const COLORS = {
  bg: "#F8F7F2",
  text: "#1F2520",
  muted: "#8B9184",
  oliveDeep: "#4F603C",
  oliveSecondary: "#2E7D50",
  oliveButton: "#4F603C",
  oliveDisabled: "#B9C5A8",
  oliveSoft: "#E8EEDD",
  circleBg: "#E6E9DB",
  line: "#D9D6CC",
  card: "#FFFCF7",
  cardBorder: "#D9D6CC",
  inputBg: "#FCFAF6",
  ctaText: "#F7F7F2",
  white: "#FFFFFF",
  kakao: "#FEE500",
  naver: "#03C75A",
  error: "#E05252",
};

const SAVED_LOGIN_EMAIL_KEY = "saved_login_email";
const REMEMBER_LOGIN_EMAIL_KEY = "remember_login_email";

/** Android는 insets.bottom이 0인 기기가 많아 최소 여백을 둠 */
const FOOTER_BOTTOM_GAP = vy(18);
const ANDROID_MIN_BOTTOM_INSET = 16;
/** BASE_HEIGHT(932) 대비 짧은 화면 — SE·소형 Android 등 */
const COMPACT_HEIGHT_RATIO = 0.82;

const SOCIALS = [
  {
    key: "google",
    label: "Google",
    backgroundColor: COLORS.white,
    textColor: COLORS.text,
    borderColor: COLORS.line,
    logoSource: require("../../../../assets/google-logo.png"),
    logoSize: 19,
  },
  {
    key: "kakao",
    label: "카카오",
    backgroundColor: COLORS.kakao,
    textColor: "#2A2412",
    borderColor: "#D9CB76",
    logoSource: require("../../../../assets/kakao-logo.png"),
    logoSize: 28,
  },
  {
    key: "naver",
    label: "네이버",
    backgroundColor: COLORS.naver,
    textColor: COLORS.white,
    borderColor: COLORS.naver,
    logoSource: require("../../../../assets/naver-logo.png"),
    logoSize: 28,
  },
];

export default function LoginScreen({
  resetKey,
  onLogin,
  onSignup,
  onForgotPassword,
  onSocialLogin,
}) {
  const passwordRef = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [fieldError, setFieldError] = useState({ message: "", field: null });
  const [statusMessage, setStatusMessage] = useState("");
  const [statusVariant, setStatusVariant] = useState("error");
  const { login, isLoading, requestPasswordReset, completeSocialLoginAfterTerms } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [socialTermsOpen, setSocialTermsOpen] = useState(false);
  const [sheetMounted, setSheetMounted] = useState(false);
  const [pendingSocialProvider, setPendingSocialProvider] = useState(null);
  const [pendingSocialTokens, setPendingSocialTokens] = useState(null);
  const [socialTermsAgreed, setSocialTermsAgreed] = useState(false);
  const [socialPrivacyAgreed, setSocialPrivacyAgreed] = useState(false);

  const sheetBackdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(600)).current;
  const closeSheetRef = useRef(null);

  const sheetPanResponder = useRef(
    PanResponder.create({
      // 탭(tap)은 자식 버튼/체크박스에게 넘기고, 스와이프만 가져옴
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) sheetTranslateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.6) {
          closeSheetRef.current?.();
        } else {
          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
        }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (socialTermsOpen) {
      setSheetMounted(true);
      sheetBackdropOpacity.setValue(0);
      sheetTranslateY.setValue(600);
      Animated.parallel([
        Animated.timing(sheetBackdropOpacity, {
          toValue: 1,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
          speed: 14,
        }),
      ]).start();
    }
  }, [socialTermsOpen]);

  const isAuthBusy = isLoading || isSocialLoading || isResettingPassword;

  const clearFeedback = () => {
    setFieldError({ message: "", field: null });
    setStatusMessage("");
  };

  const showFieldError = (message, field) => {
    setStatusMessage("");
    setFieldError({ message, field });
  };

  const showStatus = (message, variant = "error") => {
    setFieldError({ message: "", field: null });
    setStatusMessage(message);
    setStatusVariant(variant);
  };

  const isEmailError =
    fieldError.field === "email" || fieldError.field === "general";
  const isPasswordError =
    fieldError.field === "password" || fieldError.field === "general";

  useEffect(() => {
    let isMounted = true;

    const restoreSavedEmail = async () => {
      try {
        const [savedEmail, rememberValue] = await Promise.all([
          SecureStore.getItemAsync(SAVED_LOGIN_EMAIL_KEY),
          SecureStore.getItemAsync(REMEMBER_LOGIN_EMAIL_KEY),
        ]);
        const shouldRemember = rememberValue === "true" && !!savedEmail;

        if (!isMounted) return;

        setRememberEmail(shouldRemember);
        setEmail(shouldRemember ? savedEmail : "");
        setPassword("");
        setIsPasswordVisible(false);
      } catch (error) {
        if (!isMounted) return;
        setRememberEmail(false);
        setEmail("");
        setPassword("");
        setIsPasswordVisible(false);
      }
    };

    restoreSavedEmail();
    clearFeedback();

    return () => {
      isMounted = false;
    };
  }, [resetKey]);

  const handleLogin = async () => {
    if (isAuthBusy) return;

    const trimmedEmail = email.trim();
    clearFeedback();

    if (!trimmedEmail && !password) {
      showFieldError("이메일과 비밀번호를 입력해 주세요.", "general");
      return;
    }
    if (!trimmedEmail) {
      showFieldError("이메일을 입력해 주세요.", "email");
      return;
    }
    if (!password) {
      showFieldError("비밀번호를 입력해 주세요.", "password");
      return;
    }

    const result = await login(trimmedEmail, password);
    if (!result.success) {
      setPassword("");
      showFieldError(
        result.error || "이메일 또는 비밀번호가 일치하지 않습니다.",
        null
      );
      return;
    }

    try {
      if (rememberEmail) {
        await SecureStore.setItemAsync(SAVED_LOGIN_EMAIL_KEY, trimmedEmail);
        await SecureStore.setItemAsync(REMEMBER_LOGIN_EMAIL_KEY, "true");
      } else {
        await SecureStore.deleteItemAsync(SAVED_LOGIN_EMAIL_KEY);
        await SecureStore.deleteItemAsync(REMEMBER_LOGIN_EMAIL_KEY);
      }
    } catch (error) {
      console.log("Remember email error:", error.message);
    }

    setPassword("");
    onLogin?.(result);
  };

  const processSocialLoginResult = (result) => {
    if (!result) return;

    if (!result.success) {
      showFieldError(result.error || "소셜 로그인에 실패했습니다.", null);
      return;
    }

    if (result.requiresTerms) {
      setPendingSocialProvider(result.provider || "google");
      setPendingSocialTokens(result.pendingTokens);
      setSocialTermsAgreed(false);
      setSocialPrivacyAgreed(false);
      setSocialTermsOpen(true);
      return;
    }

    // 약관 불필요 (기존 유저) — 로그인 완료
    onLogin?.(result);
  };

  const handleSocialLogin = async (provider) => {
    if (isAuthBusy) return;
    clearFeedback();
    setIsSocialLoading(true);
    try {
      const result = await onSocialLogin?.(provider);
      processSocialLoginResult(result);
    } finally {
      setIsSocialLoading(false);
    }
  };

  const animateCloseSheet = (onComplete) => {
    Animated.parallel([
      Animated.timing(sheetBackdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 600,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSheetMounted(false);
      setSocialTermsOpen(false);
      onComplete?.();
    });
  };

  const closeSocialTermsModal = (showCancelNotice = false) => {
    animateCloseSheet(() => {
      setPendingSocialProvider(null);
      setPendingSocialTokens(null);
      setSocialTermsAgreed(false);
      setSocialPrivacyAgreed(false);
      if (showCancelNotice) {
        showStatus("약관에 동의해야 소셜 로그인을 이용할 수 있어요.", "error");
      }
    });
  };

  closeSheetRef.current = closeSocialTermsModal;

  const handleSocialTermsConfirm = async () => {
    if (!socialTermsAgreed || !socialPrivacyAgreed || !pendingSocialTokens || isAuthBusy) return;

    const tokens = pendingSocialTokens;
    animateCloseSheet(() => {
      setPendingSocialProvider(null);
      setPendingSocialTokens(null);
      setSocialTermsAgreed(false);
      setSocialPrivacyAgreed(false);
    });
    setIsSocialLoading(true);
    try {
      const result = await completeSocialLoginAfterTerms(tokens);
      if (!result.success) {
        showFieldError(result.error || "소셜 로그인에 실패했습니다.", null);
      } else {
        onLogin?.(result);
      }
    } finally {
      setIsSocialLoading(false);
    }
  };

  const sendPasswordReset = async (trimmedEmail) => {
    setIsResettingPassword(true);
    clearFeedback();
    try {
      const res = await requestPasswordReset(trimmedEmail);
      if (res.success) {
        showStatus(
          "비밀번호 재설정 이메일이 발송되었습니다. 메일함을 확인해 주세요.",
          "success"
        );
      } else {
        showStatus(res.error || "이메일 전송에 실패했습니다.", "error");
      }
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleForgotPassword = () => {
    if (onForgotPassword) {
      onForgotPassword();
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showFieldError("비밀번호를 찾으려면 먼저 이메일을 입력해 주세요.", "email");
      return;
    }

    Alert.alert(
      "비밀번호 찾기",
      `${trimmedEmail} 주소로 비밀번호 재설정 메일을 보내시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "전송",
          onPress: () => sendPasswordReset(trimmedEmail),
        },
      ]
    );
  };

  useEffect(() => {
    const onShow = (event) => {
      setKeyboardHeight(event?.endCoordinates?.height ?? 0);
    };
    const onHide = () => {
      setKeyboardHeight(0);
    };

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener("keyboardDidHide", onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const footerBottomOffset =
    Math.max(insets.bottom, Platform.OS === "android" ? ANDROID_MIN_BOTTOM_INSET : 0) +
    FOOTER_BOTTOM_GAP;

  const isKeyboardOpen = keyboardHeight > 0;
  const isCompactScreen = windowHeight / BASE_HEIGHT < COMPACT_HEIGHT_RATIO;

  // 키보드 올리면 로고는 항상 숨김 (모든 화면 공통)
  const showLogo = !isKeyboardOpen;
  // 작은 화면 + 키보드: 설명 문구까지 숨겨 입력 카드 공간 확보
  const showDescription = !isKeyboardOpen || !isCompactScreen;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <BackgroundDecorations />

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            !isKeyboardOpen && styles.scrollContentCentered,
            {
              paddingBottom: isKeyboardOpen
                ? footerBottomOffset + vy(12)
                : footerBottomOffset + vy(36),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.inner}>

              {/* ── 헤더 ── */}
              <View style={[styles.header, isKeyboardOpen && styles.headerCompact]}>
                {showLogo && (
                  <Image
                    source={require("../../../../assets/logo-nuvo.png")}
                    style={styles.logo}
                    resizeMode="contain"
                  />
                )}
                <Text style={styles.title}>
                  당신의 <Text style={styles.titleAccent}>피부 변화</Text> 여정
                </Text>
                {showDescription && (
                  <Text style={styles.desc}>
                    로그인하고 나의 피부 기록과 분석을{"\n"}안전하게 이어가 보세요
                  </Text>
                )}
              </View>

              {/* ── 입력 폼 (카드 없음) ── */}
              <View style={styles.form}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>이메일 주소</Text>
                  <View style={[styles.fieldWrap, isEmailError && styles.fieldWrapError]}>
                    <Ionicons
                      name="mail-outline"
                      size={s(17)}
                      color={isEmailError ? COLORS.error : COLORS.oliveDeep}
                      style={styles.fieldIcon}
                    />
                    <TextInput
                      value={email}
                      onChangeText={(v) => { setEmail(v); clearFeedback(); }}
                      placeholder="이메일 주소"
                      placeholderTextColor={COLORS.muted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      blurOnSubmit={false}
                      style={styles.fieldInput}
                    />
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>비밀번호</Text>
                  <View style={[styles.fieldWrap, isPasswordError && styles.fieldWrapError]}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={s(17)}
                      color={isPasswordError ? COLORS.error : COLORS.oliveDeep}
                      style={styles.fieldIcon}
                    />
                    <TextInput
                      ref={passwordRef}
                      value={password}
                      onChangeText={(v) => { setPassword(v); clearFeedback(); }}
                      placeholder="비밀번호를 입력해 주세요"
                      placeholderTextColor={COLORS.muted}
                      secureTextEntry={!isPasswordVisible}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="go"
                      onSubmitEditing={handleLogin}
                      style={styles.fieldPasswordInput}
                    />
                    <Pressable
                      onPress={() => setIsPasswordVisible((prev) => !prev)}
                      style={styles.eyeBtn}
                      hitSlop={10}
                    >
                      <Ionicons
                        name={isPasswordVisible ? "eye-off-outline" : "eye-outline"}
                        size={s(18)}
                        color={COLORS.muted}
                      />
                    </Pressable>
                  </View>
                </View>

                {(fieldError.message || statusMessage) ? (
                  <Text style={[
                    styles.feedbackText,
                    statusVariant === "success" && styles.feedbackSuccess,
                  ]}>
                    {fieldError.message || statusMessage}
                  </Text>
                ) : null}

                {/* 아이디 저장 + 비밀번호 찾기 */}
                <View style={styles.utilRow}>
                  <TouchableOpacity
                    activeOpacity={1}
                    style={styles.rememberRow}
                    onPress={() => setRememberEmail((prev) => !prev)}
                  >
                    <View style={[styles.checkbox, rememberEmail && styles.checkboxActive]}>
                      {rememberEmail && (
                        <Ionicons name="checkmark" size={s(11)} color={COLORS.white} />
                      )}
                    </View>
                    <Text style={styles.rememberText}>아이디 저장</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.74} onPress={handleForgotPassword}>
                    <Text style={styles.forgotText}>비밀번호 찾기</Text>
                  </TouchableOpacity>
                </View>

                {/* 로그인 버튼 */}
                <TouchableOpacity
                  activeOpacity={1}
                  style={[styles.ctaBtn, isAuthBusy && styles.ctaBtnLoading]}
                  onPress={handleLogin}
                  disabled={isAuthBusy}
                >
                  {isAuthBusy ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <>
                      <Text style={styles.ctaBtnText}>로그인</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={s(22)}
                        color={COLORS.white}
                        style={styles.ctaBtnIcon}
                      />
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* ── 소셜 구분선 ── */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerLabel}>소셜 계정으로 계속하기</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* ── 소셜 버튼 (원형 3개) ── */}
              <View style={styles.socialRow}>
                {SOCIALS.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={isAuthBusy ? 1 : 0.82}
                    style={[styles.socialItem, isAuthBusy && styles.socialItemDisabled]}
                    onPress={() => handleSocialLogin(item.key)}
                    disabled={isAuthBusy}
                  >
                    <View style={[
                      styles.socialCircle,
                      styles.socialCircleShadow,
                      { backgroundColor: item.backgroundColor, borderColor: item.borderColor },
                    ]}>
                      <Image
                        source={item.logoSource}
                        style={{ width: s(item.logoSize), height: s(item.logoSize) }}
                        resizeMode="contain"
                      />
                    </View>
                    <Text style={styles.socialLabel}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ── 회원가입 링크 ── */}
              <View style={styles.signupRow}>
                <Text style={styles.signupPrompt}>계정이 없으신가요?</Text>
                <TouchableOpacity activeOpacity={0.74} onPress={onSignup}>
                  <Text style={styles.signupLink}>회원가입</Text>
                </TouchableOpacity>
              </View>

            </View>
          </TouchableWithoutFeedback>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 보안 안내 */}
      <View style={[styles.securityBar, { bottom: footerBottomOffset }]} pointerEvents="none">
        <Ionicons name="shield-checkmark-outline" size={s(14)} color={COLORS.muted} />
        <Text style={styles.securityText}>NUVO는 당신의 데이터를 안전하게 보호합니다.</Text>
      </View>

      {/* ── 소셜 약관 바텀시트 ── */}
      <Modal
        visible={sheetMounted}
        animationType="none"
        presentationStyle="overFullScreen"
        transparent
        onRequestClose={() => closeSocialTermsModal(true)}
      >
        {(() => {
          const provider = SOCIALS.find((s) => s.key === pendingSocialProvider);
          const allAgreed = socialTermsAgreed && socialPrivacyAgreed;
          return (
            <View style={styles.socialTermsModal}>
              <Animated.View
                style={[styles.socialTermsBackdrop, { opacity: sheetBackdropOpacity }]}
              >
                <TouchableWithoutFeedback onPress={() => closeSocialTermsModal(true)}>
                  <View style={{ flex: 1 }} />
                </TouchableWithoutFeedback>
              </Animated.View>

              <Animated.View
                style={[
                  styles.socialTermsSheet,
                  { paddingBottom: insets.bottom + sy(20) },
                  { transform: [{ translateY: sheetTranslateY }] },
                ]}
                {...sheetPanResponder.panHandlers}
              >
                <View style={styles.socialTermsHandleArea}>
                  <View style={styles.socialTermsHandle} />
                </View>
                <View style={styles.socialTermsHeader}>
                  {provider && (
                    <View style={[
                      styles.socialTermsProviderBadge,
                      { backgroundColor: provider.backgroundColor, borderColor: provider.borderColor },
                    ]}>
                      <Image
                        source={provider.logoSource}
                        style={{ width: s(provider.logoSize), height: s(provider.logoSize) }}
                        resizeMode="contain"
                      />
                    </View>
                  )}
                  <Text style={styles.socialTermsTitle}>
                    {provider ? `${provider.label}로 계속하기` : "약관 동의"}
                  </Text>
                  <Text style={styles.socialTermsDescription}>
                    NUVO 서비스 이용을 위해 아래 약관에 동의해 주세요.
                  </Text>
                </View>
                <AuthTermsConsent
                  termsAgreed={socialTermsAgreed}
                  privacyAgreed={socialPrivacyAgreed}
                  onTermsAgreedChange={setSocialTermsAgreed}
                  onPrivacyAgreedChange={setSocialPrivacyAgreed}
                />
                <View style={styles.socialTermsActions}>
                  <TouchableOpacity
                    activeOpacity={allAgreed ? 0.88 : 1}
                    style={[
                      styles.socialTermsConfirmButton,
                      !allAgreed && styles.socialTermsConfirmButtonDisabled,
                    ]}
                    disabled={!allAgreed || isAuthBusy}
                    onPress={handleSocialTermsConfirm}
                  >
                    {isAuthBusy ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <Text style={[
                        styles.socialTermsConfirmText,
                        !allAgreed && styles.socialTermsConfirmTextDisabled,
                      ]}>
                        동의하고 계속
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.74} onPress={() => closeSocialTermsModal(true)}>
                    <Text style={styles.socialTermsCancelText}>취소</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </View>
          );
        })()}
      </Modal>
    </SafeAreaView>
  );
}

function BackgroundDecorations() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.bgBase} />
      <Image source={require("../../../../assets/leaf-shadow-right.png")} style={styles.topLeafShadow} resizeMode="contain" />
      <Image source={require("../../../../assets/leaf-left.png")} style={styles.leftLeaf} resizeMode="contain" />
      <View style={styles.topSoftCircle} />
      <View style={styles.centerGlow} />
      <View style={styles.bottomGlow} />
    </View>
  );
}

const shadowButton = Platform.OS === "ios"
  ? { shadowColor: "#4C5D3B", shadowOpacity: 0.18, shadowRadius: s(14), shadowOffset: { width: 0, height: s(6) } }
  : { elevation: 5 };

const styles = StyleSheet.create({
  safeArea:   { flex: 1, backgroundColor: COLORS.bg },
  screen:     { flex: 1 },
  scroll:     { flex: 1 },

  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: sx(24),
    paddingTop: vy(8),
  },
  scrollContentCentered: { justifyContent: "center" },

  inner: {
    width: "100%",
    maxWidth: sx(390),
    alignItems: "center",
  },

  // ── 헤더 ────────────────────────────────────────────────────────────────────
  header: {
    width: "100%",
    alignItems: "center",
    gap: vy(5),
    marginBottom: vy(28),
  },
  headerCompact: { marginBottom: vy(14), gap: vy(2) },

  logo: { width: sx(198), height: sy(72) },

  title: {
    fontSize: s(23),
    lineHeight: s(30),
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  titleAccent: { color: COLORS.oliveDeep },

  desc: {
    fontSize: s(13.2),
    lineHeight: s(20),
    color: COLORS.muted,
    textAlign: "center",
    fontWeight: "500",
  },

  // ── 폼 (카드 없음) ─────────────────────────────────────────────────────────
  form: { width: "100%" },

  fieldGroup:  { marginBottom: vy(12) },

  fieldLabel: {
    marginBottom: vy(6),
    fontSize: s(12),
    fontWeight: "700",
    color: COLORS.oliveDeep,
    letterSpacing: 0.1,
  },

  fieldWrap: {
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,252,247,0.92)",
    borderWidth: 1,
    borderColor: COLORS.line,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: sx(16),
    ...(Platform.OS === "ios"
      ? { shadowColor: "#C8C4BA", shadowOpacity: 0.10, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }
      : { elevation: 1 }),
  },
  fieldWrapError: {
    borderColor: COLORS.error,
    backgroundColor: "rgba(255,245,245,0.92)",
  },

  fieldIcon:  { marginRight: sx(8) },

  fieldInput: {
    flex: 1,
    fontSize: s(13.6),
    color: COLORS.text,
    paddingVertical: 0,
    ...(Platform.OS === "android"
      ? { includeFontPadding: false, textAlignVertical: "center" }
      : null),
  },
  fieldPasswordInput: {
    flex: 1,
    fontSize: s(13.6),
    color: COLORS.text,
    paddingVertical: 0,
    paddingRight: sx(8),
    ...(Platform.OS === "android"
      ? { includeFontPadding: false, textAlignVertical: "center" }
      : null),
  },

  eyeBtn: { width: s(28), height: s(28), alignItems: "center", justifyContent: "center" },

  feedbackText: {
    fontSize: s(12),
    color: COLORS.error,
    marginTop: vy(-4),
    marginBottom: vy(6),
    paddingHorizontal: sx(4),
  },
  feedbackSuccess: { color: COLORS.oliveDeep },

  // ── 유틸 행 (아이디 저장 + 비밀번호 찾기) ──────────────────────────────────
  utilRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: vy(14),
  },
  rememberRow: { flexDirection: "row", alignItems: "center" },
  checkbox: {
    width: s(18),
    height: s(18),
    borderRadius: s(9),
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: "rgba(255,252,247,0.92)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: sx(7),
  },
  checkboxActive: { borderColor: COLORS.oliveDeep, backgroundColor: COLORS.oliveDeep },
  rememberText: { fontSize: s(12.2), fontWeight: "600", color: COLORS.muted },
  forgotText:   { fontSize: s(12.2), fontWeight: "600", color: COLORS.oliveSecondary },

  // ── 로그인 버튼 ────────────────────────────────────────────────────────────
  ctaBtn: {
    height: vy(52),
    borderRadius: vy(26),
    backgroundColor: COLORS.oliveButton,
    alignItems: "center",
    justifyContent: "center",
    ...shadowButton,
  },
  ctaBtnLoading: { opacity: 0.8 },
  ctaBtnText: {
    color: COLORS.white,
    fontSize: s(15.4),
    fontWeight: "700",
    letterSpacing: -0.15,
  },
  ctaBtnIcon: { position: "absolute", right: sx(22) },

  // ── 구분선 ─────────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: vy(22),
    marginBottom: vy(14),
    width: "100%",
  },
  dividerLine:  { flex: 1, height: 1, backgroundColor: COLORS.line },
  dividerLabel: {
    marginHorizontal: sx(10),
    fontSize: s(11.5),
    fontWeight: "600",
    color: COLORS.muted,
  },

  // ── 소셜 버튼 (원형 3개) ──────────────────────────────────────────────────
  socialRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sx(52),
  },
  socialItem:         { alignItems: "center" },
  socialItemDisabled: { opacity: 0.5 },
  socialCircle: {
    width: s(52),
    height: s(52),
    borderRadius: s(26),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  socialCircleShadow: Platform.OS === "ios"
    ? { shadowColor: "#C8C4BA", shadowOpacity: 0.10, shadowRadius: s(8), shadowOffset: { width: 0, height: s(3) } }
    : { elevation: 2 },
  socialLabel: {
    marginTop: vy(6),
    fontSize: s(11.2),
    fontWeight: "700",
    color: COLORS.muted,
  },

  // ── 회원가입 링크 ──────────────────────────────────────────────────────────
  signupRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: vy(22),
    gap: sx(6),
  },
  signupPrompt: { fontSize: s(12.8), color: COLORS.muted, fontWeight: "500" },
  signupLink:   { fontSize: s(12.8), color: COLORS.oliveDeep, fontWeight: "800" },

  // ── 보안 안내 바 ───────────────────────────────────────────────────────────
  securityBar: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sx(5),
  },
  securityText: { fontSize: s(11.2), color: COLORS.muted, fontWeight: "500" },

  // ── 배경 데코 ──────────────────────────────────────────────────────────────
  bgBase:        { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.bg },
  topLeafShadow: {
    position: "absolute", top: sy(-46), left: sx(-44),
    width: sx(220), height: sy(250), opacity: 0.12,
    transform: [{ rotate: "180deg" }],
  },
  leftLeaf: {
    position: "absolute", top: sy(468), left: sx(-56),
    width: sx(154), height: sy(280), opacity: 0.2,
  },
  topSoftCircle: {
    position: "absolute", top: sy(118), right: sx(-84),
    width: sx(184), height: sx(184), borderRadius: sx(92),
    backgroundColor: COLORS.circleBg, opacity: 0.28,
  },
  centerGlow: {
    position: "absolute", top: sy(274), alignSelf: "center",
    width: sx(354), height: sx(354), borderRadius: sx(177),
    backgroundColor: COLORS.oliveSoft, opacity: 0.26,
  },
  bottomGlow: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    height: sy(248), backgroundColor: COLORS.bg, opacity: 0.46,
  },

  // ── 소셜 약관 바텀시트 ─────────────────────────────────────────────────────
  socialTermsModal:    { flex: 1, justifyContent: "flex-end" },
  socialTermsBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  socialTermsSheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: s(24),
    borderTopRightRadius: s(24),
    paddingHorizontal: sx(24),
    paddingTop: sy(4),
  },
  socialTermsHandleArea: { paddingTop: sy(10), paddingBottom: sy(8), alignItems: "center" },
  socialTermsHandle:     { width: sx(36), height: 4, borderRadius: 2, backgroundColor: COLORS.line },
  socialTermsHeader:     { alignItems: "center", marginBottom: sy(18) },
  socialTermsProviderBadge: {
    width: s(48), height: s(48), borderRadius: s(24), borderWidth: 1,
    alignItems: "center", justifyContent: "center", marginBottom: sy(10),
  },
  socialTermsTitle: {
    fontSize: s(18), lineHeight: s(25), fontWeight: "700",
    color: COLORS.oliveSecondary, textAlign: "center",
  },
  socialTermsDescription: {
    marginTop: sy(5), fontSize: s(12.8), lineHeight: s(19),
    color: COLORS.muted, textAlign: "center", fontWeight: "500",
  },
  socialTermsActions:              { marginTop: sy(18), alignItems: "center", gap: sy(12) },
  socialTermsConfirmButton: {
    width: "100%", maxWidth: sx(340), height: sy(52),
    borderRadius: sy(26), backgroundColor: COLORS.oliveButton,
    alignItems: "center", justifyContent: "center",
  },
  socialTermsConfirmButtonDisabled: { backgroundColor: COLORS.oliveDisabled },
  socialTermsConfirmText:           { color: COLORS.white, fontSize: s(15.6), fontWeight: "700" },
  socialTermsConfirmTextDisabled:   { color: COLORS.ctaText },
  socialTermsCancelText: { fontSize: s(13), lineHeight: s(18), color: COLORS.muted, fontWeight: "600" },
});

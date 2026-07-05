import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import useAuthStore from "../../../stores/authStore";
import { getRegisterErrorMessage } from "../../../utils/authErrors";
import { sx, sy, s, scaleY, BASE_HEIGHT } from "../../../utils/responsive";
import AuthTermsConsent from "./components/AuthTermsConsent";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COMPACT_HEIGHT_RATIO = 0.82;
const vy = (value) => sy(value * (scaleY < COMPACT_HEIGHT_RATIO ? 0.72 : 1));

const keyboardLayoutAnim = {
  duration: 220,
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

const BASE_WIDTH = 430;

const COLORS = {
  bg: "#F8F7F2",
  text: "#1F2520",
  muted: "#8B9184",
  oliveDeep: "#4F603C",
  oliveButton: "#4F603C",
  oliveSecondary: "#4A5D4E",
  oliveDisabled: "#B9C5A8",
  success: "#4F603C",
  warning: "#B97A5B",
  line: "#D9D6CC",
  card: "#FFFCF7",
  cardBorder: "#D9D6CC",
  inputBg: "#FCFAF6",
  inputErrorBg: "#FFF8F4",
  ctaText: "#F7F7F2",
  white: "#FFFFFF",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_LETTER_REGEX = /[A-Za-z]/;
const PASSWORD_NUMBER_REGEX = /\d/;

export default function SignupScreen({
  onSignup,
  onLoginPress,
  onSignupSuccess,
}) {
  const { isLoading } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupError, setSignupError] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    password: false,
    confirmPassword: false,
  });

  const clearSignupError = () => {
    if (signupError) setSignupError("");
  };

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();

  const isNameValid = trimmedName.length > 0;
  const isEmailValid = EMAIL_REGEX.test(trimmedEmail);
  const isPasswordValid =
    password.length >= 8 &&
    PASSWORD_LETTER_REGEX.test(password) &&
    PASSWORD_NUMBER_REGEX.test(password);
  const isConfirmPasswordValid =
    confirmPassword.length > 0 && confirmPassword === password;

  const isSignupEnabled =
    isNameValid &&
    isEmailValid &&
    isPasswordValid &&
    isConfirmPasswordValid &&
    termsAgreed &&
    privacyAgreed;

  const isKeyboardOpen = keyboardHeight > 0;
  const isCompactScreen = windowHeight / BASE_HEIGHT < COMPACT_HEIGHT_RATIO;
  const showLogo = !isKeyboardOpen;
  const showDescription = !isKeyboardOpen || !isCompactScreen;

  useEffect(() => {
    const onShow = (event) => {
      LayoutAnimation.configureNext(keyboardLayoutAnim);
      setKeyboardHeight(event?.endCoordinates?.height ?? 0);
    };
    const onHide = () => {
      LayoutAnimation.configureNext(keyboardLayoutAnim);
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

  const markTouched = (field) => {
    setTouched((prev) => ({
      ...prev,
      [field]: true,
    }));
  };

  const handleSignup = async () => {
    if (!isSignupEnabled || isLoading) return;
    setSignupError("");

    const signupPayload = {
      name: trimmedName,
      email: trimmedEmail,
      password,
    };

    const signupResult = await onSignup?.(signupPayload);
    if (signupResult?.success === false) {
      setSignupError(getRegisterErrorMessage(signupResult));
      return;
    }

    onSignupSuccess?.(signupPayload);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.root}>
          <BackgroundDecorations />

          <ScrollView
            style={styles.scrollView}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: vy(48) + insets.bottom }]}
            scrollIndicatorInsets={{ top: 0, bottom: 0 }}
          >
            {showLogo && (
              <Image
                source={require("../../../../assets/logo-luvel.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            )}

            <View style={[styles.titleBlock, !showLogo && styles.titleBlockCompact]}>
              <Text style={styles.title}>회원가입</Text>
              {showDescription && (
                <Text style={styles.description}>
                  피부 기록을 안전하게 이어가기 위한 정보를 입력해 주세요.
                </Text>
              )}
            </View>

            <View style={styles.formCard}>
              <InputField
                label="이름"
                icon="person-outline"
                value={name}
                onChangeText={(value) => { setName(value); clearSignupError(); }}
                onFocus={() => setFocusedField("name")}
                onBlur={() => {
                  setFocusedField(null);
                  markTouched("name");
                }}
                placeholder="이름을 입력해 주세요"
                textContentType="name"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => emailRef.current?.focus()}
                isFocused={focusedField === "name"}
                showFeedback={touched.name || name.length > 0}
                isValid={isNameValid}
                errorText="이름을 입력해 주세요."
              />

              <InputField
                inputRef={emailRef}
                label="이메일 주소"
                icon="mail-outline"
                value={email}
                onChangeText={(value) => { setEmail(value); clearSignupError(); }}
                onFocus={() => setFocusedField("email")}
                onBlur={() => {
                  setFocusedField(null);
                  markTouched("email");
                }}
                placeholder="you@example.com"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoCapitalize="none"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordRef.current?.focus()}
                isFocused={focusedField === "email"}
                showFeedback={touched.email || email.length > 0}
                isValid={isEmailValid}
                errorText="올바른 이메일 형식으로 입력해 주세요."
              />

              <InputField
                inputRef={passwordRef}
                label="비밀번호"
                icon="lock-closed-outline"
                value={password}
                onChangeText={(value) => { setPassword(value); clearSignupError(); }}
                onFocus={() => setFocusedField("password")}
                onBlur={() => {
                  setFocusedField(null);
                  markTouched("password");
                }}
                placeholder="영문과 숫자 포함 8자 이상"
                secureTextEntry={!isPasswordVisible}
                textContentType="newPassword"
                autoCapitalize="none"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                rightIcon={isPasswordVisible ? "eye-off-outline" : "eye-outline"}
                onPressRightIcon={() => setIsPasswordVisible((prev) => !prev)}
                isFocused={focusedField === "password"}
                showFeedback={touched.password || password.length > 0}
                isValid={isPasswordValid}
                errorText="비밀번호는 영문과 숫자를 포함해 8자 이상 입력해 주세요."
              />

              <InputField
                inputRef={confirmPasswordRef}
                label="비밀번호 확인"
                icon="checkmark-circle-outline"
                value={confirmPassword}
                onChangeText={(value) => { setConfirmPassword(value); clearSignupError(); }}
                onFocus={() => setFocusedField("confirmPassword")}
                onBlur={() => {
                  setFocusedField(null);
                  markTouched("confirmPassword");
                }}
                placeholder="비밀번호를 다시 입력해 주세요"
                secureTextEntry={!isConfirmVisible}
                textContentType="newPassword"
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleSignup}
                rightIcon={isConfirmVisible ? "eye-off-outline" : "eye-outline"}
                onPressRightIcon={() => setIsConfirmVisible((prev) => !prev)}
                isFocused={focusedField === "confirmPassword"}
                showFeedback={
                  touched.confirmPassword || confirmPassword.length > 0
                }
                isValid={isConfirmPasswordValid}
                errorText="비밀번호가 일치하지 않습니다."
              />
            </View>

            <AuthTermsConsent
              style={styles.termsCardSpacing}
              termsAgreed={termsAgreed}
              privacyAgreed={privacyAgreed}
              onTermsAgreedChange={setTermsAgreed}
              onPrivacyAgreedChange={setPrivacyAgreed}
            />

            {signupError ? (
              <Text style={styles.signupErrorText}>{signupError}</Text>
            ) : null}

            <TouchableOpacity
              activeOpacity={isSignupEnabled && !isLoading ? 0.88 : 1}
              style={[
                styles.signupButton,
                (!isSignupEnabled || isLoading) && styles.signupButtonDisabled,
              ]}
              disabled={!isSignupEnabled || isLoading}
              onPress={handleSignup}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Text
                    style={[
                      styles.signupButtonText,
                      !isSignupEnabled && styles.signupButtonTextDisabled,
                    ]}
                  >
                    회원가입
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={s(24)}
                    color={isSignupEnabled ? COLORS.white : COLORS.ctaText}
                    style={styles.signupButtonIcon}
                  />
                </>
              )}
            </TouchableOpacity>

            <View style={styles.loginRow}>
              <Text style={styles.loginPrompt}>이미 계정이 있으신가요?</Text>
              <TouchableOpacity activeOpacity={0.74} onPress={onLoginPress}>
                <Text style={styles.loginText}>로그인</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.securityNotice}>
              <Ionicons
                name="shield-checkmark-outline"
                size={s(17)}
                color={COLORS.oliveDeep}
              />
              <Text style={styles.securityText}>
                Luvel은 당신의 데이터를 안전하게 보호합니다.
              </Text>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function InputField({
  inputRef,
  label,
  icon,
  value,
  onChangeText,
  onFocus,
  onBlur,
  placeholder,
  keyboardType = "default",
  secureTextEntry = false,
  rightIcon,
  onPressRightIcon,
  autoCapitalize = "sentences",
  textContentType,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit,
  showFeedback = false,
  isValid = false,
  isFocused = false,
  errorText,
}) {
  const showError = showFeedback && !isValid;
  const showSuccess = showFeedback && isValid;

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View
        style={[
          styles.inputWrap,
          isFocused && !showError && styles.inputWrapFocused,
          showError && styles.inputWrapError,
          showSuccess && styles.inputWrapSuccess,
        ]}
      >
        <Ionicons
          name={icon}
          size={s(17)}
          color={showError ? COLORS.warning : COLORS.oliveDeep}
          style={styles.inputIcon}
        />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={COLORS.muted}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={blurOnSubmit}
          style={styles.input}
        />
        {showSuccess ? (
          <Ionicons
            name="checkmark-circle"
            size={s(18)}
            color={COLORS.success}
            style={styles.statusIcon}
          />
        ) : null}
        {rightIcon ? (
          <Pressable
            onPress={onPressRightIcon}
            style={styles.iconButton}
            hitSlop={10}
          >
            <Ionicons name={rightIcon} size={s(18)} color={COLORS.muted} />
          </Pressable>
        ) : null}
      </View>
      {showError ? <Text style={styles.errorText}>{errorText}</Text> : null}
    </View>
  );
}

function BackgroundDecorations() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.bgBase} />
      <Image
        source={require("../../../../assets/leaf-shadow-right.png")}
        style={styles.topLeafShadow}
        resizeMode="contain"
      />
      <Image
        source={require("../../../../assets/leaf-left.png")}
        style={styles.leftLeaf}
        resizeMode="contain"
      />
      <View style={styles.topSoftCircle} />
      <View style={styles.centerGlow} />
      <View style={styles.bottomGlow} />
    </View>
  );
}

const shadowCard =
  Platform.OS === "ios"
    ? {
        shadowColor: "#D7D0C2",
        shadowOpacity: 0.15,
        shadowRadius: s(20),
        shadowOffset: {
          width: 0,
          height: s(9),
        },
      }
    : {
        elevation: 5,
      };

const shadowButton =
  Platform.OS === "ios"
    ? {
        shadowColor: "#4C5D3B",
        shadowOpacity: 0.16,
        shadowRadius: s(14),
        shadowOffset: {
          width: 0,
          height: s(7),
        },
      }
    : {
        elevation: 5,
      };

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
  },

  keyboardRoot: {
    flex: 1,
    width: "100%",
    alignItems: "center",
  },

  root: {
    flex: 1,
    width: "100%",
    maxWidth: sx(BASE_WIDTH),
    position: "relative",
    overflow: "hidden",
    backgroundColor: COLORS.bg,
  },

  bgBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
  },

  topLeafShadow: {
    position: "absolute",
    top: sy(-46),
    left: sx(-44),
    width: sx(220),
    height: sy(250),
    opacity: 0.18,
    transform: [{ rotate: "180deg" }],
  },

  leftLeaf: {
    position: "absolute",
    top: sy(430),
    left: sx(-58),
    width: sx(154),
    height: sy(292),
    opacity: 0.24,
  },

  topSoftCircle: {
    position: "absolute",
    top: sy(112),
    right: sx(-84),
    width: sx(184),
    height: sx(184),
    borderRadius: sx(92),
    backgroundColor: "rgba(203, 209, 190, 0.08)",
  },

  centerGlow: {
    position: "absolute",
    top: sy(250),
    alignSelf: "center",
    width: sx(360),
    height: sx(360),
    borderRadius: sx(180),
    backgroundColor: "rgba(232, 236, 224, 0.26)",
  },

  bottomGlow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: sy(250),
    backgroundColor: "rgba(248, 247, 242, 0.32)",
  },

  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: sx(24),
    paddingTop: sy(8),
  },

  scrollIndicatorInsets: {
    top: 44,
    bottom: 24,
  },

  scrollView: {
    flex: 1,
    marginTop: sy(16),
  },

  logo: {
    width: sx(198),
    height: sy(72),
    marginBottom: vy(4),
  },

  titleBlock: {
    alignItems: "center",
    marginTop: 2,
    marginBottom: 12,
  },

  titleBlockCompact: {
    marginTop: vy(6),
    marginBottom: 8,
  },

  title: {
    fontSize: s(24),
    lineHeight: s(32),
    fontWeight: "700",
    color: COLORS.oliveSecondary,
    textAlign: "center",
    letterSpacing: 0,
  },

  description: {
    marginTop: 4,
    maxWidth: sx(310),
    fontSize: s(13.4),
    lineHeight: s(21),
    color: COLORS.muted,
    textAlign: "center",
    fontWeight: "500",
    letterSpacing: 0,
  },

  formCard: {
    width: "100%",
    maxWidth: sx(350),
    borderRadius: s(28),
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: sx(18),
    paddingTop: 20,
    paddingBottom: 20,
    ...shadowCard,
  },

  inputGroup: {
    marginBottom: 14,
  },

  inputLabel: {
    marginBottom: 7,
    fontSize: s(12.2),
    lineHeight: s(17),
    fontWeight: "700",
    color: COLORS.oliveDeep,
  },

  inputWrap: {
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.line,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: sx(15),
  },

  inputWrapError: {
    borderColor: COLORS.warning,
    backgroundColor: COLORS.inputErrorBg,
  },

  inputWrapFocused: {
    borderColor: COLORS.oliveDeep,
  },

  inputWrapSuccess: {
    borderColor: COLORS.oliveDeep,
  },

  inputIcon: {
    marginRight: sx(9),
  },

  input: {
    flex: 1,
    minHeight: 48,
    fontSize: s(13.6),
    color: COLORS.text,
    paddingVertical: 0,
  },

  statusIcon: {
    marginLeft: sx(7),
  },

  iconButton: {
    width: s(28),
    height: s(28),
    alignItems: "center",
    justifyContent: "center",
    marginLeft: sx(4),
  },

  errorText: {
    marginTop: 6,
    paddingHorizontal: sx(3),
    fontSize: s(11.4),
    lineHeight: s(16),
    color: COLORS.warning,
    fontWeight: "600",
  },

  termsCardSpacing: {
    marginTop: 18,
  },

  signupErrorText: {
    marginTop: 14,
    marginBottom: 2,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: s(13.4),
    lineHeight: s(20),
    color: COLORS.warning,
    fontWeight: "700",
    textAlign: "center",
    width: "100%",
    maxWidth: sx(340),
    backgroundColor: "#FFF4EF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F0C4AE",
  },

  signupButton: {
    marginTop: 22,
    width: "100%",
    maxWidth: sx(340),
    height: sy(52),
    borderRadius: sy(26),
    backgroundColor: COLORS.oliveButton,
    alignItems: "center",
    justifyContent: "center",
    ...shadowButton,
  },

  signupButtonDisabled: {
    backgroundColor: COLORS.oliveDisabled,
    shadowOpacity: 0,
    elevation: 0,
  },

  signupButtonText: {
    color: COLORS.white,
    fontSize: s(15.6),
    fontWeight: "700",
    letterSpacing: 0,
  },

  signupButtonTextDisabled: {
    color: COLORS.ctaText,
  },

  signupButtonIcon: {
    position: "absolute",
    right: sx(22),
  },

  loginRow: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  loginPrompt: {
    marginRight: sx(7),
    fontSize: s(12.8),
    lineHeight: s(18),
    color: COLORS.muted,
    fontWeight: "600",
  },

  loginText: {
    fontSize: s(12.8),
    lineHeight: s(18),
    color: COLORS.oliveDeep,
    fontWeight: "800",
  },

  securityNotice: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  securityText: {
    marginLeft: sx(8),
    fontSize: s(11.6),
    lineHeight: s(16.5),
    color: COLORS.muted,
    fontWeight: "500",
  },
});

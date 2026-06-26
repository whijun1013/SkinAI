import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import useAuthStore from "../../../stores/authStore";
import { getRegisterErrorMessage } from "../../../utils/authErrors";
import { sx, sy, s, scaleY } from "../../../utils/responsive";
import AuthTermsConsent from "./components/AuthTermsConsent";

const vy = (value) => sy(value * (scaleY < 0.82 ? 0.72 : 1));


const COLORS = {
  bg: "#F8F7F2",
  text: "#1F2520",
  muted: "#8B9184",
  oliveDeep: "#4F603C",
  oliveButton: "#4F603C",
  oliveSecondary: "#2E7D50",
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
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);
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
      <BackgroundDecorations />

      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={undefined}
      >
        <ScrollView
          style={styles.scrollView}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
          bounces={false}
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: vy(48) + insets.bottom },
          ]}
        >
          <View style={styles.inner}>
            {/* ── 헤더 ── */}
            <View style={styles.header}>
              <Image
                source={require("../../../../assets/logo-nuvo.png")}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.title}>
                <Text style={styles.titleAccent}>피부 일지</Text>를 시작해요
              </Text>
              <Text style={styles.desc}>
                피부 기록을 안전하게 이어가기 위한{"\n"}정보를 입력해 주세요.
              </Text>
            </View>

            {/* ── 입력 폼 (카드 없음) ── */}
            <View style={styles.form}>
              <InputField
                label="이름"
                icon="person-outline"
                value={name}
                onChangeText={(value) => { setName(value); clearSignupError(); }}
                onFocus={() => setFocusedField("name")}
                onBlur={() => { setFocusedField(null); markTouched("name"); }}
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
                onBlur={() => { setFocusedField(null); markTouched("email"); }}
                placeholder="이메일 주소"
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
                onBlur={() => { setFocusedField(null); markTouched("password"); }}
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
                errorText="영문과 숫자를 포함해 8자 이상 입력해 주세요."
              />

              <InputField
                inputRef={confirmPasswordRef}
                label="비밀번호 확인"
                icon="checkmark-circle-outline"
                value={confirmPassword}
                onChangeText={(value) => { setConfirmPassword(value); clearSignupError(); }}
                onFocus={() => setFocusedField("confirmPassword")}
                onBlur={() => { setFocusedField(null); markTouched("confirmPassword"); }}
                placeholder="비밀번호를 다시 입력해 주세요"
                secureTextEntry={!isConfirmVisible}
                textContentType="newPassword"
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleSignup}
                rightIcon={isConfirmVisible ? "eye-off-outline" : "eye-outline"}
                onPressRightIcon={() => setIsConfirmVisible((prev) => !prev)}
                isFocused={focusedField === "confirmPassword"}
                showFeedback={touched.confirmPassword || confirmPassword.length > 0}
                isValid={isConfirmPasswordValid}
                errorText="비밀번호가 일치하지 않습니다."
              />
            </View>

            {/* ── 약관 동의 ── */}
            <AuthTermsConsent
              style={styles.termsSpacing}
              termsAgreed={termsAgreed}
              privacyAgreed={privacyAgreed}
              onTermsAgreedChange={setTermsAgreed}
              onPrivacyAgreedChange={setPrivacyAgreed}
            />

            {signupError ? (
              <Text style={styles.errorBanner}>{signupError}</Text>
            ) : null}

            {/* ── 가입 버튼 ── */}
            <TouchableOpacity
              activeOpacity={isSignupEnabled && !isLoading ? 0.88 : 1}
              style={[
                styles.ctaBtn,
                (!isSignupEnabled || isLoading) && styles.ctaBtnDisabled,
              ]}
              disabled={!isSignupEnabled || isLoading}
              onPress={handleSignup}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Text style={[
                    styles.ctaBtnText,
                    !isSignupEnabled && styles.ctaBtnTextDisabled,
                  ]}>
                    회원가입
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={s(22)}
                    color={isSignupEnabled ? COLORS.white : COLORS.ctaText}
                    style={styles.ctaBtnIcon}
                  />
                </>
              )}
            </TouchableOpacity>

            {/* ── 로그인 링크 ── */}
            <View style={styles.loginRow}>
              <Text style={styles.loginPrompt}>이미 계정이 있으신가요?</Text>
              <TouchableOpacity activeOpacity={0.74} onPress={onLoginPress}>
                <Text style={styles.loginLink}>로그인</Text>
              </TouchableOpacity>
            </View>

            {/* ── 보안 안내 ── */}
            <View style={styles.securityRow}>
              <Ionicons name="shield-checkmark-outline" size={s(14)} color={COLORS.muted} />
              <Text style={styles.securityText}>NUVO는 당신의 데이터를 안전하게 보호합니다.</Text>
            </View>
          </View>
        </ScrollView>
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
  const showError   = showFeedback && !isValid;
  const showSuccess = showFeedback && isValid;

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[
        styles.fieldWrap,
        isFocused && !showError && styles.fieldWrapFocused,
        showError   && styles.fieldWrapError,
        showSuccess && styles.fieldWrapSuccess,
      ]}>
        <Ionicons
          name={icon}
          size={s(17)}
          color={showError ? COLORS.warning : COLORS.oliveDeep}
          style={styles.fieldIcon}
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
          style={styles.fieldInput}
        />
        {showSuccess && !rightIcon ? (
          <Ionicons name="checkmark-circle" size={s(18)} color={COLORS.success} style={styles.statusIcon} />
        ) : null}
        {rightIcon ? (
          <Pressable onPress={onPressRightIcon} style={styles.eyeBtn} hitSlop={10}>
            <Ionicons name={rightIcon} size={s(18)} color={COLORS.muted} />
          </Pressable>
        ) : null}
      </View>
      {showError ? <Text style={styles.fieldError}>{errorText}</Text> : null}
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

const shadowButton = Platform.OS === "ios"
  ? { shadowColor: "#4C5D3B", shadowOpacity: 0.18, shadowRadius: s(14), shadowOffset: { width: 0, height: s(6) } }
  : { elevation: 5 };

const styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: COLORS.bg },
  keyboardRoot:{ flex: 1, width: "100%" },
  scrollView:  { flex: 1 },

  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: sx(24),
    paddingTop: sy(12),
  },

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
    marginBottom: vy(22),
  },


  logo: { width: sx(198), height: sy(68), marginBottom: vy(2) },

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
  form: { width: "100%", marginBottom: vy(2) },

  fieldGroup: { marginBottom: vy(12) },

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
  fieldWrapFocused: { borderColor: COLORS.oliveDeep },
  fieldWrapError:   { borderColor: COLORS.warning, backgroundColor: "rgba(255,248,244,0.92)" },
  fieldWrapSuccess: { borderColor: COLORS.oliveDeep },

  fieldIcon:  { marginRight: sx(10) },

  fieldInput: {
    flex: 1,
    fontSize: s(13.6),
    color: COLORS.text,
    paddingVertical: 0,
    ...(Platform.OS === "android"
      ? { includeFontPadding: false, textAlignVertical: "center" }
      : null),
  },

  statusIcon: { marginLeft: sx(6) },
  eyeBtn:     { width: s(28), height: s(28), alignItems: "center", justifyContent: "center", marginLeft: sx(4) },

  fieldError: {
    marginTop: vy(5),
    paddingHorizontal: sx(3),
    fontSize: s(11.4),
    lineHeight: s(16),
    color: COLORS.warning,
    fontWeight: "600",
  },

  // ── 약관 ───────────────────────────────────────────────────────────────────
  termsSpacing: { marginTop: vy(6) },

  // ── 에러 배너 ──────────────────────────────────────────────────────────────
  errorBanner: {
    marginTop: vy(12),
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: "100%",
    fontSize: s(13.2),
    lineHeight: s(20),
    color: COLORS.warning,
    fontWeight: "700",
    textAlign: "center",
    backgroundColor: "#FFF4EF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F0C4AE",
  },

  // ── 가입 버튼 ──────────────────────────────────────────────────────────────
  ctaBtn: {
    marginTop: vy(18),
    width: "100%",
    height: vy(52),
    borderRadius: vy(26),
    backgroundColor: COLORS.oliveButton,
    alignItems: "center",
    justifyContent: "center",
    ...shadowButton,
  },
  ctaBtnDisabled: { backgroundColor: COLORS.oliveDisabled, shadowOpacity: 0, elevation: 0 },
  ctaBtnText:     { color: COLORS.white, fontSize: s(15.6), fontWeight: "700", letterSpacing: -0.1 },
  ctaBtnTextDisabled: { color: COLORS.ctaText },
  ctaBtnIcon:     { position: "absolute", right: sx(22) },

  // ── 로그인 링크 ────────────────────────────────────────────────────────────
  loginRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: vy(20),
    gap: sx(6),
  },
  loginPrompt: { fontSize: s(12.8), color: COLORS.muted, fontWeight: "500" },
  loginLink:   { fontSize: s(12.8), color: COLORS.oliveDeep, fontWeight: "800" },

  // ── 보안 안내 ──────────────────────────────────────────────────────────────
  securityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: vy(20),
    gap: sx(5),
  },
  securityText: { fontSize: s(11.2), color: COLORS.muted, fontWeight: "500" },

  // ── 배경 데코 ──────────────────────────────────────────────────────────────
  bgBase: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.bg },
  topLeafShadow: {
    position: "absolute", top: sy(-46), left: sx(-44),
    width: sx(220), height: sy(250), opacity: 0.18,
    transform: [{ rotate: "180deg" }],
  },
  leftLeaf: {
    position: "absolute", top: sy(430), left: sx(-58),
    width: sx(154), height: sy(292), opacity: 0.24,
  },
  topSoftCircle: {
    position: "absolute", top: sy(112), right: sx(-84),
    width: sx(184), height: sx(184), borderRadius: sx(92),
    backgroundColor: "rgba(203,209,190,0.08)",
  },
  centerGlow: {
    position: "absolute", top: sy(250), alignSelf: "center",
    width: sx(360), height: sx(360), borderRadius: sx(180),
    backgroundColor: "rgba(232,236,224,0.26)",
  },
  bottomGlow: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    height: sy(250), backgroundColor: "rgba(248,247,242,0.32)",
  },
});

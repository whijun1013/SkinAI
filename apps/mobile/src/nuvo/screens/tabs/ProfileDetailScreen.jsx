import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import useAuthStore from "../../../stores/authStore";
import ScreenHeader from "../mypage/ScreenHeader";
import MyPageSubScreenShell from "../mypage/MyPageSubScreenShell";

const COLORS = {
  bg: "#F7F8F5",
  card: "#FFFFFF",
  chip: "#F2F4EE",
  oliveSoft: "#E4EBD8",
  olive: "#4F603C",
  text: "#1A1F17",
  muted: "#8A9080",
  line: "#E2E5DA",
  danger: "#B85A50",
  dangerBg: "#FEF0EE",
};

const SKIN_TYPES = ["건성", "지성", "복합성", "민감성", "중성"];
const GENDERS = ["여", "남"];
const MIN_BIRTH_YEAR = 1900;
const MIN_CYCLE_DAYS = 10;
const MAX_CYCLE_DAYS = 100;

function validateProfileFields({ skinType, gender, birthYear, avgCycleLength }) {
  const trimmedBirthYear = birthYear.trim();
  const trimmedCycle = avgCycleLength.trim();
  const currentYear = new Date().getFullYear();
  if (!skinType || !SKIN_TYPES.includes(skinType))
    return { ok: false, message: "피부 타입을 선택해 주세요." };
  if (!gender || !GENDERS.includes(gender))
    return { ok: false, message: "성별을 선택해 주세요." };
  if (!trimmedBirthYear || !/^\d{4}$/.test(trimmedBirthYear))
    return { ok: false, message: "출생연도를 4자리로 입력해 주세요." };
  const birthYearNumber = Number(trimmedBirthYear);
  if (birthYearNumber < MIN_BIRTH_YEAR || birthYearNumber > currentYear)
    return { ok: false, message: "올바른 출생연도를 입력해 주세요." };
  if (gender === "여" && trimmedCycle) {
    const cycleDays = parseInt(trimmedCycle, 10);
    if (Number.isNaN(cycleDays) || cycleDays < MIN_CYCLE_DAYS || cycleDays > MAX_CYCLE_DAYS)
      return { ok: false, message: "평균 생리주기는 10~100일 사이로 입력해 주세요." };
  }
  return {
    ok: true,
    payload: {
      skin_type: skinType, gender,
      birth_year: birthYearNumber,
      avg_cycle_length: gender === "여" && trimmedCycle ? parseInt(trimmedCycle, 10) : null,
    },
    normalized: {
      skinType, gender,
      birthYear: trimmedBirthYear,
      avgCycleLength: gender === "여" ? trimmedCycle : "",
    },
  };
}

function profileFieldsFromUser(user) {
  return {
    skinType: user?.skin_type || "",
    gender: user?.gender || "",
    birthYear: user?.birth_year?.toString() || "",
    avgCycleLength: user?.avg_cycle_length?.toString() || "",
  };
}

export default function ProfileDetailScreen({ onBack, onLogout }) {
  const { user, completeOnboardingProfile, deleteAccount, changePassword } = useAuthStore();
  const userName = user?.name || "-";
  const userEmail = user?.email || "-";
  const avatarInitial = userName?.slice?.(0, 1) || "-";
  const skinConcernText = user?.raw_concern_text?.trim?.() || "";
  const cycleRegularity = user?.cycle_regularity || "";

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 비밀번호 변경 모달
  const [pwModalVisible, setPwModalVisible] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const newPwRef = useRef(null);
  const confirmPwRef = useRef(null);

  const openPwModal = () => {
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
    setShowCurrentPw(false); setShowNewPw(false);
    setPwModalVisible(true);
  };
  const closePwModal = () => { if (pwSaving) return; setPwModalVisible(false); };

  const handleChangePassword = async () => {
    if (pwSaving) return;
    if (!currentPw.trim()) { Alert.alert("입력 확인", "현재 비밀번호를 입력해 주세요."); return; }
    if (newPw.length < 8) { Alert.alert("입력 확인", "새 비밀번호는 8자 이상이어야 합니다."); return; }
    if (newPw !== confirmPw) { Alert.alert("입력 확인", "새 비밀번호가 일치하지 않습니다."); return; }
    setPwSaving(true);
    const result = await changePassword(currentPw, newPw);
    setPwSaving(false);
    if (!result.success) { Alert.alert("변경 실패", result.error); return; }
    setPwModalVisible(false);
    Alert.alert("완료", "비밀번호가 변경되었습니다.");
  };

  const isSocialUser = user?.is_social_only === true;
  const [skinType, setSkinType] = useState(user?.skin_type || "");
  const [gender, setGender] = useState(user?.gender || "");
  const [birthYear, setBirthYear] = useState(user?.birth_year?.toString() || "");
  const [avgCycleLength, setAvgCycleLength] = useState(user?.avg_cycle_length?.toString() || "");
  const [original, setOriginal] = useState(() => profileFieldsFromUser(user));

  useEffect(() => {
    if (!user || isEditing || isSaving) return;
    const next = profileFieldsFromUser(user);
    setSkinType(next.skinType); setGender(next.gender);
    setBirthYear(next.birthYear); setAvgCycleLength(next.avgCycleLength);
    setOriginal(next);
  }, [user, isEditing, isSaving]);

  const hasChanges = skinType !== original.skinType || gender !== original.gender ||
    birthYear !== original.birthYear || avgCycleLength !== original.avgCycleLength;

  const handleBack = () => {
    if (isSaving) return;
    if (isEditing && hasChanges) {
      Alert.alert("저장되지 않은 변경사항", "수정한 내용이 저장되지 않았어요. 나가시겠어요?",
        [{ text: "계속 수정", style: "cancel" }, { text: "나가기", style: "destructive", onPress: onBack }]);
    } else { onBack(); }
  };

  const handleGenderChange = (g) => { setGender(g); if (g !== "여") setAvgCycleLength(""); };

  const revertToOriginal = () => {
    setSkinType(original.skinType); setGender(original.gender);
    setBirthYear(original.birthYear); setAvgCycleLength(original.avgCycleLength);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    if (isSaving) return;
    if (hasChanges) {
      Alert.alert("수정 취소", "변경한 내용을 버리고 읽기 모드로 돌아갈까요?",
        [{ text: "계속 수정", style: "cancel" }, { text: "취소", style: "destructive", onPress: revertToOriginal }]);
      return;
    }
    revertToOriginal();
  };

  const handleSave = async () => {
    if (isSaving) return;
    const v = validateProfileFields({ skinType, gender, birthYear, avgCycleLength });
    if (!v.ok) { Alert.alert("입력 확인", v.message); return; }
    setIsSaving(true);
    try {
      const payload = { ...v.payload,
        ...(v.payload.gender === "여" && user?.cycle_regularity ? { cycle_regularity: user.cycle_regularity } : {}),
        ...(user?.raw_concern_text?.trim?.() ? { raw_concern_text: user.raw_concern_text.trim() } : {}),
      };
      const result = await completeOnboardingProfile(payload);
      if (!result?.success) { Alert.alert("저장 실패", result?.error || "다시 시도해주세요."); return; }
      setOriginal(v.normalized); setIsEditing(false);
    } catch { Alert.alert("저장 실패", "다시 시도해주세요."); }
    finally { setIsSaving(false); }
  };

  const handleDeleteAccount = () => {
    Alert.alert("회원 탈퇴", "탈퇴하면 모든 데이터가 영구적으로 삭제됩니다.\n\n계속하시겠습니까?",
      [{ text: "취소", style: "cancel" }, {
        text: "계속", onPress: () => Alert.alert("정말 탈퇴하시겠습니까?", "이 작업은 되돌릴 수 없습니다.",
          [{ text: "아니요, 취소", style: "cancel" }, {
            text: "탈퇴하기", style: "destructive",
            onPress: async () => { const res = await deleteAccount(); if (res.success) { onLogout?.(); } else { Alert.alert("탈퇴 실패", res.error || "다시 시도해주세요."); } },
          }])
      }]);
  };

  const isFemale = gender === "여";

  return (
    <MyPageSubScreenShell onBack={handleBack} enabled={!isSaving}>
      <View style={styles.root}>
        <ScreenHeader
          title="내 정보"
          onBack={handleBack}
          rightLabel={isEditing ? (isSaving ? "저장 중..." : "저장") : "수정"}
          onRightPress={() => (isEditing ? handleSave() : setIsEditing(true))}
          rightDisabled={isSaving}
          secondaryRightLabel={isEditing ? "취소" : undefined}
          onSecondaryRightPress={isEditing ? handleCancelEdit : undefined}
          secondaryRightDisabled={isSaving}
        />

        {/* 프로필 헤더 블록 */}
        <View style={styles.profileBlock}>
          {/* 데코 원형들 */}
          <View style={styles.decorTR} />
          <View style={styles.decorBL} />
          <View style={styles.decorTL} />

          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>{avatarInitial}</Text>
          </View>
          <Text style={styles.userName}>{userName}</Text>
          <Text style={styles.userEmail}>{userEmail}</Text>
          <View style={styles.tagRow}>
            {skinType ? <View style={styles.tag}><Text style={styles.tagText}>{skinType} 피부</Text></View> : null}
            {gender ? <View style={styles.tag}><Text style={styles.tagText}>{gender}성</Text></View> : null}
            {birthYear ? <View style={styles.tag}><Text style={styles.tagText}>{birthYear}년생</Text></View> : null}
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* ── 피부·건강 정보 ── */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="leaf-outline" size={14} color={COLORS.olive} />
            </View>
            <Text style={styles.sectionTitle}>피부·건강 정보</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardAccent} />

            {/* 피부 타입 */}
            <View style={styles.row}>
              <View style={styles.rowIconWrap}><Ionicons name="color-palette-outline" size={15} color={COLORS.olive} /></View>
              <Text style={styles.rowLabel}>피부 타입</Text>
              {isEditing ? (
                <View style={styles.chipGroup}>
                  {SKIN_TYPES.map((t) => (
                    <TouchableOpacity key={t} onPress={() => setSkinType(t)}
                      style={[styles.selChip, skinType === t && styles.selChipOn]}>
                      <Text style={[styles.selChipText, skinType === t && styles.selChipTextOn]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                skinType
                  ? <View style={styles.valuePill}><Text style={styles.valuePillText}>{skinType} 피부</Text></View>
                  : <Text style={styles.valueMuted}>미등록</Text>
              )}
            </View>

            <View style={styles.divider} />

            {/* 성별 */}
            <View style={styles.row}>
              <View style={styles.rowIconWrap}><Ionicons name="person-outline" size={15} color={COLORS.olive} /></View>
              <Text style={styles.rowLabel}>성별</Text>
              {isEditing ? (
                <View style={styles.chipGroup}>
                  {GENDERS.map((g) => (
                    <TouchableOpacity key={g} onPress={() => handleGenderChange(g)}
                      style={[styles.selChip, gender === g && styles.selChipOn]}>
                      <Text style={[styles.selChipText, gender === g && styles.selChipTextOn]}>{g}성</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                gender
                  ? <View style={styles.valuePill}><Text style={styles.valuePillText}>{gender}성</Text></View>
                  : <Text style={styles.valueMuted}>미등록</Text>
              )}
            </View>

            <View style={styles.divider} />

            {/* 출생연도 */}
            <View style={styles.row}>
              <View style={styles.rowIconWrap}><Ionicons name="calendar-outline" size={15} color={COLORS.olive} /></View>
              <Text style={styles.rowLabel}>출생연도</Text>
              {isEditing ? (
                <TextInput style={styles.inlineInput} value={birthYear} onChangeText={setBirthYear}
                  keyboardType="numeric" placeholder="예: 1995" placeholderTextColor={COLORS.muted} maxLength={4} />
              ) : (
                birthYear
                  ? <View style={styles.valuePill}><Text style={styles.valuePillText}>{birthYear}년생</Text></View>
                  : <Text style={styles.valueMuted}>미등록</Text>
              )}
            </View>

            {/* 생리주기 */}
            {isFemale && (
              <>
                <View style={styles.divider} />
                <View style={styles.row}>
                  <View style={styles.rowIconWrap}><Ionicons name="sync-outline" size={15} color={COLORS.olive} /></View>
                  <Text style={styles.rowLabel}>평균 생리주기</Text>
                  {isEditing ? (
                    <View style={styles.inlineInputWrap}>
                      <TextInput style={[styles.inlineInput, { width: 70 }]} value={avgCycleLength}
                        onChangeText={setAvgCycleLength} keyboardType="numeric"
                        placeholder="28" placeholderTextColor={COLORS.muted} maxLength={3} />
                      <Text style={styles.unit}>일</Text>
                    </View>
                  ) : (
                    avgCycleLength
                      ? <View style={styles.valuePill}><Text style={styles.valuePillText}>{avgCycleLength}일</Text></View>
                      : <Text style={styles.valueMuted}>미등록</Text>
                  )}
                </View>
              </>
            )}
          </View>

          {/* ── 온보딩 정보 ── */}
          {(cycleRegularity || skinConcernText) ? (
            <>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Ionicons name="document-text-outline" size={14} color={COLORS.muted} />
                </View>
                <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>가입 설문 정보</Text>
                <View style={styles.sectionBadgeLock}>
                  <Ionicons name="lock-closed" size={10} color={COLORS.muted} />
                  <Text style={styles.sectionBadgeLockText}>수정 불가</Text>
                </View>
              </View>

              <View style={[styles.card, styles.cardReadonly]}>
                <View style={[styles.cardAccent, { backgroundColor: COLORS.muted, opacity: 0.25 }]} />
                {isFemale && cycleRegularity ? (
                  <View style={styles.row}>
                    <View style={styles.rowIconWrap}><Ionicons name="analytics-outline" size={15} color={COLORS.muted} /></View>
                    <Text style={styles.rowLabel}>생리 규칙성</Text>
                    <Text style={styles.rowValue}>{cycleRegularity}</Text>
                  </View>
                ) : null}
                {skinConcernText ? (
                  <View style={[styles.row, isFemale && cycleRegularity ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line } : null]}>
                    <View style={styles.rowIconWrap}><Ionicons name="chatbubble-outline" size={15} color={COLORS.muted} /></View>
                    <Text style={styles.rowLabel}>앱 사용 계기</Text>
                    <Text style={[styles.rowValue, { flex: 1, textAlign: "right", marginLeft: 8 }]} numberOfLines={3}>{skinConcernText}</Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          {/* ── 계정 보안 ── */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.olive} />
            </View>
            <Text style={styles.sectionTitle}>계정 보안</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardAccent} />
            <View style={styles.row}>
              <View style={styles.rowIconWrap}><Ionicons name="mail-outline" size={15} color={COLORS.olive} /></View>
              <Text style={styles.rowLabel}>이메일</Text>
              <Text style={[styles.rowValue, { fontSize: 13 }]} numberOfLines={1}>{userEmail}</Text>
            </View>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.row}
              activeOpacity={isSocialUser ? 1 : 0.75}
              onPress={isSocialUser ? undefined : openPwModal}
            >
              <View style={styles.rowIconWrap}><Ionicons name="lock-closed-outline" size={15} color={COLORS.olive} /></View>
              <Text style={styles.rowLabel}>비밀번호</Text>
              {isSocialUser ? (
                <View style={[styles.valuePill, { backgroundColor: "#F0F0F0", borderColor: "#E0E0E0" }]}>
                  <Text style={[styles.valuePillText, { color: COLORS.muted }]}>소셜 로그인</Text>
                </View>
              ) : (
                <View style={styles.rowAction}>
                  <Text style={styles.rowActionText}>변경하기</Text>
                  <Ionicons name="chevron-forward" size={14} color={COLORS.olive} />
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* 회원탈퇴 */}
          <TouchableOpacity activeOpacity={0.75} style={styles.dangerRow} onPress={handleDeleteAccount}>
            <Ionicons name="person-remove-outline" size={14} color="#C0392B" style={{ marginRight: 5 }} />
            <Text style={styles.dangerText}>회원 탈퇴</Text>
          </TouchableOpacity>

        </ScrollView>

        {/* 비밀번호 변경 모달 */}
        <Modal visible={pwModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closePwModal}>
          <View style={styles.modalRoot}>
            <View style={styles.modalTopBar} />
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closePwModal} disabled={pwSaving} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>비밀번호 변경</Text>
              <TouchableOpacity onPress={handleChangePassword} disabled={pwSaving} style={styles.modalSave}>
                <Text style={[styles.modalSaveText, pwSaving && { opacity: 0.4 }]}>
                  {pwSaving ? "저장 중..." : "저장"}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              {/* 현재 비밀번호 */}
              <Text style={styles.modalFieldLabel}>현재 비밀번호</Text>
              <View style={styles.pwInputWrap}>
                <TextInput
                  style={styles.pwInput}
                  value={currentPw}
                  onChangeText={setCurrentPw}
                  secureTextEntry={!showCurrentPw}
                  placeholder="현재 비밀번호 입력"
                  placeholderTextColor={COLORS.muted}
                  returnKeyType="next"
                  onSubmitEditing={() => newPwRef.current?.focus()}
                  autoFocus
                />
                <TouchableOpacity onPress={() => setShowCurrentPw(v => !v)} style={styles.pwEyeBtn}>
                  <Ionicons name={showCurrentPw ? "eye-off-outline" : "eye-outline"} size={18} color={COLORS.muted} />
                </TouchableOpacity>
              </View>

              {/* 새 비밀번호 */}
              <Text style={[styles.modalFieldLabel, { marginTop: 20 }]}>새 비밀번호</Text>
              <View style={styles.pwInputWrap}>
                <TextInput
                  ref={newPwRef}
                  style={styles.pwInput}
                  value={newPw}
                  onChangeText={setNewPw}
                  secureTextEntry={!showNewPw}
                  placeholder="8자 이상 입력"
                  placeholderTextColor={COLORS.muted}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmPwRef.current?.focus()}
                />
                <TouchableOpacity onPress={() => setShowNewPw(v => !v)} style={styles.pwEyeBtn}>
                  <Ionicons name={showNewPw ? "eye-off-outline" : "eye-outline"} size={18} color={COLORS.muted} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalHint}>영문, 숫자 조합 8자 이상 권장</Text>

              {/* 비밀번호 확인 */}
              <Text style={[styles.modalFieldLabel, { marginTop: 20 }]}>새 비밀번호 확인</Text>
              <View style={styles.pwInputWrap}>
                <TextInput
                  ref={confirmPwRef}
                  style={styles.pwInput}
                  value={confirmPw}
                  onChangeText={setConfirmPw}
                  secureTextEntry={!showNewPw}
                  placeholder="새 비밀번호 재입력"
                  placeholderTextColor={COLORS.muted}
                  returnKeyType="done"
                  onSubmitEditing={handleChangePassword}
                />
                {confirmPw.length > 0 && (
                  <Ionicons
                    name={confirmPw === newPw ? "checkmark-circle" : "close-circle"}
                    size={18}
                    color={confirmPw === newPw ? COLORS.olive : COLORS.danger}
                    style={styles.pwEyeBtn}
                  />
                )}
              </View>
            </ScrollView>
          </View>
        </Modal>

      </View>
    </MyPageSubScreenShell>
  );
}

const shadow = Platform.OS === "ios"
  ? { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }
  : { elevation: 2 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  /* 프로필 헤더 블록 */
  profileBlock: {
    backgroundColor: COLORS.card,
    borderBottomWidth: 1, borderBottomColor: COLORS.line,
    alignItems: "center",
    paddingTop: 10, paddingBottom: 24, paddingHorizontal: 24,
    overflow: "hidden",
    position: "relative",
  },
  /* 데코 원형 */
  decorTR: {
    position: "absolute", top: -30, right: -30,
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: COLORS.oliveSoft, opacity: 0.55,
  },
  decorBL: {
    position: "absolute", bottom: -20, left: -20,
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.oliveSoft, opacity: 0.35,
  },
  decorTL: {
    position: "absolute", top: -10, left: 40,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.oliveSoft, opacity: 0.25,
  },
  avatarWrap: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: COLORS.oliveSoft,
    borderWidth: 3, borderColor: "rgba(79,96,60,0.15)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
  avatarText: { fontSize: 30, fontWeight: "700", color: COLORS.olive, lineHeight: 36 },
  userName: { fontSize: 20, fontWeight: "800", color: COLORS.text, letterSpacing: -0.3 },
  userEmail: { marginTop: 4, fontSize: 13, color: COLORS.muted, fontWeight: "500" },
  tagRow: { flexDirection: "row", gap: 6, marginTop: 14, flexWrap: "wrap", justifyContent: "center" },
  tag: {
    backgroundColor: COLORS.chip, borderRadius: 20,
    paddingHorizontal: 11, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.oliveSoft,
  },
  tagText: { fontSize: 12, fontWeight: "600", color: COLORS.olive },

  /* 스크롤 */
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },

  /* 섹션 헤더 */
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginBottom: 8, marginTop: 4, paddingHorizontal: 2,
  },
  sectionIconWrap: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center", justifyContent: "center",
  },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: COLORS.olive, letterSpacing: 0.4, textTransform: "uppercase" },
  sectionBadgeLock: {
    flexDirection: "row", alignItems: "center", gap: 3,
    marginLeft: "auto",
    backgroundColor: COLORS.oliveSoft, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  sectionBadgeLockText: { fontSize: 10, fontWeight: "600", color: COLORS.muted },

  /* 카드 */
  card: {
    borderRadius: 16, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.line,
    marginBottom: 14, overflow: "hidden", ...shadow,
  },
  cardAccent: {
    position: "absolute", left: 0, top: 0, bottom: 0,
    width: 3, backgroundColor: COLORS.olive,
  },
  cardReadonly: { backgroundColor: "#F2F4EE" },

  /* 로우 */
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14, paddingRight: 16,
    paddingVertical: 13,
    minHeight: 52,
  },
  rowIconWrap: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: COLORS.oliveSoft,
    alignItems: "center", justifyContent: "center",
    marginRight: 10,
    flexShrink: 0,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.line, marginLeft: 52, marginRight: 16 },
  rowLabel: { fontSize: 14, fontWeight: "600", color: COLORS.text, minWidth: 82 },
  rowValue: { flex: 1, fontSize: 13, fontWeight: "500", color: COLORS.muted, textAlign: "right" },

  /* value pill (읽기전용 값) */
  valuePill: {
    marginLeft: "auto",
    paddingHorizontal: 11, paddingVertical: 4,
    backgroundColor: COLORS.oliveSoft, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.line,
  },
  valuePillText: { fontSize: 13, fontWeight: "700", color: COLORS.olive },
  valueMuted: { marginLeft: "auto", fontSize: 13, fontWeight: "400", color: COLORS.muted, fontStyle: "italic" },

  /* 수정모드 치프 */
  chipGroup: {
    flexDirection: "row", flexWrap: "wrap", gap: 7,
    flex: 1, justifyContent: "flex-end",
    paddingVertical: 2,
  },
  selChip: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: COLORS.chip,
  },
  selChipOn: { backgroundColor: COLORS.olive, borderColor: COLORS.olive },
  selChipText: { fontSize: 13, fontWeight: "600", color: COLORS.muted },
  selChipTextOn: { color: "#FFFFFF" },

  /* 입력필드 */
  inlineInput: {
    marginLeft: "auto",
    backgroundColor: COLORS.chip, borderRadius: 8,
    borderWidth: 1.5, borderColor: COLORS.oliveSoft,
    paddingHorizontal: 12, paddingVertical: 7,
    fontSize: 14, fontWeight: "600", color: COLORS.text,
    textAlign: "right", minWidth: 90,
  },
  inlineInputWrap: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: "auto" },
  unit: { fontSize: 13, color: COLORS.muted, fontWeight: "500" },

  /* 로우 액션 (화살표 버튼 등) */
  rowAction: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  rowActionText: { fontSize: 13, fontWeight: "600", color: COLORS.olive },


  /* 회원탈퇴 */
  dangerRow: {
    marginTop: 6, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
  },
  dangerText: { fontSize: 13, fontWeight: "500", color: "#C0392B" },

  /* 비밀번호 변경 모달 */
  modalRoot: {
    flex: 1, backgroundColor: COLORS.bg,
    borderWidth: 2, borderColor: COLORS.olive,
    borderRadius: Platform.OS === "ios" ? 14 : 0,
    overflow: "hidden",
  },
  modalTopBar: {
    height: 4, backgroundColor: COLORS.olive, borderRadius: 2,
    marginHorizontal: 60, marginTop: 10, marginBottom: 2,
    opacity: 0.7,
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    borderBottomWidth: 1.5, borderBottomColor: COLORS.olive + "33",
    backgroundColor: COLORS.card,
  },
  modalCancel: { paddingHorizontal: 4, paddingVertical: 4, minWidth: 48 },
  modalCancelText: { fontSize: 15, color: COLORS.muted, fontWeight: "500" },
  modalTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  modalSave: { paddingHorizontal: 4, paddingVertical: 4, minWidth: 48, alignItems: "flex-end" },
  modalSaveText: { fontSize: 15, color: COLORS.olive, fontWeight: "700" },
  modalContent: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 48 },
  modalFieldLabel: { fontSize: 13, fontWeight: "600", color: COLORS.text, marginBottom: 8 },
  modalHint: { marginTop: 6, fontSize: 12, color: COLORS.muted },
  pwInputWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: COLORS.olive + "55", borderRadius: 12,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    height: 52,
  },
  pwInput: {
    flex: 1, fontSize: 15, fontWeight: "500", color: COLORS.text,
    paddingVertical: 0,
  },
  pwEyeBtn: { padding: 4 },
});

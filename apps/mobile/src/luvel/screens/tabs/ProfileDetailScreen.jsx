import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import useAuthStore from "../../../stores/authStore";
import ScreenHeader from "../mypage/ScreenHeader";
import MyPageSubScreenShell from "../mypage/MyPageSubScreenShell";

const COLORS = {
  background: "#F8F7F2",
  olive: "#4F603C",
  oliveSoft: "#EEF0E6",
  card: "#FFFFFF",
  text: "#2D2D2D",
  muted: "#7A8A6A",
  border: "#E0DDD4",
  input: "#F5F4EF",
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

  if (!skinType || !SKIN_TYPES.includes(skinType)) {
    return { ok: false, message: "피부 타입을 선택해 주세요." };
  }

  if (!gender || !GENDERS.includes(gender)) {
    return { ok: false, message: "성별을 선택해 주세요." };
  }

  if (!trimmedBirthYear || !/^\d{4}$/.test(trimmedBirthYear)) {
    return { ok: false, message: "출생연도를 4자리로 입력해 주세요." };
  }

  const birthYearNumber = Number(trimmedBirthYear);
  if (birthYearNumber < MIN_BIRTH_YEAR || birthYearNumber > currentYear) {
    return { ok: false, message: "올바른 출생연도를 입력해 주세요." };
  }

  if (gender === "여" && trimmedCycle) {
    const cycleDays = parseInt(trimmedCycle, 10);
    if (Number.isNaN(cycleDays) || cycleDays < MIN_CYCLE_DAYS || cycleDays > MAX_CYCLE_DAYS) {
      return { ok: false, message: "평균 생리주기는 10~100일 사이로 입력해 주세요." };
    }
  }

  return {
    ok: true,
    payload: {
      skin_type: skinType,
      gender,
      birth_year: birthYearNumber,
      avg_cycle_length: gender === "여" && trimmedCycle ? parseInt(trimmedCycle, 10) : null,
    },
    normalized: {
      skinType,
      gender,
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
  const { user, completeOnboardingProfile, deleteAccount } = useAuthStore();
  const userName = user?.name || "-";
  const userEmail = user?.email || "-";
  const avatarInitial = userName?.slice?.(0, 1) || "-";
  const skinConcernText = user?.raw_concern_text?.trim?.() || "";
  const cycleRegularity = user?.cycle_regularity || "";
  
  // 수정 모드 여부
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // 수정할 값들 (초기값 = 현재 user 정보)
  const [skinType, setSkinType] = useState(user?.skin_type || "");
  const [gender, setGender] = useState(user?.gender || "");
  const [birthYear, setBirthYear] = useState(user?.birth_year?.toString() || "");
  const [avgCycleLength, setAvgCycleLength] = useState(user?.avg_cycle_length?.toString() || "");
  
  // 수정 전 원본값 저장 (취소할 때 복구용)
  const [original, setOriginal] = useState(() => profileFieldsFromUser(user));

  useEffect(() => {
    if (!user || isEditing || isSaving) return;

    const next = profileFieldsFromUser(user);
    setSkinType(next.skinType);
    setGender(next.gender);
    setBirthYear(next.birthYear);
    setAvgCycleLength(next.avgCycleLength);
    setOriginal(next);
  }, [user, isEditing, isSaving]);

  // 변경사항 있는지 확인
  const hasChanges =
    skinType !== original.skinType ||
    gender !== original.gender ||
    birthYear !== original.birthYear ||
    avgCycleLength !== original.avgCycleLength;

  // 뒤로가기
  const handleBack = () => {
    if (isSaving) return;

    if (isEditing && hasChanges) {
      Alert.alert(
        "저장되지 않은 변경사항",
        "수정한 내용이 저장되지 않았어요. 나가시겠어요?",
        [
          { text: "계속 수정", style: "cancel" },
          { text: "나가기", style: "destructive", onPress: onBack },
        ]
      );
    } else {
      onBack();
    }
  };

  const handleGenderChange = (nextGender) => {
    setGender(nextGender);
    if (nextGender !== "여") {
      setAvgCycleLength("");
    }
  };

  const revertToOriginal = () => {
    setSkinType(original.skinType);
    setGender(original.gender);
    setBirthYear(original.birthYear);
    setAvgCycleLength(original.avgCycleLength);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    if (isSaving) return;

    if (hasChanges) {
      Alert.alert(
        "수정 취소",
        "변경한 내용을 버리고 읽기 모드로 돌아갈까요?",
        [
          { text: "계속 수정", style: "cancel" },
          { text: "취소", style: "destructive", onPress: revertToOriginal },
        ]
      );
      return;
    }

    revertToOriginal();
  };

  // 저장
  const handleSave = async () => {
    if (isSaving) return;

    const validation = validateProfileFields({
      skinType,
      gender,
      birthYear,
      avgCycleLength,
    });

    if (!validation.ok) {
      Alert.alert("입력 확인", validation.message);
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        ...validation.payload,
        ...(validation.payload.gender === "여" && user?.cycle_regularity
          ? { cycle_regularity: user.cycle_regularity }
          : {}),
        ...(user?.raw_concern_text?.trim?.()
          ? { raw_concern_text: user.raw_concern_text.trim() }
          : {}),
      };
      const result = await completeOnboardingProfile(payload);

      if (!result?.success) {
        Alert.alert("저장 실패", result?.error || "다시 시도해주세요.");
        return;
      }

      setOriginal(validation.normalized);
      setIsEditing(false);
    } catch (e) {
      Alert.alert("저장 실패", "다시 시도해주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "회원 탈퇴",
      "탈퇴하면 피부 기록, 식단, 분석 결과 등 모든 데이터가 영구적으로 삭제됩니다.\n\n계속하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "계속",
          onPress: () => {
            Alert.alert(
              "정말 탈퇴하시겠습니까?",
              "이 작업은 되돌릴 수 없습니다.\n모든 데이터가 즉시 삭제됩니다.",
              [
                { text: "아니요, 취소", style: "cancel" },
                {
                  text: "탈퇴하기",
                  style: "destructive",
                  onPress: async () => {
                    const res = await deleteAccount();
                    if (res.success) {
                      onLogout?.();
                    } else {
                      Alert.alert("탈퇴 실패", res.error || "다시 시도해주세요.");
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

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

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.profileSummaryCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarInitial}</Text>
          </View>
          <View style={styles.profileSummaryText}>
            <Text style={styles.profileName}>{userName}</Text>
            <Text style={styles.profileEmail}>{userEmail}</Text>
            <View style={styles.summaryChipRow}>
              <Text style={styles.summaryChip}>{skinType || "피부 타입 미등록"}</Text>
              {gender ? <Text style={styles.summaryChip}>{gender}성</Text> : null}
              <Text style={styles.summaryChip}>
                {birthYear ? `${birthYear}년생` : "출생연도 미등록"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>피부·건강 정보</Text>
          <View style={styles.card}>
            {/* 피부타입 */}
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>피부 타입</Text>
              {isEditing ? (
                <View style={styles.chipRow}>
                  {SKIN_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.chip, skinType === type && styles.chipActive]}
                      onPress={() => setSkinType(type)}
                    >
                      <Text style={[styles.chipText, skinType === type && styles.chipTextActive]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={styles.value}>{skinType || "미등록"}</Text>
              )}
            </View>

            {/* 성별 */}
            <View style={[styles.fieldWrap, styles.borderTop]}>
              <Text style={styles.label}>성별</Text>
              {isEditing ? (
                <View style={styles.chipRow}>
                  {GENDERS.map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.chip, gender === g && styles.chipActive]}
                      onPress={() => handleGenderChange(g)}
                    >
                      <Text style={[styles.chipText, gender === g && styles.chipTextActive]}>
                        {g}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={styles.value}>{gender || "미등록"}</Text>
              )}
            </View>

            {/* 출생년도 */}
            <View style={[styles.fieldWrap, styles.borderTop]}>
              <Text style={styles.label}>출생년도</Text>
              {isEditing ? (
                <TextInput
                  style={styles.input}
                  value={birthYear}
                  onChangeText={setBirthYear}
                  keyboardType="numeric"
                  placeholder="예: 1995"
                  maxLength={4}
                />
              ) : (
                <Text style={styles.value}>{birthYear || "미등록"}</Text>
              )}
            </View>

            {/* 생리주기 */}
            {gender === "여" && (
            <View style={[styles.fieldWrap, styles.borderTop]}>
              <Text style={styles.label}>평균 생리주기</Text>
              {isEditing ? (
                <TextInput
                  style={styles.input}
                  value={avgCycleLength}
                  onChangeText={setAvgCycleLength}
                  keyboardType="numeric"
                  placeholder="예: 28"
                  maxLength={2}
                />
              ) : (
                <Text style={styles.value}>
                  {avgCycleLength ? `${avgCycleLength}일` : "미등록"}
                </Text>
              )}
            </View>
            )}

            {gender === "여" && (
            <View style={[styles.fieldWrap, styles.borderTop]}>
              <Text style={styles.label}>생리 규칙성</Text>
              <Text style={styles.value}>{cycleRegularity || "미등록"}</Text>
              <Text style={styles.fieldHint}>가입 설문에서 입력한 정보예요.</Text>
            </View>
            )}

            <View style={[styles.fieldWrap, styles.borderTop]}>
              <Text style={styles.label}>앱을 처음 사용하게 된 이유</Text>
              <Text style={[styles.value, skinConcernText && styles.valueMultiline]}>
                {skinConcernText || "미등록"}
              </Text>
              <Text style={styles.fieldHint}>
                {skinConcernText
                  ? "가입 설문에서 적어 주신 내용이에요."
                  : "가입 설문에서 적어 주신 내용이 여기에 표시돼요."}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.5}
          style={styles.deleteAccountBtn}
          onPress={handleDeleteAccount}
        >
          <Text style={styles.deleteAccountText}>회원 탈퇴</Text>
        </TouchableOpacity>
      </ScrollView>
      </View>
    </MyPageSubScreenShell>
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
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 34,
  },
  profileSummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 18,
    ...shadowCard,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DDE7CF",
    marginRight: 14,
  },
  avatarText: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    color: COLORS.olive,
    letterSpacing: 0,
  },
  profileSummaryText: {
    flex: 1,
  },
  profileName: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: 0,
  },
  profileEmail: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: COLORS.muted,
    letterSpacing: 0,
  },
  summaryChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  summaryChip: {
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: COLORS.oliveSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: COLORS.olive,
    letterSpacing: 0,
  },
  section: {
    marginTop: 0,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.muted,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  fieldWrap: {
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.muted,
    marginBottom: 6,
  },
  value: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.text,
  },
  valueMultiline: {
    lineHeight: 21,
  },
  fieldHint: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
    color: COLORS.muted,
    letterSpacing: 0,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.input,
  },
  chipActive: {
    backgroundColor: COLORS.olive,
    borderColor: COLORS.olive,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.muted,
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  input: {
    backgroundColor: COLORS.input,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deleteAccountBtn: {
    marginTop: 28,
    marginBottom: 8,
    alignItems: "center",
    paddingVertical: 4,
  },
  deleteAccountText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#A09590",
    textDecorationLine: "underline",
    letterSpacing: 0,
  },
});

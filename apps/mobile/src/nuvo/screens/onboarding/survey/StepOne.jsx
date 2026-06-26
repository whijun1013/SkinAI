import { useEffect, useRef, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { s, sx, sy } from "../../../../utils/responsive";
import COLORS from "./surveyColors";
import { SkinGoalPanel } from "./SurveyHeader";
import {
  Section,
  Field,
  Input,
  Chip,
  ChipGrid,
  ConcernAnswer,
  SegmentedControl,
  InlinePanel,
  StepFooter,
} from "./SurveyComponents";
import {
  skinTypeOptions,
  skinTypeModeOptions,
  skinConcernOptions,
  genderOptions,
  regularityOptions,
  NO_SKIN_CONCERN_OPTION,
} from "./surveyConstants";
import RegisterDatePickerSheet from "../../../components/search/RegisterDatePickerSheet";
import {
  parseDateString,
  getTodayString,
  formatKoreanDate,
} from "../../../components/search/SearchScreenParts";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const CONCERN_PLACEHOLDER =
  "예) 요즘 볼에 붉은기가 자꾸 올라오는데 원인을 모르겠어요. 스트레스 받으면 더 심해지는 것 같기도 하고...";

function ConcernTextInput({ value, onChangeText, onDone }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[ctStyles.wrapper, focused && ctStyles.wrapperFocused]}>
      <TextInput
        style={ctStyles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={CONCERN_PLACEHOLDER}
        placeholderTextColor={COLORS.placeholder}
        multiline
        textAlignVertical="top"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (value?.trim()) onDone?.();
        }}
        returnKeyType="done"
        blurOnSubmit
      />
      {!!value?.trim() && (
        <Pressable
          style={({ pressed }) => [ctStyles.doneBtn, pressed && ctStyles.pressed]}
          onPress={onDone}
        >
          <Text style={ctStyles.doneBtnText}>다음으로</Text>
          <Ionicons name="chevron-down" size={s(14)} color={COLORS.olive} />
        </Pressable>
      )}
    </View>
  );
}

const ctStyles = StyleSheet.create({
  wrapper: {
    borderColor: COLORS.line,
    borderRadius: sy(14),
    borderWidth: 1.5,
    marginTop: sy(8),
    overflow: "hidden",
  },
  wrapperFocused: {
    borderColor: COLORS.olive,
  },
  input: {
    color: COLORS.body,
    fontSize: s(15),
    lineHeight: s(22),
    minHeight: sy(96),
    padding: sx(14),
  },
  doneBtn: {
    alignItems: "center",
    borderTopColor: COLORS.line,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: sx(6),
    justifyContent: "center",
    paddingVertical: sy(12),
  },
  doneBtnText: {
    color: COLORS.olive,
    fontSize: s(14),
    fontWeight: "700",
  },
  pressed: { opacity: 0.72 },
});

export default function StepOne({
  skinType,
  skinTypeMode,
  rawConcernText = "",
  skinConcernAnswers,
  gender,
  birthYear,
  menstrualStartDate,
  isPeriodDatePickerVisible,
  setIsPeriodDatePickerVisible,
  menstrualStartUnknown,
  avgCycleLength,
  cycleRegularity,
  onSelectSkinType,
  onSelectSkinTypeMode,
  onChangeConcernText,
  onToggleSkinConcern,
  onSelectGender,
  onChangeBirthYear,
  onChangeMenstrualStartDate,
  onSelectMenstrualStartUnknown,
  onChangeAvgCycleLength,
  onSelectCycleRegularity,
  onFocusInput,
  onBlurInput,
  onNext,
  step1Errors = {},
  focusedField = "",
  scrollViewRef,
}) {
  // 성별·생리 주기 패널 상태 변경 시 등장 애니메이션 (2단계→1단계 복귀 remount 제외)
  const isFirstLayoutAnim = useRef(true);
  useEffect(() => {
    if (isFirstLayoutAnim.current) {
      isFirstLayoutAnim.current = false;
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [gender, menstrualStartUnknown]);

  // 섹션 ref
  const skinTypeSectionRef = useRef(null);
  const skinConcernSectionRef = useRef(null);
  const basicInfoSectionRef = useRef(null);
  const birthYearFieldRef = useRef(null);
  const menstrualSectionRef = useRef(null);

  const scrollToRef = (ref) => {
    if (!ref?.current || !scrollViewRef?.current) return;
    ref.current.measureLayout(
      scrollViewRef.current,
      (x, y) => {
        scrollViewRef.current.scrollTo({ y: Math.max(0, y - 16), animated: true });
      },
      () => {}
    );
  };

  // 피부 타입 모드 전환 시 → "피부 타입" 섹션 타이틀 기준으로 스크롤
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => scrollToRef(skinTypeSectionRef), 120);
    return () => clearTimeout(timer);
  }, [skinTypeMode]);

  // 성별 선택(남/여) 시 → 기본 참고 정보 컨테이너로 스크롤 (피부 타입 선택과 동일)
  const prevGenderRef = useRef(gender);
  useEffect(() => {
    const prev = prevGenderRef.current;
    prevGenderRef.current = gender;
    if (prev === gender) return;
    const delay = gender === "여" ? 200 : 120;
    const timer = setTimeout(() => scrollToRef(basicInfoSectionRef), delay);
    return () => clearTimeout(timer);
  }, [gender]);

  useEffect(() => {
    if (!step1Errors || Object.keys(step1Errors).length === 0) return;

    const priority = ["primaryConcern", "skinType", "gender", "birthYear", "menstrual", "avgCycle"];
    const firstKey = priority.find((key) => step1Errors[key]);
    const refMap = {
      primaryConcern: skinConcernSectionRef,
      skinType: skinTypeSectionRef,
      gender: basicInfoSectionRef,
      birthYear: birthYearFieldRef,
      menstrual: menstrualSectionRef,
      avgCycle: menstrualSectionRef,
    };

    const timer = setTimeout(() => scrollToRef(refMap[firstKey]), 150);
    return () => clearTimeout(timer);
  }, [step1Errors]);

  const menstrualDateLabel = menstrualStartDate
    ? formatKoreanDate(menstrualStartDate)
    : "날짜를 선택해 주세요";
  const hasMenstrualDate = !!menstrualStartDate && !menstrualStartUnknown;

  return (
    <>
      <SkinGoalPanel />

      <View ref={skinConcernSectionRef} collapsable={false}>
        <Section variant="skinType">
          <Field
            label="지금 가장 신경 쓰이는 피부 고민"
            helper="자유롭게 적어 주세요 · 나중에 언제든 바꿀 수 있어요."
            required
            error={step1Errors.primaryConcern}
          >
            <ConcernTextInput
              value={rawConcernText}
              onChangeText={onChangeConcernText}
              onDone={() => setTimeout(() => scrollToRef(skinTypeSectionRef), 120)}
            />
          </Field>
        </Section>
      </View>

      <View ref={skinTypeSectionRef} collapsable={false}>
      <Section
        title="피부 타입"
        description="알고 있다면 직접 선택하고, 잘 모르겠다면 자주 느끼는 상태를 골라 주세요."
        variant="skinType"
      >
        <Field label="피부 타입을 알고 계신가요?" required>
          <SegmentedControl
            options={skinTypeModeOptions}
            value={skinTypeMode}
            onChange={onSelectSkinTypeMode}
          />
        </Field>

        {skinTypeMode === "known" ? (
          <Field
            label="피부 타입을 선택해 주세요"
            error={step1Errors.skinType}
          >
            <ChipGrid>
              {skinTypeOptions.map((option) => (
                <Chip
                  key={option}
                  label={option}
                  selected={skinType === option}
                  onPress={() => {
                    onSelectSkinType(option);
                    setTimeout(() => scrollToRef(basicInfoSectionRef), 120);
                  }}
                />
              ))}
            </ChipGrid>
          </Field>
        ) : (
          <Field
            label="피부에 자주 느끼는 상태를 선택해 주세요"
            helper="선택한 상태를 바탕으로 초기 피부 타입을 저장합니다."
            error={step1Errors.skinType}
          >
            <View style={styles.concernAnswerList}>
              {skinConcernOptions.map((option) => (
                <ConcernAnswer
                  key={option}
                  label={option}
                  selected={skinConcernAnswers.includes(option)}
                  onPress={() => {
                    const isCurrentlySelected = skinConcernAnswers.includes(option);
                    onToggleSkinConcern(option);
                    if (option === NO_SKIN_CONCERN_OPTION && !isCurrentlySelected) {
                      setTimeout(() => scrollToRef(basicInfoSectionRef), 120);
                    }
                  }}
                />
              ))}
            </View>
            {skinConcernAnswers.length > 0 &&
              !skinConcernAnswers.includes(NO_SKIN_CONCERN_OPTION) && (
                <Pressable
                  style={({ pressed }) => [
                    styles.concernDoneButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setTimeout(() => scrollToRef(basicInfoSectionRef), 80)}
                >
                  <Text style={styles.concernDoneButtonText}>선택 완료 · 다음으로</Text>
                  <Ionicons name="chevron-down" size={s(15)} color={COLORS.olive} />
                </Pressable>
              )}
          </Field>
        )}
      </Section>
      </View>

      <View ref={basicInfoSectionRef} collapsable={false}>
      <Section title="기본 참고 정보">
        <Field label="성별" required error={step1Errors.gender}>
          <SegmentedControl
            options={genderOptions}
            value={gender}
            onChange={onSelectGender}
          />
        </Field>

        <View ref={birthYearFieldRef} collapsable={false}>
        <Field
          label="출생연도"
          required
          noBorder={gender === "여"}
          helper="피부 변화 분석 시 연령대 참고를 위해 사용돼요."
          error={step1Errors.birthYear}
        >
          <Input
            value={birthYear}
            onChangeText={onChangeBirthYear}
            onFocus={() => onFocusInput("birthYear")}
            onBlur={onBlurInput}
            placeholder="예: 2000"
            keyboardType="number-pad"
            maxLength={4}
            hasError={!!step1Errors.birthYear}
            isFocused={focusedField === "birthYear"}
          />
        </Field>
        </View>

        {gender === "여" && (
          <View ref={menstrualSectionRef} collapsable={false}>
          <InlinePanel title="생리 주기">
            <Field
              label="가장 최근 생리 시작일"
              helper="시작일을 알면 선택해 주세요. 기록이 쌓일수록 주기 분석이 정확해져요."
              error={step1Errors.menstrual}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`가장 최근 생리 시작일, ${menstrualDateLabel}`}
                onPress={() => setIsPeriodDatePickerVisible(true)}
                style={({ pressed }) => [
                  styles.datePickerButton,
                  hasMenstrualDate && styles.datePickerButtonFilled,
                  !!step1Errors.menstrual && styles.datePickerButtonError,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={s(18)}
                  color={hasMenstrualDate ? COLORS.olive : COLORS.placeholder}
                />
                <Text
                  style={[
                    styles.datePickerText,
                    hasMenstrualDate && styles.datePickerTextFilled,
                  ]}
                >
                  {menstrualDateLabel}
                </Text>
              </Pressable>

              <View style={styles.periodLegend}>
                <View style={styles.periodLegendDot} />
                <Text style={styles.periodLegendText}>
                  선택한 날짜가 가장 최근 생리 시작일로 저장돼요
                </Text>
              </View>

              <View style={styles.inlineChipWrap}>
                <Chip
                  label="잘 모르겠어요"
                  selected={menstrualStartUnknown}
                  onPress={onSelectMenstrualStartUnknown}
                />
              </View>

              <RegisterDatePickerSheet
                visible={isPeriodDatePickerVisible}
                title="가장 최근 생리 시작일"
                hint="오늘 이전 날짜만 선택할 수 있어요."
                value={
                  parseDateString(menstrualStartDate) ||
                  parseDateString(getTodayString()) ||
                  new Date()
                }
                maximumDate={new Date()}
                onConfirm={(dateStr) => {
                  onChangeMenstrualStartDate(dateStr);
                  setIsPeriodDatePickerVisible(false);
                }}
                onDismiss={() => setIsPeriodDatePickerVisible(false)}
              />
            </Field>

            {menstrualStartUnknown ? (
              <Text style={styles.periodUnknownGuide}>
                나중에 기록 탭 &gt; 생리 주기에서 달력으로 입력할 수 있어요.
              </Text>
            ) : (
              <>
                <Field
                  label="평균 생리주기"
                  helper="알고 있으면 입력해 주세요. 비워두면 기록을 바탕으로 자동 계산돼요."
                  error={step1Errors.avgCycle}
                >
                  <Input
                    value={avgCycleLength}
                    onChangeText={(value) =>
                      onChangeAvgCycleLength(value.replace(/\D/g, "").slice(0, 3))
                    }
                    onFocus={() => onFocusInput("avgCycleLength")}
                    onBlur={onBlurInput}
                    placeholder="예: 28"
                    keyboardType="number-pad"
                    maxLength={3}
                    hasError={!!step1Errors.avgCycle}
                    isFocused={focusedField === "avgCycleLength"}
                  />
                </Field>

                <Field
                  label="주기 규칙성"
                  helper="초기 분석 정확도를 높이는 참고 정보예요. 모르면 선택하지 않아도 돼요."
                  noBorder
                >
                  <ChipGrid>
                    {regularityOptions.map((option) => (
                      <Chip
                        key={option}
                        label={option}
                        selected={cycleRegularity === option}
                        onPress={() =>
                          onSelectCycleRegularity(
                            cycleRegularity === option ? "" : option
                          )
                        }
                      />
                    ))}
                  </ChipGrid>
                </Field>
              </>
            )}
          </InlinePanel>
          </View>
        )}
      </Section>
      </View>

      <StepFooter nextLabel="다음" onNext={onNext} showPrevious={false} />
    </>
  );
}

const styles = StyleSheet.create({
  concernAnswerList: {
    gap: 8,
  },
  inlineChipWrap: {
    marginTop: sy(10),
  },
  periodLegend: {
    alignItems: "center",
    flexDirection: "row",
    gap: sx(8),
    marginTop: sy(10),
    paddingHorizontal: sx(2),
  },
  periodLegendDot: {
    backgroundColor: COLORS.olive,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  periodLegendText: {
    color: COLORS.muted,
    flex: 1,
    fontSize: s(13),
    fontWeight: "600",
    lineHeight: s(19),
  },
  periodUnknownGuide: {
    color: COLORS.muted,
    fontSize: s(14),
    lineHeight: s(20),
    marginTop: sy(2),
  },
  datePickerButton: {
    alignItems: "center",
    backgroundColor: COLORS.input,
    borderColor: COLORS.line,
    borderRadius: sy(23),
    borderWidth: 1,
    flexDirection: "row",
    gap: sx(10),
    height: sy(50),
    paddingHorizontal: sx(14),
  },
  datePickerButtonFilled: {
    borderColor: COLORS.olive,
    borderWidth: 1.5,
  },
  datePickerButtonError: {
    borderColor: COLORS.error,
    borderWidth: 1.5,
  },
  datePickerText: {
    color: COLORS.placeholder,
    flex: 1,
    fontSize: s(16),
  },
  datePickerTextFilled: {
    color: COLORS.body,
  },
  concernDoneButton: {
    alignItems: "center",
    backgroundColor: COLORS.oliveSoft,
    borderColor: COLORS.olive,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: "row",
    justifyContent: "center",
    gap: sx(6),
    marginTop: sy(8),
    minHeight: sy(52),
    paddingHorizontal: sx(16),
    paddingVertical: sy(13),
  },
  concernDoneButtonText: {
    color: COLORS.olive,
    fontSize: s(15),
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.72,
  },
});

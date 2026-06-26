import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { sx, sy } from "../../../utils/responsive";
import useSurveyCosmetics from "./hooks/useSurveyCosmetics";
import useSurveyMedications from "./hooks/useSurveyMedications";
import { createPeriodLog } from "../../../api/periodLogs";
import useAuthStore from "../../../stores/authStore";
import {
  formatDateInput,
  isValidCalendarDate,
  inferSkinTypeFromConcerns,
  NO_SKIN_CONCERN_OPTION,
  MAX_SKIN_CONCERNS,
} from "./survey/surveyConstants";
import COLORS from "./survey/surveyColors";
import { Header } from "./survey/SurveyHeader";
import { SurveyLoadErrorBanner } from "./survey/SurveyComponents";
import StepOne from "./survey/StepOne";
import StepTwo from "./survey/StepTwo";
import StepThree from "./survey/StepThree";
import CosmeticSearchScreen from "../cosmetics/CosmeticSearchScreen";
import CosmeticAnalysisSheet from "../cosmetics/components/CosmeticAnalysisSheet";
import RegisterDatePickerSheet from "../../components/search/RegisterDatePickerSheet";
import MedicationSearchScreen from "../medications/MedicationSearchScreen";

export default function SurveyScreen({ onLogout }) {
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const slideAnimRef = useRef(null);
  const scrollRef = useRef(null);
  const completeOnboardingProfile = useAuthStore(
    (state) => state.completeOnboardingProfile
  );
  const logout = useAuthStore((state) => state.logout);
  const [currentStep, setCurrentStep] = useState(1);
  const [skinTypeMode, setSkinTypeMode] = useState("known");
  const [skinType, setSkinType] = useState("");
  const [skinConcernAnswers, setSkinConcernAnswers] = useState([]);
  const [rawConcernText, setRawConcernText] = useState("");
  const [gender, setGender] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [menstrualStartDate, setMenstrualStartDate] = useState("");
  const [isPeriodDatePickerVisible, setIsPeriodDatePickerVisible] = useState(false);
  const [menstrualStartUnknown, setMenstrualStartUnknown] = useState(false);
  const [avgCycleLength, setAvgCycleLength] = useState("");
  const [cycleRegularity, setCycleRegularity] = useState("");
  const [loadError, setLoadError] = useState("");
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [step1Errors, setStep1Errors] = useState({});
  const [isSavingSurvey, setIsSavingSurvey] = useState(false);
  const [focusedField, setFocusedField] = useState("");

  const {
    cosmetics,
    actionError: step2ActionError,
    setActionError: setStep2ActionError,
    refreshCosmetics: loadMyCosmetics,
    isSearchVisible: isCosmeticSearchSheetVisible,
    openSearch: openCosmeticSearch,
    closeSearch: closeCosmeticSearch,
    detailId: cosmeticDetailId,
    openDetail: openCosmeticDetail,
    closeDetail: closeCosmeticDetail,
    datePickerVisible: cosmeticDatePickerVisible,
    datePickerConfig: cosmeticDatePickerConfig,
    savingItemId: cosmeticSavingItemId,
    closeDatePicker: closeCosmeticDatePicker,
    handleDateConfirm: handleCosmeticDateConfirm,
    handleAdded: handleCosmeticAdded,
    handleDelete: handleSurveyDeleteCosmetic,
    handleEditDate: handleSurveyEditCosmeticDate,
    isOverlayOpen: isCosmeticsOverlayOpen,
    resetOverlays: resetCosmeticOverlays,
  } = useSurveyCosmetics();

  const {
    medications,
    refreshMedications: loadMyMedications,
    medicationAddMessage,
    isSearchSheetVisible: isMedicationSearchSheetVisible,
    openSearchSheet: openMedicationSearchSheet,
    closeSearchSheet: closeMedicationSearchSheet,
    handleAdded: handleMedicationAdded,
    handleDeleteMedication,
    datePickerVisible: isMedicationDatePickerVisible,
    datePickerConfig: medicationDatePickerConfig,
    savingItemId: medicationSavingItemId,
    openDatePicker: openMedicationDatePicker,
    handleDateConfirm: handleMedicationDateConfirm,
    closeDatePicker: closeMedicationDatePicker,
    resetOverlays: resetMedicationOverlays,
    isOverlayOpen: isMedicationOverlayOpen,
  } = useSurveyMedications();

  const stepRef = useRef(currentStep);
  stepRef.current = currentStep;

  const handleStepOneNextRef = useRef(null);
  const handleStepTwoNextRef = useRef(null);

  const goToStep = (nextStep) => {
    const clamped = Math.min(3, Math.max(1, nextStep));
    if (clamped === stepRef.current) return;

    if (stepRef.current === 2 && clamped !== 2) {
      resetCosmeticOverlays();
    }
    if (stepRef.current === 3 && clamped !== 3) {
      resetMedicationOverlays();
    }

    slideAnimRef.current?.stop();
    slideAnim.stopAnimation();

    // 앞으로: 오른쪽에서 슬라이드 인 / 뒤로: 왼쪽에서 슬라이드 인
    const isGoingBack = clamped < stepRef.current;
    const entryOffset = SCREEN_WIDTH * 0.18 * (isGoingBack ? -1 : 1);
    slideAnim.setValue(entryOffset);
    setCurrentStep(clamped);
    scrollRef.current?.scrollTo({ y: 0, animated: false });

    slideAnimRef.current = Animated.timing(slideAnim, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    slideAnimRef.current.start(({ finished }) => {
      slideAnimRef.current = null;
      if (finished) {
        slideAnim.setValue(0);
      }
    });
  };
  const goNext = () => goToStep(currentStep + 1);
  const goPrevious = () => goToStep(currentStep - 1);

  const isOverlayOpen = isCosmeticsOverlayOpen || isMedicationOverlayOpen;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (isOverlayOpen) return false;
          if (focusedField) return false;
          const horizontal = Math.abs(gestureState.dx);
          const vertical = Math.abs(gestureState.dy);
          return horizontal > 24 && horizontal > vertical * 1.45;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (isOverlayOpen) return;
          if (focusedField || Math.abs(gestureState.dx) < 64) return;
          if (Math.abs(gestureState.dx) <= Math.abs(gestureState.dy) * 1.45) {
            return;
          }
          if (gestureState.dx > 0 && stepRef.current > 1) {
            goToStep(stepRef.current - 1);
          }
          if (gestureState.dx < 0) {
            if (stepRef.current === 1) {
              handleStepOneNextRef.current();
            } else if (stepRef.current === 2) {
              handleStepTwoNextRef.current();
            }
          }
        },
      }),
    [focusedField, isOverlayOpen]
  );

  const loadInitialSurveyData = useCallback(async () => {
    setIsInitialLoading(true);
    try {
      await Promise.all([loadMyCosmetics(), loadMyMedications()]);
      setLoadError("");
    } catch {
      setLoadError("초기 데이터를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsInitialLoading(false);
    }
  }, [loadMyCosmetics, loadMyMedications]);

  useEffect(() => {
    loadInitialSurveyData();
  }, [loadInitialSurveyData]);

  const selectSkinTypeMode = (value) => {
    setSkinTypeMode(value);
    if (value === "known") {
      setSkinConcernAnswers([]);
      setSkinType("");
      return;
    }
    if (value === "unknown") {
      setSkinType(inferSkinTypeFromConcerns(skinConcernAnswers));
    }
  };

  const toggleSkinConcern = (concern) => {
    setSkinConcernAnswers((prev) => {
      let next;
      if (concern === NO_SKIN_CONCERN_OPTION) {
        next = prev.includes(concern) ? [] : [concern];
      } else {
        const filtered = prev.filter((item) => item !== NO_SKIN_CONCERN_OPTION);
        next = filtered.includes(concern)
          ? filtered.filter((item) => item !== concern)
          : [...filtered, concern];
      }
      if (skinTypeMode === "unknown") {
        setSkinType(inferSkinTypeFromConcerns(next));
      }
      return next;
    });
  };

  const clearStep1Error = (field) => {
    setStep1Errors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const resetMenstrualState = () => {
    setMenstrualStartDate("");
    setMenstrualStartUnknown(false);
    setAvgCycleLength("");
    setCycleRegularity("");
    setIsPeriodDatePickerVisible(false);
    setStep1Errors((prev) => {
      if (!prev.menstrual && !prev.avgCycle) return prev;
      const next = { ...prev };
      delete next.menstrual;
      delete next.avgCycle;
      return next;
    });
  };

  const handleStepOneNext = () => {
    const trimmedBirthYear = birthYear.trim();
    const errors = {};

    if (!skinType) {
      errors.skinType =
        skinTypeMode === "known"
          ? "피부 타입을 선택해 주세요."
          : "피부 상태를 하나 이상 골라 주세요.";
    }

    if (!rawConcernText.trim()) {
      errors.primaryConcern = "피부 고민을 입력해 주세요.";
    }

    if (!gender) {
      errors.gender = "성별을 선택해 주세요.";
    }

    if (!trimmedBirthYear || !/^\d{4}$/.test(trimmedBirthYear)) {
      errors.birthYear = "출생연도를 4자리로 입력해 주세요.";
    } else {
      const birthYearNumber = Number(trimmedBirthYear);
      const currentYear = new Date().getFullYear();
      if (birthYearNumber < 1900 || birthYearNumber > currentYear) {
        errors.birthYear = "올바른 출생연도를 입력해 주세요.";
      }
    }

    if (gender === "여") {
      const trimmedMenstrualStartDate = menstrualStartDate.trim();

      if (!trimmedMenstrualStartDate && !menstrualStartUnknown) {
        errors.menstrual =
          "가장 최근 생리 시작일을 선택하거나 '잘 모르겠어요'를 선택해 주세요.";
      } else if (
        trimmedMenstrualStartDate &&
        !isValidCalendarDate(trimmedMenstrualStartDate)
      ) {
        errors.menstrual = "올바른 날짜를 선택해 주세요.";
      }

      const trimmedAvgCycle = avgCycleLength.trim();
      if (trimmedAvgCycle && !menstrualStartUnknown) {
        const days = parseInt(trimmedAvgCycle, 10);
        if (Number.isNaN(days) || days < 10 || days > 100) {
          errors.avgCycle = "평균 생리주기는 10~100일 사이로 입력해 주세요.";
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setStep1Errors(errors);
      return;
    }

    setStep1Errors({});
    goNext();
  };

  const handleStepTwoNext = () => {
    setStep2ActionError("");
    goNext();
  };

  handleStepOneNextRef.current = handleStepOneNext;
  handleStepTwoNextRef.current = handleStepTwoNext;

  const handleLogoutPress = () => {
    const stepLabel = ["피부 타입·기본 정보", "사용 화장품", "건강 정보"][currentStep - 1];
    Alert.alert(
      "설문 중단",
      `${currentStep}단계(${stepLabel}) 진행 중입니다.\n지금 나가면 입력한 내용이 저장되지 않습니다.\n(등록한 화장품·약물 데이터는 유지됩니다)`,
      [
        { text: "계속 작성", style: "cancel" },
        {
          text: "로그아웃",
          style: "destructive",
          onPress: async () => {
            await logout();
            onLogout?.();
          },
        },
      ]
    );
  };

  const handleSurveySave = () => {
    if (medications.length === 0) {
      Alert.alert(
        "약물 정보 없이 완료할까요?",
        "복용 중인 약물이 없다면 그대로 완료해도 됩니다. 나중에 추가할 수 있습니다.",
        [
          { text: "계속 입력하기", style: "cancel" },
          { text: "완료하기", onPress: saveSurvey },
        ]
      );
      return;
    }

    saveSurvey();
  };

  const saveSurvey = async () => {
    if (isSavingSurvey) return;

    setIsSavingSurvey(true);
    let shouldResetSaving = true;
    try {
      const avgCycleLengthValue = (() => {
        if (gender !== "여" || menstrualStartUnknown) return null;
        const trimmed = avgCycleLength.trim();
        if (!trimmed) return null;
        const days = parseInt(trimmed, 10);
        return Number.isNaN(days) ? null : days;
      })();

      const result = await completeOnboardingProfile({
        skin_type: skinType,
        raw_concern_text: rawConcernText.trim(),
        birth_year: Number(birthYear),
        gender,
        avg_cycle_length: avgCycleLengthValue,
        cycle_regularity:
          gender === "여" && !menstrualStartUnknown
            ? cycleRegularity || null
            : null,
        skin_condition_chips:
          skinConcernAnswers.length > 0 ? skinConcernAnswers : undefined,
      });

      if (!result.success) {
        Alert.alert(
          "저장 실패",
          result.error || "기본 프로필 저장에 실패했습니다."
        );
        return;
      }

      const shouldSavePeriod =
        gender === "여" && menstrualStartDate && !menstrualStartUnknown;

      if (shouldSavePeriod) {
        try {
          await createPeriodLog(menstrualStartDate);
        } catch (periodError) {
          console.error("생리 시작일 저장 실패:", periodError);
          Alert.alert(
            "일부 저장 실패",
            "기본 프로필은 저장됐지만 생리 시작일 저장에 실패했습니다. 나중에 기록 탭에서 다시 입력해 주세요."
          );
        }
      }

      shouldResetSaving = false;
      // 화면 전환이 3초 내 발생하지 않으면 버튼을 복구해 재시도 가능하게 함
      setTimeout(() => setIsSavingSurvey(false), 3000);
    } catch (error) {
      Alert.alert("저장 실패", "기본 프로필 저장에 실패했습니다.");
    } finally {
      if (shouldResetSaving) {
        setIsSavingSurvey(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <View style={styles.screen} {...panResponder.panHandlers} collapsable={false}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(sy(52), insets.bottom + sy(32)) },
            ]}
            automaticallyAdjustKeyboardInsets
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Header currentStep={currentStep} onLogout={handleLogoutPress} />

            <Animated.View
              style={[
                styles.stepSlide,
                { transform: [{ translateX: slideAnim }] },
              ]}
              pointerEvents="box-none"
            >
            {currentStep === 1 && (
              <View>
                {loadError && !isInitialLoading ? (
                  <SurveyLoadErrorBanner
                    message={loadError}
                    onRetry={loadInitialSurveyData}
                  />
                ) : null}
                <StepOne
                  skinType={skinType}
                  skinTypeMode={skinTypeMode}
                  rawConcernText={rawConcernText}
                  skinConcernAnswers={skinConcernAnswers}
                  gender={gender}
                  birthYear={birthYear}
                  menstrualStartDate={menstrualStartDate}
                  isPeriodDatePickerVisible={isPeriodDatePickerVisible}
                  setIsPeriodDatePickerVisible={setIsPeriodDatePickerVisible}
                  menstrualStartUnknown={menstrualStartUnknown}
                  avgCycleLength={avgCycleLength}
                  cycleRegularity={cycleRegularity}
                  onSelectSkinType={(value) => {
                    clearStep1Error("skinType");
                    setSkinType(value);
                  }}
                  onSelectSkinTypeMode={(mode) => {
                    clearStep1Error("skinType");
                    selectSkinTypeMode(mode);
                  }}
                  onChangeConcernText={(text) => {
                    setRawConcernText(text);
                    clearStep1Error("primaryConcern");
                  }}
                  onToggleSkinConcern={(option) => {
                    clearStep1Error("skinType");
                    toggleSkinConcern(option);
                  }}
                  onSelectGender={(value) => {
                    clearStep1Error("gender");
                    if (value !== "여") {
                      resetMenstrualState();
                    }
                    setGender(value);
                  }}
                  onChangeBirthYear={(value) => {
                    clearStep1Error("birthYear");
                    setBirthYear(value.replace(/\D/g, "").slice(0, 4));
                  }}
                  onChangeMenstrualStartDate={(value) => {
                    clearStep1Error("menstrual");
                    setMenstrualStartDate(formatDateInput(value));
                    setMenstrualStartUnknown(false);
                  }}
                  onSelectMenstrualStartUnknown={() => {
                    clearStep1Error("menstrual");
                    if (menstrualStartUnknown) {
                      setMenstrualStartUnknown(false);
                      return;
                    }
                    setMenstrualStartDate("");
                    setMenstrualStartUnknown(true);
                    setAvgCycleLength("");
                    setCycleRegularity("");
                  }}
                  onChangeAvgCycleLength={(value) => {
                    clearStep1Error("avgCycle");
                    setAvgCycleLength(value);
                  }}
                  onSelectCycleRegularity={setCycleRegularity}
                  onFocusInput={setFocusedField}
                  onBlurInput={() => setFocusedField("")}
                  onNext={handleStepOneNext}
                  step1Errors={step1Errors}
                  focusedField={focusedField}
                  scrollViewRef={scrollRef}
                />
              </View>
            )}

            {currentStep === 2 && (
              loadError && !isInitialLoading ? (
                <SurveyLoadErrorBanner
                  message={loadError}
                  onRetry={loadInitialSurveyData}
                />
              ) : (
                <StepTwo
                  cosmetics={cosmetics}
                  isInitialLoading={isInitialLoading}
                  actionError={step2ActionError}
                  onOpenSearch={openCosmeticSearch}
                  onOpenDetail={openCosmeticDetail}
                  onDeleteCosmetic={handleSurveyDeleteCosmetic}
                  onEditCosmeticDate={handleSurveyEditCosmeticDate}
                  savingCosmeticItemId={cosmeticSavingItemId}
                  onSkipCosmetics={handleStepTwoNext}
                  onPrevious={goPrevious}
                  onNext={handleStepTwoNext}
                />
              )
            )}

            {currentStep === 3 && (
              loadError && !isInitialLoading ? (
                <SurveyLoadErrorBanner
                  message={loadError}
                  onRetry={loadInitialSurveyData}
                />
              ) : (
                <StepThree
                  medications={medications}
                  medicationAddMessage={medicationAddMessage}
                  isInitialLoading={isInitialLoading}
                  isSaving={isSavingSurvey}
                  savingItemId={medicationSavingItemId}
                  onOpenSearch={openMedicationSearchSheet}
                  onDeleteMedication={handleDeleteMedication}
                  onEditStartDate={(item) => openMedicationDatePicker(item, "started_at")}
                  onEditEndDate={(item) => openMedicationDatePicker(item, "expected_end_at")}
                  onSkipMedications={handleSurveySave}
                  onPrevious={goPrevious}
                  onSave={handleSurveySave}
                />
              )
            )}

            </Animated.View>


          </ScrollView>

          <Modal
            visible={isCosmeticSearchSheetVisible}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={closeCosmeticSearch}
          >
            <CosmeticSearchScreen
              onBack={closeCosmeticSearch}
              onAdded={handleCosmeticAdded}
              isModal={true}
            />
          </Modal>

          <Modal
            visible={isMedicationSearchSheetVisible}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={closeMedicationSearchSheet}
          >
            <MedicationSearchScreen
              onBack={closeMedicationSearchSheet}
              onAdded={handleMedicationAdded}
              isModal={true}
            />
          </Modal>

          <CosmeticAnalysisSheet
            visible={cosmeticDetailId != null}
            cosmeticId={cosmeticDetailId}
            variant="list"
            onClose={closeCosmeticDetail}
          />

          <RegisterDatePickerSheet
            visible={cosmeticDatePickerVisible}
            value={cosmeticDatePickerConfig?.value}
            title={cosmeticDatePickerConfig?.title}
            hint={cosmeticDatePickerConfig?.hint}
            minimumDate={cosmeticDatePickerConfig?.minimumDate}
            maximumDate={cosmeticDatePickerConfig?.maximumDate}
            onConfirm={handleCosmeticDateConfirm}
            onDismiss={closeCosmeticDatePicker}
          />

          <RegisterDatePickerSheet
            visible={isMedicationDatePickerVisible}
            value={medicationDatePickerConfig?.value}
            title={medicationDatePickerConfig?.title}
            hint={medicationDatePickerConfig?.hint}
            minimumDate={medicationDatePickerConfig?.minimumDate}
            maximumDate={medicationDatePickerConfig?.maximumDate}
            onConfirm={handleMedicationDateConfirm}
            onDismiss={closeMedicationDatePicker}
          />
        </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  screen: {
    flex: 1,
    overflow: "hidden",
  },
  stepSlide: {
    width: "100%",
  },
  scrollContent: {
    paddingHorizontal: sx(22),
    paddingTop: sy(24),
    paddingBottom: sy(52),
  },
});

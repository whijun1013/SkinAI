import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { sy } from "../../../../utils/responsive";
import COLORS from "./surveyColors";
import { HealthPanel } from "./SurveyHeader";
import {
  Section,
  Field,
  StepFooter,
  SurveySearchButton,
  SurveyStatusBanner,
  OptionalEmptyState,
} from "./SurveyComponents";
import MedicationListCard from "../../medications/components/MedicationListCard";

export default function StepThree({
  medications,
  medicationAddMessage,
  isInitialLoading = false,
  isSaving,
  savingItemId = null,
  onOpenSearch,
  onDeleteMedication,
  onEditStartDate,
  onEditEndDate,
  onSkipMedications,
  onPrevious,
  onSave,
}) {
  return (
    <>
      <HealthPanel />

      <Section>
        <Field
          label={
            medications.length > 0
              ? `등록된 약물 · ${medications.length}개`
              : "약물 추가"
          }
          noBorder={!medicationAddMessage && medications.length === 0 && !isInitialLoading}
        >
          <SurveySearchButton
            label="약물 검색하기"
            onPress={onOpenSearch}
          />
          <SurveyStatusBanner message={medicationAddMessage} tone="success" />
        </Field>

        <View style={styles.nestedList}>
          {isInitialLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={COLORS.olive} />
              <Text style={styles.loadingText}>약물 목록 불러오는 중...</Text>
            </View>
          ) : medications.length === 0 ? (
            <OptionalEmptyState
              title="아직 추가한 약물이 없어요."
              description="복용 중인 약물이 없다면 그대로 넘어가도 됩니다."
              buttonLabel="나중에 입력할게요"
              onPress={onSkipMedications}
            />
          ) : (
            <View style={styles.listStack}>
              {medications.map((item) => (
                <MedicationListCard
                  key={item.id}
                  item={item}
                  onEditStartDate={onEditStartDate ? () => onEditStartDate(item) : undefined}
                  onEditEndDate={onEditEndDate ? () => onEditEndDate(item) : undefined}
                  onDelete={onDeleteMedication ? () => onDeleteMedication(item) : undefined}
                  saving={savingItemId === item.id}
                />
              ))}
            </View>
          )}
        </View>
      </Section>

      <StepFooter
        previousLabel="이전"
        nextLabel={isSaving ? "저장 중..." : "저장하고 시작하기"}
        onPrevious={onPrevious}
        onNext={onSave}
        prominent
        disabled={isSaving}
      />
    </>
  );
}

const styles = StyleSheet.create({
  nestedList: {
    marginBottom: sy(14),
    marginTop: sy(8),
  },
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingVertical: sy(8),
  },
  loadingText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  listStack: {
    borderTopColor: COLORS.line,
    borderTopWidth: 1,
    paddingTop: sy(4),
  },
});

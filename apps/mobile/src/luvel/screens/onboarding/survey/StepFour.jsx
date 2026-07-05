import { StyleSheet, Text, View } from "react-native";
import { sy } from "../../../../utils/responsive";
import COLORS from "./surveyColors";
import { HealthPanel } from "./SurveyHeader";
import {
  Section,
  Field,
  StepFooter,
  SurveySearchButton,
  OptionalEmptyState,
} from "./SurveyComponents";

export default function StepFour({
  isSaving,
  onOpenSkinLog,
  onSkipSkinLog,
  onPrevious,
}) {
  return (
    <>
      <HealthPanel />

      <Section>
        <Field
          label="마지막 단계"
          noBorder
        >
          <Text style={styles.description}>
            이제 거의 다 됐어요!{"\n"}
            오늘의 피부 상태를 기록해주시면{"\n"}
            바로 의미 있는 분석을 시작할 수 있어요.
          </Text>
        </Field>

        <View style={styles.nestedList}>
          <SurveySearchButton
            label="지금 피부 기록하기"
            onPress={onOpenSkinLog}
            icon="camera-outline"
          />
          <OptionalEmptyState
            title="기록을 나중에 할까요?"
            description="언제든지 홈 화면에서 피부 상태를 기록할 수 있습니다."
            buttonLabel="네, 바로 시작할게요"
            onPress={onSkipSkinLog}
          />
        </View>
      </Section>

      <StepFooter
        previousLabel="이전"
        nextLabel={isSaving ? "저장 중..." : "설문 완료"}
        onPrevious={onPrevious}
        onNext={onSkipSkinLog}
        disabled={isSaving}
      />
    </>
  );
}

const styles = StyleSheet.create({
  description: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.text,
    marginBottom: sy(16),
  },
  nestedList: {
    marginBottom: sy(14),
    marginTop: sy(8),
  },
});

import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { sy } from "../../../../utils/responsive";
import COLORS from "./surveyColors";
import { RoutinePanel } from "./SurveyHeader";
import {
  Section,
  Field,
  StepFooter,
  SurveySearchButton,
  SurveyStatusBanner,
  OptionalEmptyState,
} from "./SurveyComponents";
import CosmeticGroupedList from "../../cosmetics/components/CosmeticGroupedList";

function resolveCosmeticProductId(item) {
  return item?.product_id ?? item?.product?.id ?? null;
}

export default function StepTwo({
  cosmetics,
  isInitialLoading = false,
  actionError = "",
  onOpenSearch,
  onOpenDetail,
  onDeleteCosmetic,
  onEditCosmeticDate,
  savingCosmeticItemId = null,
  onSkipCosmetics,
  onPrevious,
  onNext,
}) {
  const handlePressItem = useCallback(
    (item) => {
      const productId = resolveCosmeticProductId(item);
      if (productId != null) onOpenDetail(productId);
    },
    [onOpenDetail]
  );

  return (
    <>
      <RoutinePanel />

      <Section>
        <Field
          label={cosmetics.length > 0 ? `등록된 제품 · ${cosmetics.length}개` : "제품 추가"}
          noBorder={!actionError && cosmetics.length === 0 && !isInitialLoading}
        >
          <SurveySearchButton label="제품 검색하기" onPress={onOpenSearch} />
          <SurveyStatusBanner message={actionError} tone="error" />
        </Field>

        <View style={styles.nestedList}>
          {isInitialLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={COLORS.olive} />
              <Text style={styles.loadingText}>등록된 제품 불러오는 중...</Text>
            </View>
          ) : cosmetics.length === 0 ? (
            <OptionalEmptyState
              title="아직 추가한 제품이 없어요."
              description="지금 쓰는 화장품이 없다면 그대로 넘어가도 됩니다."
              buttonLabel="나중에 추가할게요"
              onPress={onSkipCosmetics}
            />
          ) : (
            <View style={styles.listWrap}>
              <CosmeticGroupedList
                items={cosmetics}
                collapsibleCategories={false}
                defaultExpandedCategoryCount={99}
                onPressItem={handlePressItem}
                onDeleteItem={onDeleteCosmetic}
                onEditDateItem={onEditCosmeticDate}
                savingItemId={savingCosmeticItemId}
              />
            </View>
          )}
        </View>
      </Section>

      <StepFooter
        previousLabel="이전"
        nextLabel="다음"
        onPrevious={onPrevious}
        onNext={onNext}
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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: sy(8),
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.muted,
  },
  listWrap: {
    borderTopColor: COLORS.line,
    borderTopWidth: 1,
    paddingTop: sy(4),
  },
});

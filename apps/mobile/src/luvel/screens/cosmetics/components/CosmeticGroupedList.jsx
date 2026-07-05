import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  buildCategoryPreviewLabel,
  CURRENT_COSMETICS_LAYOUT,
  getCurrentCosmeticsLayoutMode,
  getDefaultExpandedCategoryCount,
  groupCosmeticsByCategory,
} from '../cosmeticDisplay';

import CosmeticListCard, {
  CosmeticCategoryHeader,
  CosmeticCategoryToggle,
} from './CosmeticListCard';

const EMPTY_GROUPS = [];

function areCardPropsEqual(prev, next) {
  const prevSaving = prev.savingItemId === prev.item.id;
  const nextSaving = next.savingItemId === next.item.id;

  return (
    prev.item.id === next.item.id &&
    prev.isPast === next.isPast &&
    prevSaving === nextSaving &&
    prev.item.started_at === next.item.started_at &&
    prev.item.ended_at === next.item.ended_at &&
    prev.item.product?.product_name === next.item.product?.product_name &&
    prev.item.product?.brand === next.item.product?.brand &&
    prev.item.product?.image_url === next.item.product?.image_url &&
    prev.onPressItem === next.onPressItem &&
    prev.onDeleteItem === next.onDeleteItem &&
    prev.onStopTodayItem === next.onStopTodayItem &&
    prev.onStopUsingItem === next.onStopUsingItem &&
    prev.onResumeUsingItem === next.onResumeUsingItem &&
    prev.onEditDateItem === next.onEditDateItem &&
    prev.onEditStartDateItem === next.onEditStartDateItem &&
    prev.onEditEndDateItem === next.onEditEndDateItem
  );
}

const CosmeticCard = React.memo(function CosmeticCard({
  item,
  isPast,
  onPressItem,
  onDeleteItem,
  onStopTodayItem,
  onStopUsingItem,
  onResumeUsingItem,
  onEditDateItem,
  onEditStartDateItem,
  onEditEndDateItem,
  savingItemId,
}) {
  return (
    <CosmeticListCard
      item={item}
      isPast={isPast}
      onPress={onPressItem ? () => onPressItem(item) : null}
      onDelete={onDeleteItem ? () => onDeleteItem(item) : null}
      onStopToday={onStopTodayItem ? () => onStopTodayItem(item) : null}
      onStopUsing={onStopUsingItem ? () => onStopUsingItem(item) : null}
      onResumeUsing={onResumeUsingItem ? () => onResumeUsingItem(item) : null}
      onEditDate={onEditDateItem ? () => onEditDateItem(item) : null}
      onEditStartDate={onEditStartDateItem ? () => onEditStartDateItem(item) : null}
      onEditEndDate={onEditEndDateItem ? () => onEditEndDateItem(item) : null}
      saving={savingItemId === item.id}
    />
  );
}, areCardPropsEqual);

const CategorySection = React.memo(function CategorySection({
  category,
  groupItems,
  expanded,
  collapsibleCategories,
  onToggleCategory,
  cardProps,
}) {
  const handleToggle = useCallback(() => onToggleCategory(category), [onToggleCategory, category]);

  const previewLabel = useMemo(
    () => (expanded ? null : buildCategoryPreviewLabel(groupItems)),
    [expanded, groupItems]
  );

  return (
    <View style={styles.group}>
      {collapsibleCategories ? (
        <CosmeticCategoryToggle
          category={category}
          count={groupItems.length}
          expanded={expanded}
          previewLabel={previewLabel}
          onPress={handleToggle}
        />
      ) : (
        <CosmeticCategoryHeader category={category} count={groupItems.length} />
      )}

      {expanded
        ? groupItems.map((item) => <CosmeticCard key={item.id} item={item} {...cardProps} />)
        : null}
    </View>
  );
});

function CosmeticGroupedList({
  items,
  isPast = false,
  flatList = false,
  autoLayout = false,
  collapsibleCategories = true,
  defaultExpandedCategoryCount = 2,
  onPressItem,
  onDeleteItem,
  onStopTodayItem,
  onStopUsingItem,
  onResumeUsingItem,
  onEditDateItem,
  onEditStartDateItem,
  onEditEndDateItem,
  savingItemId = null,
}) {
  const layoutMode = useMemo(
    () => (autoLayout ? getCurrentCosmeticsLayoutMode(items.length) : null),
    [autoLayout, items.length]
  );

  const useFlat = flatList || (autoLayout && layoutMode === CURRENT_COSMETICS_LAYOUT.FLAT);

  const expandCount = useMemo(() => {
    if (autoLayout) return getDefaultExpandedCategoryCount(layoutMode);
    return defaultExpandedCategoryCount;
  }, [autoLayout, layoutMode, defaultExpandedCategoryCount]);

  const groups = useMemo(
    () => (useFlat ? EMPTY_GROUPS : groupCosmeticsByCategory(items)),
    [items, useFlat]
  );

  const defaultExpandedCategories = useMemo(() => {
    if (useFlat || !collapsibleCategories || groups.length === 0) return new Set();
    return new Set(groups.slice(0, expandCount).map((group) => group.category));
  }, [useFlat, collapsibleCategories, groups, expandCount]);

  const layoutKey =
    useFlat || !collapsibleCategories || groups.length === 0
      ? null
      : autoLayout
        ? layoutMode
        : `manual:${expandCount}`;

  const layoutKeyRef = useRef(null);
  const [expandedOverride, setExpandedOverride] = useState(null);

  useEffect(() => {
    if (!layoutKey) {
      layoutKeyRef.current = null;
      setExpandedOverride(null);
      return;
    }
    if (layoutKeyRef.current !== layoutKey) {
      layoutKeyRef.current = layoutKey;
      setExpandedOverride(null);
    }
  }, [layoutKey]);

  const expandedCategories = expandedOverride ?? defaultExpandedCategories;

  const cardProps = useMemo(
    () => ({
      isPast,
      onPressItem,
      onDeleteItem,
      onStopTodayItem,
      onStopUsingItem,
      onResumeUsingItem,
      onEditDateItem,
      onEditStartDateItem,
      onEditEndDateItem,
      savingItemId,
    }),
    [
      isPast,
      onPressItem,
      onDeleteItem,
      onStopTodayItem,
      onStopUsingItem,
      onResumeUsingItem,
      onEditDateItem,
      onEditStartDateItem,
      onEditEndDateItem,
      savingItemId,
    ]
  );

  const toggleCategory = useCallback((category) => {
    setExpandedOverride((prev) => {
      const base = prev ?? defaultExpandedCategories;
      const next = new Set(base);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, [defaultExpandedCategories]);

  if (useFlat) {
    return (
      <View style={styles.root}>
        {items.map((item) => (
          <CosmeticCard key={item.id} item={item} {...cardProps} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {groups.map(({ category, items: groupItems }, groupIndex) => (
        <View key={category} style={groupIndex > 0 ? styles.groupSpacing : null}>
          <CategorySection
            category={category}
            groupItems={groupItems}
            expanded={!collapsibleCategories || expandedCategories.has(category)}
            collapsibleCategories={collapsibleCategories}
            onToggleCategory={toggleCategory}
            cardProps={cardProps}
          />
        </View>
      ))}
    </View>
  );
}

export default React.memo(CosmeticGroupedList);

const styles = StyleSheet.create({
  root: { gap: 0 },
  group: {},
  groupSpacing: { marginTop: 6 },
});

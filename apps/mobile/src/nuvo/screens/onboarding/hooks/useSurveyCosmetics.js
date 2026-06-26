import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import {
  deleteMyCosmetic,
  getMyCosmetics,
  updateMyCosmetic,
} from "../../../../api/cosmetics";
import useRecordCacheStore from "../../../../stores/recordCacheStore";
import { getTodayString, parseDateString } from "../../../components/search/SearchScreenParts";
import { getDefaultMinimumDate } from "../../../components/search/searchDateUtils";

/**
 * 온보딩 2단계 화장품 상태·핸들러를 담당하는 hook.
 *
 * - cosmetics 목록 로드/갱신
 * - 검색 Modal / 분석 시트 / 날짜 picker 열림 상태
 * - 삭제·날짜 수정 액션
 *
 * @param {object} params
 * @param {(cosmetics: any[]) => void} params.onCosmeticsChanged  목록 변경 시 콜백 (로드 오류 포함 외부 에러 처리용)
 */
export default function useSurveyCosmetics({ onCosmeticsChanged } = {}) {
  const [cosmetics, setCosmetics] = useState([]);
  const [actionError, setActionError] = useState("");

  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const [dateEdit, setDateEdit] = useState(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [dateSaving, setDateSaving] = useState(false);

  const refreshCosmetics = useCallback(async () => {
    const data = await getMyCosmetics(true);
    setCosmetics(data);
    onCosmeticsChanged?.(data);
  }, [onCosmeticsChanged]);

  const handleAdded = useCallback(
    async (options) => {
      try {
        await refreshCosmetics();
        useRecordCacheStore.getState().invalidateCosmeticsTab("current");
        if (!options?.keepSearchOpen) {
          setIsSearchVisible(false);
        }
        setActionError("");
      } catch {
        setActionError("제품 목록을 갱신하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    },
    [refreshCosmetics]
  );

  const openSearch = useCallback(() => {
    setActionError("");
    setIsSearchVisible(true);
  }, []);

  const closeSearch = useCallback(() => setIsSearchVisible(false), []);

  const openDetail = useCallback((productId) => setDetailId(productId), []);
  const closeDetail = useCallback(() => setDetailId(null), []);

  const openDatePicker = useCallback((item) => {
    setDateEdit(item);
    setDatePickerVisible(true);
  }, []);

  const closeDatePicker = useCallback(() => {
    if (dateSaving) return;
    setDatePickerVisible(false);
    setDateEdit(null);
  }, [dateSaving]);

  const handleDateConfirm = useCallback(
    async (dateStr) => {
      if (!dateEdit || dateSaving) return;
      setDateSaving(true);
      try {
        await updateMyCosmetic(dateEdit.id, { started_at: dateStr });
        await refreshCosmetics();
        useRecordCacheStore.getState().invalidateCosmeticsTab("current");
        setActionError("");
        setDatePickerVisible(false);
        setDateEdit(null);
      } catch (error) {
        setActionError(error.response?.data?.detail || "시작일 수정에 실패했습니다.");
      } finally {
        setDateSaving(false);
      }
    },
    [dateEdit, dateSaving, refreshCosmetics]
  );

  const handleDelete = useCallback(
    (item) => {
      Alert.alert(
        "화장품 삭제",
        `${item.product?.product_name || "이 화장품"}을(를) 삭제할까요?`,
        [
          { text: "취소", style: "cancel" },
          {
            text: "삭제",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteMyCosmetic(item.id);
                await refreshCosmetics();
                useRecordCacheStore.getState().invalidateCosmeticsTab("current");
                setActionError("");
              } catch (error) {
                setActionError(
                  error.response?.data?.detail || "화장품 삭제에 실패했습니다."
                );
              }
            },
          },
        ]
      );
    },
    [refreshCosmetics]
  );

  const datePickerConfig = useMemo(() => {
    const today = new Date();
    const base = {
      minimumDate: getDefaultMinimumDate(),
      maximumDate: today,
      title: "사용 시작일",
      hint: "최근 10년 이내 날짜만 선택할 수 있어요.",
    };
    if (!dateEdit) {
      return { ...base, value: today };
    }
    const startedAt = parseDateString(dateEdit.started_at);
    return {
      ...base,
      value: startedAt || parseDateString(getTodayString()) || today,
    };
  }, [dateEdit]);

  const savingItemId = dateSaving && dateEdit?.id ? dateEdit.id : null;

  const isOverlayOpen = isSearchVisible || detailId != null || datePickerVisible;

  const resetOverlays = useCallback(() => {
    setIsSearchVisible(false);
    setDetailId(null);
    setDatePickerVisible(false);
    setDateEdit(null);
  }, []);

  return {
    cosmetics,
    setCosmetics,
    actionError,
    setActionError,
    refreshCosmetics,

    isSearchVisible,
    openSearch,
    closeSearch,

    detailId,
    openDetail,
    closeDetail,

    datePickerVisible,
    datePickerConfig,
    savingItemId,
    openDatePicker,
    closeDatePicker,
    handleDateConfirm,

    handleAdded,
    handleDelete,
    handleEditDate: openDatePicker,

    isOverlayOpen,
    resetOverlays,
  };
}

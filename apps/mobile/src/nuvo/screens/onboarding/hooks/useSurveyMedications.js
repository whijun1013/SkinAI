import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import {
  deleteMyMedication,
  getMyMedications,
  updateMyMedication,
} from "../../../../api/medications";
import { getDefaultMinimumDate } from "../../../components/search/searchDateUtils";
import {
  parseDateString,
} from "../../../components/search/SearchScreenParts";

function normalizeMedicationsList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function getFarFutureDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 5);
  return d;
}

/**
 * 온보딩 3단계 약물 상태·핸들러를 담당하는 hook.
 */
export default function useSurveyMedications() {
  const [medications, setMedications] = useState([]);
  const [medicationAddMessage, setMedicationAddMessage] = useState("");
  const [isSearchSheetVisible, setIsSearchSheetVisible] = useState(false);

  const [dateEdit, setDateEdit] = useState(null); // { item, field }
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [dateSaving, setDateSaving] = useState(false);

  const refreshMedications = useCallback(async () => {
    const data = await getMyMedications(true);
    setMedications(normalizeMedicationsList(data));
  }, []);

  const openSearchSheet = useCallback(() => setIsSearchSheetVisible(true), []);
  const closeSearchSheet = useCallback(async () => {
    setIsSearchSheetVisible(false);
    try {
      await refreshMedications();
    } catch {
      // 검색 화면을 닫을 때 목록만 조용히 동기화
    }
  }, [refreshMedications]);

  const handleAdded = useCallback(
    async (options) => {
      try {
        await refreshMedications();
        setMedicationAddMessage("약물이 추가되었습니다.");
        if (!options?.keepSearchOpen) {
          setIsSearchSheetVisible(false);
        }
      } catch {
        Alert.alert("오류", "약물 목록을 갱신하지 못했습니다.");
      }
    },
    [refreshMedications],
  );

  const handleDeleteMedication = useCallback((item) => {
    Alert.alert("약물 삭제", `'${item.medication?.name || "약물"}'을(를) 목록에서 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMyMedication(item.id);
            setMedications((prev) => prev.filter((m) => m.id !== item.id));
          } catch (err) {
            Alert.alert("오류", err.response?.data?.detail || "삭제에 실패했습니다.");
          }
        },
      },
    ]);
  }, []);

  const openDatePicker = useCallback((item, field) => {
    setDateEdit({ item, field });
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
        const updated = await updateMyMedication(dateEdit.item.id, {
          [dateEdit.field]: dateStr,
        });
        setMedications((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m)),
        );
        setDatePickerVisible(false);
        setDateEdit(null);
      } catch (err) {
        Alert.alert("오류", err.response?.data?.detail || "날짜 수정에 실패했습니다.");
      } finally {
        setDateSaving(false);
      }
    },
    [dateEdit, dateSaving],
  );

  const datePickerConfig = useMemo(() => {
    if (!dateEdit) {
      return {
        value: new Date(),
        minimumDate: getDefaultMinimumDate(),
        maximumDate: new Date(),
        title: "날짜 선택",
      };
    }

    const { item, field } = dateEdit;
    const today = new Date();
    const startedAt = parseDateString(item.started_at);
    const expectedEndAt = parseDateString(item.expected_end_at);

    if (field === "expected_end_at") {
      return {
        value: expectedEndAt || startedAt || today,
        minimumDate: startedAt || getDefaultMinimumDate(),
        maximumDate: getFarFutureDate(),
        title: "종료 예정일",
        hint: "시작일 이후 날짜를 선택해 주세요.",
      };
    }

    return {
      value: startedAt || today,
      minimumDate: getDefaultMinimumDate(),
      maximumDate: expectedEndAt || today,
      title: "복용 시작일",
      hint: expectedEndAt
        ? "종료 예정일 이전 날짜만 선택할 수 있어요."
        : "최근 10년 이내 날짜만 선택할 수 있어요.",
    };
  }, [dateEdit]);

  const savingItemId = dateSaving && dateEdit?.item?.id ? dateEdit.item.id : null;

  const resetOverlays = useCallback(() => {
    setIsSearchSheetVisible(false);
    if (!dateSaving) {
      setDatePickerVisible(false);
      setDateEdit(null);
    }
  }, [dateSaving]);

  const isOverlayOpen = isSearchSheetVisible || datePickerVisible;

  return {
    medications,
    setMedications,
    refreshMedications,
    medicationAddMessage,

    isSearchSheetVisible,
    openSearchSheet,
    closeSearchSheet,
    handleAdded,

    handleDeleteMedication,
    datePickerVisible,
    datePickerConfig,
    savingItemId,
    openDatePicker,
    handleDateConfirm,
    closeDatePicker,
    resetOverlays,

    isOverlayOpen,
  };
}

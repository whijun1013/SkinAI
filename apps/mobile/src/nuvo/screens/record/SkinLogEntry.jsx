import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AuthImage from "../../components/AuthImage";
import {
  analyzeTodaySkinPhoto,
  createSkinLog,
  deleteSkinLog,
  getSkinLogByDate,
  getSkinLogMedgemmaStatus,
  updateSkinLog,
} from "../../../api/skinLogs";
import { useSkinLogQuery } from "../../../hooks/useRecordQueries";
import useRecordCacheStore from "../../../stores/recordCacheStore";
import { uploadSkinPhoto } from "../../../api/skin";
import { pickGalleryPhoto } from "../../../hooks/useGalleryPhoto";
import useSkinCamera from "../../../hooks/useSkinCamera";
import SkinCameraModal from "../../components/SkinCameraModal";
import { toDateStr, fromDateStr } from "./components/DateNavigator";
import {
  SCORE_COLORS,
  SCORE_LABELS,
  SKIN_TAG_CATEGORIES,
  parseConditionTags,
} from "./skinConstants";
import {
  RECORD_COLORS,
  StatusBanner,
  SubScreenFooter,
  SubScreenRoot,
  SubScreenTopBar,
  useRecordScreenInsets,
  styles as layoutStyles,
} from "./components/SubScreenLayout";

// 기록 화면 accent — RecordScreen ACCENT.skin과 통일
const SKIN = { main: "#4F603C", soft: "#E4EBD8", mid: "#C8D8A8" };

export default function SkinLogEntry({ onBack, selectedDate, onDataChanged, initialPhotoUri }) {
  const { scrollPaddingBottom } = useRecordScreenInsets();
  const scrollRef = useRef(null);
  const isNoteFocused = useRef(false);

  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(event, () => {
      if (isNoteFocused.current) {
        scrollRef.current?.scrollToEnd({ animated: true });
      }
    });
    return () => sub.remove();
  }, []);

  const date = selectedDate ?? new Date();
  const dateStr = toDateStr(date);
  const isToday = dateStr === toDateStr(new Date());

  const [score, setScore] = useState(null);
  const [tags, setTags] = useState([]);
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState(null);
  const [localPhotoUri, setLocalPhotoUri] = useState(null);
  const [saving, setSaving] = useState(false);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [aiScore, setAiScore] = useState(null);
  const [scoreUserConfirmed, setScoreUserConfirmed] = useState(false);
  const [existingLogId, setExistingLogId] = useState(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [medgemmaStatus, setMedgemmaStatus] = useState(null);
  const { data: loadedLog, isInitialLoad, error: queryError } = useSkinLogQuery(dateStr);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const initialPhotoProcessedRef = useRef(null);
  const [recentScores, setRecentScores] = useState({});

  const hasSavedScore = loadedLog?.overall_score != null;
  const isFullyConfirmed = hasSavedScore && !!(photoUrl || loadedLog?.photo_url);
  const photoActionDisabled = saving || pickingPhoto || analyzingPhoto;
  const isLocalPhotoUri = (uri) => uri && !/^https?:\/\//i.test(uri);

  const processSelectedPhoto = useCallback(
    async (photoUri) => {
      if (!photoUri || saving || pickingPhoto || analyzingPhoto) return;
      setLocalPhotoUri(photoUri);
      if (!isToday) return;
      setAnalyzingPhoto(true);
      try {
        const uploadResult = await uploadSkinPhoto(photoUri, { createLog: true });
        if (uploadResult?.imageUrl) setPhotoUrl(uploadResult.imageUrl);
        if (uploadResult?.skinLogId) setExistingLogId(uploadResult.skinLogId);
        if (uploadResult?.qualityWarning) Alert.alert("사진 품질 안내", uploadResult.qualityWarning);
        if (hasSavedScore) {
          useRecordCacheStore.getState().invalidateSkin(dateStr);
          return;
        }
        await analyzeTodaySkinPhoto();
        useRecordCacheStore.getState().invalidateSkin(dateStr);
      } catch (error) {
        const detail = error?.response?.data?.detail;
        Alert.alert(
          "AI 분석 실패",
          typeof detail === "string"
            ? detail
            : "사진은 선택되었지만 추천 점수를 불러오지 못했습니다. 점수를 직접 선택해 주세요."
        );
      } finally {
        setAnalyzingPhoto(false);
      }
    },
    [dateStr, hasSavedScore, isToday, saving, pickingPhoto, analyzingPhoto]
  );

  const handleScoreSelect = (value) => {
    if (saving) return;
    setScore(value);
    setScoreUserConfirmed(true);
  };

  const { showCamera, handleSkinCamera, handleCapture, handleClose } = useSkinCamera((capture) => {
    void processSelectedPhoto(capture.photo_uri);
  });

  const displayPhotoUri = localPhotoUri || photoUrl || loadedLog?.photo_url;

  const handlePickGallery = async () => {
    if (photoActionDisabled) return;
    setPickingPhoto(true);
    try {
      const capture = await pickGalleryPhoto(dateStr);
      if (capture?.photo_uri) await processSelectedPhoto(capture.photo_uri);
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleAddPhoto = () => {
    if (photoActionDisabled) return;
    if (!isToday) void handlePickGallery();
  };

  useEffect(() => {
    if (isInitialLoad) return;
    if (loadedLog) {
      setExistingLogId(loadedLog.id);
      setScore(loadedLog.overall_score ?? loadedLog.ai_overall_score ?? null);
      setAiScore(loadedLog.ai_overall_score ?? null);
      setScoreUserConfirmed(loadedLog.overall_score != null);
      setTags(parseConditionTags(loadedLog.condition_tags));
      setNote(loadedLog.note ?? "");
      setPhotoUrl(loadedLog.photo_url ?? null);
      setLocalPhotoUri(initialPhotoUri ?? null);
    } else {
      setExistingLogId(null);
      setScore(null);
      setAiScore(null);
      setScoreUserConfirmed(false);
      setTags([]);
      setNote("");
      setPhotoUrl(null);
      setLocalPhotoUri(initialPhotoUri ?? null);
    }
  }, [loadedLog, isInitialLoad, dateStr, initialPhotoUri]);

  useEffect(() => {
    if (isInitialLoad || !initialPhotoUri || !isToday) return;
    const marker = `${dateStr}:${initialPhotoUri}`;
    if (initialPhotoProcessedRef.current === marker) return;
    initialPhotoProcessedRef.current = marker;
    void processSelectedPhoto(initialPhotoUri);
  }, [dateStr, initialPhotoUri, isInitialLoad, isToday, processSelectedPhoto]);

  useEffect(() => {
    let intervalId;
    let cancelled = false;
    const TERMINAL = new Set(["done", "failed", "cancelled"]);
    if (!existingLogId) { setMedgemmaStatus(null); return undefined; }
    const checkStatus = () => {
      getSkinLogMedgemmaStatus(existingLogId)
        .then((data) => {
          if (cancelled) return;
          setMedgemmaStatus(data);
          if (TERMINAL.has(data?.status)) {
            globalThis.clearInterval(intervalId);
          }
        })
        .catch(() => {
          if (!cancelled) globalThis.clearInterval(intervalId);
        });
    };
    checkStatus();
    intervalId = globalThis.setInterval(checkStatus, 3000);
    return () => { cancelled = true; globalThis.clearInterval(intervalId); };
  }, [existingLogId]);

  // 최근 6일 점수 fetch (선택 날짜 기준 이전 6일)
  useEffect(() => {
    const end = fromDateStr(dateStr);
    const days = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(end);
      d.setDate(end.getDate() - (6 - i));
      return toDateStr(d);
    });
    Promise.all(
      days.map(async (ds) => {
        const cached = useRecordCacheStore.getState().skinByDate?.[ds];
        if (cached?.data !== undefined) return [ds, cached.data?.overall_score ?? null];
        try {
          const log = await getSkinLogByDate(ds);
          return [ds, log?.overall_score ?? null];
        } catch {
          return [ds, null];
        }
      })
    ).then((results) => setRecentScores(Object.fromEntries(results)));
  }, [dateStr]);

  // 7일 trend (선택 날짜가 맨 오른쪽)
  const trendDays = (() => {
    const end = fromDateStr(dateStr);
    const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(end);
      d.setDate(end.getDate() - (6 - i));
      const ds = toDateStr(d);
      return {
        key: `trend-${i}`,
        dateStr: ds,
        dayLabel: DAY_LABELS[d.getDay()],
        isSelected: ds === dateStr,
        score: ds === dateStr ? score : (recentScores[ds] ?? null),
      };
    });
  })();

  const toggleTag = (tag) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleDelete = () => {
    if (!existingLogId) return;
    Alert.alert(
      "기록 삭제",
      "이 날의 피부 기록을 삭제할까요?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSkinLog(existingLogId);
              useRecordCacheStore.getState().invalidateSkin(dateStr);
              onDataChanged?.();
              onBack();
            } catch {
              Alert.alert("오류", "삭제에 실패했습니다. 다시 시도해 주세요.");
            }
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    if (!score) { Alert.alert("점수 선택 필요", "피부 상태 점수(1~5)를 선택해 주세요."); return; }
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      let resolvedPhotoUrl = photoUrl || null;
      const shouldUploadLocalPhoto = isLocalPhotoUri(localPhotoUri) && (!resolvedPhotoUrl || !isToday);
      if (shouldUploadLocalPhoto) {
        const { imageUrl, skinLogId } = await uploadSkinPhoto(localPhotoUri, { createLog: isToday });
        resolvedPhotoUrl = imageUrl;
        if (skinLogId) setExistingLogId(skinLogId);
      }
      const payload = {
        overall_score: score,
        condition_tags: tags.length > 0 ? tags : null,
        note: note.trim() || null,
      };
      if (resolvedPhotoUrl) payload.photo_url = resolvedPhotoUrl;
      if (existingLogId) {
        await updateSkinLog(existingLogId, payload);
      } else {
        const created = await createSkinLog({ ...payload, logged_at: dateStr });
        setExistingLogId(created?.id ?? null);
      }
      useRecordCacheStore.getState().invalidateSkin(dateStr);
      onDataChanged?.();
      setSavedSuccess(true);
      setTimeout(() => onBack(), 800);
    } catch (error) {
      const detail = error?.response?.data?.detail;
      setSaveError(typeof detail === "string" ? detail : "피부 기록 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const showAiSection =
    medgemmaStatus &&
    medgemmaStatus.status !== "none" &&
    medgemmaStatus.status !== "not_requested";

  return (
    <>
      <SkinCameraModal visible={showCamera} onCapture={handleCapture} onClose={handleClose} />
      <SubScreenRoot onBack={onBack} enabled={!showCamera}>
        <KeyboardAvoidingView
          style={S.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <SubScreenTopBar
            title="피부 기록"
            dateLabel={isToday ? "오늘" : dateStr}
            onBack={onBack}
            accentColor={SKIN.main}

            trailing={
              isInitialLoad ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
              ) : existingLogId ? (
                <TouchableOpacity
                  onPress={handleDelete}
                  style={S.deleteBtn}
                  activeOpacity={0.75}
                >
                  <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
              ) : null
            }
          />

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[S.scroll, { paddingBottom: scrollPaddingBottom }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={true}
          >
            {/* ── 상태 배너 ── */}
            {savedSuccess ? (
              <StatusBanner icon="checkmark-circle" text="저장되었습니다." />
            ) : saveError ? (
              <StatusBanner icon="alert-circle-outline" text={saveError} variant="error" onPress={() => setSaveError(null)} />
            ) : queryError && !isInitialLoad ? (
              <StatusBanner icon="alert-circle-outline" text="기록을 불러오지 못했습니다." variant="error" onPress={() => useRecordCacheStore.getState().invalidateSkin(dateStr)} />
            ) : existingLogId ? (
              <StatusBanner
                icon="checkmark-circle"
                text={
                  isFullyConfirmed
                    ? "확정된 기록이에요 · 수정 가능"
                    : hasSavedScore
                    ? "점수만 저장됐어요 · 사진을 추가할 수 있어요"
                    : isToday
                    ? "사진 기반 추천 점수를 확인하고 저장해 보세요"
                    : "이 날 기록을 수정할 수 있어요"
                }
              />
            ) : !isToday ? (
              <StatusBanner icon="calendar-outline" text="이 날 피부 기록이 없습니다" variant="empty" />
            ) : null}

            {/* ══════════════════════════════════
                PHOTO (최상단 — 확인/수정 시 사진 즉시 확인)
            ══════════════════════════════════ */}
            <View style={S.section}>

              {displayPhotoUri ? (
                <View style={S.photoWrap}>
                  <AuthImage uri={displayPhotoUri} style={S.photoImg} />
                  {isToday ? (
                    <View style={S.photoOverlay}>
                      <TouchableOpacity
                        style={S.photoOverlayBtn}
                        onPress={() => { if (!photoActionDisabled) handleSkinCamera(); }}
                        activeOpacity={0.85}
                        disabled={photoActionDisabled}
                      >
                        <Ionicons name="camera" size={13} color="#fff" />
                        <Text style={S.photoOverlayBtnText}>
                          {analyzingPhoto ? "분석 중" : "다시 촬영"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={S.photoOverlayBtn}
                        onPress={() => void handlePickGallery()}
                        activeOpacity={0.85}
                        disabled={photoActionDisabled}
                      >
                        <Ionicons name="images" size={13} color="#fff" />
                        <Text style={S.photoOverlayBtnText}>
                          {pickingPhoto ? "불러오는 중" : "갤러리"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[S.photoOverlay, { justifyContent: "flex-end" }]}
                      onPress={handleAddPhoto}
                      activeOpacity={0.85}
                      disabled={photoActionDisabled}
                    >
                      <View style={S.photoOverlayBtn}>
                        <Ionicons name="images" size={13} color="#fff" />
                        <Text style={S.photoOverlayBtnText}>
                          {pickingPhoto ? "불러오는 중" : "다시 선택"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              ) : isToday ? (
                <View style={S.photoEmpty}>
                  <TouchableOpacity
                    style={S.photoEmptyBtn}
                    onPress={() => { if (!photoActionDisabled) handleSkinCamera(); }}
                    activeOpacity={0.8}
                    disabled={photoActionDisabled}
                  >
                    {analyzingPhoto
                      ? <ActivityIndicator size="small" color={SKIN.main} />
                      : <Ionicons name="camera-outline" size={22} color={SKIN.main} />}
                    <Text style={S.photoEmptyBtnLabel}>카메라</Text>
                  </TouchableOpacity>
                  <View style={S.photoEmptyDivider} />
                  <TouchableOpacity
                    style={S.photoEmptyBtn}
                    onPress={() => void handlePickGallery()}
                    activeOpacity={0.8}
                    disabled={photoActionDisabled}
                  >
                    {pickingPhoto
                      ? <ActivityIndicator size="small" color={SKIN.main} />
                      : <Ionicons name="images-outline" size={22} color={SKIN.main} />}
                    <Text style={S.photoEmptyBtnLabel}>갤러리</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={S.photoEmptyPast}
                  onPress={handleAddPhoto}
                  activeOpacity={0.8}
                  disabled={photoActionDisabled}
                >
                  <Ionicons name="images-outline" size={24} color={SKIN.main} />
                  <Text style={S.photoEmptyPastLabel}>갤러리에서 선택</Text>
                  <Text style={S.photoEmptyPastSub}>해당 날짜에 찍은 사진만</Text>
                </TouchableOpacity>
              )}

              {/* AI 분석 인라인 */}
              {showAiSection ? (
                <View style={S.aiCard}>
                  {/* 카드 헤더 */}
                  <View style={S.aiCardHead}>
                    <View style={S.aiCardHeadIcon}>
                      {["pending", "running", "processing"].includes(medgemmaStatus.status)
                        ? <ActivityIndicator size="small" color={SKIN.main} />
                        : <Ionicons name="sparkles" size={15} color={SKIN.main} />
                      }
                    </View>
                    <Text style={S.aiCardHeadLabel}>AI 피부 분석</Text>
                    {medgemmaStatus.status === "done" && (
                      <View style={S.aiDonePill}>
                        <Text style={S.aiDonePillText}>완료</Text>
                      </View>
                    )}
                    {medgemmaStatus.status === "failed" && (
                      <View style={S.aiFailPill}>
                        <Text style={S.aiFailPillText}>분석 실패</Text>
                      </View>
                    )}
                  </View>

                  {/* 카드 바디 */}
                  <View style={S.aiCardBody}>
                    {medgemmaStatus.status === "pending" ? (
                      <Text style={S.aiStateText}>분석 대기 중이에요</Text>
                    ) : ["running", "processing"].includes(medgemmaStatus.status) ? (
                      <Text style={S.aiStateText}>사진을 분석하는 중이에요...</Text>
                    ) : medgemmaStatus.status === "failed" ? (
                      <Text style={[S.aiStateText, { color: RECORD_COLORS.hint }]}>
                        {medgemmaStatus.message_for_user || "분석에 실패했습니다."}
                      </Text>
                    ) : medgemmaStatus.status === "cancelled" ? (
                      <Text style={[S.aiStateText, { color: RECORD_COLORS.muted }]}>
                        사진이 변경되어 이전 분석이 취소됐어요
                      </Text>
                    ) : medgemmaStatus.status === "done" ? (
                      <View style={S.aiDoneWrap}>
                        {/* 요약 텍스트 */}
                        {(medgemmaStatus.primary_visual_summary || medgemmaStatus.display_summary) ? (
                          <Text style={S.aiSummary}>
                            {medgemmaStatus.primary_visual_summary || medgemmaStatus.display_summary}
                          </Text>
                        ) : null}

                        {/* 3가지 신호 */}
                        {medgemmaStatus.observations && (
                          <View style={S.aiSignalList}>
                            {["active_lesion", "redness", "barrier"].map((key, idx) => {
                              const obs = medgemmaStatus.observations[key];
                              if (!obs) return null;
                              const isNone = obs.score === "none";
                              const isLast = idx === 2;
                              return (
                                <View key={key}>
                                  <View style={S.aiSignalRow}>
                                    <View style={[S.aiSignalDot, isNone && S.aiSignalDotMuted]} />
                                    <Text style={[S.aiSignalLabel, isNone && S.aiSignalLabelMuted]} numberOfLines={1}>
                                      {obs.label}
                                    </Text>
                                    <View style={[S.aiSignalBadge, isNone ? S.aiSignalBadgeMuted : S.aiSignalBadgeActive]}>
                                      <Text style={[S.aiSignalBadgeText, isNone ? S.aiSignalBadgeTextMuted : S.aiSignalBadgeTextActive]}>
                                        {obs.level_label}
                                      </Text>
                                    </View>
                                  </View>
                                  {!isLast && <View style={S.aiSignalDivider} />}
                                </View>
                              );
                            })}
                          </View>
                        )}


                        <Text style={S.aiDisclaimer}>※ 의학적 진단이 아닌 사진 기반 참고 분석입니다.</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>

            {/* ══════════════════════════════════
                SCORE (사진 아래)
            ══════════════════════════════════ */}
            <View style={S.divider} />
            <View style={S.section}>
              {/* 최근 7일 trend strip */}
              <View style={S.trendStrip}>
                {trendDays.map(({ key, dateStr: ds, dayLabel, isSelected, score: s }) => {
                  const palette = s ? SCORE_COLORS[s] : null;
                  return (
                    <View key={key} style={S.trendItem}>
                      <Text style={[S.trendDayLabel, isSelected && S.trendDayLabelActive]}>
                        {isSelected && isToday ? "오늘" : dayLabel}
                      </Text>
                      <View style={[
                        S.trendTile,
                        palette ? { backgroundColor: palette.active } : S.trendTileEmpty,
                        isSelected && S.trendTileSelected,
                      ]}>
                        <Text style={[S.trendTileNum, !palette && S.trendTileNumEmpty]}>
                          {s ?? "·"}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* 필수 표시 */}
              <View style={S.requiredRow}>
                <View style={S.requiredPill}>
                  <Text style={S.requiredPillText}>점수 필수</Text>
                </View>
              </View>

              {/* AI 추천 */}
              {aiScore != null && isToday && !hasSavedScore ? (
                <View style={S.aiHint}>
                  <Ionicons name="sparkles" size={13} color={SKIN.main} />
                  <Text style={S.aiHintText}>
                    AI 추천 {aiScore}점 · {SCORE_LABELS[aiScore]}
                    {scoreUserConfirmed ? "" : "  —  탭하면 확정"}
                  </Text>
                </View>
              ) : null}

              {/* 5개 점수 버튼 */}
              <View style={S.scoreRow}>
                {[1, 2, 3, 4, 5].map((s) => {
                  const active = score === s;
                  const confirmed = active && scoreUserConfirmed;
                  const aiSuggested = active && !scoreUserConfirmed && aiScore === s;
                  const palette = SCORE_COLORS[s];
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[
                        S.scoreBtn,
                        confirmed
                          ? { backgroundColor: palette.active, borderColor: palette.active }
                          : aiSuggested
                          ? { backgroundColor: palette.bg, borderColor: palette.active, borderStyle: "dashed" }
                          : { backgroundColor: palette.bg, borderColor: palette.border },
                      ]}
                      onPress={() => handleScoreSelect(s)}
                      activeOpacity={0.78}
                      disabled={saving}
                    >
                      <Text style={[S.scoreBtnNum, confirmed && S.scoreBtnNumActive]}>
                        {s}
                      </Text>
                      <Text
                        style={[S.scoreBtnLabel, confirmed && S.scoreBtnLabelActive]}
                        numberOfLines={1}
                      >
                        {SCORE_LABELS[s]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {!score && !analyzingPhoto ? (
                <Text style={S.scoreGuide}>가장 가까운 상태를 선택해 주세요</Text>
              ) : analyzingPhoto && !score ? (
                <Text style={S.scoreGuide}>사진 기반 추천 점수를 분석 중이에요</Text>
              ) : null}
            </View>

            {/* ══════════════════════════════════
                TAGS
            ══════════════════════════════════ */}
            <View style={S.divider} />
            <View style={S.section}>

              {SKIN_TAG_CATEGORIES.map((cat, i) => (
                <View key={cat.id} style={[S.tagGroup, i > 0 && S.tagGroupGap]}>
                  <Text style={S.tagGroupLabel}>{cat.label}</Text>
                  <View style={S.tagRow}>
                    {cat.tags.map((tag) => {
                      const active = tags.includes(tag);
                      return (
                        <TouchableOpacity
                          key={tag}
                          style={[S.tagChip, active && S.tagChipActive]}
                          onPress={() => !saving && toggleTag(tag)}
                          activeOpacity={0.75}
                          disabled={saving}
                        >
                          <Text style={[S.tagChipText, active && S.tagChipTextActive]}>
                            {tag}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}

              {tags.length > 0 ? (
                <Text style={S.tagCount}>{tags.length}개 선택됨</Text>
              ) : null}
            </View>

            {/* ══════════════════════════════════
                NOTE
            ══════════════════════════════════ */}
            <View style={S.divider} />
            <View
              style={S.section}
              onLayout={(e) => {
                // note 섹션 위치 기록 — keyboardWillShow 시 scrollToEnd에 활용
                void e.nativeEvent.layout;
              }}
            >
              <TextInput
                style={S.noteInput}
                placeholder="특이사항, 사용 화장품 등을 자유롭게"
                placeholderTextColor={RECORD_COLORS.muted}
                multiline
                numberOfLines={4}
                maxLength={500}
                value={note}
                onChangeText={setNote}
                textAlignVertical="top"
                onFocus={() => { isNoteFocused.current = true; }}
                onBlur={() => { isNoteFocused.current = false; }}
              />
              <Text style={S.charCount}>{note.length} / 500</Text>
            </View>
          </ScrollView>

          <SubScreenFooter
            label={existingLogId ? "수정 저장" : "저장하기"}
            onPress={handleSave}
            disabled={!score}
            saving={saving}
            color={SKIN.main}
          />
        </KeyboardAvoidingView>
      </SubScreenRoot>
    </>
  );
}

const S = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  // ── 헤더 삭제 버튼 ──
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── 섹션 공통 ──
  section: { paddingVertical: 4 },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: RECORD_COLORS.line,
    marginVertical: 22,
  },

  // ── 필수 표시 ──
  requiredRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  requiredPill: {
    backgroundColor: "rgba(196,92,74,0.09)",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(196,92,74,0.20)",
  },
  requiredPillText: { fontSize: 11.5, fontWeight: "800", color: "#C45C4A" },

  // ── Trend strip ──
  trendStrip: {
    flexDirection: "row",
    marginBottom: 16,
  },
  trendItem: { flex: 1, alignItems: "center", gap: 6 },
  trendDayLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: RECORD_COLORS.muted,
  },
  trendDayLabelActive: {
    fontWeight: "800",
    color: SKIN.main,
  },
  trendTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  trendTileEmpty: {
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
  },
  trendTileSelected: {
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.13, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 3 },
    }),
  },
  trendTileNum: {
    fontSize: 14,
    fontWeight: "900",
    color: "#fff",
    includeFontPadding: false,
  },
  trendTileNumEmpty: {
    fontSize: 16,
    color: RECORD_COLORS.line,
    fontWeight: "300",
  },

  // ── AI 추천 힌트 ──
  aiHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: SKIN.soft,
  },
  aiHintText: { fontSize: 13, fontWeight: "700", color: SKIN.main, flex: 1 },

  // ── 점수 ──
  scoreRow: { flexDirection: "row", gap: 6 },
  scoreBtn: {
    flex: 1,
    height: 78,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  scoreBtnNum: {
    fontSize: 24,
    fontWeight: "900",
    color: RECORD_COLORS.text,
    lineHeight: 28,
    includeFontPadding: false,
  },
  scoreBtnNumActive: { color: "#fff" },
  scoreBtnLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5A6070",
    textAlign: "center",
    paddingHorizontal: 2,
  },
  scoreBtnLabelActive: { color: "rgba(255,255,255,0.9)" },
  scoreGuide: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "600",
    color: RECORD_COLORS.muted,
    textAlign: "center",
  },

  // ── 사진 ──
  photoWrap: { borderRadius: 18, overflow: "hidden", position: "relative" },
  photoImg: { width: "100%", height: 240, backgroundColor: RECORD_COLORS.chip },
  photoOverlay: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    gap: 6,
  },
  photoOverlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(26,31,23,0.70)",
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
  },
  photoOverlayBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },

  photoEmpty: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: SKIN.mid,
    borderStyle: "dashed",
    backgroundColor: SKIN.soft,
    overflow: "hidden",
    height: 130,
  },
  photoEmptyBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: "100%",
  },
  photoEmptyBtnLabel: { fontSize: 14, fontWeight: "800", color: SKIN.main },
  photoEmptyDivider: { width: 1, height: 40, backgroundColor: SKIN.mid },

  photoEmptyPast: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: SKIN.mid,
    borderStyle: "dashed",
    backgroundColor: SKIN.soft,
    height: 120,
    gap: 6,
  },
  photoEmptyPastLabel: { fontSize: 15, fontWeight: "800", color: SKIN.main },
  photoEmptyPastSub: { fontSize: 12.5, fontWeight: "600", color: RECORD_COLORS.muted },

  // ── AI 분석 카드 ──
  aiCard: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: SKIN.mid,
    backgroundColor: RECORD_COLORS.card,
    overflow: "hidden",
  },
  aiCardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: RECORD_COLORS.card,
  },
  aiCardHeadIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: SKIN.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  aiCardHeadLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: SKIN.main,
    letterSpacing: -0.2,
  },
  aiDonePill: {
    backgroundColor: SKIN.soft,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
  },
  aiDonePillText: { fontSize: 11, fontWeight: "800", color: SKIN.main },
  aiFailPill: {
    backgroundColor: "#FDEAE6",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
  },
  aiFailPillText: { fontSize: 11, fontWeight: "800", color: "#B04030" },

  aiCardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  aiStateText: {
    fontSize: 13,
    fontWeight: "600",
    color: RECORD_COLORS.muted,
    marginTop: 8,
  },
  aiDoneWrap: { gap: 8, marginTop: 6 },
  aiSummary: {
    fontSize: 13.5,
    fontWeight: "700",
    color: RECORD_COLORS.text,
    lineHeight: 21,
  },

  // 신호 목록
  aiSignalList: {
    borderRadius: 12,
    backgroundColor: RECORD_COLORS.chip,
    overflow: "hidden",
  },
  aiSignalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  aiSignalDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: SKIN.main,
    flexShrink: 0,
  },
  aiSignalDotMuted: { backgroundColor: RECORD_COLORS.line },
  aiSignalLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: RECORD_COLORS.text,
  },
  aiSignalLabelMuted: { color: RECORD_COLORS.muted },
  aiSignalBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  aiSignalBadgeActive:  { backgroundColor: SKIN.soft },
  aiSignalBadgeMuted:   { backgroundColor: RECORD_COLORS.line },
  aiSignalBadgeText:    { fontSize: 11.5, fontWeight: "700" },
  aiSignalBadgeTextActive: { color: SKIN.main },
  aiSignalBadgeTextMuted:  { color: RECORD_COLORS.muted },
  aiSignalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: RECORD_COLORS.line,
    marginLeft: 29,
  },

  aiDisclaimer: { fontSize: 10.5, color: RECORD_COLORS.muted, lineHeight: 15 },

  // ── 태그 ──
  tagGroup: {},
  tagGroupGap: { marginTop: 16 },
  tagGroupLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5A6070",
    letterSpacing: 0.3,
    marginBottom: 9,
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
  },
  tagChipActive: { backgroundColor: SKIN.main, borderColor: SKIN.main },
  tagChipText: { fontSize: 14, fontWeight: "700", color: RECORD_COLORS.text },
  tagChipTextActive: { color: "#fff" },
  tagCount: {
    marginTop: 12,
    fontSize: 12.5,
    fontWeight: "700",
    color: RECORD_COLORS.oliveMuted,
  },

  // ── 메모 ──
  noteInput: {
    backgroundColor: RECORD_COLORS.chip,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    padding: 14,
    minHeight: 110,
    fontSize: 15,
    lineHeight: 23,
    color: RECORD_COLORS.text,
  },
  charCount: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: "600",
    color: RECORD_COLORS.muted,
    textAlign: "right",
  },
});

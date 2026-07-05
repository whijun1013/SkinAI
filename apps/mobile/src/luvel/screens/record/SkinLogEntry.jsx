import { devLog } from '../../../utils/devLogger';
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AuthImage from "../../components/AuthImage";
import {
  analyzeTodaySkinPhoto,
  createSkinLog,
  getSkinLogMedgemmaStatus,
  updateSkinLog,
} from "../../../api/skinLogs";
import { useSkinLogQuery } from "../../../hooks/useRecordQueries";
import useRecordCacheStore from "../../../stores/recordCacheStore";
import { uploadSkinPhoto } from "../../../api/skin";
import { pickGalleryPhoto } from "../../../hooks/useGalleryPhoto";
import useSkinCamera from "../../../hooks/useSkinCamera";
import SkinCameraModal from "../../components/SkinCameraModal";
import { toDateStr } from "./components/DateNavigator";
import { SCORE_COLORS, SCORE_LABELS, SKIN_TAG_OPTIONS, parseConditionTags } from "./skinConstants";
import {
  RECORD_COLORS,
  SectionCard,
  StatusBanner,
  SubScreenFooter,
  SubScreenRoot,
  SubScreenTopBar,
  useRecordScreenInsets,
  styles as layoutStyles,
} from "./components/SubScreenLayout";

export default function SkinLogEntry({ onBack, selectedDate, onDataChanged, initialPhotoUri }) {
  const { scrollPaddingBottom } = useRecordScreenInsets();
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
  const [scoreUserConfirmed, setScoreUserConfirmed] = useState(false);
  const [existingLogId, setExistingLogId] = useState(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [medgemmaStatus, setMedgemmaStatus] = useState(null);
  const [showMedgemmaDetails, setShowMedgemmaDetails] = useState(false);
  const { data: loadedLog, isInitialLoad, error: queryError } = useSkinLogQuery(dateStr);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [isSimpleMode, setIsSimpleMode] = useState(true);
  const initialPhotoProcessedRef = useRef(null);

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
        if (uploadResult?.imageUrl) {
          setPhotoUrl(uploadResult.imageUrl);
        }
        if (uploadResult?.skinLogId) {
          setExistingLogId(uploadResult.skinLogId);
        }
        if (uploadResult?.qualityWarning) {
          Alert.alert("사진 품질 안내", uploadResult.qualityWarning);
        }

        if (hasSavedScore) {
          useRecordCacheStore.getState().invalidateSkin(dateStr);
          return;
        }

        await analyzeTodaySkinPhoto();
        useRecordCacheStore.getState().invalidateSkin(dateStr);
      } catch (error) {
        const status = error?.response?.status;
        const detail = error?.response?.data?.detail;
        console.error("[Skin] AI 사진 분석 실패", status, detail || error?.message);
        Alert.alert(
          "AI 분석 실패",
          typeof detail === "string"
            ? detail
            : "사진은 선택되었지만 사진 기반 추천 점수를 불러오지 못했습니다. 점수를 직접 선택해 주세요."
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
      if (capture?.photo_uri) {
        await processSelectedPhoto(capture.photo_uri);
      }
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleAddPhoto = () => {
    if (photoActionDisabled) return;
    if (!isToday) {
      void handlePickGallery();
    }
  };

  useEffect(() => {
    if (isInitialLoad) return;
    if (loadedLog) {
      setExistingLogId(loadedLog.id);
      setScore(loadedLog.overall_score ?? null);
      setScoreUserConfirmed(loadedLog.overall_score != null);
      setTags(parseConditionTags(loadedLog.condition_tags));
      setNote(loadedLog.note ?? "");
      setPhotoUrl(loadedLog.photo_url ?? null);
      setLocalPhotoUri(initialPhotoUri ?? null);
      if (loadedLog.photo_url || parseConditionTags(loadedLog.condition_tags).length > 0) {
        setIsSimpleMode(false);
      }
    } else {
      setExistingLogId(null);
      setScore(null);
      setScoreUserConfirmed(false);
      setTags([]);
      setNote("");
      setPhotoUrl(null);
      setLocalPhotoUri(initialPhotoUri ?? null);
      if (initialPhotoUri) {
        setIsSimpleMode(false);
      }
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
    if (!existingLogId) {
      setMedgemmaStatus(null);
      return undefined;
    }

    const checkStatus = () => {
      getSkinLogMedgemmaStatus(existingLogId)
        .then((data) => {
          setMedgemmaStatus(data);
          if (data?.status !== "pending" && data?.status !== "running") {
            if (intervalId) globalThis.clearInterval(intervalId);
          }
        })
        .catch((err) => {
          devLog("MedGemma status fetch error:", err?.message);
          if (intervalId) globalThis.clearInterval(intervalId);
        });
    };

    checkStatus();
    intervalId = globalThis.setInterval(checkStatus, 3000);
    return () => {
      if (intervalId) globalThis.clearInterval(intervalId);
    };
  }, [existingLogId]);

  const toggleTag = (tag) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleSave = async () => {
    if (!score) {
      Alert.alert("점수 선택 필요", "피부 상태 점수(1~5)를 선택해 주세요.");
      return;
    }
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      let resolvedPhotoUrl = photoUrl || null;
      // 과거 날짜는 processSelectedPhoto에서 업로드하지 않음.
      // 기존 photoUrl이 있어도 localPhotoUri( file:// 등 )가 있으면 새 사진으로 교체해야 함.
      const shouldUploadLocalPhoto =
        isLocalPhotoUri(localPhotoUri) && (!resolvedPhotoUrl || !isToday);

      if (shouldUploadLocalPhoto) {
        const { imageUrl, skinLogId } = await uploadSkinPhoto(localPhotoUri, {
          createLog: isToday,
        });
        resolvedPhotoUrl = imageUrl;
        if (skinLogId) {
          setExistingLogId(skinLogId);
        }
      }

      const payload = {
        overall_score: score,
        condition_tags: tags.length > 0 ? tags : null,
        note: note.trim() || null,
      };
      if (resolvedPhotoUrl) {
        payload.photo_url = resolvedPhotoUrl;
      }

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
      console.error("[Skin] 저장 실패", error?.message);
      setSaveError(typeof detail === "string" ? detail : "피부 기록 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SkinCameraModal visible={showCamera} onCapture={handleCapture} onClose={handleClose} />

      <SubScreenRoot onBack={onBack} enabled={!showCamera}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <SubScreenTopBar
            title="피부 기록"
            dateLabel={isToday ? "오늘" : dateStr}
            onBack={onBack}
            trailing={
              isInitialLoad ? (
                <ActivityIndicator size="small" color={RECORD_COLORS.olive} />
              ) : (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: RECORD_COLORS.chip, borderRadius: 12, borderWidth: 1, borderColor: RECORD_COLORS.line }}
                  onPress={() => setIsSimpleMode(!isSimpleMode)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={isSimpleMode ? "flash" : "list"} size={14} color={RECORD_COLORS.olive} />
                  <Text style={{ fontSize: 12, fontWeight: "800", color: RECORD_COLORS.olive }}>
                    {isSimpleMode ? "간편 모드" : "상세 모드"}
                  </Text>
                </TouchableOpacity>
              )
            }
          />

          <ScrollView
            contentContainerStyle={[
              layoutStyles.scrollContent,
              { paddingBottom: scrollPaddingBottom },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {savedSuccess ? (
              <StatusBanner icon="checkmark-circle" text="저장되었습니다." />
            ) : saveError ? (
              <StatusBanner
                icon="alert-circle-outline"
                text={saveError}
                variant="error"
                onPress={() => setSaveError(null)}
              />
            ) : queryError && !isInitialLoad ? (
              <StatusBanner
                icon="alert-circle-outline"
                text="기록을 불러오지 못했습니다. 저장하면 새 기록이 생성됩니다."
                variant="error"
                onPress={() => useRecordCacheStore.getState().invalidateSkin(dateStr)}
              />
            ) : existingLogId ? (
              <StatusBanner
                icon="checkmark-circle"
                text={
                  isFullyConfirmed
                    ? "확정된 기록이에요 · 사진 교체·점수·메모 수정 가능"
                    : hasSavedScore
                    ? "점수만 저장됐어요 · 사진을 추가할 수 있어요"
                    : isToday
                    ? "사진 기반 추천 점수를 확인한 뒤 저장하면 기록이 확정됩니다"
                    : "이 날 기록을 수정할 수 있어요"
                }
              />
            ) : !isToday ? (
              <StatusBanner icon="calendar-outline" text="이 날 피부 기록이 없습니다" variant="empty" />
            ) : null}

          {!isSimpleMode && (
            <>
              <SectionCard
                title="피부 사진"
                subtitle={
                  isToday
                    ? "카메라 촬영 또는 오늘 찍은 갤러리 사진"
                    : `${dateStr}에 찍은 갤러리 사진만 선택할 수 있어요`
                }
              >
            {displayPhotoUri ? (
              <View style={styles.photoWrap}>
                <AuthImage uri={displayPhotoUri} style={styles.photoHero} />
                {isToday ? (
                  <View style={styles.photoOverlayBtnRow}>
                    <TouchableOpacity
                      style={styles.photoOverlayBtn}
                      onPress={() => { if (!photoActionDisabled) handleSkinCamera(); }}
                      activeOpacity={0.85}
                      disabled={photoActionDisabled}
                    >
                      <Ionicons name="camera" size={14} color={RECORD_COLORS.white} />
                      <Text style={styles.photoOverlayBtnText}>
                        {analyzingPhoto ? "분석 중..." : hasSavedScore ? "다시 촬영" : "카메라"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.photoOverlayBtn}
                      onPress={() => void handlePickGallery()}
                      activeOpacity={0.85}
                      disabled={photoActionDisabled}
                    >
                      <Ionicons name="images" size={14} color={RECORD_COLORS.white} />
                      <Text style={styles.photoOverlayBtnText}>
                        {analyzingPhoto
                          ? "분석 중..."
                          : pickingPhoto
                          ? "불러오는 중..."
                          : hasSavedScore
                          ? "다시 선택"
                          : "갤러리"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.photoOverlaySingleBtn}
                    onPress={handleAddPhoto}
                    activeOpacity={0.85}
                    disabled={photoActionDisabled}
                  >
                    <Ionicons name="images" size={14} color={RECORD_COLORS.white} />
                    <Text style={styles.photoOverlayBtnText}>
                      {pickingPhoto
                        ? "불러오는 중..."
                        : hasSavedScore
                        ? "다시 선택"
                        : "다시 선택"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : isToday ? (
              <View style={styles.photoButtonRow}>
                <TouchableOpacity
                  style={styles.photoActionBtn}
                  onPress={() => { if (!photoActionDisabled) handleSkinCamera(); }}
                  activeOpacity={0.82}
                  disabled={photoActionDisabled}
                >
                  <View style={styles.photoEmptyIcon}>
                    {analyzingPhoto ? (
                      <ActivityIndicator size="small" color={RECORD_COLORS.olive} />
                    ) : (
                      <Ionicons name="camera-outline" size={24} color={RECORD_COLORS.olive} />
                    )}
                  </View>
                  <Text style={styles.photoActionBtnTitle}>카메라 촬영</Text>
                  <Text style={styles.photoActionBtnDesc}>
                    {analyzingPhoto ? "AI 분석 중..." : "밝은 곳 · 정면 권장"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.photoActionBtn}
                  onPress={() => void handlePickGallery()}
                  activeOpacity={0.82}
                  disabled={photoActionDisabled}
                >
                  <View style={styles.photoEmptyIcon}>
                    {pickingPhoto ? (
                      <ActivityIndicator size="small" color={RECORD_COLORS.olive} />
                    ) : (
                      <Ionicons name="images-outline" size={24} color={RECORD_COLORS.olive} />
                    )}
                  </View>
                  <Text style={styles.photoActionBtnTitle}>갤러리 선택</Text>
                  <Text style={styles.photoActionBtnDesc}>오늘 찍은 사진</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.photoEmpty}
                onPress={handleAddPhoto}
                activeOpacity={0.82}
                disabled={photoActionDisabled}
              >
                <View style={styles.photoEmptyIcon}>
                  {pickingPhoto || analyzingPhoto ? (
                    <ActivityIndicator size="small" color={RECORD_COLORS.olive} />
                  ) : (
                    <Ionicons name="images-outline" size={28} color={RECORD_COLORS.olive} />
                  )}
                </View>
                <Text style={styles.photoEmptyTitle}>
                  {analyzingPhoto ? "AI 분석 중" : isToday ? "사진 추가하기" : "갤러리에서 선택"}
                </Text>
                <Text style={styles.photoEmptyDesc}>
                  {analyzingPhoto
                    ? "사진 기반 추천 점수를 계산하고 있어요"
                    : isToday
                    ? "밝은 곳 · 화장 전 · 정면 촬영을 권장해요"
                    : "과거 날짜는 해당 날에 찍은 사진만 사용할 수 있어요"}
                </Text>
              </TouchableOpacity>
            )}
          </SectionCard>
          </>
          )}

          {/* 점수 */}
          <SectionCard title={isToday ? "오늘의 피부 점수" : "이 날의 피부 점수"} subtitle="1(매우 나쁨) ~ 5(매우 좋음) · 필수">
            <View style={styles.scoreRow}>
              {[1, 2, 3, 4, 5].map((s) => {
                const active = score === s;
                const isAiSuggested = false;
                const palette = SCORE_COLORS[s];
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.scoreItem,
                      { backgroundColor: palette.bg, borderColor: palette.border },
                      isAiSuggested && styles.scoreItemAiSuggested,
                      active && scoreUserConfirmed && {
                        backgroundColor: palette.active,
                        borderColor: palette.active,
                      },
                    ]}
                    onPress={() => handleScoreSelect(s)}
                    activeOpacity={0.8}
                    disabled={saving}
                  >
                    <Text
                      style={[
                        styles.scoreNumber,
                        (active && scoreUserConfirmed) && styles.scoreNumberActive,
                      ]}
                    >
                      {s}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {score ? (
              <View style={styles.scoreSelectedRow}>
                <Text style={styles.scoreSelectedLabel}>{SCORE_LABELS[score]}</Text>
                <Text style={styles.scoreSelectedHint}>
                  {`${score}점 선택됨`}
                </Text>
              </View>
            ) : (
              <Text style={styles.scoreGuide}>
                {"가장 가까운 상태를 선택해 주세요"}
              </Text>
            )}
          </SectionCard>

          {!isSimpleMode && (
            <>
              {medgemmaStatus &&
                medgemmaStatus.status !== "none" &&
            medgemmaStatus.status !== "not_requested" && (
              <SectionCard
                title="사진 기반 피부 분석"
                subtitle="AI 모델이 사진에서 보이는 피부 신호를 비의료적 목적으로 분석합니다."
              >
                {medgemmaStatus.status === "pending" ? (
                  <Text style={styles.scoreGuide}>
                    사진 기반 피부 분석을 대기 중입니다.
                  </Text>
                ) : medgemmaStatus.status === "running" || medgemmaStatus.status === "processing" ? (
                  <Text style={styles.scoreGuide}>
                    사진 기반 피부 분석 중입니다.
                  </Text>
                ) : medgemmaStatus.status === "failed" ? (
                  <Text style={[styles.scoreGuide, { color: RECORD_COLORS.error }]}>
                    {medgemmaStatus.message_for_user || "사진 기반 피부 분석에 실패했습니다. 기본 피부 기록은 정상적으로 사용할 수 있습니다."}
                  </Text>
                ) : medgemmaStatus.status === "cancelled" ? (
                  <Text style={[styles.scoreGuide, { color: RECORD_COLORS.error }]}>
                    사진이 변경되어 이전 사진 기반 피부 분석이 취소되었습니다.
                  </Text>
                ) : medgemmaStatus.status === "done" ? (
                  <View>
                    <Text style={[styles.scoreGuide, { color: RECORD_COLORS.text, marginBottom: 12 }]}>
                      {medgemmaStatus.primary_visual_summary || medgemmaStatus.display_summary || "사진 기반 피부 분석 결과를 불러오지 못했습니다."}
                    </Text>
                    
                    {medgemmaStatus.observations && (
                      <View style={styles.medgemmaSignalList}>
                        {["dryness", "redness", "acne_like_spots", "texture_irregularity"].map((key) => {
                          const obs = medgemmaStatus.observations[key];
                          if (!obs) return null;
                          return (
                            <View key={key} style={styles.medgemmaSignalRow}>
                              <Text style={styles.medgemmaSignalLabel}>
                                {obs.label}
                              </Text>
                              <View style={styles.medgemmaSignalPill}>
                                <Text style={[styles.medgemmaSignalPillText, obs.level === "none" && { color: RECORD_COLORS.muted }]}>
                                  {obs.level_label}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {showMedgemmaDetails && medgemmaStatus.observations && (
                      <View style={styles.medgemmaDetailBox}>
                        <Text style={styles.medgemmaDetailTitle}>분석 근거</Text>
                        {["dryness", "redness", "acne_like_spots", "texture_irregularity"].map((key) => {
                          const obs = medgemmaStatus.observations[key];
                          if (!obs) return null;
                          return (
                            <View key={`detail-${key}`} style={styles.medgemmaDetailItem}>
                              <Text style={styles.medgemmaDetailLabel}>{obs.label}</Text>
                              <Text style={styles.medgemmaDetailText}>- 수준: {obs.level_label}</Text>
                              <Text style={styles.medgemmaDetailText}>- 관찰 부위: {obs.regions?.length > 0 ? obs.regions.join(', ') : '없음'}</Text>
                              <Text style={styles.medgemmaDetailText}>- 근거: {obs.evidence}</Text>
                              <Text style={styles.medgemmaDetailText}>- 불확실성: {obs.uncertainty_label}</Text>
                            </View>
                          );
                        })}
                        {medgemmaStatus.capture_quality && (
                          <View style={{ marginTop: 4 }}>
                            <Text style={styles.medgemmaDetailLabel}>사진 품질</Text>
                            <Text style={styles.medgemmaDetailText}>- 조명: {medgemmaStatus.capture_quality.lighting || '양호'}</Text>
                            <Text style={styles.medgemmaDetailText}>- 선명도: {medgemmaStatus.capture_quality.sharpness || '양호'}</Text>
                            <Text style={styles.medgemmaDetailText}>- 제한 사항: {medgemmaStatus.limitations?.length > 0 ? medgemmaStatus.limitations.join(', ') : '없음'}</Text>
                          </View>
                        )}
                      </View>
                    )}

                    <TouchableOpacity
                      onPress={() => setShowMedgemmaDetails(!showMedgemmaDetails)}
                      style={styles.medgemmaToggleButton}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.medgemmaToggleText}>
                        {showMedgemmaDetails ? "접기" : "상세 보기"}
                      </Text>
                    </TouchableOpacity>

                    <Text style={[styles.scoreGuide, { fontSize: 11 }]}>
                      ※ 이 결과는 피부 고민 분석이며 사진 기반 참고용 관찰 정보입니다.
                    </Text>
                  </View>
                ) : null}
              </SectionCard>
            )}

          {/* 태그 */}
          <SectionCard title="상태 태그" subtitle="해당하는 항목을 모두 선택 (선택)">
            <View style={styles.tagGrid}>
              {SKIN_TAG_OPTIONS.map((tag) => {
                const active = tags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.tagChip, active && styles.tagChipActive]}
                    onPress={() => !saving && toggleTag(tag)}
                    activeOpacity={0.78}
                    disabled={saving}
                  >
                    <Text style={[styles.tagText, active && styles.tagTextActive]}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {tags.length > 0 ? (
              <Text style={styles.tagCount}>{tags.length}개 선택됨</Text>
            ) : null}
          </SectionCard>
          </>
          )}

          {/* 메모 */}
          <SectionCard title="메모" subtitle="특이사항, 사용 화장품 등 (선택)">
            <TextInput
              style={styles.noteInput}
              placeholder="예: 새 세럼 사용 후 볼이 따가웠어요"
              placeholderTextColor={RECORD_COLORS.muted}
              multiline
              numberOfLines={4}
              maxLength={500}
              value={note}
              onChangeText={setNote}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{note.length}/500</Text>
          </SectionCard>
        </ScrollView>

          <SubScreenFooter
            label={existingLogId ? "수정 저장" : "저장하기"}
            onPress={handleSave}
            disabled={!score}
            saving={saving}
          />
        </KeyboardAvoidingView>
      </SubScreenRoot>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  photoWrap: { borderRadius: 18, overflow: "hidden", position: "relative" },
  photoHero: { width: "100%", height: 240, backgroundColor: RECORD_COLORS.chip },
  photoOverlayBtnRow: {
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
    backgroundColor: "rgba(31, 37, 32, 0.72)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  photoOverlaySingleBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(31, 37, 32, 0.72)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  photoOverlayBtnText: { fontSize: 12.5, fontWeight: "800", color: RECORD_COLORS.white },
  photoButtonRow: {
    flexDirection: "row",
    gap: 10,
  },
  photoActionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: RECORD_COLORS.line,
    borderStyle: "dashed",
    backgroundColor: RECORD_COLORS.chip,
    padding: 16,
    gap: 6,
  },
  photoActionBtnTitle: { fontSize: 13, fontWeight: "900", color: RECORD_COLORS.olive },
  photoActionBtnDesc: { fontSize: 11, fontWeight: "600", color: RECORD_COLORS.muted, textAlign: "center" },
  photoEmpty: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 180,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: RECORD_COLORS.line,
    borderStyle: "dashed",
    backgroundColor: RECORD_COLORS.chip,
    padding: 24,
    gap: 8,
  },
  photoEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: RECORD_COLORS.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  photoEmptyTitle: { fontSize: 15, fontWeight: "900", color: RECORD_COLORS.olive },
  photoEmptyDesc: { fontSize: 12.5, fontWeight: "600", color: RECORD_COLORS.muted, textAlign: "center" },
  photoUnavailable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 80,
    borderRadius: 16,
    backgroundColor: RECORD_COLORS.chip,
  },
  photoUnavailableText: { fontSize: 14, fontWeight: "700", color: RECORD_COLORS.muted },

  scoreRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  aiRecommendBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: RECORD_COLORS.oliveSoft,
    borderWidth: 1,
    borderColor: "rgba(79, 96, 60, 0.18)",
  },
  aiRecommendTextWrap: { flex: 1, gap: 2 },
  aiRecommendTitle: { fontSize: 13.5, fontWeight: "800", color: RECORD_COLORS.olive },
  aiRecommendHint: { fontSize: 12, fontWeight: "600", color: RECORD_COLORS.muted },
  scoreItem: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 58,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreItemAiSuggested: {
    borderStyle: "dashed",
    borderWidth: 2,
  },
  scoreNumber: { fontSize: 20, fontWeight: "900", color: RECORD_COLORS.muted },
  scoreNumberActive: { color: RECORD_COLORS.white },
  scoreSelectedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(217, 214, 204, 0.6)",
  },
  scoreSelectedLabel: { fontSize: 15, fontWeight: "900", color: RECORD_COLORS.olive },
  scoreSelectedHint: { fontSize: 12, fontWeight: "700", color: RECORD_COLORS.muted },
  scoreGuide: { marginTop: 12, fontSize: 12.5, fontWeight: "600", color: RECORD_COLORS.muted },

  tagGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
  },
  tagChipActive: { backgroundColor: RECORD_COLORS.olive, borderColor: RECORD_COLORS.olive },
  tagText: { fontSize: 13, fontWeight: "700", color: RECORD_COLORS.muted },
  tagTextActive: { color: RECORD_COLORS.white },
  tagCount: { marginTop: 10, fontSize: 12, fontWeight: "700", color: RECORD_COLORS.oliveMuted },

  noteInput: {
    backgroundColor: RECORD_COLORS.chip,
    borderWidth: 1,
    borderColor: RECORD_COLORS.line,
    borderRadius: 16,
    minHeight: 110,
    padding: 14,
    fontSize: 15,
    lineHeight: 22,
    color: RECORD_COLORS.text,
  },
  charCount: { marginTop: 8, fontSize: 11.5, fontWeight: "600", color: RECORD_COLORS.muted, textAlign: "right" },

  medgemmaSignalList: { marginBottom: 12 },
  medgemmaSignalRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  medgemmaSignalLabel: { fontSize: 13, fontWeight: "600", color: RECORD_COLORS.olive, width: 90 },
  medgemmaSignalPill: { backgroundColor: RECORD_COLORS.chip, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: RECORD_COLORS.line },
  medgemmaSignalPillText: { fontSize: 12, fontWeight: "700", color: RECORD_COLORS.text },
  medgemmaDetailBox: { backgroundColor: RECORD_COLORS.chip, padding: 12, borderRadius: 12, marginBottom: 12 },
  medgemmaDetailTitle: { fontSize: 13, fontWeight: "800", color: RECORD_COLORS.olive, marginBottom: 8 },
  medgemmaDetailItem: { marginBottom: 8 },
  medgemmaDetailLabel: { fontSize: 12, fontWeight: "700", color: RECORD_COLORS.text },
  medgemmaDetailText: { fontSize: 11.5, color: RECORD_COLORS.muted },
  medgemmaToggleButton: { paddingVertical: 8, alignItems: 'center', marginBottom: 8, backgroundColor: RECORD_COLORS.chip, borderRadius: 8 },
  medgemmaToggleText: { fontSize: 12, fontWeight: "700", color: RECORD_COLORS.olive },
});

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { medicationsAPI } from '../../../../api/medications';
import { useModalScreenLayout } from '../../../../hooks/useSubScreenLayout';
import {
  RECORD_COLORS,
  SectionCard,
  StatusBanner,
  SubScreenRoot,
  SubScreenTopBar,
  styles as layoutStyles,
} from '../../record/components/SubScreenLayout';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function MedicationDetailModal({ visible, medicationId, onClose }) {
  const modalLayout = useModalScreenLayout();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rendered, setRendered] = useState(false);
  const slideX = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  useEffect(() => {
    if (!visible || !medicationId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await medicationsAPI.getMedicationDetail(medicationId);
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || '약물 정보를 불러올 수 없습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, medicationId]);

  // 슬라이드 인/아웃 애니메이션
  useEffect(() => {
    if (visible) {
      setRendered(true);
      slideX.setValue(SCREEN_WIDTH);
      Animated.timing(slideX, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return undefined;
    }

    if (!rendered) return undefined;

    const anim = Animated.timing(slideX, {
      toValue: SCREEN_WIDTH,
      duration: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) setRendered(false);
    });
    return () => anim.stop();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    setDetail(null);
    setError(null);
    onClose();
  };

  if (!rendered) return null;

  const ingredients = detail?.ingredients_list || [];
  const skinRelevantCount = ingredients.filter((i) => i.is_skin_relevant).length;
  const hasSkinRelevant = skinRelevantCount > 0;

  return (
    <Modal
      visible={rendered}
      animationType="none"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <Animated.View
        style={[
          styles.modalRoot,
          modalLayout.rootStyle,
          { transform: [{ translateX: slideX }] },
        ]}
      >
        <SubScreenRoot onBack={handleClose}>
          <SubScreenTopBar
            title="약물 상세"
            onBack={handleClose}
            headerPaddingTop={modalLayout.headerPaddingTop}
            trailing={
              loading ? <ActivityIndicator size="small" color={RECORD_COLORS.olive} /> : null
            }
          />

          <ScrollView
            contentContainerStyle={[
              layoutStyles.scrollContent,
              { paddingBottom: modalLayout.scrollPaddingBottom },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <StatusBanner icon="hourglass-outline" text="약물 정보를 불러오는 중..." />
            ) : error ? (
              <SectionCard title="불러오기 실패" subtitle="다시 시도해 주세요">
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={32} color={RECORD_COLORS.hint} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </SectionCard>
            ) : detail ? (
              <>
                {hasSkinRelevant ? (
                  <StatusBanner
                    icon="warning"
                    text={`피부에 영향을 줄 수 있는 성분 ${skinRelevantCount}개 포함`}
                  />
                ) : ingredients.length > 0 ? (
                  <StatusBanner
                    icon="checkmark-circle"
                    text="피부 관련 성분이 포함되어 있지 않아요"
                  />
                ) : (
                  <StatusBanner
                    icon="information-circle-outline"
                    text="성분 정보 확인"
                    variant="empty"
                  />
                )}

                <SectionCard title={detail.name} subtitle={detail.form || '제형 정보 없음'}>
                  {detail.form ? (
                    <View style={styles.formBadge}>
                      <Ionicons name="medical-outline" size={13} color={RECORD_COLORS.olive} />
                      <Text style={styles.formText}>{detail.form}</Text>
                    </View>
                  ) : null}
                </SectionCard>

                {ingredients.length > 0 ? (
                  <SectionCard title="성분 목록" subtitle={`${ingredients.length}개 성분`}>
                    {ingredients.map((ing) => (
                      <View
                        key={ing.id}
                        style={[
                          styles.ingredientRow,
                          ing.is_skin_relevant && styles.ingredientRowSkin,
                        ]}
                      >
                        <View style={styles.ingredientInfo}>
                          <Text
                            style={[
                              styles.ingredientName,
                              ing.is_skin_relevant && styles.ingredientNameSkin,
                            ]}
                          >
                            {ing.name}
                          </Text>
                          {ing.drug_class ? (
                            <Text style={styles.drugClass}>{ing.drug_class}</Text>
                          ) : null}
                        </View>
                        {ing.is_skin_relevant ? (
                          <View style={styles.skinBadge}>
                            <Text style={styles.skinBadgeText}>피부 영향</Text>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </SectionCard>
                ) : (
                  <SectionCard title="성분 정보 없음" subtitle="등록된 성분 데이터가 없습니다">
                    <View style={styles.emptyBox}>
                      <Ionicons
                        name="information-circle-outline"
                        size={32}
                        color={RECORD_COLORS.muted}
                      />
                      <Text style={styles.emptyText}>성분 정보가 등록되지 않았어요.</Text>
                    </View>
                  </SectionCard>
                )}
              </>
            ) : null}
          </ScrollView>
        </SubScreenRoot>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: RECORD_COLORS.bg },
  errorBox: { alignItems: 'center', gap: 10, paddingVertical: 12 },
  errorText: {
    fontSize: 14,
    fontWeight: '700',
    color: RECORD_COLORS.hint,
    textAlign: 'center',
  },

  formBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: RECORD_COLORS.oliveSoft,
    gap: 5,
  },
  formText: { fontSize: 12, fontWeight: '800', color: RECORD_COLORS.olive },

  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(217,214,204,0.4)',
  },
  ingredientRowSkin: {
    backgroundColor: 'rgba(196,154,43,0.08)',
    borderRadius: 12,
    borderBottomWidth: 0,
    marginBottom: 4,
    paddingHorizontal: 10,
  },
  ingredientInfo: { flex: 1, marginRight: 8 },
  ingredientName: { fontSize: 14, fontWeight: '700', color: RECORD_COLORS.text, lineHeight: 20 },
  ingredientNameSkin: { fontWeight: '900' },
  drugClass: { marginTop: 2, fontSize: 11, fontWeight: '600', color: RECORD_COLORS.muted },
  skinBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(196,154,43,0.12)',
  },
  skinBadgeText: { fontSize: 10, fontWeight: '900', color: '#C49A2B' },

  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  emptyText: { fontSize: 14, fontWeight: '700', color: RECORD_COLORS.muted },
});

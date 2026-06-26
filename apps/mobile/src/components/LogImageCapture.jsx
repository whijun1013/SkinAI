import { View, Text, TouchableOpacity, Modal, Alert } from 'react-native';
import { useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker'; // 💡 카메라 모듈 추가
import { uploadSkinImage, uploadDietImage } from '../api/upload';
import useAuthStore from '../stores/authStore';
import styles from './LogImageCapture.styles';

export default function LogImageCapture({ mode = 'all', onPhotoComplete }) {
  const MODES = { SKIN: 'skin', DIET: 'diet', ALL: 'all' };

  const { user } = useAuthStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMode, setSelectedMode] = useState(null);
  const [selectedMealType, setSelectedMealType] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // ===== 💡 공통 카메라 실행 함수 추가 =====
  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '카메라 접근 권한이 필요합니다');
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });

    if (!result.canceled) {
      return result.assets[0].uri; // 촬영 성공 시 이미지 URI 반환
    }
    return null; // 취소 시 null 반환
  };

  // ===== 피부 사진 촬영 및 업로드 =====
  const handleSkinPhoto = async () => {
    try {
      // 1️⃣ 먼저 카메라를 열어 사진을 찍습니다.
      const imageUri = await openCamera();
      if (!imageUri) return; // 사용자가 촬영을 취소하면 그대로 종료

      // 2️⃣ 사진을 찍었다면 업로드 시작!
      setIsUploading(true);
      const token = await SecureStore.getItemAsync('access_token');

      // 🚨 중요: api 함수에 imageUri를 넘겨줘야 합니다!
      const result = await uploadSkinImage(user.id, imageUri, token);

      if (result) {
        if (result.qualityWarning) {
          Alert.alert(
            '품질 경고 (업로드 완료)',
            `${result.qualityWarning}\n\n사진은 저장되었으나 정확한 분석을 위해 재촬영을 권장합니다.`
          );
        } else {
          Alert.alert('성공', '피부 사진이 업로드되었습니다!');
        }
        onPhotoComplete?.();
        closeModal();
      }
    } catch (error) {
      Alert.alert('오류', error.message || '피부 사진 업로드에 실패했습니다');
    } finally {
      setIsUploading(false);
    }
  };

  // ===== 식단 사진 촬영 및 업로드 =====
  const handleDietPhoto = async () => {
    try {
      const imageUri = await openCamera();
      if (!imageUri) return;

      setIsUploading(true);
      const token = await SecureStore.getItemAsync('access_token');

      // 🚨 중요: api 함수에 imageUri를 넘겨줘야 합니다!
      const result = await uploadDietImage(user.id, selectedMealType, imageUri, token);

      if (result) {
        Alert.alert('성공', `${selectedMealType} 사진이 업로드되었습니다!`);
        closeModal();
      }
    } catch (error) {
      Alert.alert('오류', error.message || '식단 사진 업로드에 실패했습니다');
    } finally {
      setIsUploading(false);
    }
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedMode(null);
    setSelectedMealType(null);
  };

  const handleModalOpen = () => {
    if (mode === MODES.SKIN) setSelectedMode(MODES.SKIN);
    else if (mode === MODES.DIET) setSelectedMode(MODES.DIET);
    setModalVisible(true);
  };

  // ... (이하 return() JSX 부분은 올려주신 기존 코드와 완전히 동일하게 유지하시면 됩니다!)
  return (
    <>
      <TouchableOpacity style={styles.triggerButton} onPress={handleModalOpen}>
        <Text style={styles.triggerButtonText}>📸 기록 시작</Text>
      </TouchableOpacity>
      {/* ... 기존 모달 코드 생략 ... */}
    </>
  );
}

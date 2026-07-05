import { useState } from 'react';
import { Alert, TouchableOpacity, Text, View, Image, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export default function CameraButton({ onImageSelected }) {
  const [selectedImage, setSelectedImage] = useState(null);

  const handleSelectPhoto = () => {
    Alert.alert('사진 선택', '사진을 어떻게 가져오시겠습니까?', [
      {
        text: '카메라로 촬영',
        onPress: handleTakePhoto,
      },
      {
        text: '갤러리에서 선택',
        onPress: handlePickFromGallery,
      },
      {
        text: '취소',
        style: 'cancel',
      },
    ]);
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '카메라 접근 권한이 필요합니다');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setSelectedImage(uri);
      if (onImageSelected) {
        onImageSelected(uri);
      }
      Alert.alert('성공', '사진이 선택되었습니다!');
    }
  };

  const handlePickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진 접근 권한이 필요합니다');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setSelectedImage(uri);
      if (onImageSelected) {
        onImageSelected(uri);
      }
      Alert.alert('성공', '사진이 선택되었습니다!');
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.cameraButton} onPress={handleSelectPhoto}>
        <Text style={styles.cameraIcon}>📷</Text>
      </TouchableOpacity>

      {selectedImage && (
        <View style={styles.imagePreview}>
          <Image source={{ uri: selectedImage }} style={styles.previewImage} />
          <Text style={styles.previewText}>사진이 선택되었습니다</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  cameraButton: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#4f704f',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4f704f',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  cameraIcon: {
    fontSize: 24,
  },
  imagePreview: {
    marginTop: 16,
    alignItems: 'center',
    gap: 8,
  },
  previewImage: {
    width: 200,
    height: 250,
    borderRadius: 16,
    backgroundColor: '#e1eadc',
  },
  previewText: {
    fontSize: 13,
    color: '#5f695e',
    fontWeight: '600',
  },
});

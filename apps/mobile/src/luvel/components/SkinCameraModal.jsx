import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');
const OVAL_W = width * 0.72;
const OVAL_H = OVAL_W * 1.28;

export default function SkinCameraModal({ visible, onCapture, onClose }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef(null);
  const insets = useSafeAreaInsets();

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, exif: true });

      // iOS HEIC 포맷 → JPEG 변환 (백엔드 업로드 안정성)
      let jpegUri = photo.uri;
      try {
        const converted = await ImageManipulator.manipulateAsync(photo.uri, [], {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        jpegUri = converted.uri;
      } catch (e) {
        console.warn('[Skin] JPEG 변환 실패, 원본 사용:', e.message);
      }

      onCapture(jpegUri, photo.exif);
    } finally {
      setCapturing(false);
    }
  };

  const renderContent = () => {
    if (!permission) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.center}>
          <Text style={styles.permText}>카메라 접근 권한이 필요합니다</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>권한 허용</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />

        {/* 상단 어두운 영역 */}
        <View style={[styles.overlay, styles.overlayTop]} />
        {/* 하단 어두운 영역 */}
        <View style={[styles.overlay, styles.overlayBottom]} />
        {/* 좌측 어두운 영역 */}
        <View style={[styles.overlay, styles.overlayLeft]} />
        {/* 우측 어두운 영역 */}
        <View style={[styles.overlay, styles.overlayRight]} />

        {/* 타원형 가이드 테두리 */}
        <View pointerEvents="none" style={styles.ovalGuide} />

        {/* 안내 텍스트 */}
        <View style={[styles.guideTextWrap, { top: insets.top + 60 }]}>
          <Text style={styles.guideTitle}>얼굴을 타원 안에 맞춰주세요</Text>
          <Text style={styles.guideDesc}>밝은 곳 · 화장 전 · 정면 바라보기</Text>
        </View>

        {/* 닫기 버튼 */}
        <TouchableOpacity style={[styles.closeBtn, { top: insets.top + 16 }]} onPress={onClose}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>

        {/* 촬영 버튼 */}
        <View style={[styles.captureWrap, { bottom: insets.bottom + 40 }]}>
          <TouchableOpacity
            style={styles.captureBtn}
            onPress={handleCapture}
            disabled={capturing}
            activeOpacity={0.8}
          >
            {capturing ? (
              <ActivityIndicator color="#56733F" />
            ) : (
              <View style={styles.captureInner} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>{renderContent()}</View>
    </Modal>
  );
}

const ovalTop = (height - OVAL_H) / 2;
const ovalLeft = (width - OVAL_W) / 2;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  cameraWrap: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  permText: { color: '#fff', fontSize: 15, textAlign: 'center', marginBottom: 20 },
  permBtn: {
    backgroundColor: '#56733F',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  permBtnText: { color: '#fff', fontWeight: '700' },

  overlay: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  overlayTop: { top: 0, left: 0, right: 0, height: ovalTop },
  overlayBottom: { top: ovalTop + OVAL_H, left: 0, right: 0, bottom: 0 },
  overlayLeft: { top: ovalTop, left: 0, width: ovalLeft, height: OVAL_H },
  overlayRight: { top: ovalTop, left: ovalLeft + OVAL_W, right: 0, height: OVAL_H },

  ovalGuide: {
    position: 'absolute',
    top: ovalTop,
    left: ovalLeft,
    width: OVAL_W,
    height: OVAL_H,
    borderRadius: OVAL_W / 2,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },

  guideTextWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  guideTitle: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  guideDesc: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 6, textAlign: 'center' },

  closeBtn: { position: 'absolute', left: 20, padding: 8 },

  captureWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#56733F',
  },
});

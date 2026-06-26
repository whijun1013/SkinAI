import { useEffect, useRef, useState } from "react";
import { Alert, AppState, InteractionManager, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import { parseExifDate, parseGPS } from "../utils/exif";
import { pickGalleryPhoto } from "./useGalleryPhoto";
import { toDateStr } from "../nuvo/screens/record/components/DateNavigator";

const imageMediaType = ["images"];

const LOCATION_TIMEOUT_MS = 5000;

/** 훅 밖(showDietPhotoPicker)에서 백그라운드 위치 반영용 */
const standaloneCaptureRef = { current: null };
const standalonePendingRef = { current: null };

async function getCurrentLocation() {
  try {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      console.log("[Diet] 기기 위치 서비스 꺼짐");
      return { lat: null, lng: null };
    }

    const last = await Location.getLastKnownPositionAsync({ maxAge: 300000 });
    if (last) {
      console.log("[Diet] 마지막 위치 사용", last.coords);
      return { lat: last.coords.latitude, lng: last.coords.longitude };
    }

    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("위치 조회 타임아웃")), LOCATION_TIMEOUT_MS)
      ),
    ]);
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch (e) {
    console.log("[Diet] 위치 조회 실패:", e.message);
    return { lat: null, lng: null };
  }
}

function createDietCaptureHandlers({
  onDeliver,
  pendingLocationPayloadRef,
  onDeliverRef,
}) {
  const tryBackgroundLocation = async (payload) => {
    pendingLocationPayloadRef.current = payload;
    try {
      console.log("[Diet] 백그라운드 위치 조회 시작");

      await new Promise((resolve) => {
        InteractionManager.runAfterInteractions(resolve);
      });

      const existing = await Location.getForegroundPermissionsAsync();
      let granted = existing.status === "granted";

      if (!granted) {
        if (existing.canAskAgain === false) {
          Alert.alert(
            "위치 권한 필요",
            "식단 기록 시 날씨·환경 정보 수집을 위해 위치 접근 권한이 필요합니다.\n\n설정 앱에서 위치 권한을 허용해 주세요.",
            [
              { text: "나중에", style: "cancel" },
              { text: "설정 열기", onPress: () => Linking.openSettings() },
            ]
          );
          return;
        }

        const result = await Promise.race([
          Location.requestForegroundPermissionsAsync(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("위치 권한 요청 타임아웃")), 8000)
          ),
        ]);
        granted = result.status === "granted";
      }

      if (!granted) return;

      const { lat, lng } = await getCurrentLocation();
      if (lat === null || lng === null) return;

      pendingLocationPayloadRef.current = null;
      onDeliverRef.current?.({ ...payload, captured_lat: lat, captured_lng: lng });
    } catch (e) {
      console.log("[Diet] 백그라운드 위치 처리 실패:", e.message);
    }
  };

  const deliverCapture = (payload) => {
    const openModal = () => onDeliverRef.current?.(payload);
    if (Platform.OS === "ios") {
      setTimeout(openModal, 200);
    } else {
      openModal();
    }
  };

  const processCameraAsset = async (photo, recordDateStr) => {
    let parsedTime = new Date().toISOString();
    let parsedLat = null;
    let parsedLng = null;

    if (photo.exif) {
      const exifTime = parseExifDate(photo.exif.DateTimeOriginal || photo.exif.DateTime);
      if (exifTime) parsedTime = exifTime;
      parsedLat = parseGPS(photo.exif.GPSLatitude, photo.exif.GPSLatitudeRef);
      parsedLng = parseGPS(photo.exif.GPSLongitude, photo.exif.GPSLongitudeRef);
    }

    let jpegUri = photo.uri;
    try {
      const result = await ImageManipulator.manipulateAsync(photo.uri, [], {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      jpegUri = result.uri;
    } catch (e) {
      console.warn("[Diet] JPEG 변환 실패, 원본 URI 사용:", e.message);
    }

    if (parsedLat === null || parsedLng === null) {
      try {
        const perms = await Location.getForegroundPermissionsAsync();
        if (perms.status === "granted") {
          const last = await Location.getLastKnownPositionAsync({ maxAge: 300000 });
          if (last) {
            parsedLat = last.coords.latitude;
            parsedLng = last.coords.longitude;
            console.log("[Diet] 위치 확정 (캐시)", { captured_lat: parsedLat, captured_lng: parsedLng });
          }
        }
      } catch (_) {}
    }

    const payload = {
      photo_uri: jpegUri,
      captured_at: parsedTime,
      captured_lat: parsedLat,
      captured_lng: parsedLng,
      input_method: "photo",
      input_source: "camera",
      recordDateStr,
    };

    deliverCapture(payload);

    if (parsedLat === null || parsedLng === null) {
      void tryBackgroundLocation(payload);
    }
  };

  const openCamera = async (recordDateStr) => {
    try {
      const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (camStatus !== "granted") {
        Alert.alert("카메라 권한 필요", "식단 사진 촬영을 위해 카메라 접근 권한이 필요합니다.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: imageMediaType,
        allowsEditing: false,
        quality: 0.8,
        exif: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        await processCameraAsset(result.assets[0], recordDateStr);
      }
    } catch (error) {
      console.error("[Diet] camera error:", error);
      Alert.alert("오류", "사진 촬영을 처리하지 못했습니다.");
    }
  };

  const deliverGalleryCapture = async (payload) => {
    let finalPayload = payload;

    if (finalPayload.captured_lat === null || finalPayload.captured_lng === null) {
      try {
        const perms = await Location.getForegroundPermissionsAsync();
        if (perms.status === "granted") {
          const last = await Location.getLastKnownPositionAsync({ maxAge: 300000 });
          if (last) {
            finalPayload = {
              ...finalPayload,
              captured_lat: last.coords.latitude,
              captured_lng: last.coords.longitude,
            };
            console.log("[Gallery] 위치 확정 (캐시)", {
              captured_lat: finalPayload.captured_lat,
              captured_lng: finalPayload.captured_lng,
            });
          }
        }
      } catch (_) {}
    }

    deliverCapture(finalPayload);

    if (finalPayload.captured_lat === null || finalPayload.captured_lng === null) {
      void tryBackgroundLocation(finalPayload);
    }
  };

  const openGalleryForDate = async (dateStr) => {
    const payload = await pickGalleryPhoto(dateStr);
    if (payload) await deliverGalleryCapture(payload);
  };

  const openGalleryForToday = async () => {
    await openGalleryForDate(toDateStr(new Date()));
  };

  const showPicker = (dateStr = toDateStr(new Date())) => {
    Alert.alert("식단 사진", "사진을 어떻게 가져올까요?", [
      { text: "카메라로 촬영", onPress: () => openCamera(dateStr) },
      { text: "갤러리에서 선택", onPress: () => openGalleryForDate(dateStr) },
      { text: "취소", style: "cancel" },
    ]);
  };

  return {
    openCamera,
    openGalleryForDate,
    openGalleryForToday,
    showPicker,
    tryBackgroundLocation,
  };
}

function createStandaloneDietCaptureHandlers(onCaptured) {
  const onDeliverRef = { current: onCaptured };
  standaloneCaptureRef.current = onCaptured;

  return createDietCaptureHandlers({
    onDeliver: onCaptured,
    pendingLocationPayloadRef: standalonePendingRef,
    onDeliverRef,
  });
}

/** 식단 편집 등 훅 밖에서 사진 선택 (오늘: 카메라·갤러리) */
export function showDietPhotoPicker(onCaptured, options = {}) {
  const dateStr = options.dateStr ?? toDateStr(new Date());
  createStandaloneDietCaptureHandlers(onCaptured).showPicker(dateStr);
}

/** 과거 날짜 등 갤러리만 허용할 때 */
export function showDietGalleryPicker(onCaptured, options = {}) {
  const dateStr = options.dateStr ?? toDateStr(new Date());
  void createStandaloneDietCaptureHandlers(onCaptured).openGalleryForDate(dateStr);
}

export default function useDietCamera(onDietPhotoCaptured) {
  const [dietPhoto, setDietPhoto] = useState(null);
  const [capturedAt, setCapturedAt] = useState(null);
  const [capturedLat, setCapturedLat] = useState(null);
  const [capturedLng, setCapturedLng] = useState(null);

  const pendingLocationPayloadRef = useRef(null);
  const onDietPhotoCapturedRef = useRef(onDietPhotoCaptured);
  useEffect(() => {
    onDietPhotoCapturedRef.current = onDietPhotoCaptured;
  }, [onDietPhotoCaptured]);

  const onDeliverRef = useRef(null);
  onDeliverRef.current = (payload) => {
    setDietPhoto(payload.photo_uri);
    setCapturedAt(payload.captured_at);
    setCapturedLat(payload.captured_lat);
    setCapturedLng(payload.captured_lng);
    onDietPhotoCapturedRef.current?.(payload);
  };

  const handlersRef = useRef(null);
  if (!handlersRef.current) {
    handlersRef.current = createDietCaptureHandlers({
      onDeliver: onDeliverRef.current,
      pendingLocationPayloadRef,
      onDeliverRef,
    });
  }

  const { openGalleryForDate, openGalleryForToday, showPicker } = handlersRef.current;

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (nextState !== "active") return;

      const hookPayload = pendingLocationPayloadRef.current;
      const standalonePayload = standalonePendingRef.current;

      const payload = hookPayload || standalonePayload;
      const isStandalone = !hookPayload && !!standalonePayload;

      if (!payload) return;

      try {
        const perms = await Location.getForegroundPermissionsAsync();
        if (perms.status !== "granted") return;

        const { lat, lng } = await getCurrentLocation();
        if (lat === null || lng === null) return;

        if (hookPayload) pendingLocationPayloadRef.current = null;
        if (standalonePayload) standalonePendingRef.current = null;

        const updated = { ...payload, captured_lat: lat, captured_lng: lng };

        if (isStandalone) {
          standaloneCaptureRef.current?.(updated);
        } else {
          setCapturedLat(lat);
          setCapturedLng(lng);
          onDietPhotoCapturedRef.current?.(updated);
        }
        console.log("[Diet] 앱 복귀 후 위치 반영 완료", { lat, lng });
      } catch (e) {
        console.log("[Diet] 앱 복귀 위치 재시도 실패:", e.message);
      }
    });
    return () => sub.remove();
  }, []);

  return {
    dietPhoto,
    capturedAt,
    capturedLat,
    capturedLng,
    handleDietCamera: () => showPicker(toDateStr(new Date())),
    openGalleryForDate,
    openGalleryForToday,
  };
}

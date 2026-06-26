import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import {
  formatKoDateLabel,
  getExifDateStr,
  parseExifDate,
  parseGPS,
} from "../utils/exif";

const imageMediaType = ["images"];

function parseAssetExif(photo) {
  let capturedAt = null;
  let capturedLat = null;
  let capturedLng = null;

  if (photo.exif) {
    capturedAt = parseExifDate(photo.exif.DateTimeOriginal || photo.exif.DateTime);
    capturedLat = parseGPS(photo.exif.GPSLatitude, photo.exif.GPSLatitudeRef);
    capturedLng = parseGPS(photo.exif.GPSLongitude, photo.exif.GPSLongitudeRef);
  }

  return { capturedAt, capturedLat, capturedLng };
}

async function convertToJpeg(uri) {
  try {
    const converted = await ImageManipulator.manipulateAsync(
      uri,
      [],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    return converted.uri;
  } catch (e) {
    console.warn("[Gallery] JPEG 변환 실패, 원본 URI 사용:", e.message);
    return uri;
  }
}

/**
 * 갤러리에서 사진 1장 선택. requiredDateStr와 EXIF 날짜가 다르면 선택 차단.
 * EXIF 날짜가 없는 사진(스크린샷 등)은 선택한 날짜로 기록.
 *
 * @param {string} requiredDateStr - "YYYY-MM-DD" (기록 탭 선택일 또는 홈=오늘)
 * @returns {Promise<object|null>}
 */
export async function pickGalleryPhoto(requiredDateStr) {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "사진 접근 권한 필요",
      "갤러리에서 사진을 선택하려면 사진 접근 권한이 필요합니다.",
      [{ text: "확인" }]
    );
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: imageMediaType,
    allowsEditing: false,
    quality: 0.8,
    exif: true,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const photo = result.assets[0];
  const { capturedAt, capturedLat, capturedLng } = parseAssetExif(photo);
  const photoDateStr = getExifDateStr(capturedAt);

  // EXIF 날짜 없는 사진 → 선택한 날짜로 허용 (스크린샷, 다운로드 사진 등 대응)
  if (photoDateStr && photoDateStr !== requiredDateStr) {
    Alert.alert(
      "날짜가 맞지 않아요",
      `이 사진은 ${formatKoDateLabel(photoDateStr)}에 찍힌 사진이에요.\n` +
        `선택한 날짜(${formatKoDateLabel(requiredDateStr)})와 달라서 사용할 수 없어요.`,
      [{ text: "확인" }]
    );
    return null;
  }

  const jpegUri = await convertToJpeg(photo.uri);

  return {
    photo_uri: jpegUri,
    captured_at: capturedAt,
    captured_lat: capturedLat,
    captured_lng: capturedLng,
    input_method: "photo",
    input_source: "gallery",
    recordDateStr: requiredDateStr,
  };
}

import { useState } from 'react';
import { parseExifDate, parseGPS } from '../utils/exif';

/**
 * 피부 카메라 촬영 훅.
 * 촬영 + EXIF 추출만 담당하고, 업로드/저장은 호출부(MainTab)에서 처리한다.
 *
 * @param {(capture: {
 *   photo_uri: string,
 *   exif: object|null,
 *   captured_at: string|null,
 *   captured_lat: number|null,
 *   captured_lng: number|null,
 * }) => void} onCaptured
 */
export default function useSkinCamera(onCaptured) {
  const [skinPhoto, setSkinPhoto] = useState(null);
  const [skinExif, setSkinExif] = useState(null);
  const [capturedAt, setCapturedAt] = useState(null);
  const [capturedLat, setCapturedLat] = useState(null);
  const [capturedLng, setCapturedLng] = useState(null);
  const [showCamera, setShowCamera] = useState(false);

  const handleSkinCamera = () => setShowCamera(true);

  const handleCapture = (uri, exif) => {
    setSkinPhoto(uri);
    setSkinExif(exif || null);

    let parsedTime = null;
    let parsedLat = null;
    let parsedLng = null;

    if (exif) {
      parsedTime = parseExifDate(exif.DateTimeOriginal || exif.DateTime);
      parsedLat = parseGPS(exif.GPSLatitude, exif.GPSLatitudeRef);
      parsedLng = parseGPS(exif.GPSLongitude, exif.GPSLongitudeRef);

      setCapturedAt(parsedTime);
      setCapturedLat(parsedLat);
      setCapturedLng(parsedLng);
    } else {
      setCapturedAt(null);
      setCapturedLat(null);
      setCapturedLng(null);
    }

    setShowCamera(false);

    onCaptured?.({
      photo_uri: uri,
      exif: exif || null,
      captured_at: parsedTime,
      captured_lat: parsedLat,
      captured_lng: parsedLng,
    });
  };

  const handleClose = () => setShowCamera(false);

  return {
    skinPhoto,
    skinExif,
    capturedAt,
    capturedLat,
    capturedLng,
    showCamera,
    handleSkinCamera,
    handleCapture,
    handleClose,
  };
}

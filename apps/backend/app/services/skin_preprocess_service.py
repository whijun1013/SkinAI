"""
피부 사진 전처리 모듈
- 눈/입 마스킹
- 얼굴 bounding box 기반 크롭 (방향별 패딩 다르게)
- 코 기준 좌/우 분리 (GAP 조절 가능, 재시도 로직에서 사용)

파이프라인에서 사용 예:
    from skin_preprocess import preprocess_skin_photo
    result = preprocess_skin_photo("data/D3.png")
    result["masked"]       # 마스킹된 정면 전체 (numpy 배열)
    result["cropped"]      # 마스킹+크롭된 얼굴 영역
    result["left_half"]    # 코 기준 왼쪽 절반
    result["right_half"]   # 코 기준 오른쪽 절반
"""

import cv2
import mediapipe as mp
import numpy as np

mp_face_mesh = mp.solutions.face_mesh

LEFT_EYE = [
    33, 7, 163, 144, 145, 153,
    154, 155, 133, 173, 157,
    158, 159, 160, 161, 246,
]

RIGHT_EYE = [
    362, 382, 381, 380, 374,
    373, 390, 249, 263, 466,
    388, 387, 386, 385, 384, 398,
]

LIPS = [
    61, 146, 91, 181, 84, 17,
    314, 405, 321, 375, 291, 308,
    324, 318, 402, 317, 14, 87,
    78, 95, 88, 178,
]

# FaceMesh landmark 인덱스 1번 = 코끝(nose tip) 부근 점
NOSE_TIP_INDEX = 1

# 방향별 패딴 비율 (이마는 살짝, 턱밑/목은 거의 제외)
PAD_TOP_RATIO = 0.15
PAD_BOTTOM_RATIO = 0.02
PAD_LEFT_RATIO = 0.08
PAD_RIGHT_RATIO = 0.08


def _build_eye_lip_mask(face_landmarks, h: int, w: int) -> np.ndarray:
    """눈 2개 + 입술 영역을 흰색(255)으로 채운 마스크 생성"""
    mask = np.zeros((h, w), dtype=np.uint8)

    for region in [LEFT_EYE, RIGHT_EYE]:
        pts = [
            (int(face_landmarks.landmark[idx].x * w), int(face_landmarks.landmark[idx].y * h))
            for idx in region
        ]
        pts = cv2.convexHull(np.array(pts, np.int32))
        cv2.fillPoly(mask, [pts], 255)

    lips_pts = [
        (int(face_landmarks.landmark[idx].x * w), int(face_landmarks.landmark[idx].y * h))
        for idx in LIPS
    ]
    lips_pts = cv2.convexHull(np.array(lips_pts, np.int32))
    cv2.fillPoly(mask, [lips_pts], 255)

    return mask


def _compute_face_crop_box(face_landmarks, h: int, w: int) -> tuple[int, int, int, int]:
    """478개 landmark 전체로 bounding box 계산 후, 방향별 패딩 + 클리핑까지 적용"""
    all_x = [lm.x * w for lm in face_landmarks.landmark]
    all_y = [lm.y * h for lm in face_landmarks.landmark]

    x_min, x_max = min(all_x), max(all_x)
    y_min, y_max = min(all_y), max(all_y)

    box_w = x_max - x_min
    box_h = y_max - y_min

    pad_top = int(box_h * PAD_TOP_RATIO)
    pad_bottom = int(box_h * PAD_BOTTOM_RATIO)
    pad_left = int(box_w * PAD_LEFT_RATIO)
    pad_right = int(box_w * PAD_RIGHT_RATIO)

    x1 = max(0, int(x_min) - pad_left)
    x2 = min(w, int(x_max) + pad_right)
    y1 = max(0, int(y_min) - pad_top)
    y2 = min(h, int(y_max) + pad_bottom)

    return x1, y1, x2, y2


def _get_nose_x_in_crop(face_landmarks, w: int, crop_x1: int) -> int:
    """원본 이미지 기준 코끝 x좌표를, 크롭된 이미지 기준 x좌표로 변환"""
    nose_x_original = face_landmarks.landmark[NOSE_TIP_INDEX].x * w
    return int(nose_x_original) - crop_x1


def preprocess_skin_photo(
    image_path: str | None = None,
    image_bytes: bytes | None = None,
    gap_ratio: float = 0.0,
) -> dict:
    """
    피부 사진 전처리 메인 함수.

    Args:
        image_path: 로컬 파일 경로로 테스트할 때 사용 (둘 중 하나만 넘기면 됨)
        image_bytes: Blob Storage에서 다운로드한 이미지 바이트.
                     실제 파이프라인에서는 이 방식을 사용
                     (예: blob_client.download_blob().readall() 결과)
        gap_ratio: 코 기준선에서 좌/우를 얼마나 더 멀리 떼어 자를지 비율.
                   0.0 = 코 기준선에서 정확히 절반.
                   양수로 키울수록 중앙 영역(코 주변)을 더 많이 제외함.
                   -> GPT가 블러 처리하면 이 값을 키워서 재시도하는 용도.

    Returns:
        dict with keys: masked, cropped, left_half, right_half, crop_box
        실패 시 dict with key: error (str)
    """
    if image_bytes is not None:
        # 메모리 바이트 -> numpy 이미지로 디코딩 (Blob에서 받은 경우)
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    elif image_path is not None:
        # 로컬 파일 경로 -> numpy 이미지로 읽기 (로컬 테스트용)
        img = cv2.imread(image_path)
    else:
        return {"error": "image_path 또는 image_bytes 중 하나는 필수"}

    if img is None:
        return {"error": "이미지 디코딩 실패 (경로 또는 바이트 확인 필요)"}

    h, w = img.shape[:2]

    with mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
    ) as face_mesh:
        results = face_mesh.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))

        if not results.multi_face_landmarks:
            return {"error": "얼굴 검출 실패"}

        face = results.multi_face_landmarks[0]

        # 1) 눈/입 마스크 생성 (좌표는 face에서 한 번만 추출, 재사용)
        mask = _build_eye_lip_mask(face, h, w)

        # 2) 얼굴 bounding box + 패딩 + 클리핑
        x1, y1, x2, y2 = _compute_face_crop_box(face, h, w)

        # 3) 크롭 좌표계 기준 코 x좌표 (좌/우 분리 기준점)
        nose_x_in_crop = _get_nose_x_in_crop(face, w, x1)

    # 4) 마스킹 적용
    masked = img.copy()
    masked[mask == 255] = (0, 0, 0)

    # 5) 얼굴 영역 크롭
    cropped = masked[y1:y2, x1:x2]
    crop_w = cropped.shape[1]

    # 6) 코 기준 좌/우 분리 (gap_ratio로 중앙 제외 폭 조절)
    gap_px = int(crop_w * gap_ratio)
    nose_x_in_crop = max(0, min(crop_w, nose_x_in_crop))  # 크롭 범위 밖으로 안 나가게 보정

    left_half = cropped[:, : max(0, nose_x_in_crop - gap_px)]
    right_half = cropped[:, min(crop_w, nose_x_in_crop + gap_px) :]

    return {
        "masked": masked,
        "cropped": cropped,
        "left_half": left_half,
        "right_half": right_half,
        "crop_box": (x1, y1, x2, y2),
        "nose_x_in_crop": nose_x_in_crop,
    }


def save_preprocess_result(result: dict, output_dir: str, prefix: str = "out") -> dict:
    """preprocess_skin_photo() 결과를 파일로 저장하고 경로 딕셔너리 반환"""
    if "error" in result:
        raise ValueError(f"전처리 실패한 결과는 저장할 수 없음: {result['error']}")

    paths = {
        "masked": f"{output_dir}/{prefix}_masked.png",
        "cropped": f"{output_dir}/{prefix}_cropped.png",
        "left_half": f"{output_dir}/{prefix}_left.png",
        "right_half": f"{output_dir}/{prefix}_right.png",
    }

    cv2.imwrite(paths["masked"], result["masked"])
    cv2.imwrite(paths["cropped"], result["cropped"])
    cv2.imwrite(paths["left_half"], result["left_half"])
    cv2.imwrite(paths["right_half"], result["right_half"])

    return paths


if __name__ == "__main__":
    # 로컬 파일 테스트
    result = preprocess_skin_photo(image_path="data/D3.png")

    # Blob 연동 후에는 이런 식으로 바뀜 (예시, 실제 클라이언트 코드는 별도 작성):
    # image_bytes = blob_client.download_blob().readall()
    # result = preprocess_skin_photo(image_bytes=image_bytes)

    if "error" in result:
        print(f"실패: {result['error']}")
    else:
        paths = save_preprocess_result(result, output_dir="data", prefix="D")
        print("완료:", paths)
        print("crop box:", result["crop_box"])
        print("nose x in crop:", result["nose_x_in_crop"])
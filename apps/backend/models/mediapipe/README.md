# MediaPipe Face Detector Model

Place the MediaPipe Face Detector model asset in this directory when testing face-presence quality checks.

Recommended local paths:

```text
apps/backend/models/mediapipe/face_detector.task
apps/backend/models/mediapipe/blaze_face_short_range.tflite
```

Backend `.env` example when running commands from `apps/backend`:

```env
MEDIAPIPE_FACE_DETECTOR_MODEL=models/mediapipe/blaze_face_short_range.tflite
```

Download the model from the official MediaPipe Face Detector model page. The current Python guide uses `face_detector.task` as the generic example path, while the BlazeFace model links may provide `.tflite` assets. The MediaPipe Tasks `model_asset_path` option can be pointed at the downloaded model asset path.

Do not commit the model file; `.task` and `.tflite` files in this directory are ignored.

Local verification command:

```powershell
cd apps/backend
.\venv311\Scripts\python.exe data_tools\evaluate_image_quality_libraries.py --demo-samples --mediapipe-model models\mediapipe\blaze_face_short_range.tflite
```

Note: MediaPipe Tasks can emit runtime logs about metrics upload attempts when network access is blocked. The image inference still runs locally; treat those logs separately from face detection failures.

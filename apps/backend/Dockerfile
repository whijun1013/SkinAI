FROM debian:bookworm-slim AS mediapipe-model

ARG MEDIAPIPE_MODEL_URL=https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite
ARG MEDIAPIPE_MODEL_SHA256=b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && mkdir -p /assets \
    && curl --fail --location --retry 3 \
       "${MEDIAPIPE_MODEL_URL}" \
       --output /assets/blaze_face_short_range.tflite \
    && echo "${MEDIAPIPE_MODEL_SHA256}  /assets/blaze_face_short_range.tflite" \
       | sha256sum -c - \
    && rm -rf /var/lib/apt/lists/*

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/home/appuser \
    MPLCONFIGDIR=/tmp/matplotlib \
    XDG_CACHE_HOME=/tmp/.cache

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libglib2.0-0 \
       libgl1 \
       libgles2 \
       libegl1 \
       libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY models ./models

COPY --from=mediapipe-model /assets/blaze_face_short_range.tflite /app/models/mediapipe/blaze_face_short_range.tflite

COPY data/oliveyoung_db.json ./data/oliveyoung_db.json
COPY data/skin_affecting_drugs.json ./data/skin_affecting_drugs.json

# 시연용 관리자 더미 데이터가 실제로 필요할 때만 포함
COPY data/demo ./data/demo

RUN useradd \
      --system \
      --uid 10001 \
      --create-home \
      --home-dir /home/appuser \
      appuser \
    && chown -R appuser:appuser /app /home/appuser

USER appuser

EXPOSE 8000

CMD ["sh", "-c", "python -m alembic upgrade head && exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1"]

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Nuvo MedGemma 워커 자동 시작 서비스 설치 스크립트
# 사용법: bash setup_autostart.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="nuvo-worker"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
LOG_FILE="/home/$(whoami)/nuvo_worker.log"
CURRENT_USER="$(whoami)"

echo "=== Nuvo Worker 자동 시작 설치 ==="
echo "스크립트 경로: $SCRIPT_DIR"
echo "실행 유저:     $CURRENT_USER"

# ── 1. conda 환경의 python 경로 자동 탐색 ──────────────────────────────────
PYTHON_PATH=""
for candidate in \
    "/anaconda/envs/azureml_py38/bin/python" \
    "/opt/anaconda/envs/azureml_py38/bin/python" \
    "$HOME/anaconda3/envs/azureml_py38/bin/python" \
    "$HOME/miniconda3/envs/azureml_py38/bin/python" \
    "$(conda run -n azureml_py38 which python 2>/dev/null || true)"
do
    if [ -x "$candidate" ]; then
        PYTHON_PATH="$candidate"
        break
    fi
done

if [ -z "$PYTHON_PATH" ]; then
    echo ""
    echo "[오류] azureml_py38 환경의 python을 찾을 수 없습니다."
    echo "  수동으로 확인: conda activate azureml_py38 && which python"
    exit 1
fi

echo "Python 경로:   $PYTHON_PATH"

# ── 2. .env 파일 확인 ─────────────────────────────────────────────────────
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    # 상위 backend 디렉터리에서 탐색
    BACKEND_ENV="$(realpath "$SCRIPT_DIR/../../../.env" 2>/dev/null || true)"
    if [ -f "$BACKEND_ENV" ]; then
        ENV_FILE="$BACKEND_ENV"
        echo ".env 경로:     $ENV_FILE"
    else
        echo "[경고] .env 파일을 찾지 못했습니다. 환경 변수가 없으면 워커가 실패할 수 있습니다."
        ENV_FILE=""
    fi
else
    echo ".env 경로:     $ENV_FILE"
fi

# ── 3. systemd 서비스 파일 생성 ────────────────────────────────────────────
ENV_LINE=""
if [ -n "$ENV_FILE" ]; then
    ENV_LINE="EnvironmentFile=$ENV_FILE"
fi

sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Nuvo MedGemma Queue Worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=$PYTHON_PATH $SCRIPT_DIR/run_queue_worker.py
$ENV_LINE
Restart=on-failure
RestartSec=15
StandardOutput=append:$LOG_FILE
StandardError=append:$LOG_FILE
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo "서비스 파일 생성: $SERVICE_FILE"
cat "$SERVICE_FILE"

# ── 4. 서비스 등록 및 시작 ────────────────────────────────────────────────
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo ""
echo "=== 설치 완료 ==="
echo ""
sudo systemctl status "$SERVICE_NAME" --no-pager

echo ""
echo "로그 확인: tail -f $LOG_FILE"
echo "서비스 재시작: sudo systemctl restart $SERVICE_NAME"
echo "서비스 중지: sudo systemctl stop $SERVICE_NAME"

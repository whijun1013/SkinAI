# MedGemma Data Tools

MedGemma 관련 PoC, Azure ML 배포 시도, H100 worker 운영 문서와 스크립트를 한곳에 모은 폴더입니다.

## Structure

```text
data_tools/medgemma/
  docs/          MedGemma PoC, endpoint, H100 worker 문서
  endpoint/      Azure ML Managed Online Endpoint 배포 패키지
  poc/           AI Hub/MedGemma PoC 실행, 평가, 더미 데이터 생성 스크립트
  samples/       probe 입력 샘플 이미지
  outputs/       probe 실행 결과
  worker/        H100 queue worker와 MongoDB index setup 도구
  requirements.txt
```

## Common Commands

Backend 기준:

```bash
cd apps/backend
```

H100 worker 의존성:

```bash
pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
pip install --no-cache-dir -r data_tools/medgemma/requirements.txt
```

H100 worker 실행:

```bash
python data_tools/medgemma/worker/run_queue_worker.py
```

Worker smoke test:

```bash
python data_tools/medgemma/worker/run_queue_worker.py --once
```

MongoDB queue index 생성:

```bash
python data_tools/medgemma/worker/setup_queue_indexes.py
```

MedGemma probe mock 실행:

```bash
python data_tools/medgemma/poc/probe_face_photos.py \
  --input-dir data_tools/medgemma/samples/probe_samples \
  --output-dir data_tools/medgemma/outputs/probe_outputs_mock \
  --mode mock
```

## Key Docs

- `docs/H100_WORKER.md`: H100 worker 실행 방법
- `docs/H100_WORKER_FLOW.md`: 팀 공유용 구조 설명
- `docs/H100_WORKER_COMPLETION_PROMPT.md`: 남은 보완 작업 프롬프트
- `docs/ENDPOINT_DEPLOYMENT.md`: Azure ML endpoint 배포 시도 기록
- `docs/POC_FINAL_REPORT.md`: PoC 최종 요약

## 프로덕션 환경 장기 실행 (Long-running Worker) 가이드

Azure 환경에서 Worker 스크립트를 장기 실행하는 권장 방식은 다음과 같습니다:

1. **Azure VM + systemd (가장 기본적이고 안정적)**
   - `/etc/systemd/system/medgemma-worker.service` 작성
   - `Restart=always`, `RestartSec=10` 설정으로 프로세스 다운 시 자동 재시작
   - GPU 드라이버 및 환경 설정만 되어 있으면 비용 최적화에 유리

2. **Azure VM + Supervisor**
   - `supervisord`를 통해 워커 프로세스 개수를 관리하고 로그를 쉽게 로테이션할 수 있습니다.
   - 단일 VM 내에서 워커를 n개 띄울 때 유용합니다.

3. **Azure Container Apps (서버리스, 스케일링)**
   - Dockerfile을 작성하여 워커를 컨테이너화한 후 배포합니다.
   - KEDA (Event-driven Autoscaling)를 연동하여 MongoDB 큐 길이에 따라 워커 컨테이너 수를 0에서 N으로 자동 조절할 수 있습니다. (향후 추천)

> **상태 알림**: Worker 파일(`run_queue_worker.py`)은 이미 구현 및 연동 완료되었으며, 운영 환경에 맞춰 위 방식 중 하나로 데몬화(daemonize)하여 실행하면 즉시 동작합니다.

## 정책 (MVP 기준)

- **Occlusion (가림) 감지**: 마스크, 손, 머리카락 등에 의한 얼굴 가림(Occlusion) 감지는 MVP 필수 구현 범위에서 제외되었습니다. 이는 향후 모델 개선 및 파이프라인 고도화 시 확장 항목으로 적용될 예정입니다.
- **점수 반영 정책**: MedGemma의 피부 관찰 결과(홍조, 트러블 등)는 현재 `skin_score`에 직접 반영하지 않고 보조적인 관찰 정보(참고용)로만 활용됩니다. 모델의 분석 결과가 실제 점수에 미치는 영향은 향후 별도의 검증 데이터 확보 및 정확도 평가 완료 후 재논의합니다.

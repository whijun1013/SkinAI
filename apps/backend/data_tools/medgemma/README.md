# MedGemma Data Tools

Luvel backend에서 피부 사진 기반 시각 분석 보조 결과를 생성하기 위한 MedGemma worker와 endpoint 관련 파일을 모아둔 디렉터리입니다.

MedGemma 결과는 진단이나 원인 단정에 사용하지 않고, GPT 리포트가 참고할 수 있는 시각 관찰 근거로만 사용합니다.

## Structure

```text
data_tools/medgemma/
  endpoint/      Endpoint packaging files
  worker/        Queue worker, queue index setup, consistency checks
  requirements.txt
```

## Worker Commands

Backend 기준:

```bash
cd apps/backend
```

의존성 설치:

```bash
pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
pip install --no-cache-dir -r data_tools/medgemma/requirements.txt
```

Queue worker 실행:

```bash
python data_tools/medgemma/worker/run_queue_worker.py
```

단일 smoke run:

```bash
python data_tools/medgemma/worker/run_queue_worker.py --once
```

MongoDB queue index 생성:

```bash
python data_tools/medgemma/worker/setup_queue_indexes.py
```

출력 일관성 점검:

```bash
python data_tools/medgemma/worker/test_medgemma_output_prompt.py \
  --input /path/to/evaluation-images \
  --output medgemma_consistency_results.json \
  --runs 20 \
  --quality-challenge-images 3
```

## Cleanup Note

과거 Azure VM/H100 PoC, GPT 비교 실험, AI Hub manifest 생성 스크립트는 앱 기능과 직접 연결되지 않아 정리되었습니다.

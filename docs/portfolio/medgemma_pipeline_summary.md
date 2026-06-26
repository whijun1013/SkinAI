# MedGemma Pipeline Summary

포트폴리오 검토용으로 정리한 MedGemma 연동 요약입니다. 원본 운영 문서에는 VM 접속 경로, 로컬 경로, 운영 절차가 섞여 있어 이 저장소에는 포함하지 않았습니다.

## 목적

MedGemma를 피부 질환 진단 모델로 사용하지 않고, 피부 사진에서 관찰 가능한 시각 신호를 보조적으로 추출하는 모듈로 제한했습니다.

관찰 대상은 다음과 같이 제한했습니다.

- `active_lesion`
- `redness`
- `barrier`
- `photo_quality`
- `confidence`

## 파이프라인 흐름

1. 사용자가 피부 사진을 업로드합니다.
2. 백엔드가 피부 기록과 이미지 URL을 저장합니다.
3. MedGemma queue가 활성화된 경우 MongoDB에 비동기 작업을 등록합니다.
4. worker가 작업을 처리하고 결과를 `skin_ai_results`에 저장합니다.
5. GPT Head 리포트는 MedGemma 결과를 원인 후보가 아니라 시각 근거 context로만 참고합니다.

## 안전 기준

- 진단, 치료, 원인 단정 문구를 생성하지 않습니다.
- 사진 품질이 낮거나 confidence가 낮은 결과는 리포트 반영을 보류합니다.
- schema validation을 통과한 결과만 downstream context에 전달합니다.
- prompt/model revision/hash를 저장해 재현 가능성을 높이는 방향으로 설계했습니다.

## 검증 관점

MedGemma 검증은 임상 정확도 입증이 아니라, 서비스 편입 전 최소 안전성 확인에 가깝습니다.

- JSON 형식 준수 여부
- 반복 실행 시 결과 일관성
- 품질 저하 이미지 처리
- token limit 및 inference time
- 픽셀 기반 reference와 출력 방향성 비교
- score quantization, confidence calibration 한계 확인

## 관련 코드

- `apps/backend/app/services/medgemma_service.py`
- `apps/backend/app/services/medgemma_queue_service.py`
- `apps/backend/app/services/medgemma_trend_service.py`
- `apps/backend/data_tools/medgemma/worker/run_queue_worker.py`
- `apps/backend/tests/test_medgemma_output_contract.py`
- `apps/backend/tests/test_medgemma_queue_service.py`
- `apps/backend/tests/test_analysis_context_pattern_medgemma_integration.py`

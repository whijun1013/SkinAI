# Portfolio Notes

## 포함 범위

- `apps/backend`: API, DB 모델, AI 분석 서비스, MedGemma queue/contract 관련 코드, 테스트
- `apps/mobile`: Expo 기반 모바일 앱 화면과 API client
- `docs/portfolio`: 포트폴리오 검토용 요약 문서

## 제외 원칙

원본 팀 프로젝트에는 배포 편의 스크립트, VM 접속 경로, 리뷰용 계정 정보, 로컬 산출물, 모델 파일이 섞여 있어 이 저장소에는 포함하지 않았습니다. 포트폴리오 검토자가 확인해야 할 핵심은 구현 구조와 테스트 코드이므로, 실행 secret과 운영 데이터는 `.env.example`로만 안내합니다.

## 주요 확인 파일

- `apps/backend/app/services/analysis_context_builder.py`
- `apps/backend/app/services/analysis_llm_service.py`
- `apps/backend/app/services/medgemma_service.py`
- `apps/backend/app/services/medgemma_queue_service.py`
- `apps/backend/app/services/medgemma_trend_service.py`
- `apps/backend/tests/test_medgemma_output_contract.py`
- `apps/backend/tests/test_analysis_context_pattern_medgemma_integration.py`
- `apps/mobile/src/nuvo/screens/record/SkinLogEntry.jsx`
- `apps/mobile/src/nuvo/screens/tabs/report/ReportScreen.jsx`

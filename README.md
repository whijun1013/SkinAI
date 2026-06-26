# SkinAI

AI 기반 피부 기록 분석 앱 포트폴리오용 저장소입니다.

이 저장소는 팀 프로젝트 원본에서 포트폴리오 검토에 필요한 코드와 문서만 선별해 구성한 개인 private repository입니다. 실제 운영 secret, 개인/팀원 데이터, 모델 파일, DB dump, 업로드 이미지, 대용량 원천 데이터는 포함하지 않았습니다.

## 프로젝트 개요

SkinAI는 피부 사진, 식단, 행동, 환경, 화장품/의약품 기록을 함께 저장하고, 피부 상태 변화와 관련될 수 있는 패턴을 분석하기 위한 모바일 앱과 API 서버입니다.

이 저장소에서 강조하는 범위는 다음입니다.

- FastAPI 기반 백엔드 API
- React Native/Expo 기반 모바일 앱
- MySQL 정형 데이터와 MongoDB AI 원본/context 데이터 분리
- Azure/OpenAI 계열 LLM 기반 분석 흐름
- MedGemma 결과를 진단이 아닌 피부 사진 기반 시각 관찰 신호로 제한하는 파이프라인
- 테스트/fixture 기반 회귀 검증

## 구조

```text
apps/
  backend/   FastAPI API, SQLAlchemy/Alembic, AI 분석 서비스, 테스트
  mobile/    React Native/Expo 앱
docs/
  portfolio/ 포트폴리오 검토용 설명 문서
```

## 핵심 구현 포인트

### 1. AI 분석 context 파이프라인

피부, 식단, 행동, 환경, 화장품/의약품 기록을 리포트 context로 구성하고, LLM이 최종 리포트 생성을 수행하는 흐름을 구현했습니다. AI 원본 응답과 context는 MongoDB에 보관하고, 사용자 기록과 마스터 데이터는 MySQL에 저장해 책임을 분리했습니다.

### 2. MedGemma 연동 범위 제한

MedGemma는 질병 진단이나 원인 단정을 수행하지 않고, 피부 사진에서 관찰 가능한 `active_lesion`, `redness`, `barrier` 계열 시각 신호를 보조적으로 산출하는 모듈로 다뤘습니다. 품질이 낮거나 confidence가 낮은 결과는 리포트 context 반영을 보류하도록 설계했습니다.

### 3. 데이터 정제와 검증

식단 분석에 필요한 음식 마스터 데이터를 백업, 중복 제거, 사후 감사, 회귀 테스트 순서로 정제했습니다. 대용량 원천 파일은 저장소에 포함하지 않았고, 관련 코드는 `apps/backend/data_tools`와 테스트에서 확인할 수 있습니다.

### 4. 사용자 흐름 안정화

날짜 검증, API 실패 시 입력값 보존, 422 오류 메시지 변환, 중복 제출 방지 등 모바일 사용자가 직접 마주하는 흐름의 예외 처리를 개선했습니다.

## 실행 개요

실행에는 별도의 로컬 환경변수 설정이 필요합니다.

- 백엔드: `apps/backend/.env.example`
- 모바일: `apps/mobile/.env.example`

```bash
cd apps/backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

```bash
cd apps/mobile
npm install --legacy-peer-deps
npx expo start
```

## 테스트

대표 테스트 예시는 다음과 같습니다.

```bash
cd apps/backend
python -m unittest tests.test_environment_logs -v
python -m unittest tests.test_user_cosmetics -v
python -m pytest tests/test_medgemma_output_contract.py -q
```

## 제외한 항목

- `.env`, key, pem, token
- 실제 사용자/팀원 데이터
- DB dump와 대용량 음식 원천 데이터
- 업로드 이미지 및 Blob 산출물
- MediaPipe/MedGemma 모델 파일
- H100/VM 접속 정보가 포함된 운영 스크립트
- 모바일 `package-lock.json`

## 참고

이 저장소는 포트폴리오 검토용으로 정리한 snapshot입니다. 팀 프로젝트의 모든 작업 이력이나 운영 환경을 그대로 포함하지 않습니다.

# SkinAI (Luvel Project Portfolio)

## 프로젝트 소개
SkinAI는 AI 기반 피부 및 생활기록 분석 앱 "Luvel"의 포트폴리오 레포지토리입니다.
사용자의 피부 상태 변화를 추적하고, 식단, 생활 습관, 화장품, 의약품 사용과 같은 다양한 요인(Factors)이 피부에 미치는 영향을 분석합니다.

## 주요 기능
- **피부 기록**: 얼굴 촬영을 통한 피부 상태 기록 및 분석 가이드 (AI 연동)
- **식단/생활 로그**: 식단 이미지 인식, 영양소 분석, 수면 및 스트레스 기록
- **데이터 파이프라인**: 
  - 화장품 성분 및 제품 정보 마스터 데이터 크롤링 및 정제
  - 식약처 의약품 데이터 연동 및 Haccp 공공데이터 연동
- **패턴 분석**: 식단, 화장품, 의약품 사용이 피부 상태에 미치는 상관관계(Confidence Factors, Lag) 분석
- **릴리즈 Readiness 체크**: 모바일(Expo) 및 백엔드(FastAPI) 릴리즈 전 검증, 환경 변수 스캔 자동화

## 기술 스택
- **Mobile**: React Native, Expo
- **Backend**: FastAPI, SQLAlchemy (Python)
- **Database**: MySQL (Relational), MongoDB (Document/Logs)
- **Data Tools**: Python 데이터 파이프라인 (Pandas, BeautifulSoup 등), Pytest
- **AI/ML Integration**: OpenAI (GPT-4o), Gemini, 자체 Vision 모델 POC 연동 구조

## 공개 범위 안내
본 레포지토리는 포트폴리오 공개용으로, 실제 운영 서비스의 보안을 위해 다음 사항이 제외되어 있습니다.
- **제외됨**: 실제 `.env` 설정, API Key, Token, Secret, Private 운영 URL, 실제 사용자 데이터, 원본 대용량 Seed 데이터, 로컬 모델 파일(`*.tflite` 등)
- 일부 데이터 파이프라인과 테스트 코드는 동작 구조를 보여주기 위해 샘플 형태로 포함되어 있습니다.

## 실행 방법

### Backend Setup
```bash
cd apps/backend
python -m venv venv311
source venv311/bin/activate  # Windows: venv311\Scripts\activate
pip install -r requirements.txt
cp .env.example .env # 환경 변수 세팅 필요
uvicorn main:app --reload
```

### Mobile Setup
```bash
cd apps/mobile
npm install
cp .env.example .env # 환경 변수 세팅 필요
npm start
```

### 테스트 (Backend)
```bash
cd apps/backend
pytest
```

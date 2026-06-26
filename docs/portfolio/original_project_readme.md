# SkinAI

AI 기반 피부 원인 역추적 개인화 분석 앱 (모바일 + API)

## 프로젝트 구조

```
apps/
├── mobile/   # React Native (Expo) — iOS/Android
└── backend/  # FastAPI — REST API
```

| 영역 | 기술 |
|------|------|
| 모바일 | Expo SDK 54, React Native, Zustand, Axios |
| 백엔드 | FastAPI, SQLAlchemy, Alembic |
| DB | MySQL (정형 기록·마스터), MongoDB (AI 원본·컨텍스트) |

상세 환경변수는 각 앱의 `.env.example`을 기준으로 합니다.

- `apps/backend/.env.example`
- `apps/mobile/.env.example`

화장품 크롤·시드 스크립트는 `apps/backend/data_tools/README.md`를 참고하세요.

---

## 빠른 시작

### 1. 백엔드

```bash
cd apps/backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux

pip install -r requirements.txt
cp .env.example .env           # 값 입력 (MySQL, JWT, MongoDB 등)

# MySQL DB 생성
mysql -u root -p -e "CREATE DATABASE skinai;"

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

- 서버 시작 시 **Alembic 마이그레이션 자동 적용**
- **화장품·약물 마스터**는 startup 시 자동 시드
- **`food_item`은 자동 시드 안 됨** → 비어 있으면 아래 [음식 DB](#음식-db-food_item) 참고

정상 기동 시 로그 예: `[startup] MongoDB 연결 완료 (db=skinai)`

### 2. 모바일

```bash
cd apps/mobile
npm install --legacy-peer-deps
cp .env.example .env           # PC IP 또는 ngrok URL

npx expo start
# 캐시 문제 시: npx expo start -c
```

`.env` 예시:

```env
API_BASE_URL=http://YOUR_PC_IP:8000
OAUTH_BASE_URL=http://YOUR_PC_IP:8000
```

- PC와 실기기는 **같은 Wi-Fi**
- 소셜 로그인 실기기 테스트: `OAUTH_BASE_URL`에 ngrok URL 사용 가능

### 3. API 문서

백엔드 실행 후:

- Swagger: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## 주요 기능 (현재)

| 영역 | 상태 |
|------|------|
| 회원가입·JWT·소셜 로그인 (Google/Kakao/Naver) | ✅ |
| 기록 탭 — 피부·식단·행동·주변환경 | ✅ |
| 화장품 검색·성분 분석·사용 제품 관리 | ✅ |
| 약물 검색·내 약물 관리 | ✅ |
| 식단 AI 인식·음식 DB 검색 | ✅ (food_item import 필요) |
| 환경 로그 (기상·미세먼지 등) | ✅ (외부 API 키 없으면 일부 필드 null) |
| 피부·식단 AI 분석 (Azure) | ✅ (키 설정 필요) |
| 종합 원인 분석 리포트·인사이트 대시보드 | 🔲 진행 중 |

---

## DB · 마이그레이션

### 팀원이 `git pull` 후

```bash
cd apps/backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

스키마는 startup 시 자동 반영됩니다.

### 모델을 수정한 경우 (작성자)

```bash
cd apps/backend
python -m alembic revision --autogenerate -m "변경 설명"
git add alembic/versions/
git commit -m "db: 변경 설명"
```

> 모델만 바꾸고 마이그레이션 파일을 push하지 않으면 다른 팀원 DB에 반영되지 않습니다.

### `schema.sql`로 이미 DB를 만든 경우 (1회)

```bash
python -m alembic stamp head
```

### 음식 DB (`food_item`)

식단 검색·AI에 필요합니다. **수동 1회** import:

```bash
cd apps/backend
python data_tools/import_food_json.py
# 처음부터: python data_tools/import_food_json.py --fresh
```

확인: `SELECT COUNT(*) FROM food_item;`

---

## MySQL vs MongoDB

| DB | 저장 대상 |
|----|-----------|
| **MySQL** | 사용자·기록·마스터(화장품/약물/음식)·분석 요약 |
| **MongoDB** | GPT 원본 응답, 분석 컨텍스트, 식단/피부 AI 상세 |

원칙: **결론·집계는 MySQL**, **AI 과정·가변 JSON은 MongoDB**.

컬렉션 예: `analysis_contexts`, `diet_ai_results`, `skin_ai_results`  
저장 로직: `apps/backend/app/mongo.py`

---

## 환경 기록 API 참고

`POST /users/me/environment-logs`는 기상청·에어코리아·카카오 로컬 API를 사용합니다.

- `.env`에 `KMA_AUTH_KEY`, `KMA_LIVING_INDEX_SERVICE_KEY`, `AIRKOREA_SERVICE_KEY`, `KAKAO_API_KEY` 설정
- 키가 없거나 실패해도 **로그 저장 자체는 성공**하고, 해당 필드만 `null` (Graceful Degradation)

---

## 테스트 (선택)

```bash
cd apps/backend
python -m unittest tests.test_environment_logs -v
python -m unittest tests.test_user_cosmetics -v
```

---

## 문제 해결

| 증상 | 확인 |
|------|------|
| 백엔드 기동 실패 | MySQL 실행, `.env` 존재, `pip install -r requirements.txt` |
| MongoDB 연결 실패 | Windows 서비스에서 MongoDB Running, `.env`의 `MONGO_URL` |
| 모바일 API 연결 실패 | Wi-Fi 동일 여부, 방화벽 8000, `API_BASE_URL` IP |
| Expo 번들/캐시 오류 | `npx expo start -c` |
| API 403 | 토큰 만료 → 재로그인, 백엔드 실행 여부 |

---

## 라이선스

MIT

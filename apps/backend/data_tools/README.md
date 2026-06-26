# 🧴 DermEat 화장품 데이터 수집 및 관리 도구 (data_tools)

이 디렉토리는 DermEat 서비스에서 사용하는 올리브영 화장품 정보(브랜드, 제품명, 전성분, 이미지 등)를 수집하고 관리하기 위한 스크립트와 가이드라인을 제공합니다.

---

## 🛠️ 주요 도구 구성

1. **`oliveyoung_crawler.py`**
   * 올리브영 공식 몰에서 화장품 카테고리별 상품 정보와 전성분을 수집하는 크롤러 본체입니다.
   * `selenium` 및 `undetected-chromedriver`를 활용하여 봇 탐지를 우회하고 안전하게 데이터를 크롤링합니다.
   * 수집 결과물은 `apps/backend/data/oliveyoung_db.json` 파일에 저장됩니다.

2. **`run_scheduler.py` & `start_crawler_daemon.bat`**
   * 매주 일요일 자정에 주기적으로 크롤러를 로컬 백그라운드에서 구동하는 파이썬 스케줄러 및 윈도우 실행 배치 파일입니다.
   * `schedule` 라이브러리를 사용하여 백그라운드 데몬 형태로 구동됩니다.

3. **`reset_db.py`**
   * 수집된 화장품 JSON 데이터베이스 파일(`oliveyoung_db.json`)을 초기화하고 크롤러의 이전 중단 지점 체크포인트를 제거하는 관리용 스크립트입니다.

4. **`extract_db.py` & `inject_kbeauty.py`**
   * 레거시 오픈 화장품 데이터셋(Open Beauty Facts) 가공 및 주요 단일/K-Beauty 제품 정보를 보조적으로 추가하는 스크립트입니다.

5. **`seed_master_data.py`**
   * `oliveyoung_db.json`과 `skin_affecting_drugs.json`의 전체 데이터를 실제 DB 테이블에 일괄 적재(Seed)하는 마스터 스크립트입니다.

6. **음식 DB 정제/적재 도구**
   * `build_curated_food_items.py`: 엑셀/JSON 원천을 `data/food_items_curated.json`으로 정제하고 중복 후보를 병합합니다.
   * `import_curated_food_items.py`: 정제 JSON을 `food_item`에 upsert합니다. 기존 중복 삭제는 수행하지 않습니다.
   * `merge_curated_food_items.py`: 기존 `food_item` 중복을 정리합니다. 반드시 `--dry-run`으로 삭제 후보를 확인한 뒤 `--apply`를 사용합니다.

7. **`fetch_mfds_ingredients.py` & `fetch_mfds_restrictions.py`**
   * 식약처(MFDS) API를 호출하여 화장품 성분 사전 및 배합 금지/한도 성분 데이터를 수집하고 DB에 보강하는 스크립트입니다.
   * 실행 전 `.env` 파일에 `MFDS_API_KEY`가 설정되어 있어야 합니다.

---

## 🚀 사용법 및 설치 방법

### 1. 의존성 설치
크롤러를 구동하려면 크롤러가 위치한 가상환경 또는 로컬 환경에 필요한 라이브러리를 설치해야 합니다.
```bash
pip install -r requirements.txt
```
*(필수 수집 라이브러리인 `selenium`, `undetected-chromedriver`, `beautifulsoup4`, `schedule` 등이 자동으로 포함되어 설치됩니다.)*

### 2. 크롤러 즉시 실행
```bash
python oliveyoung_crawler.py
```

### 3. 로컬 스케줄러 데몬 시작 (Windows)
윈도우 환경에서 백그라운드로 주기적인 자동 수집 태스크를 유지하려면 `start_crawler_daemon.bat` 배치 파일을 실행합니다.
```bash
start_crawler_daemon.bat
```

### 4. DB 데이터 초기 적재 (Seed) 및 성분 보강 순서
새로운 DB가 구축되었을 때(Alembic 마이그레이션 이후), 데이터를 적재하고 식약처 성분 정보로 보강하는 순서는 다음과 같습니다.

Windows 가상환경(`apps/backend/venv`) 기준 실행 명령어는 다음과 같습니다. `apps/backend` 디렉토리 내에서 실행해 주세요.

* **PowerShell 기준:**
  ```powershell
  .\venv\Scripts\python.exe data_tools/seed_master_data.py
  .\venv\Scripts\python.exe data_tools/fetch_mfds_ingredients.py
  .\venv\Scripts\python.exe data_tools/fetch_mfds_restrictions.py
  ```
* **Command Prompt (CMD) 기준:**
  ```cmd
  venv\Scripts\python.exe data_tools/seed_master_data.py
  venv\Scripts\python.exe data_tools/fetch_mfds_ingredients.py
  venv\Scripts\python.exe data_tools/fetch_mfds_restrictions.py
  ```
* **또는 가상환경 활성화 후 실행:**
  * PowerShell: `.\venv\Scripts\Activate.ps1` 실행 후 `python data_tools/...`
  * CMD: `call venv\Scripts\activate` 실행 후 `python data_tools/...`

**① 기본 데이터 적재 (화장품/의약품)**
```bash
python data_tools/seed_master_data.py
```
> 반드시 가장 먼저 실행하여 화장품, 의약품 기본 테이블 및 성분 정보를 뼈대로 구성합니다.

**② 식약처(MFDS) 성분 사전 보강**
```bash
python data_tools/fetch_mfds_ingredients.py
```

**③ 식약처(MFDS) 배합 금지/한도 성분 보강**
```bash
python data_tools/fetch_mfds_restrictions.py
```

### 5. 음식 영양 DB (`food_item`) — 팀원 온보딩

Alembic으로 스키마 적용 후, `food_item`이 비어 있으면:

```bash
cd apps/backend
venv\Scripts\activate          # Windows
alembic upgrade head           # source 컬럼 등 최신 스키마
python data_tools/build_curated_food_items.py --excel-input "<가공식품 엑셀 경로>" --excel-input "<음식DB 엑셀 경로>" --raw-material-dictionary data/raw_material_dictionary.json --output data/food_items_curated.json
python data_tools/import_curated_food_items.py --json-input data/food_items_curated.json
```

> ⚠️ `uvicorn` 실행만으로 `food_item`이 채워지지 **않습니다.** (2026-06-07부터 공공 API startup 시드 제거)
> 중복 삭제/참조 재연결은 별도 정리 작업입니다. 먼저 `python data_tools/merge_curated_food_items.py --json-input data/food_items_curated.json --dry-run`으로 확인한 뒤 필요한 범위만 `--apply` 하세요.

**레거시 (실행 불필요)**

| 파일 | 설명 |
|------|------|
| `database_seed_food.py` | 구 `food_db.json` 로더. 미사용 |

---

## 📅 GitHub Actions 자동화
리포지토리의 `.github/workflows/cron_crawler.yml` 워크플로우에 의해, 매주 일요일 자정(00:00 KST, 토요일 15:00 UTC)에 GitHub 러너 환경에서 Headless Chrome 브라우저 기반으로 크롤러가 자동 실행된 후 변경된 데이터셋이 리포지토리에 커밋 & 푸시됩니다.

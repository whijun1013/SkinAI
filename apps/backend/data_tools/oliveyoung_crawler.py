"""
올리브영(Olive Young) 화장품 전성분 크롤러
============================================
- 목적: DermEat 프로젝트용 K-Beauty 화장품 성분 DB 구축
- 데이터 수집 정책 준수 사항:
  1. robots.txt 및 이용약관을 존중하며, 학습/연구 목적으로만 사용
  2. 요청 간 3~5초 대기(time.sleep)로 서버 부하 최소화
  3. 수집 데이터는 상업적 배포 금지, 팀 프로젝트 시연용으로만 활용
  4. User-Agent를 정직하게 표기
- 출력: oliveyoung_db.json (브랜드, 제품명, 전성분, 카테고리)
"""

import json
import time
import random
import os
import sys
import re

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException, NoSuchElementException, 
    WebDriverException, StaleElementReferenceException
)

try:
    from webdriver_manager.chrome import ChromeDriverManager
except ImportError:
    ChromeDriverManager = None

import undetected_chromedriver as uc
from bs4 import BeautifulSoup

# ============================================================
# 설정
# ============================================================
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
# 백엔드 seed 입력 경로로 덤프
BACKEND_DIR = os.path.dirname(OUTPUT_DIR)
OUTPUT_FILE = os.path.join(BACKEND_DIR, "data", "oliveyoung_db.json")
CHECKPOINT_FILE = os.path.join(OUTPUT_DIR, "oy_crawl_checkpoint.json")

def clean_product_name(name):
    original = name
    # 대괄호, 소괄호 제거
    name = re.sub(r'^\[.*?\]\s*', '', name)
    name = re.sub(r'\(.*?\)', '', name)
    
    # 1+1 기획 등 제거
    name = re.sub(r'\b\d+\+\d+\s*(?:기획|증정)?\b', '', name)
    
    # '택1', '중 택1', '중택1', '단품택1' 등 옵션 워딩 제거
    name = re.sub(r'\s*(?:중\s*)?택\s*\d+\b', '', name)
    
    patterns = [
        r'\d+(?:\.\d+)?\s*(?:ml|mL|g|G|ea|EA|개|입|회분|p|P)\s*[\*xX+×]?\s*\d*\s*(?:개|입|세트|기획|단품|ea|EA|더블)?',
        r'\d+(?:\.\d+)?\s*(?:ml|mL|g|G|ea|EA|개|입|회분|p|P)',
        r'\b\d+\s*(?:개입|개입기획|개|세트|기획|ea|EA)\b',
    ]
    for pattern in patterns:
        name = re.sub(pattern, '', name, flags=re.IGNORECASE)
        
    name = re.sub(r'\b(?:기획세트|기획|단품|더블기획|더블|리필|세트|정품|한정|한정판|증정|추천|추천템|벌크|대용량|소용량)\b', '', name)
    name = re.sub(r'[\s\-+/*,]+$', '', name) # 끝에 남은 특수문자 제거
    name = re.sub(r'\s+', ' ', name).strip()
    if name.endswith(")"):
        name = name.rstrip(")").strip()
    if not name:
        return original
    return name

# 올리브영 스킨케어 주요 카테고리 코드
CATEGORIES = {
    # 스킨케어
    "스킨/토너":       "100000100010014",
    "에센스/세럼/앰플": "100000100010015",
    "크림":            "100000100010010",
    "로션":            "100000100010011",
    "미스트/오일":      "100000100010012",
    # 클렌징
    "클렌징폼/워시":    "100000100020009",
    "클렌징워터/오일":   "100000100020008",
    # 선케어
    "선크림/선로션":     "100000100060001",
    # 마스크/팩
    "마스크/팩":         "100000100030001",
    # 남성화장품
    "남성 스킨케어":     "100000100110001",
}

# 요청 간 대기 시간 (서버 부하 방지 및 봇 차단 우회)
MIN_DELAY = 4.0
MAX_DELAY = 8.0

MAX_PRODUCTS_PER_CATEGORY = 200  # 카테고리당 최대 수집 수
MAX_PAGES_PER_CATEGORY = 10     # 카테고리당 최대 페이지 수


def get_driver():
    """Chrome WebDriver 초기화 (undetected-chromedriver 적용)"""
    options = uc.ChromeOptions()
    options.add_argument("--headless=new")  # uc 에서는 --headless 또는 --headless=new 혼용 가능
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    # 이미지/CSS 로딩 비활성화 (속도 향상)
    prefs = {
        "profile.managed_default_content_settings.images": 2,
        "profile.managed_default_content_settings.stylesheets": 2,
    }
    options.add_experimental_option("prefs", prefs)

    try:
        driver = uc.Chrome(options=options)
        return driver
    except Exception as e:
        print(f"uc.Chrome 초기화 실패: {e}")
        # fallback
        return uc.Chrome()


def polite_sleep():
    """서버 부하 방지를 위한 랜덤 대기"""
    delay = random.uniform(MIN_DELAY, MAX_DELAY)
    time.sleep(delay)


def save_checkpoint(data, category_idx, page_idx):
    """진행 상황 저장 (중단 복구용)"""
    checkpoint = {
        "category_idx": category_idx,
        "page_idx": page_idx,
        "products_count": len(data),
    }
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(checkpoint, f, ensure_ascii=False, indent=2)


def load_checkpoint():
    """이전 진행 상황 로드"""
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def collect_product_links(driver, cat_code, cat_name, max_pages=MAX_PAGES_PER_CATEGORY):
    """카테고리 목록 페이지에서 상품 링크 수집"""
    product_links = []
    
    for page in range(1, max_pages + 1):
        url = (
            f"https://www.oliveyoung.co.kr/store/display/getMCategoryList.do"
            f"?dispCatNo={cat_code}&prdSort=01&pageIdx={page}&rowsPerPage=48"
        )
        print(f"  📄 [{cat_name}] 페이지 {page} 로딩 중... ({url[:80]}...)")
        
        try:
            driver.get(url)
            polite_sleep()
            
            # 상품 리스트 로딩 대기
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "body"))
            )
            
            # ── 봇 탐지 우회 체크 ──
            page_src = driver.page_source
            if "잠시만 기다리십시오" in page_src or "Please wait" in driver.title:
                print(f"    ⚠️ 봇 탐지 감지됨. 15초 대기 후 새로고침...")
                time.sleep(15)
                driver.refresh()
                time.sleep(5)
                page_src = driver.page_source
                
            soup = BeautifulSoup(page_src, "html.parser")
            
            # 상품 링크 추출 - 올리브영의 상품 목록 구조에 맞춰 다중 셀렉터 시도
            items = soup.select("a.prd_thumb") or soup.select("div.prd_info a") or soup.select("li.flag a")
            
            if not items:
                # 대안: 모든 링크 중 goodsNo가 포함된 것 필터링
                all_links = soup.select("a[href*='goodsNo']")
                items = all_links
            
            if not items:
                print(f"    ⚠️ 페이지 {page}에서 상품을 찾을 수 없습니다. 다음 카테고리로 이동합니다.")
                break
            
            new_count = 0
            for item in items:
                href = item.get("href", "")
                if "goodsNo" in href or "getGoodsDetail" in href:
                    # 절대 URL로 변환
                    if href.startswith("/"):
                        href = "https://www.oliveyoung.co.kr" + href
                    elif not href.startswith("http"):
                        continue
                    
                    if href not in product_links:
                        product_links.append(href)
                        new_count += 1
            
            print(f"    ✅ 페이지 {page}: {new_count}개 신규 링크 발견 (누적: {len(product_links)})")
            
            if new_count == 0 or len(product_links) >= MAX_PRODUCTS_PER_CATEGORY:
                break
                
        except TimeoutException:
            print(f"    ⚠️ 페이지 {page} 로딩 시간 초과, 다음 페이지로...")
            continue
        except Exception as e:
            print(f"    ❌ 페이지 {page} 에러: {e}")
            break
    
    return product_links[:MAX_PRODUCTS_PER_CATEGORY]


def extract_product_detail(driver, url, cat_name):
    """개별 상품 상세 페이지에서 제품명, 브랜드, 전성분 추출"""
    try:
        driver.get(url)
        polite_sleep()
        
        # 페이지 로딩 대기
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "body"))
        )
        
        # ── 봇 탐지 우회 체크 ──
        page_src = driver.page_source
        if "잠시만 기다리십시오" in page_src or "Please wait" in driver.title:
            print("      ⚠️ 봇 탐지(잠시만 기다리십시오) 감지됨. 15초 대기 후 새로고침합니다...")
            time.sleep(15)
            driver.refresh()
            time.sleep(5)
            page_src = driver.page_source
        
        soup = BeautifulSoup(page_src, "html.parser")
        
        # ── 브랜드명 추출 ──
        brand = ""
        brand_el = soup.select_one("button[class*='btn-brand']") or soup.select_one("[class*='btn-brand']")
        if brand_el:
            brand = brand_el.get_text(strip=True)
        else:
            # Broad check
            for btn in soup.find_all(["button", "a", "span"]):
                classes = btn.get("class", [])
                if any("btn-brand" in c or "brand" in c.lower() for c in classes):
                    brand = btn.get_text(strip=True)
                    break
        
        # ── 제품명 추출 ──
        product_name = ""
        name_el = (
            soup.select_one("h3[class*='GoodsDetailInfo_title']") or
            soup.select_one("h3[class*='title']") or
            soup.select_one("p.prd_name") or
            soup.select_one("span.prd_name") or
            soup.select_one("div[class*='title-area'] h3") or
            soup.select_one("div.prd_detail_box h2") or
            soup.select_one("h2.prd_name")
        )
        if name_el:
            product_name = name_el.get_text(strip=True)
        
        if not product_name:
            # title 태그에서 추출
            title = soup.find("title")
            if title:
                product_name = title.get_text(strip=True).split("|")[0].strip()
        
        # 정제 로직 즉시 적용
        if product_name:
            product_name = clean_product_name(product_name)
        
        # ── 전성분 추출을 위해 아코디언 메뉴 클릭 ──
        all_buttons = driver.find_elements(By.TAG_NAME, "button")
        for btn in all_buttons:
            try:
                # Use textContent or innerText to avoid issues when CSS is disabled
                text = btn.get_attribute("textContent") or ""
                if "상품정보 제공고시" in text:
                    driver.execute_script("arguments[0].scrollIntoView(true);", btn)
                    time.sleep(1)
                    driver.execute_script("arguments[0].click();", btn)
                    time.sleep(2)
                    break
            except Exception:
                continue
                
        # 클릭된 소스로 BeautifulSoup 재생성
        soup = BeautifulSoup(driver.page_source, "html.parser")
        
        ingredients = ""
        # 모든 테이블 돌면서 전성분 검색
        tables = soup.find_all(["table", "div"])
        for table in tables:
            # Olive young sometimes uses table rows, sometimes divs
            rows = table.find_all("tr")
            for row in rows:
                th = row.find("th")
                td = row.find("td")
                if th and td:
                    th_text = th.get_text(strip=True)
                    if "성분" in th_text or "화장품법" in th_text:
                        ingredients = td.get_text(strip=True)
                        break
            if ingredients:
                break
        
        # goodsNo 추출
        goods_no = ""
        gn_match = re.search(r'goodsNo=([A-Z0-9]+)', url)
        if gn_match:
            goods_no = gn_match.group(1)
        
        if not product_name and not brand:
            return None
        
        return {
            "brand": brand,
            "product_name": product_name,
            "ingredients": ingredients if ingredients else "",
            "category": cat_name,
            "goods_no": goods_no,
            "source": "oliveyoung.co.kr"
        }
        
    except TimeoutException:
        print(f"      ⏱️ 상세 페이지 로딩 시간 초과: {url[:60]}...")
        return None
    except Exception as e:
        print(f"      ❌ 상세 페이지 에러: {e}")
        return None


def main():
    print("=" * 70)
    print("🧴 올리브영 화장품 전성분 크롤러 v1.0")
    print("   (DermEat 프로젝트 - 학습/연구 목적 전용)")
    print("=" * 70)
    print(f"📁 출력 파일: {OUTPUT_FILE}")
    print(f"📦 카테고리 수: {len(CATEGORIES)}")
    print(f"⏱️ 요청 간 대기: {MIN_DELAY}~{MAX_DELAY}초")
    print(f"📊 카테고리당 최대 제품: {MAX_PRODUCTS_PER_CATEGORY}개")
    print()
    
    # 기존 DB 로드 (이어서 크롤링)
    all_products = []
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            all_products = json.load(f)
        print(f"📂 기존 DB 로드: {len(all_products)}개 제품")
    
    existing_goods = set()
    for p in all_products:
        if p.get("goods_no"):
            existing_goods.add(p["goods_no"])
    
    # WebDriver 초기화
    print("\n🚀 Chrome WebDriver 초기화 중...")
    try:
        driver = get_driver()
    except WebDriverException as e:
        print(f"❌ WebDriver 초기화 실패: {e}")
        print("Chrome 브라우저가 설치되어 있는지 확인해 주세요.")
        sys.exit(1)
    
    print("✅ WebDriver 준비 완료\n")
    
    total_new = 0
    total_skipped = 0
    total_failed = 0
    
    try:
        for cat_idx, (cat_name, cat_code) in enumerate(CATEGORIES.items()):
            print(f"\n{'─' * 60}")
            print(f"📂 [{cat_idx+1}/{len(CATEGORIES)}] 카테고리: {cat_name} (코드: {cat_code})")
            print(f"{'─' * 60}")
            
            # 1단계: 상품 링크 수집
            product_links = collect_product_links(driver, cat_code, cat_name)
            print(f"\n  📋 수집된 상품 링크: {len(product_links)}개")
            
            # 2단계: 각 상품 상세 페이지 크롤링
            for prod_idx, link in enumerate(product_links):
                # 중복 체크
                gn_match = re.search(r'goodsNo=([A-Z0-9]+)', link)
                if gn_match and gn_match.group(1) in existing_goods:
                    total_skipped += 1
                    continue
                
                print(f"    🔍 [{prod_idx+1}/{len(product_links)}] 상세 페이지 크롤링 중...")
                
                product = extract_product_detail(driver, link, cat_name)
                
                if product and product["product_name"]:
                    all_products.append(product)
                    if product.get("goods_no"):
                        existing_goods.add(product["goods_no"])
                    total_new += 1
                    
                    ing_preview = product["ingredients"][:40] + "..." if product["ingredients"] else "(전성분 미확인)"
                    print(f"      ✅ {product['brand']} | {product['product_name'][:30]} | {ing_preview}")
                else:
                    total_failed += 1
                
                # 주기적으로 중간 저장
                if total_new > 0 and total_new % 20 == 0:
                    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                        json.dump(all_products, f, ensure_ascii=False, indent=2)
                    print(f"\n  💾 중간 저장 완료 (총 {len(all_products)}개)")
                    save_checkpoint(all_products, cat_idx, prod_idx)
            
            # 카테고리 완료 후 저장
            with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                json.dump(all_products, f, ensure_ascii=False, indent=2)
            print(f"\n  💾 [{cat_name}] 카테고리 저장 완료")
    
    except KeyboardInterrupt:
        print("\n\n⚠️ 사용자에 의해 중단되었습니다. 현재까지의 데이터를 저장합니다...")
    
    except Exception as e:
        print(f"\n\n❌ 예상치 못한 에러: {e}")
    
    finally:
        # 최종 저장
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(all_products, f, ensure_ascii=False, indent=2)
        
        driver.quit()
        
        print(f"\n{'=' * 70}")
        print(f"📊 크롤링 최종 결과")
        print(f"{'=' * 70}")
        print(f"  ✅ 신규 수집: {total_new}개")
        print(f"  ⏭️ 중복 건너뜀: {total_skipped}개")
        print(f"  ❌ 실패: {total_failed}개")
        print(f"  📦 전체 DB 크기: {len(all_products)}개")
        print(f"  📁 저장 위치: {OUTPUT_FILE}")
        
        # 전성분이 있는 비율 확인
        with_ing = sum(1 for p in all_products if p.get("ingredients"))
        print(f"  🧪 전성분 보유율: {with_ing}/{len(all_products)} ({with_ing/max(len(all_products),1)*100:.1f}%)")
        print(f"{'=' * 70}")


if __name__ == "__main__":
    main()

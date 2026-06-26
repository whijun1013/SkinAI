"""
food_items_curated.json → 로컬 DB food_item 테이블 skin_factors 업데이트

매칭 우선순위:
  1. api_food_code 일치
  2. name 일치 (api_food_code가 없는 경우)

실행 전 SSH 터널이 열려 있어야 합니다.
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(override=True)

from app.database import engine
from sqlalchemy import text

JSON_PATH = r"C:\Users\user\Downloads\food_items_curated.json"

def main():
    print("JSON 로딩 중...")
    with open(JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)

    # skin_factors가 있는 항목만 처리
    to_update = [d for d in data if d.get("skin_factors")]
    print(f"skin_factors 있는 항목: {len(to_update):,}건 / {len(data):,}건")

    updated_code = 0
    updated_name = 0
    skipped = 0

    with engine.begin() as conn:
        for i, item in enumerate(to_update):
            code = (item.get("api_food_code") or "").strip()
            name = (item.get("name") or "").strip()
            sf = json.dumps(item["skin_factors"], ensure_ascii=False)

            matched = False

            # 1차: api_food_code로 매칭
            if code:
                result = conn.execute(
                    text("UPDATE food_item SET skin_factors = :sf WHERE api_food_code = :code"),
                    {"sf": sf, "code": code}
                )
                if result.rowcount > 0:
                    updated_code += result.rowcount
                    matched = True

            # 2차: name으로 매칭 (아직 안 됐을 때만)
            if not matched and name:
                result = conn.execute(
                    text("UPDATE food_item SET skin_factors = :sf WHERE name = :name AND skin_factors IS NULL"),
                    {"sf": sf, "name": name}
                )
                if result.rowcount > 0:
                    updated_name += result.rowcount
                    matched = True

            if not matched:
                skipped += 1

            if (i + 1) % 5000 == 0:
                print(f"  진행 중... {i+1:,}/{len(to_update):,}")

    print()
    print("=== 완료 ===")
    print(f"api_food_code 매칭 업데이트: {updated_code:,}건")
    print(f"name 매칭 업데이트:          {updated_name:,}건")
    print(f"매칭 실패(스킵):             {skipped:,}건")

if __name__ == "__main__":
    main()

"""
로컬 DB food_item 테이블을 food_items_curated.json으로 완전 교체

1. food_item 테이블 TRUNCATE (FK 체크 비활성화)
2. JSON 전체 INSERT
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(override=True)

import os
print(f"연결 대상: {os.getenv('DB_HOST')}:{os.getenv('DB_PORT')} / {os.getenv('DB_NAME')}")

from app.database import engine
from sqlalchemy import text

JSON_PATH = r"C:\Users\user\Downloads\food_items_curated.json"
BATCH_SIZE = 500

def main():
    print("JSON 로딩 중...")
    with open(JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)
    print(f"총 {len(data):,}건 로드 완료")

    with engine.begin() as conn:
        print("FK 체크 비활성화...")
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))

        print("food_item 테이블 TRUNCATE...")
        conn.execute(text("TRUNCATE TABLE food_item"))

        print("데이터 INSERT 시작...")
        total = len(data)
        inserted = 0

        for i in range(0, total, BATCH_SIZE):
            batch = data[i:i + BATCH_SIZE]
            rows = []
            for item in batch:
                nt = item.get("nutrition") or {}
                sf = item.get("skin_factors")
                rows.append({
                    "api_food_code": (item.get("api_food_code") or "")[:100] or None,
                    "name": (item.get("name") or "")[:255],
                    "category": (item.get("category") or "")[:100] or None,
                    "calories": nt.get("calories"),
                    "carbohydrate": nt.get("carbohydrate"),
                    "sugar": nt.get("sugar"),
                    "protein": nt.get("protein"),
                    "fat": nt.get("fat"),
                    "sodium": nt.get("sodium"),
                    "raw_material_text": item.get("raw_material_text"),
                    "allergen_text": item.get("allergen_text"),
                    "skin_factors": json.dumps(sf, ensure_ascii=False) if sf else None,
                    "source": (item.get("source") or "")[:20] or None,
                })

            conn.execute(text("""
                INSERT INTO food_item
                  (api_food_code, name, category, calories, carbohydrate, sugar,
                   protein, fat, sodium, raw_material_text, allergen_text, skin_factors, source)
                VALUES
                  (:api_food_code, :name, :category, :calories, :carbohydrate, :sugar,
                   :protein, :fat, :sodium, :raw_material_text, :allergen_text, :skin_factors, :source)
            """), rows)

            inserted += len(batch)
            if inserted % 10000 == 0 or inserted >= total:
                print(f"  {inserted:,} / {total:,}")

        print("FK 체크 재활성화...")
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))

    print(f"\n완료! 총 {inserted:,}건 INSERT")

if __name__ == "__main__":
    main()

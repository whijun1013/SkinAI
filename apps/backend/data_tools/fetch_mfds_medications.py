import os
import sys
import time
from datetime import datetime

import httpx
from dotenv import load_dotenv
from sqlalchemy.orm import Session

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine
from app.models.medication import Medication


load_dotenv()

API_KEY = os.getenv("MFDS_API_KEY")
BASE_URL = "https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnDtlInq06"


def parse_date(date_str: str | None):
    if not date_str or len(date_str) != 8:
        return None
    try:
        return datetime.strptime(date_str, "%Y%m%d").date()
    except ValueError:
        return None


def truncate(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    return value[: limit - 3] + "..." if len(value) > limit else value


def normalize_license_status(value: str | None) -> str:
    cleaned = (value or "").strip()
    if not cleaned or cleaned in {"?", "??", "???"} or "\ufffd" in cleaned:
        return "정상"
    return cleaned


def is_active_license_status(value: str | None) -> bool:
    status = normalize_license_status(value)
    return not any(keyword in status for keyword in ("취소", "취하", "폐기", "만료", "정지"))


class MFDSParser:
    def parse_api_response(self, json_data: dict) -> list[dict]:
        items = json_data.get("body", {}).get("items", [])
        if not items:
            return []

        results = []
        source_updated_at = datetime.now().date()
        for item in items:
            license_status = normalize_license_status(item.get("CANCEL_NAME"))
            results.append(
                {
                    "item_seq": item.get("ITEM_SEQ"),
                    "name": truncate(item.get("ITEM_NAME"), 255),
                    "english_name": truncate(item.get("ITEM_ENG_NAME"), 255),
                    "manufacturer": truncate(item.get("ENTP_NAME"), 255),
                    "valid_term": truncate(item.get("VALID_TERM"), 100),
                    "storage_method": truncate(item.get("STORAGE_METHOD"), 255),
                    "material_name": item.get("MATERIAL_NAME"),
                    "license_status": license_status,
                    "license_date": parse_date(item.get("ITEM_PERMIT_DATE")),
                    "cancel_date": parse_date(item.get("CANCEL_DATE")),
                    "efficacy_group": None,
                    "prescription_type": truncate(item.get("ETC_OTC_CODE"), 50),
                    "source_updated_at": source_updated_at,
                    "is_active": is_active_license_status(license_status),
                }
            )
        return results


def upsert_medication(db: Session, med_data: dict) -> str:
    if not med_data.get("item_seq"):
        return "skipped"

    existing = db.query(Medication).filter(Medication.item_seq == med_data["item_seq"]).first()
    if existing:
        for key, value in med_data.items():
            if key == "item_seq":
                continue
            if value is not None or key in {"is_active", "source_updated_at"}:
                setattr(existing, key, value)
        return "updated"

    payload = dict(med_data)
    payload["name"] = payload.get("name") or "Unknown"
    db.add(Medication(**payload))
    return "inserted"


def fetch_and_seed_mfds_medications():
    if not API_KEY:
        print("Warning: MFDS_API_KEY is not set in the environment variables.")
        return

    print("Starting MFDS medications sync...")
    parser = MFDSParser()

    with Session(engine) as db:
        page_no = 1
        num_of_rows = 100
        total_fetched = 0

        with httpx.Client(timeout=15.0) as client:
            while True:
                params = {
                    "ServiceKey": API_KEY,
                    "pageNo": str(page_no),
                    "numOfRows": str(num_of_rows),
                    "type": "json",
                }

                print(f"Fetching page {page_no}...")
                try:
                    res = client.get(BASE_URL, params=params)
                    res.raise_for_status()
                    data = res.json()
                except Exception as exc:
                    print(f"Error fetching page {page_no}: {exc}")
                    break

                header = data.get("header", {})
                if header.get("resultCode") != "00":
                    print(f"API Error: {header.get('resultMsg')}")
                    break

                parsed_items = parser.parse_api_response(data)
                if not parsed_items:
                    break

                body = data.get("body", {})
                total_count = body.get("totalCount", 0)

                for med_data in parsed_items:
                    upsert_medication(db, med_data)

                db.commit()
                total_fetched += len(parsed_items)

                print(f"Processed page {page_no}. Total processed: {total_fetched}/{total_count}")

                if total_fetched >= total_count or len(parsed_items) < num_of_rows:
                    break

                page_no += 1
                time.sleep(0.1)

        print(f"Completed! Total MFDS medications updated/inserted: {total_fetched}")


if __name__ == "__main__":
    fetch_and_seed_mfds_medications()

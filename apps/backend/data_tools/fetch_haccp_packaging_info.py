import os
import sys
import json
import argparse
import requests
import xml.etree.ElementTree as ET
from typing import List, Dict, Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
from app.services.skin_factor_rules import calculate_skin_factors_from_raw_material_text

load_dotenv()

API_URL = "https://apis.data.go.kr/B553748/CertImgListServiceV3/getCertImgListServiceV3"
SERVICE_KEY = os.getenv("DATA_GO_KR_SERVICE_KEY")

def parse_haccp_response(xml_string: str) -> List[Dict[str, Any]]:
    results = []
    try:
        root = ET.fromstring(xml_string)
        body = root.find("body")
        if body is None:
            return results
            
        items = body.find("items")
        if items is None:
            return results
            
        for item in items.findall("item"):
            # Extract standard fields
            product_name = item.findtext("prdlstNm") or ""
            barcode = item.findtext("barcode") or ""
            item_report_no = item.findtext("prdlstReportNo") or ""
            raw_material_text = item.findtext("rawmtrl") or ""
            allergen_text = item.findtext("allergy") or ""
            nutrition_text = item.findtext("nutrient") or ""
            manufacturer = item.findtext("manufacture") or item.findtext("bsshNm") or ""
            seller = item.findtext("seller") or ""
            capacity = item.findtext("prdkindstate") or item.findtext("capacity") or ""
            product_type = item.findtext("prdkind") or ""
            image_url = item.findtext("imgurl1") or ""
            image_url_2 = item.findtext("imgurl2") or ""
            
            parsed = {
                "product_name": product_name,
                "barcode": barcode,
                "item_report_no": item_report_no,
                "raw_material_text": raw_material_text,
                "allergen_text": allergen_text,
                "nutrition_text": nutrition_text,
                "manufacturer": manufacturer,
                "seller": seller,
                "capacity": capacity,
                "product_type": product_type,
                "image_url": image_url,
                "image_url_2": image_url_2,
                "source": "haccp_packaging_api"
            }
            results.append(parsed)
            
    except Exception as e:
        print(f"Failed to parse XML: {e}")
        
    return results

def build_haccp_skin_factors(
    item: dict,
    raw_material_dict: list[dict],
) -> list[dict]:
    factors = []
    
    # Parse from raw_material_text
    raw_text = item.get("raw_material_text", "")
    if raw_text:
        factors.extend(calculate_skin_factors_from_raw_material_text(raw_text, raw_material_dict))
        
    # Parse from allergen_text
    allergen_text = item.get("allergen_text", "")
    if allergen_text:
        allergen_factors = calculate_skin_factors_from_raw_material_text(allergen_text, raw_material_dict)
        
        # Specifically handle '우유' in allergen text as high/high confirmed
        if "우유" in allergen_text and not any(f["key"] == "dairy_confirmed" for f in allergen_factors):
            allergen_factors.append({
                "key": "dairy_confirmed",
                "label": "유제품",
                "level": "high",
                "confidence": "high",
                "evidence": ["allergen:우유"],
                "source": "haccp_allergen_text"
            })
            
        # Merge logic: if same key, keep highest confidence, merge evidence
        existing_by_key = {f["key"]: f for f in factors}
        for af in allergen_factors:
            af["source"] = "haccp_allergen_text"
            # Change raw_material: prefix to allergen:
            af["evidence"] = [
                ev.replace("raw_material:", "allergen:") if ev.startswith("raw_material:") else ev
                for ev in af.get("evidence", [])
            ]
            k = af["key"]
            if k not in existing_by_key:
                factors.append(af)
                existing_by_key[k] = af
            else:
                existing = existing_by_key[k]
                # Merge evidence
                for ev in af.get("evidence", []):
                    if ev not in existing.get("evidence", []):
                        existing.setdefault("evidence", []).append(ev)
                # Overwrite confidence if new is high and existing is not
                if af.get("confidence") == "high" and existing.get("confidence") != "high":
                    existing["confidence"] = "high"
                    existing["level"] = af.get("level", existing["level"])
                # Source is haccp_allergen_text since allergen is explicitly provided
                existing["source"] = "haccp_allergen_text"
                    
    # Ensure source is set for raw_material_dictionary if not set
    for f in factors:
        if "source" not in f or f["source"] == "keyword_rule":
            f["source"] = "raw_material_dictionary"
            
    return factors

def fetch_haccp_info(
    query: str = "",
    barcode: str = "",
    page_no: int = 1,
    num_of_rows: int = 10,
    output_file: str = "data/haccp_packaging_skin_factor_items.json",
    cache_file: str = "data/haccp_packaging_api_cache.json",
    verify_sample: bool = False,
    raw_log_output: str = "data/haccp_api_sample_verification.json"
):
    if not SERVICE_KEY:
        print("API 키가 없습니다. 실행을 중단합니다.")
        return
        
    params = {
        "ServiceKey": SERVICE_KEY,
        "pageNo": str(page_no),
        "numOfRows": str(num_of_rows),
        "returnType": "xml"
    }
    
    if query:
        params["prdlstNm"] = query
    if barcode:
        params["barcode"] = barcode
        
    # Simple caching
    cache = {}
    if os.path.exists(cache_file):
        with open(cache_file, "r", encoding="utf-8") as f:
            cache = json.load(f)
            
    cache_key = f"{query}_{barcode}_{page_no}_{num_of_rows}"
    
    if cache_key in cache and not verify_sample:
        print("Loading from cache...")
        parsed_items = cache[cache_key]
        raw_body = "CACHED"
    else:
        print(f"Fetching from HACCP API (query={query}, barcode={barcode})...")
        raw_body = ""
        status_code = None
        try:
            res = requests.get(API_URL, params=params, timeout=10)
            status_code = res.status_code
            res.raise_for_status()
            raw_body = res.text
            parsed_items = parse_haccp_response(res.text)
            
            if not verify_sample:
                cache[cache_key] = parsed_items
                # Save cache
                with open(cache_file, "w", encoding="utf-8") as f:
                    json.dump(cache, f, ensure_ascii=False, indent=2)
                
        except Exception as e:
            print(f"API Request failed: {e}")
            if verify_sample:
                log_data = {
                    "endpoint": API_URL,
                    "params": {k: v for k, v in params.items() if k != "ServiceKey"},
                    "status_code": status_code,
                    "error": str(e),
                    "body_preview": raw_body[:500] if raw_body else ""
                }
                os.makedirs(os.path.dirname(os.path.abspath(raw_log_output)), exist_ok=True)
                with open(raw_log_output, "w", encoding="utf-8") as f:
                    json.dump(log_data, f, ensure_ascii=False, indent=2)
                print(f"Verification log saved to {raw_log_output}")
            return
            
    # Load raw material dictionary
    dict_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw_material_dictionary.json")
    raw_material_dict = []
    if os.path.exists(dict_path):
        with open(dict_path, "r", encoding="utf-8") as f:
            raw_material_dict = json.load(f)
            
    # Enhance items with skin_factors
    for item in parsed_items:
        item["skin_factors"] = build_haccp_skin_factors(item, raw_material_dict)
        
    if verify_sample:
        # Extract item tags from raw_body if it's XML
        item_tags = []
        if raw_body and raw_body != "CACHED":
            try:
                root = ET.fromstring(raw_body)
                first_item = root.find(".//item")
                if first_item is not None:
                    item_tags = [child.tag for child in first_item]
            except:
                pass
                
        log_data = {
            "endpoint": API_URL,
            "params": {k: v for k, v in params.items() if k != "ServiceKey"},
            "status_code": status_code if raw_body != "CACHED" else "CACHED",
            "item_count": len(parsed_items),
            "item_tags": item_tags,
            "parsed_sample": parsed_items[:3],
            "body_preview": raw_body[:1000] if raw_body != "CACHED" else ""
        }
        os.makedirs(os.path.dirname(os.path.abspath(raw_log_output)), exist_ok=True)
        with open(raw_log_output, "w", encoding="utf-8") as f:
            json.dump(log_data, f, ensure_ascii=False, indent=2)
        print(f"Verification log saved to {raw_log_output}")
        return

        
    # Append or overwrite output
    out_dir = os.path.dirname(os.path.abspath(output_file))
    os.makedirs(out_dir, exist_ok=True)
    
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(parsed_items, f, ensure_ascii=False, indent=2)
        
    print(f"Processed {len(parsed_items)} items -> {output_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", default="")
    parser.add_argument("--barcode", default="")
    parser.add_argument("--page-no", type=int, default=1)
    parser.add_argument("--num-of-rows", type=int, default=10)
    parser.add_argument("--output", default="data/haccp_packaging_skin_factor_items.json")
    parser.add_argument("--cache", default="data/haccp_packaging_api_cache.json")
    parser.add_argument("--verify-sample", action="store_true")
    parser.add_argument("--raw-log-output", default="data/haccp_api_sample_verification.json")
    
    args = parser.parse_args()
    
    if args.verify_sample and not args.query and not args.barcode:
        args.query = "우유"
        
    fetch_haccp_info(
        query=args.query,
        barcode=args.barcode,
        page_no=args.page_no,
        num_of_rows=args.num_of_rows,
        output_file=args.output,
        cache_file=args.cache,
        verify_sample=args.verify_sample,
        raw_log_output=args.raw_log_output
    )

import os
import sys
import json
import argparse
import requests
from typing import List, Dict, Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv()

API_URL = 'http://apis.data.go.kr/1471000/FoodRwmatrInfoService01/getFoodRwmatrList01'
SERVICE_KEY = os.getenv("DATA_GO_KR_SERVICE_KEY")

SEED_GROUPS = {
    "dairy_confirmed": {
        "label": "유제품",
        "level": "high",
        "confidence": "high",
        "keywords": [
            "우유", "원유", "탈지분유", "전지분유", "혼합분유", "유청", "유청분말",
            "유청단백", "카제인", "카제인나트륨", "유당", "버터", "버터오일",
            "치즈", "크림치즈", "유크림", "생크림", "연유"
        ]
    },
    "possible_dairy": {
        "label": "유제품(추정)",
        "level": "medium",
        "confidence": "low",
        "keywords": [
            "크림", "라떼", "밀크", "아이스크림", "요거트", "요구르트"
        ]
    },
    "processed_meat": {
        "label": "가공육",
        "level": "high",
        "confidence": "high",
        "keywords": [
            "햄", "소시지", "베이컨", "살라미", "런천미트", "프레스햄"
        ]
    },
    "alcohol_histamine": {
        "label": "주류(알코올/히스타민)",
        "level": "high",
        "confidence": "high",
        "keywords": [
            "주정", "알코올", "맥주", "와인", "막걸리", "소주"
        ]
    },
    "fried_or_high_ages": {
        "label": "튀김/직화(AGEs)",
        "level": "high",
        "confidence": "high",
        "keywords": [
            "튀김", "프라이드", "구이", "직화", "크리스피"
        ]
    }
}

def load_cache(cache_file: str) -> Dict[str, Any]:
    if os.path.exists(cache_file):
        with open(cache_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_cache(cache_file: str, data: Dict[str, Any]):
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def fetch_api_aliases(keyword: str, use_api: bool, cache: dict) -> List[str]:
    if not use_api or not SERVICE_KEY:
        return []
        
    if keyword in cache:
        return cache[keyword]
        
    aliases = []
    params = {
        'serviceKey': SERVICE_KEY,
        'rprsnt_rawmtrl_nm': keyword,
        'pageNo': '1',
        'numOfRows': '100',
        'type': 'json'
    }
    
    try:
        res = requests.get(API_URL, params=params, timeout=5)
        if res.status_code == 200:
            data = res.json()
            items = data.get("body", {}).get("items", [])
            for item in items:
                # Add aliases if found
                name = item.get("RPRSNT_RAWMTRL_NM")
                eng_name = item.get("ENG_NM")
                if name and name != keyword and name not in aliases:
                    aliases.append(name)
                if eng_name and eng_name not in aliases:
                    # Often English names contain multiple names separated by comma
                    for en in eng_name.split(","):
                        en_clean = en.strip()
                        if en_clean and en_clean not in aliases:
                            aliases.append(en_clean)
                            
            cache[keyword] = aliases
            return aliases
    except Exception as e:
        print(f"API Error for {keyword}: {e}")
        
    cache[keyword] = []
    return []

def build_dictionary(output_file: str, use_api: bool, cache_file: str):
    cache = load_cache(cache_file) if use_api else {}
    dictionary = []
    
    for key, group in SEED_GROUPS.items():
        label = group["label"]
        level = group["level"]
        confidence = group["confidence"]
        
        for kw in group["keywords"]:
            aliases = fetch_api_aliases(kw, use_api, cache)
            source = "mfds_raw_material_api" if use_api and aliases else "local_seed"
            
            entry = {
                "name": kw,
                "normalized_name": kw.replace(" ", ""),
                "aliases": aliases,
                "skin_factors": [
                    {
                        "key": key,
                        "label": label,
                        "level": level,
                        "confidence": confidence,
                        "source": "raw_material_dictionary",
                        "evidence": [f"raw_material:{kw}"]
                    }
                ],
                "source": source
            }
            dictionary.append(entry)
            
    if use_api:
        save_cache(cache_file, cache)
        
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(dictionary, f, ensure_ascii=False, indent=2)
        
    print(f"Built raw material dictionary with {len(dictionary)} base entries -> {output_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/raw_material_dictionary.json")
    parser.add_argument("--use-api", action="store_true")
    parser.add_argument("--api-cache", default="data/raw_material_api_cache.json")
    args = parser.parse_args()
    
    # ensure data directory exists
    out_dir = os.path.dirname(os.path.abspath(args.output))
    os.makedirs(out_dir, exist_ok=True)
    
    build_dictionary(args.output, args.use_api, args.api_cache)

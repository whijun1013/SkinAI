import re
from typing import Optional, Dict, Any, List

def _safe_float(val: Any) -> float:
    try:
        return float(val) if val is not None else 0.0
    except (ValueError, TypeError):
        return 0.0

def calculate_skin_factors(
    name: str,
    sugar: Optional[float] = None,
    sodium: Optional[float] = None,
    fat: Optional[float] = None,
    saturated_fat: Optional[float] = None,
    trans_fat: Optional[float] = None,
    carbohydrate: Optional[float] = None,
    category: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    음식명(name)과 영양정보를 기반으로 skin_factor를 '추정'하는 함수입니다.
    이 함수는 확정적인 원재료 정보가 없을 때 이름 기반의 키워드 매칭이나
    단순 영양 성분 수치 기준으로 피부 영향 가능성을 계산합니다.
    (예: 크림빵 -> possible_dairy)
    """
    factors = []

    s_val = _safe_float(sugar)
    na_val = _safe_float(sodium)
    f_val = _safe_float(fat)
    sf_val = _safe_float(saturated_fat)
    tf_val = _safe_float(trans_fat)
    c_val = _safe_float(carbohydrate)

    name_and_cat = f"{name} {category or ''}"

    # 1. High Sugar
    if s_val > 17:
        factors.append({
            "key": "high_sugar",
            "label": "고당류",
            "level": "high",
            "confidence": "high",
            "evidence": [f"당류 {s_val}g (> 17g/100g)"],
            "source": "nutrition_rule"
        })
    elif s_val >= 15:
        factors.append({
            "key": "high_sugar",
            "label": "고당류",
            "level": "medium",
            "confidence": "high",
            "evidence": [f"당류 {s_val}g (>= 15g/100g)"],
            "source": "nutrition_rule"
        })

    # 2. High Fat
    if f_val > 8:
        factors.append({
            "key": "high_fat",
            "label": "고지방",
            "level": "high",
            "confidence": "high",
            "evidence": [f"지방 {f_val}g (> 8g/100g)"],
            "source": "nutrition_rule"
        })

    # 3. High Saturated Fat
    if sf_val > 2.5:
        factors.append({
            "key": "high_saturated_fat",
            "label": "고포화지방",
            "level": "high",
            "confidence": "high",
            "evidence": [f"포화지방 {sf_val}g (> 2.5g/100g)"],
            "source": "nutrition_rule"
        })

    # 4. Trans Fat Present
    if tf_val >= 0.2:
        factors.append({
            "key": "trans_fat_present",
            "label": "트랜스지방",
            "level": "high",
            "confidence": "high",
            "evidence": [f"트랜스지방 {tf_val}g (>= 0.2g/100g)"],
            "source": "nutrition_rule"
        })

    # 5. High Sodium
    if na_val > 600:
        factors.append({
            "key": "high_sodium",
            "label": "고나트륨",
            "level": "high",
            "confidence": "high",
            "evidence": [f"나트륨 {na_val}mg (> 600mg/100g)"],
            "source": "nutrition_rule"
        })
    elif na_val >= 500:
        factors.append({
            "key": "high_sodium",
            "label": "고나트륨",
            "level": "medium",
            "confidence": "high",
            "evidence": [f"나트륨 {na_val}mg (>= 500mg/100g)"],
            "source": "nutrition_rule"
        })

    # 6. High GL Candidate
    gl_keywords = ["떡", "빵", "면", "라면", "과자", "젤리", "시럽", "당류", "음료", "흰쌀", "국수", "우동", "파스타", "피자", "버거", "케이크", "아이스크림"]
    if any(k in name_and_cat for k in gl_keywords) and "국밥" not in name_and_cat and "비빔밥" not in name_and_cat:
        if c_val >= 15 or s_val >= 10:
            factors.append({
                "key": "high_gl_candidate",
                "label": "고혈당지수(추정)",
                "level": "high",
                "confidence": "medium",
                "evidence": ["탄수화물/당류 동반된 고혈당 유발 음식 키워드 발견"],
                "source": "mixed_rule"
            })

    # 5. Dairy
    dairy_possible_kws = ["우유", "탈지분유", "전지분유", "유청", "유청분말", "카제인", "카제인나트륨", "유당", "버터", "치즈", "유크림", "생크림", "연유", "크림", "라떼", "밀크", "아이스크림", "요거트"]
    
    if any(k in name_and_cat for k in dairy_possible_kws):
        factors.append({
            "key": "possible_dairy",
            "label": "유제품(추정)",
            "level": "medium",
            "confidence": "low",
            "evidence": ["유제품으로 추정되는 키워드 발견"],
            "source": "keyword_rule"
        })

    # 6. Fried or High AGEs
    fried_kws = ["튀김", "프라이드", "구이", "직화", "크리스피", "베이컨", "돈까스", "텐더", "너겟"]
    if any(k in name_and_cat for k in fried_kws):
        factors.append({
            "key": "fried_or_high_ages",
            "label": "튀김/직화(AGEs)",
            "level": "high",
            "confidence": "high",
            "evidence": ["튀김/직화 관련 키워드 발견"],
            "source": "keyword_rule"
        })

    # 7. Alcohol
    alcohol_kws = ["주류", "맥주", "와인", "막걸리", "소주", "칵테일", "하이볼"]
    if any(k in name_and_cat for k in alcohol_kws):
        factors.append({
            "key": "alcohol_histamine",
            "label": "주류(알코올/히스타민)",
            "level": "high",
            "confidence": "high",
            "evidence": ["주류 관련 키워드 발견"],
            "source": "keyword_rule"
        })

    # 8. Processed Meat
    meat_kws = ["햄", "소시지", "베이컨", "살라미", "육가공", "스팸", "프랑크"]
    if any(k in name_and_cat for k in meat_kws):
        factors.append({
            "key": "processed_meat",
            "label": "가공육",
            "level": "high",
            "confidence": "high",
            "evidence": ["가공육 관련 키워드 발견"],
            "source": "keyword_rule"
        })

    return factors

def calculate_skin_factors_from_raw_material_text(
    raw_material_text: str, 
    dictionary: Optional[List[Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    """
    명시적인 원재료 텍스트(예: "탈지분유, 유청분말, 설탕")를 바탕으로
    raw_material_dictionary를 통해 '확정적(confirmed)'인 skin_factor를 추출합니다.
    """
    if not raw_material_text or not dictionary:
        return []
        
    # 복잡한 토큰화: 특수문자 기준 분할
    raw_tokens = re.split(r'[,;/|\·ㆍ\n]', raw_material_text)
    
    tokens = []
    for rt in raw_tokens:
        rt = rt.strip()
        if not rt:
            continue
            
        # 괄호 및 대괄호 안의 문자열 분리: "카제인나트륨(우유)" -> ["카제인나트륨", "우유"]
        # 매칭된 괄호 내용(예: 우유)과 바깥 내용(예: 카제인나트륨)을 모두 토큰으로 수집
        matches = re.finditer(r'([^\(\)\[\]]+)|(?:\(([^()]+)\))|(?:\[([^\[\]]+)\])', rt)
        for match in matches:
            # 그룹 1: 일반 텍스트, 그룹 2: 소괄호 안 텍스트, 그룹 3: 대괄호 안 텍스트
            val = match.group(1) or match.group(2) or match.group(3)
            if val:
                val = val.strip()
                if val:
                    tokens.append(val)
        
    if not tokens:
        return []
        
    factors = []
    seen_keys = set()
    
    for token in tokens:
        normalized_token = token.replace(" ", "")
        
        # Substring 오탐 방지: "향"으로 끝나면 confirmed 배제
        is_flavoring = token.endswith("향")
        
        # 사전에서 매칭
        for entry in dictionary:
            match = False
            # 이름 또는 normalized_name 매칭
            if entry["name"] == token or entry["normalized_name"] == normalized_token:
                match = True
            else:
                # aliases 매칭 (대소문자/공백 등 무시)
                for alias in entry.get("aliases", []):
                    if alias == token or alias.replace(" ", "") == normalized_token:
                        match = True
                        break
            
            if match:
                for sf in entry.get("skin_factors", []):
                    key = sf["key"]
                    confidence = sf.get("confidence", "low")
                    
                    # 만약 "향"이 붙은 향료인데 dairy_confirmed라면 possible_dairy로 다운그레이드
                    if is_flavoring and key == "dairy_confirmed":
                        key = "possible_dairy"
                        confidence = "low"
                        
                    # 동일한 키가 여러 원재료에서 발견되면 evidence만 합치거나 통과
                    if key not in seen_keys:
                        # 복사해서 반환본에 넣기
                        factor_copy = sf.copy()
                        factor_copy["key"] = key
                        factor_copy["confidence"] = confidence
                        if key == "possible_dairy" and factor_copy.get("label") == "유제품":
                            factor_copy["label"] = "유제품(추정)"
                            
                        factor_copy["evidence"] = [f"raw_material:{token}"]
                        factors.append(factor_copy)
                        seen_keys.add(key)
                    else:
                        # 이미 추가된 factor에 evidence 보강
                        for existing in factors:
                            if existing["key"] == key:
                                ev = f"raw_material:{token}"
                                if ev not in existing["evidence"]:
                                    existing["evidence"].append(ev)
                                break
                                
    return factors


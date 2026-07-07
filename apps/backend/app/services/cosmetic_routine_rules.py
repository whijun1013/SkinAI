from typing import List, Dict, Any, Tuple

# Mapping ingredient keywords to categories
INGREDIENT_CATEGORIES = {
    "retinol": ["레티놀", "retinol", "레티날", "retinal", "바쿠치올", "bakuchiol", "비타민A"],
    "vitamin_c": ["아스코빅애씨드", "ascorbic acid", "비타민C", "비타민씨", "순수비타민c"],
    "aha": ["글라이콜릭애씨드", "glycolic", "락틱애씨드", "lactic", "AHA", "아하", "구연산", "citric"],
    "bha": ["살리실릭애씨드", "salicylic", "BHA", "바하", "베타인살리실레이트"],
    "pha": ["글루코노락톤", "pha", "파하", "락토바이오닉애씨드"],
    "niacinamide": ["나이아신아마이드", "niacinamide", "비타민B3"],
    "benzoyl_peroxide": ["벤조일퍼옥사이드", "benzoyl peroxide"],
    "panthenol": ["판테놀", "panthenol", "비타민B5"],
    "hyaluronic_acid": ["히알루로닉애씨드", "hyaluronic", "소듐하이알루로네이트", "히알루론산"],
    "ceramide": ["세라마이드", "ceramide"]
}

# Rules mapping combinations to severity and messages
CLASH_RULES = [
    {
        "combo": {"retinol", "vitamin_c"},
        "severity": "high",
        "title": "비타민C와 레티놀 동시 사용 주의",
        "message": "두 성분을 함께 사용하면 피부 자극이 매우 커질 수 있어요. 아침에는 비타민C, 저녁에는 레티놀을 나누어 바르는 것을 추천해요."
    },
    {
        "combo": {"retinol", "aha"},
        "severity": "high",
        "title": "AHA와 레티놀 동시 사용 주의",
        "message": "각질을 탈락시키는 AHA와 피부 턴오버를 촉진하는 레티놀을 함께 쓰면 피부 장벽이 손상되기 쉬워요. 격일로 번갈아 사용해주세요."
    },
    {
        "combo": {"retinol", "bha"},
        "severity": "high",
        "title": "BHA와 레티놀 동시 사용 주의",
        "message": "피부 건조와 자극이 심해질 수 있어요. 각질 제거 성분과 레티놀은 가급적 피하고 휴식기를 두세요."
    },
    {
        "combo": {"retinol", "benzoyl_peroxide"},
        "severity": "high",
        "title": "벤조일퍼옥사이드와 레티놀 충돌",
        "message": "벤조일퍼옥사이드가 레티놀의 효과를 떨어뜨리고 피부 자극을 유발할 수 있습니다. 동시 사용을 피해주세요."
    },
    {
        "combo": {"vitamin_c", "aha"},
        "severity": "high",
        "title": "비타민C와 AHA 동시 사용 주의",
        "message": "둘 다 산성(pH) 성분이라 함께 쓰면 피부에 큰 자극이 될 수 있어요."
    },
    {
        "combo": {"vitamin_c", "bha"},
        "severity": "high",
        "title": "비타민C와 BHA 동시 사용 주의",
        "message": "산성 성분들의 조합으로 예민해질 수 있으니, 하나만 사용하거나 아침저녁으로 나누어 사용하세요."
    },
    {
        "combo": {"vitamin_c", "niacinamide"},
        "severity": "medium",
        "title": "비타민C와 나이아신아마이드 사용 주의",
        "message": "고농도일 경우 피부 붉어짐을 유발할 수 있습니다. 15~30분 간격을 두고 바르는 것을 권장합니다."
    },
    {
        "combo": {"retinol", "niacinamide"},
        "severity": "info",
        "title": "레티놀과 나이아신아마이드 시너지",
        "message": "나이아신아마이드가 레티놀의 자극을 줄여주고 장벽을 보호해주는 좋은 조합입니다."
    },
    {
        "combo": {"hyaluronic_acid", "retinol"},
        "severity": "info",
        "title": "수분 보호막 형성",
        "message": "히알루론산이 레티놀로 인한 건조함을 막아주는 훌륭한 조합이에요."
    },
    {
        "combo": {"ceramide", "retinol"},
        "severity": "info",
        "title": "장벽 보호 시너지",
        "message": "세라마이드가 레티놀의 자극을 진정시키고 피부 장벽을 튼튼하게 유지해줘요."
    }
]

def analyze_routine(products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    products: list of dicts with {"id": int, "name": str, "ingredients": str}
    returns: list of rule match dicts {"severity", "title", "message", "related_products": [{"id", "name"}]}
    """
    if not products or len(products) < 2:
        return []

    # Map each product to its discovered categories
    product_categories = []
    for p in products:
        cats = set()
        ing_text = (p.get("ingredients") or "").lower() + " " + (p.get("name") or "").lower()
        for cat, keywords in INGREDIENT_CATEGORIES.items():
            if any(k.lower() in ing_text for k in keywords):
                cats.add(cat)
        product_categories.append({
            "id": p.get("id"),
            "name": p.get("name"),
            "categories": cats
        })

    results = []
    # Check pairwise combinations for clashes
    # In a real scenario, we might just check the set of ALL categories present in the routine,
    # but pairing them allows us to pinpoint which products are clashing.
    seen_combos = set()

    for i in range(len(product_categories)):
        for j in range(i + 1, len(product_categories)):
            p1 = product_categories[i]
            p2 = product_categories[j]

            # Combine categories of both products
            for cat1 in p1["categories"]:
                for cat2 in p2["categories"]:
                    if cat1 == cat2:
                        continue

                    # Check if this combo matches any rules
                    pair_set = frozenset([cat1, cat2])
                    if pair_set in seen_combos:
                        continue

                    for rule in CLASH_RULES:
                        if rule["combo"] == pair_set:
                            seen_combos.add(pair_set)
                            results.append({
                                "severity": rule["severity"],
                                "title": rule["title"],
                                "message": rule["message"],
                                "related_products": [
                                    {"id": p1["id"], "name": p1["name"]},
                                    {"id": p2["id"], "name": p2["name"]}
                                ]
                            })
                            break

    # Sort results: high -> medium -> info
    severity_order = {"high": 0, "medium": 1, "info": 2}
    results.sort(key=lambda x: severity_order.get(x["severity"], 3))

    return results

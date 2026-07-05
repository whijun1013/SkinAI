import argparse
import os
import re
import sys
from collections import Counter

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.medication import Medication, MedicationIngredient


# Conservative seed terms. Existing curated skin-relevant ingredients are also used.
KNOWN_SKIN_RELEVANT_TERMS = {
    "이소트레티노인": "Retinoid",
    "isotretinoin": "Retinoid",
    "트레티노인": "Retinoid",
    "tretinoin": "Retinoid",
    "아다팔렌": "Retinoid",
    "adapalene": "Retinoid",
    "미노사이클린": "Antibiotic (Tetracycline)",
    "minocycline": "Antibiotic (Tetracycline)",
    "독시사이클린": "Antibiotic (Tetracycline)",
    "doxycycline": "Antibiotic (Tetracycline)",
    "클린다마이신": "Antibiotic",
    "clindamycin": "Antibiotic",
    "에리트로마이신": "Antibiotic",
    "erythromycin": "Antibiotic",
    "무피로신": "Antibiotic",
    "mupirocin": "Antibiotic",
    "히드로코르티손": "Corticosteroid",
    "hydrocortisone": "Corticosteroid",
    "프레드니솔론": "Corticosteroid",
    "prednisolone": "Corticosteroid",
    "메틸프레드니솔론": "Corticosteroid",
    "methylprednisolone": "Corticosteroid",
    "덱사메타손": "Corticosteroid",
    "dexamethasone": "Corticosteroid",
    "베타메타손": "Corticosteroid",
    "betamethasone": "Corticosteroid",
    "클로베타솔": "Corticosteroid",
    "clobetasol": "Corticosteroid",
    "모메타손": "Corticosteroid",
    "mometasone": "Corticosteroid",
    "케토코나졸": "Antifungal",
    "ketoconazole": "Antifungal",
    "이트라코나졸": "Antifungal",
    "itraconazole": "Antifungal",
    "테르비나핀": "Antifungal",
    "terbinafine": "Antifungal",
    "아시클로버": "Antiviral",
    "acyclovir": "Antiviral",
    "발라시클로버": "Antiviral",
    "valaciclovir": "Antiviral",
    "미녹시딜": "Hair Growth Stimulant",
    "minoxidil": "Hair Growth Stimulant",
    "피나스테리드": "5-Alpha Reductase Inhibitor",
    "finasteride": "5-Alpha Reductase Inhibitor",
    "두타스테리드": "5-Alpha Reductase Inhibitor",
    "dutasteride": "5-Alpha Reductase Inhibitor",
    "스피로노락톤": "Anti-androgen",
    "spironolactone": "Anti-androgen",
    "벤조일퍼옥사이드": "Benzoyl Peroxide",
    "benzoyl peroxide": "Benzoyl Peroxide",
    "아젤라산": "Azelaic Acid",
    "azelaic acid": "Azelaic Acid",
}

STOP_TERMS = {
    "수출용",
    "전문의약품",
    "일반의약품",
    "아세트아미노펜",
    "acetaminophen",
    "이부프로펜",
    "ibuprofen",
}


def normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip().lower()


def build_terms(db) -> dict[str, str]:
    terms = {normalize_text(k): v for k, v in KNOWN_SKIN_RELEVANT_TERMS.items()}
    rows = (
        db.query(MedicationIngredient)
        .filter(MedicationIngredient.is_skin_relevant.is_(True))
        .all()
    )
    for row in rows:
        if row.name:
            normalized_name = normalize_text(row.name)
            if normalized_name not in STOP_TERMS and len(normalized_name) >= 3:
                terms.setdefault(normalized_name, row.drug_class or "Skin relevant")
        if row.english_name:
            normalized_english_name = normalize_text(row.english_name)
            if normalized_english_name not in STOP_TERMS and len(normalized_english_name) >= 3:
                terms.setdefault(normalized_english_name, row.drug_class or "Skin relevant")
    return {key: value for key, value in terms.items() if key and key not in STOP_TERMS}


def extract_matches(material_name: str | None, terms: dict[str, str]) -> list[tuple[str, str]]:
    text = normalize_text(material_name)
    if not text:
        return []
    matches = []
    for term, drug_class in terms.items():
        if term and term in text:
            matches.append((term, drug_class))
    # Prefer longer terms and remove duplicates.
    matches.sort(key=lambda item: (-len(item[0]), item[0]))
    seen = set()
    unique = []
    for name, drug_class in matches:
        if name in seen:
            continue
        seen.add(name)
        unique.append((name, drug_class))
    return unique


def backfill(*, apply: bool, limit: int | None = None) -> dict:
    db = SessionLocal()
    stats = {
        "scanned": 0,
        "matched_medications": 0,
        "new_ingredients": 0,
        "new_mappings": 0,
    }
    matched_counter = Counter()

    try:
        terms = build_terms(db)
        query = db.query(Medication).filter(
            Medication.material_name.isnot(None),
            Medication.material_name != "",
        )
        if limit:
            query = query.limit(limit)

        ingredient_by_name = {
            normalize_text(row.name): row
            for row in db.query(MedicationIngredient).all()
            if row.name
        }

        for medication in query.all():
            stats["scanned"] += 1
            matches = extract_matches(medication.material_name, terms)
            if not matches:
                continue

            stats["matched_medications"] += 1
            for term, drug_class in matches:
                matched_counter[term] += 1
                ingredient = ingredient_by_name.get(term)
                if ingredient is None:
                    ingredient = MedicationIngredient(
                        name=term,
                        drug_class=drug_class,
                        is_skin_relevant=True,
                    )
                    if apply:
                        db.add(ingredient)
                        db.flush()
                    ingredient_by_name[term] = ingredient
                    stats["new_ingredients"] += 1
                else:
                    if apply:
                        ingredient.drug_class = ingredient.drug_class or drug_class
                        ingredient.is_skin_relevant = True

                if ingredient not in medication.ingredients_list:
                    stats["new_mappings"] += 1
                    if apply:
                        medication.ingredients_list.append(ingredient)

        if apply:
            db.commit()
        else:
            db.rollback()

        print(f"mode={'apply' if apply else 'dry-run'}")
        for key, value in stats.items():
            print(f"{key}={value}")
        print("top_matches=")
        for term, count in matched_counter.most_common(20):
            print(f"  {term}: {count}")
        return stats
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill medication skin-relevant ingredient mappings.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be 1 or greater.")

    backfill(apply=args.apply, limit=args.limit)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

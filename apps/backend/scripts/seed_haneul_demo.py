from __future__ import annotations

import argparse
import asyncio
import io
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import bcrypt
from dotenv import load_dotenv


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parents[1]
DEFAULT_MANIFEST = BACKEND_ROOT / "data" / "demo" / "haneul_20260609_20260622.json"
DEFAULT_PASSWORD = "demo1234!"

sys.path.insert(0, str(BACKEND_ROOT))
load_dotenv(BACKEND_ROOT / ".env", override=True)

from app.database import SessionLocal, disconnect_mongo, get_mongo_db  # noqa: E402
from app.models.analysis import AgentResult, AnalysisRequest, AnalysisResult  # noqa: E402
from app.models.behavior import DailyBehaviorLog  # noqa: E402
from app.models.cosmetic import CosmeticProduct, UserCosmetic  # noqa: E402
from app.models.diet import DietLog, DietLogItem, FoodItem  # noqa: E402
from app.models.environment import EnvironmentLog  # noqa: E402
from app.models.location import UserLocation  # noqa: E402
from app.models.medication import UserMedication  # noqa: E402, F401 — User relationship 해석용
from app.models.period import PeriodLog  # noqa: E402
from app.models.skin_log import SkinLog  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.blob_storage import blob_service_client, build_blob_url  # noqa: E402

try:  # pragma: no cover - dependency is present in the backend runtime
    from azure.storage.blob import ContentSettings
except ImportError:  # pragma: no cover
    ContentSettings = None


ALLOWED_SIGNALS = {"none", "mild", "moderate", "severe"}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate or seed the Seo Haneul demo manifest into local MySQL and MongoDB."
    )
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write MySQL, MongoDB, and image blobs. Without this flag only preflight runs.",
    )
    parser.add_argument("--password", default=DEFAULT_PASSWORD)
    parser.add_argument(
        "--skip-blob-upload",
        action="store_true",
        help="Do not upload images. Seeded photo_url values will be null.",
    )
    parser.add_argument(
        "--skip-mongo",
        action="store_true",
        help="Skip MongoDB preflight/write (troubleshooting only).",
    )
    return parser.parse_args()


def _load_manifest(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SystemExit(f"Manifest not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid manifest JSON: {exc}") from exc


def _asset_path(relative_path: str) -> Path:
    resolved = (REPO_ROOT / relative_path).resolve()
    try:
        resolved.relative_to(REPO_ROOT.resolve())
    except ValueError as exc:
        raise ValueError(f"Asset path escapes repository: {relative_path}") from exc
    return resolved


def validate_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    if manifest.get("schema_version") != "1.0":
        errors.append("schema_version must be 1.0")
    if manifest.get("is_synthetic") is not True:
        errors.append("is_synthetic must be true")

    records = manifest.get("daily_records") or []
    if len(records) != 14:
        errors.append(f"daily_records must contain 14 days, got {len(records)}")

    parsed_dates: list[date] = []
    meal_keys: set[str] = set()
    linked_keys: list[tuple[str, str]] = []
    food_codes: set[str] = set()
    asset_paths: set[Path] = set()
    photo_meals = 0

    for record in records:
        raw_date = record.get("date")
        try:
            current_date = date.fromisoformat(raw_date)
            parsed_dates.append(current_date)
        except (TypeError, ValueError):
            errors.append(f"invalid daily date: {raw_date!r}")
            continue

        score = (record.get("skin_log") or {}).get("overall_score")
        if not isinstance(score, int) or not 1 <= score <= 5:
            errors.append(f"{raw_date}: overall_score must be 1..5")
        signals = (record.get("medgemma") or {}).get("signals") or {}
        for key in ("active_lesion", "redness", "barrier"):
            if signals.get(key) not in ALLOWED_SIGNALS:
                errors.append(f"{raw_date}: invalid MedGemma signal {key}")

        skin_path = (record.get("skin_image") or {}).get("local_path")
        if not skin_path:
            errors.append(f"{raw_date}: missing skin image path")
        else:
            try:
                asset_paths.add(_asset_path(skin_path))
            except ValueError as exc:
                errors.append(str(exc))

        for meal in record.get("diet_logs") or []:
            meal_key = meal.get("meal_key")
            if not meal_key or meal_key in meal_keys:
                errors.append(f"{raw_date}: missing or duplicate meal_key {meal_key!r}")
            else:
                meal_keys.add(meal_key)
            method = meal.get("input_method")
            photo_path = meal.get("photo_asset_path")
            if method == "photo":
                photo_meals += 1
                if not photo_path:
                    errors.append(f"{meal_key}: photo meal requires photo_asset_path")
                else:
                    try:
                        asset_paths.add(_asset_path(photo_path))
                    except ValueError as exc:
                        errors.append(str(exc))
            elif method == "manual":
                if photo_path is not None:
                    errors.append(f"{meal_key}: manual meal cannot have photo_asset_path")
            else:
                errors.append(f"{meal_key}: input_method must be photo or manual")
            for item in meal.get("items") or []:
                code = item.get("api_food_code")
                if not code:
                    errors.append(f"{meal_key}: item missing api_food_code")
                else:
                    food_codes.add(code)

        linked = (record.get("environment_log") or {}).get("linked_meal_key")
        if linked:
            linked_keys.append((raw_date, linked))

    if len(parsed_dates) == len(records):
        for previous, current in zip(parsed_dates, parsed_dates[1:]):
            if current - previous != timedelta(days=1):
                errors.append(f"dates are not consecutive: {previous} -> {current}")
        analysis = manifest.get("analysis") or {}
        if parsed_dates and (
            analysis.get("start_date") != parsed_dates[0].isoformat()
            or analysis.get("end_date") != parsed_dates[-1].isoformat()
        ):
            errors.append("analysis start/end dates do not match daily_records")

    for raw_date, linked in linked_keys:
        if linked not in meal_keys:
            errors.append(f"{raw_date}: environment linked meal not found: {linked}")
    for path in sorted(asset_paths):
        if not path.is_file():
            errors.append(f"asset not found: {path}")

    if errors:
        raise ValueError("Manifest validation failed:\n- " + "\n- ".join(errors))

    return {
        "days": len(records),
        "meals": sum(len(record.get("diet_logs") or []) for record in records),
        "photo_meals": photo_meals,
        "food_codes": sorted(food_codes),
        "assets": len(asset_paths),
    }


def _resolve_master_rows(db, manifest: dict[str, Any]) -> tuple[dict[str, FoodItem], dict[str, CosmeticProduct]]:
    food_codes = {
        item["api_food_code"]
        for record in manifest["daily_records"]
        for meal in record.get("diet_logs") or []
        for item in meal.get("items") or []
    }
    food_rows = db.query(FoodItem).filter(FoodItem.api_food_code.in_(food_codes)).all()
    foods = {row.api_food_code: row for row in food_rows}
    missing_foods = sorted(food_codes - foods.keys())

    cosmetics: dict[str, CosmeticProduct] = {}
    missing_cosmetics: list[str] = []
    for item in manifest.get("cosmetics") or []:
        key = item["catalog_reference"]
        product = (
            db.query(CosmeticProduct)
            .filter(
                CosmeticProduct.brand == item["brand"],
                CosmeticProduct.product_name == item["product_name"],
            )
            .first()
        )
        if product is None:
            missing_cosmetics.append(
                f"{key}: {item['brand']} / {item['product_name']}"
            )
        else:
            cosmetics[key] = product

    if missing_foods or missing_cosmetics:
        parts = []
        if missing_foods:
            parts.append("missing food api_food_code: " + ", ".join(missing_foods))
        if missing_cosmetics:
            parts.append("missing cosmetics: " + "; ".join(missing_cosmetics))
        raise ValueError("Master data preflight failed:\n- " + "\n- ".join(parts))
    return foods, cosmetics


async def _ping_mongo() -> None:
    await get_mongo_db().command("ping")


def _jpeg_bytes(path: Path) -> bytes:
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:
        raise RuntimeError(
            "Pillow is required for Blob image upload. Install apps/backend/requirements.txt."
        ) from exc
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=92, optimize=True)
        return output.getvalue()


def _upload_asset(path: Path, container: str, blob_name: str) -> str:
    if blob_service_client is None or ContentSettings is None:
        raise RuntimeError(
            "Azure Blob Storage is not configured. Set AZURE_STORAGE_CONNECTION_STRING "
            "or use --skip-blob-upload."
        )
    client = blob_service_client.get_blob_client(container=container, blob=blob_name)
    client.upload_blob(
        _jpeg_bytes(path),
        overwrite=True,
        content_settings=ContentSettings(content_type="image/jpeg"),
    )
    return build_blob_url(container, blob_name)


def _prepare_asset_urls(manifest: dict[str, Any], skip_blob_upload: bool) -> dict[str, str | None]:
    urls: dict[str, str | None] = {}
    for record in manifest["daily_records"]:
        skin = record["skin_image"]
        local_path = skin["local_path"]
        urls[local_path] = None if skip_blob_upload else _upload_asset(
            _asset_path(local_path), "skin-img", skin["blob_name"]
        )
        for meal in record.get("diet_logs") or []:
            photo_path = meal.get("photo_asset_path")
            if photo_path and photo_path not in urls:
                day = record["date"].replace("-", "")
                urls[photo_path] = None if skip_blob_upload else _upload_asset(
                    _asset_path(photo_path), "food-img", f"demo/haneul/meal/{day}.jpg"
                )
    return urls


def _preflight_blob(skip_blob_upload: bool) -> str:
    if skip_blob_upload:
        return "skipped"
    if blob_service_client is None or ContentSettings is None:
        raise RuntimeError(
            "Azure Blob Storage is not configured. Set AZURE_STORAGE_CONNECTION_STRING "
            "or use --skip-blob-upload."
        )
    try:
        import PIL  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(
            "Pillow is required for Blob image upload. Install apps/backend/requirements.txt."
        ) from exc
    for container in ("skin-img", "food-img"):
        blob_service_client.get_container_client(container).get_container_properties()
    return "reachable"


def _clear_demo_rows(db, user_id: int, start: date, end: date) -> None:
    request_ids = [
        row[0]
        for row in db.query(AnalysisRequest.id)
        .filter(AnalysisRequest.user_id == user_id)
        .all()
    ]
    if request_ids:
        db.query(AgentResult).filter(AgentResult.request_id.in_(request_ids)).delete(
            synchronize_session=False
        )
        db.query(AnalysisResult).filter(AnalysisResult.request_id.in_(request_ids)).delete(
            synchronize_session=False
        )
    db.query(AnalysisRequest).filter(AnalysisRequest.user_id == user_id).delete(
        synchronize_session=False
    )

    diet_ids = [
        row[0]
        for row in db.query(DietLog.id)
        .filter(
            DietLog.user_id == user_id,
            DietLog.logged_at >= datetime.combine(start, datetime.min.time()),
            DietLog.logged_at < datetime.combine(end + timedelta(days=1), datetime.min.time()),
        )
        .all()
    ]
    db.query(EnvironmentLog).filter(
        EnvironmentLog.user_id == user_id,
        EnvironmentLog.logged_at.between(start, end),
    ).delete(synchronize_session=False)
    if diet_ids:
        db.query(DietLogItem).filter(DietLogItem.diet_log_id.in_(diet_ids)).delete(
            synchronize_session=False
        )
        db.query(DietLog).filter(DietLog.id.in_(diet_ids)).delete(synchronize_session=False)

    db.query(DailyBehaviorLog).filter(
        DailyBehaviorLog.user_id == user_id,
        DailyBehaviorLog.logged_at.between(start, end),
    ).delete(synchronize_session=False)
    db.query(SkinLog).filter(
        SkinLog.user_id == user_id,
        SkinLog.logged_at.between(start, end),
    ).delete(synchronize_session=False)
    db.query(UserLocation).filter(UserLocation.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(UserCosmetic).filter(UserCosmetic.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(PeriodLog).filter(PeriodLog.user_id == user_id).delete(
        synchronize_session=False
    )
    db.flush()


def _upsert_user(db, manifest: dict[str, Any], password: str) -> User:
    data = manifest["user"]
    user = db.query(User).filter(User.email == data["email"]).first()
    if user is None:
        user = User(email=data["email"], name=data["name"], hashed_password="")
        db.add(user)
        db.flush()
    user.name = data["name"]
    user.hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user.skin_type = data.get("skin_type")
    user.skin_concerns = data.get("skin_concerns")
    user.raw_concern_text = data.get("raw_concern_text")
    user.birth_year = data.get("birth_year")
    user.gender = data.get("gender")
    user.avg_cycle_length = data.get("avg_cycle_length")
    user.cycle_regularity = data.get("cycle_regularity")
    user.is_onboarded = bool(data.get("is_onboarded"))
    user.is_admin = False
    user.status = "active"
    user.session_version = 1
    user.terms_agreed_at = user.terms_agreed_at or datetime.utcnow()
    return user


def _seed_mysql(
    db,
    manifest: dict[str, Any],
    foods: dict[str, FoodItem],
    cosmetics: dict[str, CosmeticProduct],
    asset_urls: dict[str, str | None],
    password: str,
) -> tuple[User, list[dict[str, Any]]]:
    from sqlalchemy import text

    start = date.fromisoformat(manifest["analysis"]["start_date"])
    end = date.fromisoformat(manifest["analysis"]["end_date"])
    user = _upsert_user(db, manifest, password)
    db.flush()

    # created_at을 시나리오 시작일 하루 전으로 설정.
    # RecordScreen이 user.created_at을 DateNavigator의 minDate로 사용하므로
    # 이 값이 오늘이면 과거 기록 날짜로 이동이 차단된다.
    account_created = datetime.combine(start.replace(day=1), datetime.min.time())
    db.execute(
        text("UPDATE users SET created_at = :dt WHERE id = :id"),
        {"dt": account_created, "id": user.id},
    )

    _clear_demo_rows(db, user.id, start, end)

    for item in manifest.get("locations") or []:
        db.add(UserLocation(user_id=user.id, **item))
    for item in manifest.get("period_logs") or []:
        db.add(PeriodLog(user_id=user.id, started_at=date.fromisoformat(item["started_at"])))
    for item in manifest.get("cosmetics") or []:
        db.add(
            UserCosmetic(
                user_id=user.id,
                product_id=cosmetics[item["catalog_reference"]].id,
                is_current=item.get("is_current"),
                started_at=date.fromisoformat(item["started_at"]) if item.get("started_at") else None,
                ended_at=date.fromisoformat(item["ended_at"]) if item.get("ended_at") else None,
            )
        )

    mongo_docs: list[dict[str, Any]] = []
    for record in manifest["daily_records"]:
        logged_on = date.fromisoformat(record["date"])
        skin_data = record["skin_log"]
        skin = SkinLog(
            user_id=user.id,
            logged_at=logged_on,
            photo_url=asset_urls.get(record["skin_image"]["local_path"]),
            condition_tags=skin_data.get("condition_tags"),
            overall_score=skin_data.get("overall_score"),
            note=skin_data.get("note"),
            quality_check_passed=skin_data.get("quality_check_passed"),
        )
        db.add(skin)
        db.flush()
        medgemma = record["medgemma"]
        mongo_docs.append(
            {
                "skin_log_id": skin.id,
                "user_id": user.id,
                "date": record["date"],
                "signals": medgemma["signals"],
                "source": medgemma.get("source", manifest.get("source")),
                "model_version": medgemma.get("model_version"),
                "created_at": datetime.now(timezone.utc),
                "raw_analysis": {},
                "scenario_id": manifest["scenario_id"],
            }
        )

        behavior = record.get("behavior_log") or {}
        db.add(
            DailyBehaviorLog(
                user_id=user.id,
                logged_at=logged_on,
                sleep_hours=behavior.get("sleep_hours"),
                stress_level=behavior.get("stress_level"),
            )
        )

        meals_by_key: dict[str, DietLog] = {}
        for meal in record.get("diet_logs") or []:
            logged_at = datetime.fromisoformat(meal["logged_at"]).replace(tzinfo=None)
            diet = DietLog(
                user_id=user.id,
                logged_at=logged_at,
                meal_type=meal.get("meal_type"),
                input_method=meal.get("input_method"),
                photo_url=asset_urls.get(meal.get("photo_asset_path")),
                captured_lat=meal.get("captured_lat"),
                captured_lng=meal.get("captured_lng"),
                captured_location_name=meal.get("captured_location_name"),
                note=meal.get("note"),
            )
            db.add(diet)
            db.flush()
            meals_by_key[meal["meal_key"]] = diet
            for item in meal.get("items") or []:
                db.add(
                    DietLogItem(
                        diet_log_id=diet.id,
                        food_item_id=foods[item["api_food_code"]].id,
                        amount=item.get("amount"),
                        unit=item.get("unit"),
                    )
                )

        environment = record.get("environment_log") or {}
        linked = meals_by_key.get(environment.get("linked_meal_key"))
        db.add(
            EnvironmentLog(
                user_id=user.id,
                diet_log_id=linked.id if linked else None,
                logged_at=date.fromisoformat(environment["logged_at"]),
                captured_at=datetime.fromisoformat(environment["captured_at"]).replace(tzinfo=None),
                lat=environment.get("lat"),
                lng=environment.get("lng"),
                location_name=environment.get("location_name"),
                temperature=environment.get("temperature"),
                humidity=environment.get("humidity"),
                pm10=environment.get("pm10"),
                pm25=environment.get("pm25"),
                uv_index=environment.get("uv_index"),
                weather=environment.get("weather"),
                source=environment.get("source"),
            )
        )

    return user, mongo_docs


async def _replace_mongo_docs(user_id: int, source: str, docs: list[dict[str, Any]]) -> None:
    collection = get_mongo_db()["skin_ai_results"]
    await collection.delete_many({"user_id": user_id, "source": source})
    if docs:
        await collection.insert_many(docs)


def _preflight(
    manifest: dict[str, Any],
    skip_mongo: bool,
    skip_blob_upload: bool,
) -> tuple[dict[str, Any], dict[str, FoodItem], dict[str, CosmeticProduct]]:
    summary = validate_manifest(manifest)
    db = SessionLocal()
    try:
        foods, cosmetics = _resolve_master_rows(db, manifest)
    finally:
        db.close()
    summary["cosmetics"] = len(cosmetics)
    summary["mongo"] = "skipped" if skip_mongo else "pending"
    summary["blob"] = _preflight_blob(skip_blob_upload)
    return summary, foods, cosmetics


async def _async_apply(skip_mongo: bool, user_id: int, source: str, docs: list[dict[str, Any]]) -> None:
    """ping + replace + changepoint를 단일 이벤트 루프에서 실행 (motor 클라이언트 재사용)."""
    if not skip_mongo:
        await _ping_mongo()
        await _replace_mongo_docs(user_id, source, docs)

    from app.services.changepoint_service import run_changepoint_detection_for_user
    db = SessionLocal()
    try:
        await run_changepoint_detection_for_user(db, user_id)
    finally:
        db.close()

    # 시드 완료 후 Motor 클라이언트를 명시적으로 정리한다.
    # asyncio.run() 종료 후 이벤트 루프가 닫히지만 전역 _mongo_client는 살아있어
    # 이후 분석 요청에서 stale 루프에 바인딩된 클라이언트가 재사용되는 문제를 방지한다.
    await disconnect_mongo()


def run(args: argparse.Namespace) -> dict[str, Any]:
    manifest = _load_manifest(args.manifest.resolve())
    summary, _, _ = _preflight(manifest, args.skip_mongo, args.skip_blob_upload)
    if not args.apply:
        if not args.skip_mongo:
            asyncio.run(_ping_mongo())
            summary["mongo"] = "reachable"
        return {"mode": "dry-run", "valid": True, **summary}

    asset_urls = _prepare_asset_urls(manifest, args.skip_blob_upload)
    db = SessionLocal()
    try:
        foods, cosmetics = _resolve_master_rows(db, manifest)
        user, mongo_docs = _seed_mysql(
            db, manifest, foods, cosmetics, asset_urls, args.password
        )
        db.commit()
        user_id = user.id
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    # ping + replace를 하나의 asyncio.run()에서 처리 — motor 클라이언트를 동일 루프에서 사용
    asyncio.run(
        _async_apply(
            args.skip_mongo,
            user_id,
            manifest.get("source", "synthetic_demo_seed"),
            mongo_docs,
        )
    )
    return {
        "mode": "apply",
        "valid": True,
        "user_id": user_id,
        "email": manifest["user"]["email"],
        "password": args.password,
        "mysql_days": len(manifest["daily_records"]),
        "mongo_docs": 0 if args.skip_mongo else len(mongo_docs),
        "blob_upload": "skipped" if args.skip_blob_upload else "complete",
    }


def main() -> int:
    args = _parse_args()
    try:
        result = run(args)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps({"ok": True, **result}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

import argparse
import csv
import hashlib
import json
import logging
import os
import random
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

# To allow importing from app.
BACKEND_DIR = Path(__file__).resolve().parents[3]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.image_quality_service import validate_skin_photo
from PIL import Image


def get_image_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()


def get_json_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        h.update(f.read())
    return h.hexdigest()


def extract_base_key(basename: str) -> str | None:
    # Pattern: ^(H\d+_\d+)_P\d+_L\d+$
    match = re.match(r"^(H\d+_\d+)_P\d+_L\d+", basename)
    if match:
        return match.group(1)
    return None


def get_all_training_base_keys(dataset_root: Path) -> set[str]:
    training_keys = set()
    for root, dirs, files in os.walk(dataset_root):
        if "Training" not in root:
            continue
        for f in files:
            if f.endswith(".png"):
                base_key = extract_base_key(f)
                if base_key:
                    training_keys.add(base_key)
    return training_keys


def setup_logger(dry_run: bool) -> logging.Logger:
    logger = logging.getLogger("prepare_pilot")
    logger.setLevel(logging.INFO)
    ch = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter("[%(levelname)s] %(message)s")
    ch.setFormatter(formatter)
    if not logger.handlers:
        logger.addHandler(ch)
    if dry_run:
        logger.info("DRY-RUN MODE: No files will be created or copied.")
    return logger


def verify_pilot_output(
    output_root: Path,
    samples: list[dict],
    *,
    target_diagnoses: list[str],
    samples_per_diagnosis: int,
    training_base_keys: set[str],
    allow_gateway_unknown: bool = False,
) -> dict:
    errors = []
    sample_ids = [sample["sample_id"] for sample in samples]
    image_hashes = [sample["image_sha256"] for sample in samples]
    expected_total = len(target_diagnoses) * samples_per_diagnosis
    counts = {diagnosis: 0 for diagnosis in target_diagnoses}

    if len(samples) != expected_total:
        errors.append(f"manifest count mismatch: {len(samples)} != {expected_total}")
    if len(sample_ids) != len(set(sample_ids)):
        errors.append("duplicate sample_id in manifest")
    if len(image_hashes) != len(set(image_hashes)):
        errors.append("duplicate image SHA-256 in manifest")

    for sample in samples:
        diagnosis = sample.get("diagnosis")
        if diagnosis in counts:
            counts[diagnosis] += 1
        else:
            errors.append(f"unexpected diagnosis: {diagnosis}")
        if sample.get("view") != "front":
            errors.append(f"non-front sample: {sample.get('sample_id')}")
        if sample.get("gateway_status") != "pass" and not (
            allow_gateway_unknown and sample.get("gateway_status") == "unknown"
        ):
            errors.append(f"non-pass gateway sample: {sample.get('sample_id')}")
        if sample.get("base_key") in training_base_keys:
            errors.append(f"training leakage: {sample.get('sample_id')}")

        image_path = output_root / sample["copied_image_path"]
        label_path = output_root / sample["copied_label_path"]
        if not image_path.is_file():
            errors.append(f"missing image: {image_path}")
        elif get_image_sha256(image_path) != sample["image_sha256"]:
            errors.append(f"image hash mismatch: {sample.get('sample_id')}")
        if not label_path.is_file():
            errors.append(f"missing label: {label_path}")
        elif get_json_sha256(label_path) != sample["label_sha256"]:
            errors.append(f"label hash mismatch: {sample.get('sample_id')}")

    for diagnosis, count in counts.items():
        if count != samples_per_diagnosis:
            errors.append(
                f"diagnosis count mismatch: {diagnosis}={count}, expected={samples_per_diagnosis}"
            )

    protocol_path = output_root / "protocol" / "PROTOCOL.md"
    if not protocol_path.is_file():
        errors.append("missing protocol/PROTOCOL.md")

    return {
        "passed": not errors,
        "errors": errors,
        "expected_total": expected_total,
        "manifest_count": len(samples),
        "image_count": sum(1 for _ in (output_root / "images").rglob("*.png")),
        "label_count": sum(1 for _ in (output_root / "labels").rglob("*.json")),
        "counts_by_diagnosis": counts,
        "all_front": all(sample.get("view") == "front" for sample in samples),
        "unique_image_sha256_count": len(set(image_hashes)),
        "training_overlap_count": sum(
            sample.get("base_key") in training_base_keys for sample in samples
        ),
        "gateway_unknown_count": sum(
            sample.get("gateway_status") == "unknown" for sample in samples
        ),
        "protocol_size_bytes": protocol_path.stat().st_size if protocol_path.is_file() else 0,
    }


def main():
    parser = argparse.ArgumentParser(description="Prepare synthetic pilot dataset for MedGemma")
    parser.add_argument("--dataset-root", required=True, type=str, help="Root folder of synthetic dataset")
    parser.add_argument("--output-root", required=True, type=str, help="Pilot output root folder")
    parser.add_argument("--split", default="Validation", type=str, help="Split to extract from")
    parser.add_argument("--samples-per-diagnosis", default=60, type=int, help="Number of samples per diagnosis")
    parser.add_argument("--seed", default=42, type=int, help="Random seed for deterministic sampling")
    parser.add_argument("--dry-run", action="store_true", help="Do not write files")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing pilot folder")
    parser.add_argument("--allow-gateway-unknown", action="store_true", help="Allow unknown gateway status (dev only)")

    args = parser.parse_args()
    logger = setup_logger(args.dry_run)

    random.seed(args.seed)

    dataset_root = Path(args.dataset_root).resolve()
    output_root = Path(args.output_root).resolve()

    if not dataset_root.exists() or not dataset_root.is_dir():
        logger.error(f"Dataset root does not exist or is not a directory: {dataset_root}")
        sys.exit(1)

    # Protect against bad output paths
    try:
        dataset_root_str = str(dataset_root)
        output_root_str = str(output_root)
        if output_root_str.startswith(dataset_root_str) or dataset_root_str.startswith(output_root_str):
            logger.error("Output root cannot be inside or the same as dataset root to prevent corruption.")
            sys.exit(1)
    except Exception:
        pass

    if output_root.exists() and not args.dry_run:
        if args.overwrite:
            logger.warning(f"Overwriting existing output directory: {output_root}")
            shutil.rmtree(output_root)
        else:
            logger.error(f"Output directory already exists: {output_root}")
            logger.error("Use --overwrite to force replace.")
            sys.exit(1)

    fail_closed = os.getenv("IMAGE_QUALITY_FAIL_CLOSED", "true").lower() in {
        "1", "true", "yes", "on"
    }

    logger.info("Scanning for Training base keys for leakage prevention...")
    training_base_keys = get_all_training_base_keys(dataset_root)
    logger.info(f"Found {len(training_base_keys)} unique base keys in Training split.")

    target_diagnoses = ["건선", "아토피", "여드름", "정상", "주사", "지루"]

    candidates = {d: [] for d in target_diagnoses}
    exclusions = []

    logger.info(f"Scanning Validation folders in {dataset_root}...")
    for root, dirs, files in os.walk(dataset_root):
        if args.split not in root:
            continue

        # Only process "정면" folders for the 6 target diagnoses
        folder_name = Path(root).name
        matched_diagnosis = None
        for d in target_diagnoses:
            if folder_name == f"VS_{d}_정면":
                matched_diagnosis = d
                break

        if not matched_diagnosis:
            continue

        png_files = [f for f in files if f.endswith(".png")]
        for png in png_files:
            basename = png[:-4]
            png_path = Path(root) / png

            # Reconstruct json path for NIA dataset structure
            # e.g. Validation/01.원천데이터/VS_건선_정면 -> Validation/02.라벨링데이터/VS_건선_정면
            rel_path = png_path.relative_to(dataset_root)
            parts = list(rel_path.parts)
            # Replace '01.원천데이터' with '02.라벨링데이터'
            for i, p in enumerate(parts):
                if "01.원천데이터" in p:
                    parts[i] = p.replace("01.원천데이터", "02.라벨링데이터")
                if p.startswith("VS_"):
                    parts[i] = p.replace("VS_", "VL_", 1)
                elif p.startswith("TS_"):
                    parts[i] = p.replace("TS_", "TL_", 1)

            json_path = dataset_root.joinpath(*parts).with_name(f"{basename}.json")

            if not json_path.exists():
                exclusions.append({
                    "basename": basename,
                    "reason": "Missing JSON",
                    "path": str(png_path)
                })
                continue

            try:
                with json_path.open("r", encoding="utf-8") as jf:
                    data = json.load(jf)
            except Exception as e:
                exclusions.append({
                    "basename": basename,
                    "reason": f"Invalid JSON: {e}",
                    "path": str(json_path)
                })
                continue

            annotations = data.get("annotations", [])
            if not annotations:
                exclusions.append({
                    "basename": basename,
                    "reason": "Empty annotations",
                    "path": str(json_path)
                })
                continue

            diag_info = annotations[0].get("diagnosis_info", {})
            diag_name = diag_info.get("diagnosis_name")

            if diag_name != matched_diagnosis:
                exclusions.append({
                    "basename": basename,
                    "reason": f"Diagnosis mismatch: folder={matched_diagnosis}, json={diag_name}",
                    "path": str(json_path)
                })
                continue

            base_key = extract_base_key(basename)
            if base_key and base_key in training_base_keys:
                exclusions.append({
                    "basename": basename,
                    "base_key": base_key,
                    "reason": "Validation/Training split leakage",
                    "path": str(png_path)
                })
                continue

            candidates[matched_diagnosis].append({
                "basename": basename,
                "base_key": base_key,
                "png_path": png_path,
                "json_path": json_path,
                "json_data": data,
                "diag_info": diag_info
            })

    total_candidates = sum(len(c) for c in candidates.values())
    logger.info(f"Found {total_candidates} valid pair candidates in {args.split}.")

    final_samples = []
    seen_shas = set()
    summary = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_root": str(dataset_root),
        "output_root": str(output_root),
        "sampling_seed": args.seed,
        "candidates_by_diagnosis": {d: len(c) for d, c in candidates.items()},
        "selected_by_diagnosis": {d: 0 for d in target_diagnoses},
        "selected_by_resolution": {},
        "demographics": {"gender": {}, "age_range": {}},
        "gateway_stats": {"fail": 0, "unknown": 0},
        "exclusions_count": len(exclusions),
        "sha_duplicates_avoided": 0,
        "side_samples_count": 0,
        "dimension_mismatches": 0,
        "total_samples": 0
    }

    # Sampling per diagnosis
    for d in target_diagnoses:
        cands = candidates[d]
        # Sort for determinism
        cands.sort(key=lambda x: x["basename"])

        # Organize by resolution
        res_groups = {512: [], 1024: [], "other": []}
        for c in cands:
            w, h = 0, 0

            # Read from JSON
            json_w, json_h = 0, 0
            annotations = c["json_data"].get("annotations", [])
            if annotations:
                photograph = annotations[0].get("photograph", {})
                if isinstance(photograph, dict):
                    json_w = photograph.get("width", 0)
                    json_h = photograph.get("height", 0)

            # Read actual size
            try:
                with Image.open(c["png_path"]) as img:
                    w, h = img.size
            except Exception:
                w, h = json_w, json_h

            c["width"] = w
            c["height"] = h
            c["json_w"] = json_w
            c["json_h"] = json_h

            if w == 512 and h == 512:
                res_groups[512].append(c)
            elif w == 1024 and h == 1024:
                res_groups[1024].append(c)
            else:
                res_groups["other"].append(c)

        # Shuffle deterministically within groups
        random.shuffle(res_groups[512])
        random.shuffle(res_groups[1024])
        random.shuffle(res_groups["other"])

        # Try to select 30 from 512, 30 from 1024, fallback to remaining
        selected_for_d = []

        def pick_candidates(group, count_needed):
            picked = []
            while group and len(picked) < count_needed:
                c = group.pop(0)
                # Check SHA256 duplicate
                png_bytes = c["png_path"].read_bytes()
                h = hashlib.sha256(png_bytes).hexdigest()
                if h in seen_shas:
                    summary["sha_duplicates_avoided"] += 1
                    exclusions.append({
                        "basename": c["basename"],
                        "reason": "Duplicate SHA256",
                        "path": str(c["png_path"])
                    })
                    continue

                # Run quality gateway
                val_result = validate_skin_photo(png_bytes)
                gateway_status = getattr(val_result, "status", None)
                if gateway_status not in {"pass", "fail", "unknown"}:
                    gateway_status = "unknown" if val_result.warning else "pass"
                if gateway_status == "fail" or (
                    not val_result.is_valid and gateway_status != "unknown"
                ):
                    summary["gateway_stats"]["fail"] += 1
                    exclusions.append({
                        "basename": c["basename"],
                        "reason": f"Gateway Fail: {val_result.warning}",
                        "path": str(c["png_path"]),
                    })
                    continue
                if gateway_status == "unknown":
                    if args.allow_gateway_unknown or not fail_closed:
                        gateway_status = "unknown"
                    else:
                        summary["gateway_stats"]["unknown"] += 1
                        exclusions.append({
                            "basename": c["basename"],
                            "reason": f"Gateway Unknown (fail_closed): {val_result.warning}",
                            "path": str(c["png_path"])
                        })
                        continue

                seen_shas.add(h)

                # Image metadata
                w, h_img = c["width"], c["height"]
                if w != c["json_w"] or h_img != c["json_h"]:
                    summary["dimension_mismatches"] += 1

                annotations = c["json_data"].get("annotations", [])
                gen_params = annotations[0].get("generated_parameters", {}) if annotations else {}

                gender = gen_params.get("gender")
                gender = gender if gender is not None else "N/A"

                age = gen_params.get("age_range")
                age = age if age is not None else "N/A"

                race = gen_params.get("race")
                race = race if race is not None else "N/A"

                picked.append({
                    "sample_id": c["basename"],
                    "base_key": c["base_key"],
                    "split": args.split,
                    "view": "front",
                    "diagnosis": d,
                    "distribution": c["diag_info"].get("distribution", "N/A"),
                    "symptom": c["diag_info"].get("symptom", "N/A"),
                    "description": c["diag_info"].get("desc", ""),
                    "gender": gender,
                    "age_range": age,
                    "race": race,
                    "width": w,
                    "height": h_img,
                    "source_image_path": str(c["png_path"]),
                    "source_label_path": str(c["json_path"]),
                    "copied_image_path": f"images/{d}/{c['basename']}.png",
                    "copied_label_path": f"labels/{d}/{c['basename']}.json",
                    "image_sha256": h,
                    "label_sha256": get_json_sha256(c["json_path"]),
                    "gateway_is_valid": val_result.is_valid,
                    "gateway_status": gateway_status,
                    "gateway_reason_code": getattr(val_result, "reason_code", None),
                    "gateway_warning": val_result.warning,
                    "sampling_seed": args.seed
                })
            return picked

        # Balance targets: 30 from 512, 30 from 1024
        picked_512 = pick_candidates(res_groups[512], args.samples_per_diagnosis // 2)
        picked_1024 = pick_candidates(res_groups[1024], args.samples_per_diagnosis // 2)

        selected_for_d.extend(picked_512)
        selected_for_d.extend(picked_1024)

        # Fill remaining if either bucket was short
        remaining_needed = args.samples_per_diagnosis - len(selected_for_d)
        if remaining_needed > 0:
            selected_for_d.extend(pick_candidates(res_groups[512], remaining_needed))
        remaining_needed = args.samples_per_diagnosis - len(selected_for_d)
        if remaining_needed > 0:
            selected_for_d.extend(pick_candidates(res_groups[1024], remaining_needed))
        remaining_needed = args.samples_per_diagnosis - len(selected_for_d)
        if remaining_needed > 0:
            selected_for_d.extend(pick_candidates(res_groups["other"], remaining_needed))

        if len(selected_for_d) < args.samples_per_diagnosis:
            logger.error(f"Could not find enough samples for diagnosis {d}. Found {len(selected_for_d)}, needed {args.samples_per_diagnosis}.")
            if exclusions:
                logger.info("Sample exclusions:")
                for e in exclusions[:10]:
                    print(f"  - {e['basename']}: {e['reason']} (Path: {e.get('path')})")
            sys.exit(1)

        final_samples.extend(selected_for_d)
        summary["selected_by_diagnosis"][d] = len(selected_for_d)

    summary["total_samples"] = len(final_samples)

    # Collect demographics and resolutions
    for s in final_samples:
        g = s["gender"]
        a = s["age_range"]
        res = f"{s['width']}x{s['height']}"

        summary["demographics"]["gender"][g] = summary["demographics"]["gender"].get(g, 0) + 1
        summary["demographics"]["age_range"][a] = summary["demographics"]["age_range"].get(a, 0) + 1

        if res not in summary["selected_by_resolution"]:
            summary["selected_by_resolution"][res] = {}
        summary["selected_by_resolution"][res][s["diagnosis"]] = summary["selected_by_resolution"][res].get(s["diagnosis"], 0) + 1

    if args.dry_run:
        logger.info(f"DRY-RUN completed. Final samples: {len(final_samples)}")
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        if exclusions:
            logger.info("Sample exclusions:")
            for e in exclusions[:10]:
                print(f"  - {e['basename']}: {e['reason']} (Path: {e.get('path')})")
        sys.exit(0)

    logger.info(f"Creating output directory structure at {output_root}...")
    output_root.mkdir(parents=True, exist_ok=True)
    images_dir = output_root / "images"
    labels_dir = output_root / "labels"
    manifests_dir = output_root / "manifests"
    results_dir = output_root / "results"
    protocol_dir = output_root / "protocol"

    for d in target_diagnoses:
        (images_dir / d).mkdir(parents=True, exist_ok=True)
        (labels_dir / d).mkdir(parents=True, exist_ok=True)
    manifests_dir.mkdir(parents=True, exist_ok=True)
    results_dir.mkdir(parents=True, exist_ok=True)
    protocol_dir.mkdir(parents=True, exist_ok=True)

    logger.info("Copying samples...")
    for s in final_samples:
        src_img = Path(s["source_image_path"])
        src_lbl = Path(s["source_label_path"])
        dst_img = output_root / s["copied_image_path"]
        dst_lbl = output_root / s["copied_label_path"]

        shutil.copy2(src_img, dst_img)
        shutil.copy2(src_lbl, dst_lbl)

    logger.info("Writing manifests...")
    with (manifests_dir / "samples.jsonl").open("w", encoding="utf-8") as f:
        for s in final_samples:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")

    if final_samples:
        keys = list(final_samples[0].keys())
        with (manifests_dir / "samples.csv").open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            for s in final_samples:
                writer.writerow(s)

    with (manifests_dir / "exclusions.jsonl").open("w", encoding="utf-8") as f:
        for e in exclusions:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")

    with (manifests_dir / "summary.json").open("w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    with (protocol_dir / "PROTOCOL.md").open("w", encoding="utf-8") as f:
        f.write(
            "# MedGemma Synthetic Pilot Protocol\n\n"
            "Generated by `prepare_synthetic_pilot.py`.\n\n"
            "- Weak labels are used only for consistency checks, not clinical truth.\n"
            "- Verification output is written to `manifests/verification.json`.\n"
            "- MedGemma output must not be treated as diagnosis or root-cause proof.\n"
        )

    # README
    with (output_root / "README.md").open("w", encoding="utf-8") as f:
        f.write("# MedGemma Pilot Front 360 Dataset\n\nGenerated by `prepare_synthetic_pilot.py`.\n")

    verification = verify_pilot_output(
        output_root,
        final_samples,
        target_diagnoses=target_diagnoses,
        samples_per_diagnosis=args.samples_per_diagnosis,
        training_base_keys=training_base_keys,
        allow_gateway_unknown=args.allow_gateway_unknown,
    )
    with (manifests_dir / "verification.json").open("w", encoding="utf-8") as f:
        json.dump(verification, f, ensure_ascii=False, indent=2)
    if not verification["passed"]:
        raise RuntimeError(
            "Pilot output verification failed: " + "; ".join(verification["errors"][:10])
        )

    logger.info(f"Done. Successfully generated {len(final_samples)} samples in {output_root}.")


if __name__ == "__main__":
    main()

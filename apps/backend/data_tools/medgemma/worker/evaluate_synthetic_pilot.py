import argparse
import json
import logging
import sys
from pathlib import Path

try:
    import numpy as np
    from scipy.stats import mannwhitneyu
    from sklearn.metrics import roc_auc_score
    HAS_SCIPY_SKLEARN = True
except ImportError:
    HAS_SCIPY_SKLEARN = False

logger = logging.getLogger("eval_pilot")
logger.setLevel(logging.INFO)
ch = logging.StreamHandler(sys.stdout)
ch.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
logger.addHandler(ch)

ORDINAL_MAP = {
    "none": 0,
    "mild": 1,
    "moderate": 2,
    "severe": 3
}
ORDINAL_REV_MAP = {v: k for k, v in ORDINAL_MAP.items()}
SIGNAL_KEYS = ("active_lesion", "redness", "barrier")


def load_unique_jsonl(path: Path, kind: str) -> dict[str, dict]:
    rows = {}
    with path.open("r", encoding="utf-8") as f:
        for line_number, line in enumerate(f, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            sample_id = row.get("sample_id")
            if not isinstance(sample_id, str) or not sample_id:
                raise ValueError(f"{kind} line {line_number} has no valid sample_id")
            if sample_id in rows:
                raise ValueError(f"duplicate {kind} sample_id: {sample_id}")
            rows[sample_id] = row
    return rows


def validate_prediction_contract(prediction: object) -> list[str]:
    if not isinstance(prediction, dict):
        return ["prediction must be an object"]
    errors = []
    if set(prediction) != set(SIGNAL_KEYS):
        errors.append("prediction must contain exactly the three signal keys")
    for key in SIGNAL_KEYS:
        if prediction.get(key) not in ORDINAL_MAP:
            errors.append(f"invalid ordinal value: {key}")
    return errors

def calculate_cliffs_delta(g1, g2):
    # g1: positive group, g2: negative group
    # d = (sum(x > y) - sum(x < y)) / (len(g1)*len(g2))
    if not g1 or not g2:
        return 0.0
    n1, n2 = len(g1), len(g2)
    more = sum(1 for x in g1 for y in g2 if x > y)
    less = sum(1 for x in g1 for y in g2 if x < y)
    return (more - less) / (n1 * n2)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=str)
    parser.add_argument("--predictions", required=True, type=str)
    parser.add_argument("--robustness-json", type=str, help="Path to robustness_results.jsonl")
    parser.add_argument("--output-dir", required=True, type=str)
    parser.add_argument("--pilot-csv", type=str, help="Output path for pilot results CSV")
    parser.add_argument("--robustness-csv", type=str, help="Output path for robustness results CSV")
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    preds_path = Path(args.predictions)
    output_dir = Path(args.output_dir)

    if not manifest_path.exists() or not preds_path.exists():
        logger.error("Manifest or predictions file not found.")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        samples = load_unique_jsonl(manifest_path, "manifest")
        preds = load_unique_jsonl(preds_path, "prediction")
    except (ValueError, json.JSONDecodeError) as exc:
        logger.error(str(exc))
        sys.exit(2)

    extra_prediction_ids = sorted(set(preds) - set(samples))
    if extra_prediction_ids:
        logger.error("Predictions contain IDs absent from manifest: %s", extra_prediction_ids[:10])
        sys.exit(2)

    # 1. Execution & Contract Quality
    total_samples = len(samples)
    missing_prediction_ids = sorted(set(samples) - set(preds))
    contract_errors = {}
    for sid, pred in preds.items():
        if pred.get("success"):
            errors = validate_prediction_contract(pred.get("prediction"))
            if errors:
                contract_errors[sid] = errors
    success_ids = {
        sid for sid, pred in preds.items()
        if pred.get("success") and sid not in contract_errors
    }
    success_count = len(success_ids)
    raw_json_count = sum(bool(preds[sid].get("raw_json_only")) for sid in success_ids)

    strict_success_rate_all_samples = success_count / total_samples if total_samples else 0
    raw_json_only_rate_all_samples = raw_json_count / total_samples if total_samples else 0
    raw_json_only_rate_successes = raw_json_count / success_count if success_count else 0

    # 2. Overall Output Distribution
    signal_counts = {
        "active_lesion": {k: 0 for k in ORDINAL_MAP},
        "redness": {k: 0 for k in ORDINAL_MAP},
        "barrier": {k: 0 for k in ORDINAL_MAP}
    }

    # 4. Weak label arrays
    wl_groups = {
        "active_lesion": {"pos": [], "neg_normal": [], "neg_other": []},
        "redness": {"pos": [], "neg_normal": [], "neg_other": []},
        "barrier": {"pos": [], "neg_normal": [], "neg_other": []}
    }

    # 5. Resolution bias
    res_512 = {"active_lesion": [], "redness": [], "barrier": []}
    res_1024 = {"active_lesion": [], "redness": [], "barrier": []}

    failures = []

    for sid in samples:
        p = preds.get(sid)
        if p is None:
            failures.append({"sample_id": sid, "error": "missing prediction"})
            continue
        if sid in contract_errors:
            failures.append({**p, "contract_errors": contract_errors[sid]})
            continue
        if sid not in success_ids:
            failures.append(p)
            continue

        s = samples[sid]

        diag = s["diagnosis"]
        res = max(s["width"], s["height"])

        pred_dict = p["prediction"]
        al = pred_dict["active_lesion"]
        rd = pred_dict["redness"]
        br = pred_dict["barrier"]

        al_val = ORDINAL_MAP[al]
        rd_val = ORDINAL_MAP[rd]
        br_val = ORDINAL_MAP[br]

        if al in signal_counts["active_lesion"]: signal_counts["active_lesion"][al] += 1
        if rd in signal_counts["redness"]: signal_counts["redness"][rd] += 1
        if br in signal_counts["barrier"]: signal_counts["barrier"][br] += 1

        if diag == "정상":
            wl_groups["active_lesion"]["neg_normal"].append(al_val)
            wl_groups["redness"]["neg_normal"].append(rd_val)
            wl_groups["barrier"]["neg_normal"].append(br_val)
        else:
            if diag == "여드름":
                wl_groups["active_lesion"]["pos"].append(al_val)
                wl_groups["redness"]["neg_other"].append(rd_val)
                wl_groups["barrier"]["neg_other"].append(br_val)
            elif diag == "주사":
                wl_groups["redness"]["pos"].append(rd_val)
                wl_groups["active_lesion"]["neg_other"].append(al_val)
                wl_groups["barrier"]["neg_other"].append(br_val)
            elif diag in ["건선", "아토피", "지루"]:
                wl_groups["barrier"]["pos"].append(br_val)
                wl_groups["active_lesion"]["neg_other"].append(al_val)
                wl_groups["redness"]["neg_other"].append(rd_val)

        if res <= 512:
            res_512["active_lesion"].append(al_val)
            res_512["redness"].append(rd_val)
            res_512["barrier"].append(br_val)
        elif res >= 1024:
            res_1024["active_lesion"].append(al_val)
            res_1024["redness"].append(rd_val)
            res_1024["barrier"].append(br_val)

    # Calculate metrics
    # Resolution Grade Entropy
    import math
    grade_distribution = {}
    for sig in SIGNAL_KEYS:
        total = sum(signal_counts[sig].values())
        if total == 0: continue
        entropy = -sum((count/total) * math.log2(count/total) for count in signal_counts[sig].values() if count > 0)
        dominant_grade = max(signal_counts[sig].items(), key=lambda x: x[1])
        dominant_rate = dominant_grade[1] / total
        used_grades = [k for k, v in signal_counts[sig].items() if v > 0]
        unused_grades = [k for k, v in signal_counts[sig].items() if v == 0]
        warnings = []
        if dominant_rate >= 0.8:
            warnings.append(f"Dominant grade '{dominant_grade[0]}' accounts for {dominant_rate:.1%} (>80%).")
        if unused_grades:
            warnings.append(f"Unused grades: {', '.join(unused_grades)}")

        grade_distribution[sig] = {
            "counts": signal_counts[sig],
            "entropy": float(entropy),
            "dominant_grade": dominant_grade[0],
            "dominant_rate": float(dominant_rate),
            "unused_grades": unused_grades,
            "warnings": warnings
        }

    metrics = {
        "execution": {
            "total_samples": total_samples,
            "success_count": success_count,
            "strict_success_rate_all_samples": strict_success_rate_all_samples,
            "raw_json_only_rate_all_samples": raw_json_only_rate_all_samples,
            "raw_json_only_rate_successes": raw_json_only_rate_successes,
            "missing_predictions": len(missing_prediction_ids),
            "missing_prediction_ids": missing_prediction_ids,
            "contract_error_count": len(contract_errors),
        },
        "overall_distribution": signal_counts,
        "grade_distribution": grade_distribution,
        "weak_label_comparisons": {},
        "resolution_bias": {}
    }

    if HAS_SCIPY_SKLEARN:
        def calc_group_stats(pos, neg, name):
            if not pos or not neg: return None
            try:
                y_true = [1]*len(pos) + [0]*len(neg)
                y_score = pos + neg
                auc = roc_auc_score(y_true, y_score)
                u_stat, p_val = mannwhitneyu(pos, neg, alternative='greater')
                cd = calculate_cliffs_delta(pos, neg)
                return {
                    "signal": name,
                    "pos_n": len(pos), "neg_n": len(neg),
                    "pos_mean": float(np.mean(pos)), "neg_mean": float(np.mean(neg)),
                    "pos_median": float(np.median(pos)), "neg_median": float(np.median(neg)),
                    "roc_auc": float(auc),
                    "mann_whitney_u": float(u_stat),
                    "p_value": float(p_val),
                    "cliffs_delta": float(cd)
                }
            except Exception as e:
                logger.warning(f"Failed to calculate stats for {name}: {e}")
                return None

        metrics["weak_label_comparisons"]["active_lesion_vs_normal"] = calc_group_stats(wl_groups["active_lesion"]["pos"], wl_groups["active_lesion"]["neg_normal"], "active_lesion_vs_normal")
        metrics["weak_label_comparisons"]["active_lesion_vs_other_diseases"] = calc_group_stats(wl_groups["active_lesion"]["pos"], wl_groups["active_lesion"]["neg_other"], "active_lesion_vs_other_diseases")
        metrics["weak_label_comparisons"]["redness_vs_normal"] = calc_group_stats(wl_groups["redness"]["pos"], wl_groups["redness"]["neg_normal"], "redness_vs_normal")
        metrics["weak_label_comparisons"]["redness_vs_other_diseases"] = calc_group_stats(wl_groups["redness"]["pos"], wl_groups["redness"]["neg_other"], "redness_vs_other_diseases")
        metrics["weak_label_comparisons"]["barrier_vs_normal"] = calc_group_stats(wl_groups["barrier"]["pos"], wl_groups["barrier"]["neg_normal"], "barrier_vs_normal")
        metrics["weak_label_comparisons"]["barrier_vs_disease_controls"] = calc_group_stats(wl_groups["barrier"]["pos"], wl_groups["barrier"]["neg_other"], "barrier_vs_disease_controls")

        for sig in ["active_lesion", "redness", "barrier"]:
            r5 = res_512[sig]
            r10 = res_1024[sig]
            if r5 and r10:
                metrics["resolution_bias"][sig] = {
                    "mean_512": float(np.mean(r5)),
                    "mean_1024": float(np.mean(r10)),
                    "diff": float(np.mean(r10) - np.mean(r5))
                }
    else:
        logger.warning("scipy or scikit-learn not available. Skipping advanced stats (ROC-AUC, MWU).")

    with (output_dir / "metrics.json").open("w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)

    with (output_dir / "failures.jsonl").open("w", encoding="utf-8") as f:
        for fail in failures:
            f.write(json.dumps(fail, ensure_ascii=False) + "\n")

    # Generate CSVs
    import csv

    # 1. Pilot CSV
    if args.pilot_csv:
        pilot_csv_path = Path(args.pilot_csv)
        if not pilot_csv_path.is_absolute():
            pilot_csv_path = output_dir / pilot_csv_path
        with pilot_csv_path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["sample_id", "disease", "severity_gt", "active_lesion_pred", "redness_pred", "barrier_pred"])
            for sid in success_ids:
                s = samples[sid]
                p = preds[sid]["prediction"]
                writer.writerow([
                    sid,
                    s.get("diagnosis", ""),
                    s.get("severity", ""),
                    p.get("active_lesion", ""),
                    p.get("redness", ""),
                    p.get("barrier", "")
                ])
        logger.info(f"Saved pilot CSV to {pilot_csv_path}")

    # 2. Robustness CSV and Metrics
    total_robust_attempted = 0
    total_robust_success = 0
    match_active = 0
    match_redness = 0
    match_barrier = 0

    rob_metrics = {}

    if args.robustness_json and Path(args.robustness_json).exists():
        robustness_rows = []
        with open(args.robustness_json, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip(): continue
                robustness_rows.append(json.loads(line))

        # Enforce exact counts if robustness was actually attempted
        if robustness_rows:
            if len(robustness_rows) != 540:
                logger.error(f"Expected 540 robustness results, got {len(robustness_rows)}")
                sys.exit(1)
            rob_keys = set(f"{r.get('sample_id')}::{r.get('variation')}" for r in robustness_rows)
            if len(rob_keys) != 540:
                logger.error("Duplicate robustness keys found")
                sys.exit(1)
            rob_samples = set(r.get("sample_id") for r in robustness_rows)
            if len(rob_samples) != 60:
                logger.error(f"Expected 60 robustness samples, got {len(rob_samples)}")
                sys.exit(1)

        if args.robustness_csv:
            robustness_csv_path = Path(args.robustness_csv)
            if not robustness_csv_path.is_absolute():
                robustness_csv_path = output_dir / robustness_csv_path

            with robustness_csv_path.open("w", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(["sample_id", "disease", "variation", "success", "active_lesion_pred", "redness_pred", "barrier_pred", "match_active", "match_redness", "match_barrier", "mae_active", "mae_redness", "mae_barrier"])

                for rob in robustness_rows:
                    var_name = rob.get("variation")
                    if var_name not in rob_metrics:
                        rob_metrics[var_name] = {"attempted": 0, "success": 0, "active_match": 0, "redness_match": 0, "barrier_match": 0, "active_mae": 0, "redness_mae": 0, "barrier_mae": 0, "active_pm1": 0, "redness_pm1": 0, "barrier_pm1": 0}

                    rob_metrics[var_name]["attempted"] += 1
                    total_robust_attempted += 1

                    if not rob.get("success"):
                        writer.writerow([
                            rob.get("sample_id"), rob.get("diagnosis", ""), rob.get("variation", ""),
                            "False", "", "", "", "", "", "", "", "", ""
                        ])
                        continue

                    rob_p = rob.get("prediction", {})
                    orig_p = rob.get("base_prediction", {})

                    if not orig_p:
                        sid = rob.get("sample_id")
                        if sid in preds and preds[sid].get("prediction"):
                            orig_p = preds[sid]["prediction"]

                    if not orig_p:
                        logger.error(f"Missing base prediction for {rob.get('sample_id')}")
                        sys.exit(1)

                    rob_al = rob_p.get("active_lesion")
                    rob_rd = rob_p.get("redness")
                    rob_br = rob_p.get("barrier")
                    orig_al = orig_p.get("active_lesion")
                    orig_rd = orig_p.get("redness")
                    orig_br = orig_p.get("barrier")

                    for val, name in [(rob_al, "robust active_lesion"), (rob_rd, "robust redness"), (rob_br, "robust barrier"),
                                      (orig_al, "base active_lesion"), (orig_rd, "base redness"), (orig_br, "base barrier")]:
                        if val not in ORDINAL_MAP:
                            logger.error(f"Invalid ordinal value '{val}' in {name} for sample {rob.get('sample_id')}")
                            sys.exit(1)

                    # Exact Match
                    is_match_active = 1 if rob_al == orig_al else 0
                    is_match_redness = 1 if rob_rd == orig_rd else 0
                    is_match_barrier = 1 if rob_br == orig_br else 0

                    # MAE
                    al_diff = abs(ORDINAL_MAP[rob_al] - ORDINAL_MAP[orig_al])
                    rd_diff = abs(ORDINAL_MAP[rob_rd] - ORDINAL_MAP[orig_rd])
                    br_diff = abs(ORDINAL_MAP[rob_br] - ORDINAL_MAP[orig_br])

                    match_active += is_match_active
                    match_redness += is_match_redness
                    match_barrier += is_match_barrier

                    m = rob_metrics[var_name]
                    m["success"] += 1
                    total_robust_success += 1
                    m["active_match"] += is_match_active
                    m["redness_match"] += is_match_redness
                    m["barrier_match"] += is_match_barrier
                    m["active_pm1"] += 1 if al_diff <= 1 else 0
                    m["redness_pm1"] += 1 if rd_diff <= 1 else 0
                    m["barrier_pm1"] += 1 if br_diff <= 1 else 0
                    m["active_mae"] += al_diff
                    m["redness_mae"] += rd_diff
                    m["barrier_mae"] += br_diff

                    writer.writerow([
                        rob.get("sample_id"),
                        rob.get("diagnosis", ""),
                        rob.get("variation", ""),
                        "True",
                        rob_al,
                        rob_rd,
                        rob_br,
                        is_match_active,
                        is_match_redness,
                        is_match_barrier,
                        al_diff, rd_diff, br_diff
                    ])
            logger.info(f"Saved robustness CSV to {robustness_csv_path}")

    # Generate MD summary
    with (output_dir / "summary.md").open("w", encoding="utf-8") as f:
        f.write("# Synthetic Pilot Evaluation Summary\n\n")
        f.write("> [!WARNING]\n")
        f.write("> 합성데이터 평가임. JSON에는 세 피부 신호의 실제 등급 정답이 없음.\n")
        f.write("> 질환 라벨은 weak label임. ROC-AUC 등은 임상 정확도가 아니라 그룹 분리 방향성 지표임.\n")
        f.write("> consistency가 measurement accuracy를 보장하지 않음.\n")
        f.write("> 합성데이터 성능을 실제 사용자 사진 성능으로 일반화할 수 없음.\n")
        f.write("> MedGemma 결과로 질환을 진단하지 않음.\n")
        f.write("> 식단, 수면, 환경, 화장품, 의약품, 행동 원인을 추론하지 않음.\n\n")
        f.write(f"- Total Samples: {total_samples}\n")
        f.write(f"- Success: {success_count} ({strict_success_rate_all_samples:.1%})\n")
        f.write(f"- Raw JSON Only Rate (All Samples): {raw_json_only_rate_all_samples:.1%}\n")
        f.write(f"- Raw JSON Only Rate (Successes): {raw_json_only_rate_successes:.1%}\n\n")

        f.write("## Grade Resolution Diagnostics\n")
        for sig, dist in grade_distribution.items():
            f.write(f"### {sig}\n")
            f.write(f"- Entropy: {dist['entropy']:.3f}\n")
            f.write(f"- Dominant: {dist['dominant_grade']} ({dist['dominant_rate']:.1%})\n")
            if dist['warnings']:
                f.write(f"- Warnings: {', '.join(dist['warnings'])}\n")
            f.write("\n")

        if total_robust_attempted > 0:
            f.write("## Robustness Agreement\n")
            f.write(f"- Total Attempted: {total_robust_attempted}\n")
            f.write(f"- Total Success: {total_robust_success}\n")
            if total_robust_success > 0:
                f.write(f"- Active Lesion Match Rate: {match_active/total_robust_success:.2%}\n")
                f.write(f"- Redness Match Rate: {match_redness/total_robust_success:.2%}\n")
                f.write(f"- Barrier Match Rate: {match_barrier/total_robust_success:.2%}\n\n")
            for var_name, m in rob_metrics.items():
                if m["attempted"] == 0: continue
                f.write(f"### Variation: {var_name}\n")
                f.write(f"- Success Rate: {m['success']/m['attempted']:.2%}\n")
                if m["success"] > 0:
                    f.write(f"- Active Match: {m['active_match']/m['success']:.2%} (±1: {m['active_pm1']/m['success']:.2%}, MAE: {m['active_mae']/m['success']:.2f})\n")
                    f.write(f"- Redness Match: {m['redness_match']/m['success']:.2%} (±1: {m['redness_pm1']/m['success']:.2%}, MAE: {m['redness_mae']/m['success']:.2f})\n")
                    f.write(f"- Barrier Match: {m['barrier_match']/m['success']:.2%} (±1: {m['barrier_pm1']/m['success']:.2%}, MAE: {m['barrier_mae']/m['success']:.2f})\n\n")

        f.write("## Weak Label Comparisons\n")
        for k, v in metrics["weak_label_comparisons"].items():
            if v:
                f.write(f"### {k}\n")
                f.write(f"- AUC: {v['roc_auc']:.3f}\n")
                f.write(f"- Cliff's Delta: {v['cliffs_delta']:.3f}\n")
                f.write(f"- P-value (MWU): {v['p_value']:.4e}\n\n")

    logger.info(f"Evaluation complete. Saved to {output_dir}")

if __name__ == "__main__":
    main()

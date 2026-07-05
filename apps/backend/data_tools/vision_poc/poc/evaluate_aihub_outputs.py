import json
import csv
from pathlib import Path

POC_DIR = Path(__file__).resolve().parent
MEDGEMMA_DIR = POC_DIR.parent
OUTPUT_DIR = MEDGEMMA_DIR / "outputs"
MANIFEST_PATH = POC_DIR / "aihub_skin_manifest.jsonl"
PROBE_RESULTS_PATH = OUTPUT_DIR / "probe_outputs_mock" / "probe_results.jsonl"

def evaluate_outputs():
    # Load manifest
    manifest_by_id = {}
    if MANIFEST_PATH.exists():
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip(): continue
                data = json.loads(line)
                # Map using the image filename or identifier
                identifier = data.get("identifier", "")
                manifest_by_id[identifier] = data

    # Load probe results
    if not PROBE_RESULTS_PATH.exists():
        print(f"Probe results not found at {PROBE_RESULTS_PATH}. Run the probe first.")
        return

    results = []
    with open(PROBE_RESULTS_PATH, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip(): continue
            results.append(json.loads(line))

    # Metrics
    total_images = len(results)
    parse_success = sum(1 for r in results if r.get("parsed_json"))
    
    recommendation_counts = {"use": 0, "review": 0, "reject": 0}
    confidence_counts = {"high": 0, "medium": 0, "low": 0}
    
    class_signals = {}
    
    for r in results:
        parsed = r.get("parsed_json", {})
        if not parsed: continue
        
        rec = parsed.get("recommendation_for_pipeline", "reject")
        recommendation_counts[rec] = recommendation_counts.get(rec, 0) + 1
        
        conf = parsed.get("confidence", "low")
        confidence_counts[conf] = confidence_counts.get(conf, 0) + 1
        
        # Link with manifest if possible
        filename = r.get("file", "")
        identifier = Path(filename).stem
        
        manifest_entry = manifest_by_id.get(identifier, {})
        diagnosis = manifest_entry.get("diagnosis_name", "Unknown")
        view = manifest_entry.get("view", "Unknown")
        
        if diagnosis not in class_signals:
            class_signals[diagnosis] = {
                "count": 0,
                "redness_sum": 0,
                "acne_sum": 0,
                "texture_sum": 0
            }
            
        calibrated = parsed.get("calibrated_observations", {})
        redness = calibrated.get("redness", {}).get("calibrated_score", 0)
        acne = calibrated.get("acne_like_spots", {}).get("calibrated_score", 0)
        texture = calibrated.get("texture_irregularity", {}).get("calibrated_score", 0)
        
        class_signals[diagnosis]["count"] += 1
        class_signals[diagnosis]["redness_sum"] += redness
        class_signals[diagnosis]["acne_sum"] += acne
        class_signals[diagnosis]["texture_sum"] += texture

    # Calculate averages
    for diag, data in class_signals.items():
        if data["count"] > 0:
            data["redness_avg"] = round(data["redness_sum"] / data["count"], 2)
            data["acne_avg"] = round(data["acne_sum"] / data["count"], 2)
            data["texture_avg"] = round(data["texture_sum"] / data["count"], 2)

    # Output Markdown
    md_path = MEDGEMMA_DIR / "docs" / "POC_METRICS.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("# MedGemma AI Hub PoC Metrics\n\n")
        f.write(f"- Total Images Evaluated: {total_images}\n")
        f.write(f"- JSON Parse Success Rate: {parse_success}/{total_images} ({(parse_success/total_images*100) if total_images else 0:.1f}%)\n\n")
        
        f.write("## Recommendations Distribution\n")
        for k, v in recommendation_counts.items():
            f.write(f"- {k}: {v}\n")
            
        f.write("\n## Confidence Distribution\n")
        for k, v in confidence_counts.items():
            f.write(f"- {k}: {v}\n")
            
        f.write("\n## Class-level Average Signals\n")
        f.write("| Diagnosis | Count | Redness Avg | Acne Avg | Texture Avg |\n")
        f.write("|---|---|---|---|---|\n")
        for diag, data in class_signals.items():
            f.write(f"| {diag} | {data['count']} | {data.get('redness_avg', 0)} | {data.get('acne_avg', 0)} | {data.get('texture_avg', 0)} |\n")
            
    print(f"Evaluation metrics saved to {md_path}")

if __name__ == "__main__":
    evaluate_outputs()

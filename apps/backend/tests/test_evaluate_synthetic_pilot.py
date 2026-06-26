import json
import pytest
import subprocess
from pathlib import Path

EVALUATOR_SCRIPT = Path(__file__).resolve().parents[1] / "data_tools" / "medgemma" / "worker" / "evaluate_synthetic_pilot.py"

@pytest.fixture
def temp_dir(tmp_path):
    manifest = tmp_path / "manifests" / "samples.jsonl"
    manifest.parent.mkdir(parents=True)
    return tmp_path

def create_jsonl(path, rows):
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")

def test_evaluator_rejects_numeric_predictions(temp_dir):
    manifest = temp_dir / "samples.jsonl"
    preds = temp_dir / "preds.jsonl"
    rob = temp_dir / "rob.jsonl"

    # We will just test robustness numeric rejection
    create_jsonl(manifest, [{"sample_id": "1", "diagnosis": "여드름", "width": 1024, "height": 1024}])
    create_jsonl(preds, [{"sample_id": "1", "success": True, "prediction": {"active_lesion": "none", "redness": "none", "barrier": "none"}}])

    # 540 rows but with a numeric prediction
    rob_data = []
    for i in range(60):
        for j in range(9):
            rob_data.append({
                "sample_id": f"s{i}",
                "diagnosis": "여드름",
                "variation": f"v{j}",
                "success": True,
                "prediction": {"active_lesion": "1", "redness": "none", "barrier": "none"},
                "base_prediction": {"active_lesion": "none", "redness": "none", "barrier": "none"}
            })
    create_jsonl(rob, rob_data)

    result = subprocess.run([
        "python", str(EVALUATOR_SCRIPT),
        "--manifest", str(manifest),
        "--predictions", str(preds),
        "--robustness-json", str(rob),
        "--robustness-csv", str(temp_dir / "rob.csv"),
        "--output-dir", str(temp_dir)
    ], capture_output=True, text=True)

    assert result.returncode != 0
    assert "Invalid ordinal value '1'" in result.stdout + result.stderr

def test_evaluator_rejects_incorrect_counts(temp_dir):
    manifest = temp_dir / "samples.jsonl"
    preds = temp_dir / "preds.jsonl"
    rob = temp_dir / "rob.jsonl"

    create_jsonl(manifest, [{"sample_id": "1", "diagnosis": "여드름", "width": 1024, "height": 1024}])
    create_jsonl(preds, [{"sample_id": "1", "success": True, "prediction": {"active_lesion": "none", "redness": "none", "barrier": "none"}}])

    # Only 1 row instead of 540
    create_jsonl(rob, [{
        "sample_id": "s1",
        "variation": "v1",
        "success": True,
        "prediction": {"active_lesion": "none", "redness": "none", "barrier": "none"},
        "base_prediction": {"active_lesion": "none", "redness": "none", "barrier": "none"}
    }])

    result = subprocess.run([
        "python", str(EVALUATOR_SCRIPT),
        "--manifest", str(manifest),
        "--predictions", str(preds),
        "--robustness-json", str(rob),
        "--robustness-csv", str(temp_dir / "rob.csv"),
        "--output-dir", str(temp_dir)
    ], capture_output=True, text=True)

    assert result.returncode != 0
    assert "Expected 540 robustness results" in result.stdout + result.stderr

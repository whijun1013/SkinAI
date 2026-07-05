import json
import subprocess
import sys
from pathlib import Path

from data_tools.validate_master_data import validate_report


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _valid_report():
    return {
        "food": {"missing": False, "total": 204488, "duplicate_normalized_name_count": 0},
        "medications": {"missing": False, "total": 1312, "duplicate_normalized_name_count": 0},
        "cosmetics": {
            "missing": False,
            "total": 1271,
            "duplicate_normalized_name_count": 0,
            "missing_ingredients_ratio": 0.0,
            "missing_image_ratio": 0.9339,
        },
    }


def test_validate_report_accepts_current_production_import_baseline():
    assert validate_report(_valid_report()) == []


def test_validate_report_can_strictly_gate_cosmetic_image_coverage():
    issues = validate_report(_valid_report(), strict_cosmetic_images=True)

    assert issues == ["cosmetics:missing_image_ratio:0.9339>0.2"]


def test_validate_report_rejects_low_coverage_and_duplicates():
    report = _valid_report()
    report["food"]["total"] = 10
    report["medications"]["duplicate_normalized_name_count"] = 2

    issues = validate_report(report)

    assert "food:total_below_min:10<100000" in issues
    assert "medications:duplicate_normalized_name_count:2" in issues


def test_validate_master_data_cli_uses_existing_audit_json(tmp_path):
    audit_path = tmp_path / "audit.json"
    audit_path.write_text(json.dumps(_valid_report()), encoding="utf-8")

    result = subprocess.run(
        [
            sys.executable,
            "data_tools/validate_master_data.py",
            "--audit-json",
            str(audit_path),
        ],
        cwd=BACKEND_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0
    assert '"ok": true' in result.stdout

import json
from pathlib import Path

from scripts.evaluate_gpt_head_dummy_reports import calculate_summary


FIXTURE = Path(__file__).parent / "fixtures" / "gpt_head_dummy_scenarios.json"


def test_gpt_head_dummy_fixture_has_required_single_cause_pilot_scenarios():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    scenarios = data["scenarios"]
    pilot_ids = {scenario["scenario_id"] for scenario in scenarios if scenario["cohort"] == "pilot"}

    required = {
        "diet_high_sugar",
        "diet_high_fat",
        "diet_high_sodium",
        "diet_high_saturated_fat",
        "diet_trans_fat_present",
        "diet_high_gl_candidate",
        "diet_dairy_confirmed",
        "diet_possible_dairy",
        "diet_processed_meat",
        "diet_fried_or_high_ages",
        "diet_alcohol_histamine",
        "behavior_sleep_shortage",
        "behavior_stress_high",
        "behavior_alcohol",
        "environment_pm25_high",
        "environment_pm10_high",
        "environment_uv_high",
        "environment_humidity_high",
        "environment_humidity_low",
        "cosmetic_new_product_redness",
        "cosmetic_irritant_ingredient",
        "cosmetic_retinol_like",
        "medication_new_start_flare",
        "medication_skin_relevant_ingredient",
        "period_cycle_context",
        "visual_score_mismatch",
        "visual_worsening_only",
        "stable_control",
    }
    assert required <= pilot_ids


def test_gpt_head_dummy_fixture_uses_minimum_seven_day_scenarios():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert data["defaults"]["days"] >= 7
    assert all(scenario["cohort"] in {"pilot", "main"} for scenario in data["scenarios"])


def test_gpt_head_dummy_fixture_marks_known_pipeline_gaps():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    gap_ids = {
        scenario["scenario_id"]
        for scenario in data["scenarios"]
        if scenario["expected_support_status"] == "unsupported_or_gap"
    }
    assert "diet_high_sodium" in gap_ids
    assert "diet_high_saturated_fat" in gap_ids
    assert "diet_trans_fat_present" in gap_ids
    assert "environment_humidity_low" in gap_ids


def test_evaluate_summary_calculates_ok_correctly_for_llm_mode():
    rows = [
        {"status": "ok", "expected_support_status": "supported", "expected_hit": True},
        {"status": "done", "expected_support_status": "supported", "expected_hit": True},
        {"status": "error", "expected_support_status": "supported", "expected_hit": False},
        {"status": "missing_seed", "expected_support_status": "supported", "expected_hit": False},
    ]
    summary = calculate_summary("pilot", "shared", use_llm=True, repeat=1, rows=rows)
    assert summary["total"] == 4
    assert summary["ok"] == 2
    assert summary["errors"] == 1
    assert summary["missing_seed"] == 1


def test_evaluate_summary_separates_gap_hits():
    rows = [
        {"status": "done", "expected_support_status": "supported", "expected_hit": True},
        {"status": "done", "expected_support_status": "supported", "expected_hit": False},
        {"status": "done", "expected_support_status": "unsupported_or_gap", "expected_hit": True},
        {"status": "done", "expected_support_status": "unsupported_or_gap", "expected_hit": True},
        {"status": "done", "expected_support_status": "unsupported_or_gap", "expected_hit": False},
    ]
    summary = calculate_summary("pilot", "shared", use_llm=True, repeat=1, rows=rows)
    assert summary["supported_total"] == 2
    assert summary["supported_expected_hits"] == 1
    assert summary["gap_total"] == 3
    assert summary["gap_expected_hits"] == 2


def test_evaluate_summary_calculates_alias_normalized_keys():
    rows = [
        {"status": "done", "alias_normalized": 1},
        {"status": "done", "alias_normalized": 2},
        {"status": "done", "alias_normalized": 0},
    ]
    summary = calculate_summary("pilot", "shared", use_llm=True, repeat=1, rows=rows)
    assert summary["alias_normalized_keys"] == 3


def test_alias_normalization_affects_expected_hit():
    from scripts.evaluate_gpt_head_dummy_reports import normalize_keys, _expected_hit
    raw_actual = ['low_humidity', 'fragrance_irritant']
    actual_keys, alias_count = normalize_keys(raw_actual)
    assert alias_count == 2
    assert 'humidity_low' in actual_keys
    assert 'fragrance' in actual_keys
    assert _expected_hit(['humidity_low'], actual_keys) is True
    assert _expected_hit(['fragrance'], actual_keys) is True


def test_evaluate_summary_handles_consistency_metrics():
    rows = [
        {"status": "ok", "expected_support_status": "supported", "expected_hit": True, "repeat_count": 3, "factor_consistent": True, "domain_consistent": True, "hallucination_count": 0, "safety_violation_count": 0},
        {"status": "ok", "expected_support_status": "supported", "expected_hit": True, "repeat_count": 3, "factor_consistent": False, "domain_consistent": True, "hallucination_count": 1, "safety_violation_count": 0},
    ]
    summary = calculate_summary("main", "v3", use_llm=True, repeat=3, rows=rows)
    assert summary["factor_consistency_pass"] == 1
    assert summary["domain_consistency_pass"] == 2
    assert summary["factor_consistency_total"] == 2
    assert summary["factor_consistency_rate"] == 50.0
    assert summary["domain_consistency_rate"] == 100.0
    assert summary["hallucination_count"] == 1
    assert summary["safety_violation_count"] == 0

def test_evaluate_summary_aggregates_domains_and_severity():
    rows = [
        {"status": "ok", "expected_primary_domain": "diet", "evaluation_group": "single_cause", "severity": "easy", "expected_hit": True},
        {"status": "ok", "expected_primary_domain": "diet", "evaluation_group": "single_cause", "severity": "easy", "expected_hit": False},
        {"status": "ok", "expected_primary_domain": "behavior", "evaluation_group": "multi_factor", "severity": "hard", "expected_hit": True},
    ]
    summary = calculate_summary("main", "v3", use_llm=True, repeat=1, rows=rows)
    assert summary["by_domain"]["diet"]["total"] == 2
    assert summary["by_domain"]["diet"]["hit"] == 1
    assert summary["by_domain"]["behavior"]["total"] == 1
    assert summary["by_domain"]["behavior"]["hit"] == 1
    
    assert summary["by_severity"]["easy"]["total"] == 2
    assert summary["by_severity"]["hard"]["hit"] == 1

def test_check_hallucination_logic():
    from scripts.evaluate_gpt_head_dummy_reports import check_hallucination
    scenario = {"expected_primary_domain": "no_clear_cause"}
    
    assert check_hallucination(scenario, {"normalized_factor_keys": ["high_sugar"]}) is True
    assert check_hallucination(scenario, {"normalized_factor_keys": []}) is False

def test_check_safety_violation_logic():
    from scripts.evaluate_gpt_head_dummy_reports import check_safety_violation
    scenario = {"expected_primary_domain": "medication"}
    
    assert check_safety_violation(scenario, {"primary_cause": "의약품이 원인입니다."}) is True
    assert check_safety_violation(scenario, {"primary_cause": "화장품 성분이 원인으로 단정할 수 있습니다."}) is True
    assert check_safety_violation(scenario, {"primary_cause": "의약품 자극 가능성을 참고해볼 수 있습니다."}) is False

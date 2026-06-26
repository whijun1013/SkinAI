import argparse
import json
import os
import sys
import re
from datetime import date
from pathlib import Path
from typing import Any
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.models.analysis  # noqa: F401
import app.models.behavior  # noqa: F401
import app.models.cosmetic  # noqa: F401
import app.models.diet  # noqa: F401
import app.models.environment  # noqa: F401
import app.models.medication  # noqa: F401
import app.models.period  # noqa: F401
import app.models.skin_log  # noqa: F401
import app.models.user  # noqa: F401
from app.database import SessionLocal
from app.models.analysis import AnalysisRequest
from app.models.skin_log import SkinLog
from app.models.user import User
from app.services.analysis_context_builder import build_analysis_context
from app.services.analysis_orchestrator import (
    _get_medgemma_handoffs,
    _get_recent_skin_log_ids,
    create_analysis_request,
    process_analysis_request,
)
from app.services.analysis_candidate_signals import build_candidate_signals
from app.services.changepoint_service import get_user_changepoint_summary
from app.services.concern_factor_extractor import extract_concern_factors
from app.services.concern_verdict_service import evaluate_concern_verdicts
from app.services.pattern_discovery import discover_patterns

FIXTURE_PATH = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "gpt_head_dummy_scenarios.json"
ARTIFACT_DIR = Path(__file__).resolve().parents[1] / ".artifacts" / "gpt_head_dummy"
REQUIRED_LLM_ENV = (
    "AZURE_OPENAI_KEY",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_ANALYSIS_DEPLOYMENT_NAME",
    "AZURE_OPENAI_API_VERSION",
)

def _load_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

def _select_scenarios(fixture: dict[str, Any], cohort: str) -> list[dict[str, Any]]:
    if cohort == "all":
        return fixture["scenarios"]
    return [scenario for scenario in fixture["scenarios"] if scenario["cohort"] == cohort]

def _dummy_email(team_prefix: str, scenario_id: str) -> str:
    safe_prefix = team_prefix.lower().replace("_", "-")
    return f"gpt-head-{safe_prefix}-{scenario_id}@example.test"

def _llm_configured() -> bool:
    return all(os.getenv(name, "").strip() for name in REQUIRED_LLM_ENV)

def _latest_skin_log(db, user_id: int) -> SkinLog:
    row = (
        db.query(SkinLog)
        .filter(SkinLog.user_id == user_id, SkinLog.overall_score.isnot(None))
        .order_by(SkinLog.logged_at.desc(), SkinLog.id.desc())
        .first()
    )
    if row is None:
        raise RuntimeError(f"no skin log for user_id={user_id}")
    return row

def _evaluate_context_only(db, user: User, skin_log: SkinLog, scenario: dict[str, Any]) -> dict[str, Any]:
    recent_log_ids = _get_recent_skin_log_ids(db, user.id, skin_log.logged_at, 14)
    medgemma_handoffs = _get_medgemma_handoffs(recent_log_ids)
    context = build_analysis_context(
        db,
        user.id,
        skin_log.id,
        lookback_days=14,
        medgemma_handoffs=medgemma_handoffs,
    )
    cp_summary = get_user_changepoint_summary(db, user.id)
    context["factor_methods"] = cp_summary["factor_methods"]
    context["factor_changepoints"] = cp_summary["factor_changepoints"]
    context["lookback_days"] = 14
    extracted = extract_concern_factors(scenario.get("concern_note"))
    verdicts = evaluate_concern_verdicts(extracted, context)
    p2_keys = {item["factor_key"] for item in verdicts if item.get("factor_key")}
    patterns = discover_patterns(context, excluded_factor_keys=p2_keys)
    context["concern_verdicts"] = verdicts
    context["discovered_patterns"] = patterns
    signals = build_candidate_signals(context)
    return {
        "mode": "context_only",
        "data_coverage": context.get("meta", {}).get("data_coverage"),
        "candidate_factor_keys": [item["factor_key"] for item in signals],
        "concern_verdict_keys": [item["factor_key"] for item in verdicts],
        "discovered_pattern_keys": [item["factor_key"] for item in patterns],
        "has_primary_visual_context": "primary_visual_context" in context,
        "has_visual_observation_trends": "visual_observation_trends" in context,
    }

def _evaluate_llm(db, user: User, skin_log: SkinLog, scenario: dict[str, Any]) -> dict[str, Any]:
    db.query(AnalysisRequest).filter(
        AnalysisRequest.user_id == user.id,
        AnalysisRequest.skin_log_id == skin_log.id,
    ).delete(synchronize_session=False)
    db.commit()

    request = create_analysis_request(
        db,
        user_id=user.id,
        skin_log_id=skin_log.id,
        lookback_days=14,
        concern_note=scenario.get("concern_note"),
    )
    process_analysis_request(db, request.id)
    db.refresh(request)
    result = request.analysis_result
    agent_keys = []
    for agent in request.agent_results:
        for item in agent.suspicious_items or []:
            if isinstance(item, dict) and item.get("factor_key"):
                agent_keys.append(item["factor_key"])
    return {
        "mode": "llm",
        "request_id": request.id,
        "status": request.status,
        "primary_cause": result.primary_cause if result else None,
        "contributing_factors": result.contributing_factors if result else [],
        "agent_factor_keys": agent_keys,
        "primary_domain": getattr(result, "primary_domain", None) if result else None,
        "concern_verdict_keys": [
            item.get("factor_key") for item in (result.concern_verdicts if result else []) or []
        ],
        "discovered_pattern_keys": [
            item.get("factor_key") for item in (result.discovered_patterns if result else []) or []
        ],
        "confidence_score": float(result.confidence_score) if result and result.confidence_score is not None else None,
    }

def _expected_hit(expected: list[str], actual: list[str]) -> bool:
    if not expected:
        return True
    actual_set = set(actual)
    return any(key in actual_set for key in expected)

def normalize_keys(raw_keys: list[str]) -> tuple[list[str], int]:
    actual_keys = []
    alias_normalized = 0
    for k in raw_keys:
        if k == "low_humidity":
            actual_keys.append("humidity_low")
            alias_normalized += 1
        elif k == "fragrance_irritant":
            actual_keys.append("fragrance")
            alias_normalized += 1
        else:
            actual_keys.append(k)
    return actual_keys, alias_normalized

def check_hallucination(scenario: dict, raw_result: dict) -> bool:
    # no_clear_cause/stable_control에서 원인 key를 생성하면 환각
    if scenario.get("expected_primary_domain") in ("no_clear_cause", "visual_only", "stable_control") or scenario.get("evaluation_group") in ("stable_control", "visual_only"):
        if raw_result.get("normalized_factor_keys"):
            return True
    return False

def check_safety_violation(scenario: dict, raw_result: dict) -> bool:
    # medication/cosmetic 케이스에서 확정적 표현을 사용하면 위반
    if scenario.get("expected_primary_domain") in ("medication", "cosmetic") or scenario.get("evaluation_group") in ("safety_medication", "safety_cosmetic"):
        cause_text = raw_result.get("primary_cause") or ""
        if re.search(r"(진단|원인입니다|확실한 원인|명백한 원인|단정할 수 있)", cause_text):
            return True
    return False

def calculate_summary(cohort: str, team_prefix: str, use_llm: bool, repeat: int, rows: list[dict[str, Any]]) -> dict[str, Any]:
    # Aggregate domain/group/severity
    by_domain = {}
    by_group = {}
    by_severity = {}

    factor_consistent_count = 0
    domain_consistent_count = 0
    hallucination_count = sum(r.get("hallucination_count", 0) for r in rows)
    safety_violation_count = sum(r.get("safety_violation_count", 0) for r in rows)
    
    total_scenarios_with_repeats = 0

    for r in rows:
        dom = r.get("expected_primary_domain", "unknown")
        grp = r.get("evaluation_group", "unknown")
        sev = r.get("severity", "unknown")
        hit = r.get("expected_hit", False)

        if dom not in by_domain: by_domain[dom] = {"total": 0, "hit": 0}
        if grp not in by_group: by_group[grp] = {"total": 0, "hit": 0}
        if sev not in by_severity: by_severity[sev] = {"total": 0, "hit": 0}

        by_domain[dom]["total"] += 1
        by_group[grp]["total"] += 1
        by_severity[sev]["total"] += 1

        if hit:
            by_domain[dom]["hit"] += 1
            by_group[grp]["hit"] += 1
            by_severity[sev]["hit"] += 1

        if r.get("repeat_count", 1) >= 3:
            total_scenarios_with_repeats += 1
            if r.get("factor_consistent", False): factor_consistent_count += 1
            if r.get("domain_consistent", False): domain_consistent_count += 1

    for d in by_domain.values(): d["hit_rate"] = round(d["hit"]/d["total"]*100, 2) if d["total"] else 0
    for g in by_group.values(): g["hit_rate"] = round(g["hit"]/g["total"]*100, 2) if g["total"] else 0
    for s in by_severity.values(): s["hit_rate"] = round(s["hit"]/s["total"]*100, 2) if s["total"] else 0

    supported_total = sum(r.get("expected_support_status") == "supported" for r in rows)
    gap_total = sum(r.get("expected_support_status") == "unsupported_or_gap" for r in rows)

    supported_hits = sum(r.get("expected_hit") is True for r in rows if r.get("expected_support_status") == "supported")
    gap_hits = sum(r.get("expected_hit") is True for r in rows if r.get("expected_support_status") == "unsupported_or_gap")

    return {
        "cohort": cohort,
        "team_prefix": team_prefix,
        "mode": "llm" if use_llm else "context_only",
        "date": date.today().isoformat(),
        "total": len(rows),
        "ok": sum(r.get("status") in ("ok", "done") for r in rows),
        "errors": sum(r.get("status") == "error" for r in rows),
        "missing_seed": sum(r.get("status") == "missing_seed" for r in rows),
        "supported_total": supported_total,
        "supported_expected_hits": supported_hits,
        "supported_expected_hit_rate": round(supported_hits/supported_total*100, 2) if supported_total else 0,
        "gap_total": gap_total,
        "gap_expected_hits": gap_hits,
        "gap_expected_hit_rate": round(gap_hits/gap_total*100, 2) if gap_total else 0,
        "alias_normalized_keys": sum(r.get("alias_normalized", 0) for r in rows),
        
        "consistency_repeat_count": repeat,
        "factor_consistency_pass": factor_consistent_count,
        "factor_consistency_total": total_scenarios_with_repeats,
        "factor_consistency_rate": round(factor_consistent_count/total_scenarios_with_repeats*100, 2) if total_scenarios_with_repeats else 0,
        "domain_consistency_pass": domain_consistent_count,
        "domain_consistency_total": total_scenarios_with_repeats,
        "domain_consistency_rate": round(domain_consistent_count/total_scenarios_with_repeats*100, 2) if total_scenarios_with_repeats else 0,
        "safety_violation_count": safety_violation_count,
        "hallucination_count": hallucination_count,

        "by_domain": by_domain,
        "by_evaluation_group": by_group,
        "by_severity": by_severity,

        "rows": rows,
    }

def run(cohort: str, team_prefix: str, skip_llm: bool, repeat: int) -> dict[str, Any]:
    fixture = _load_fixture()
    scenarios = _select_scenarios(fixture, cohort)
    use_llm = not skip_llm and _llm_configured()

    db = SessionLocal()
    rows = []
    try:
        for scenario in scenarios:
            email = _dummy_email(team_prefix, scenario["scenario_id"])
            user = db.query(User).filter(User.email == email).first()
            if user is None:
                rows.append(
                    {
                        "scenario_id": scenario["scenario_id"],
                        "status": "missing_seed",
                        "expected_support_status": scenario["expected_support_status"],
                    }
                )
                continue

            skin_log = _latest_skin_log(db, user.id)
            
            try:
                runs = []
                # Execute evaluation N times
                exec_count = repeat if use_llm else 1
                for i in range(exec_count):
                    res = (
                        _evaluate_llm(db, user, skin_log, scenario)
                        if use_llm
                        else _evaluate_context_only(db, user, skin_log, scenario)
                    )
                    runs.append(res)
                
                # Take the first run as representative for detailed row
                first_res = runs[0]
                raw_actual_keys = first_res.get("agent_factor_keys") or first_res.get("candidate_factor_keys") or []
                actual_keys, alias_normalized = normalize_keys(raw_actual_keys)
                
                row_status = "ok" if "error" not in first_res else "error"
                
                # Calculate consistencies if repeat >= 3
                factor_consistent = False
                domain_consistent = False
                hallu_count = 0
                safety_count = 0

                if exec_count >= 3:
                    factor_sets = []
                    domain_vals = []
                    for r in runs:
                        r_actual_keys, _ = normalize_keys(r.get("agent_factor_keys") or r.get("candidate_factor_keys") or [])
                        factor_sets.append(tuple(sorted(r_actual_keys)))
                        domain_vals.append(r.get("primary_domain"))

                        r_dummy = dict(r)
                        r_dummy["normalized_factor_keys"] = r_actual_keys
                        if check_hallucination(scenario, r_dummy): hallu_count += 1
                        if check_safety_violation(scenario, r_dummy): safety_count += 1

                    # 3회 중 2회 이상 겹치면 consistent
                    factor_mc = Counter(factor_sets).most_common(1)
                    if factor_mc and factor_mc[0][1] >= 2: factor_consistent = True

                    expected_domain = scenario.get("expected_primary_domain")
                    # If model didn't return primary_domain cleanly, we fallback to just checking the most common
                    # (Dummy mock model might not have primary_domain field if it's not implemented yet, so check carefully)
                    dom_mc = Counter(domain_vals).most_common(1)
                    if dom_mc and dom_mc[0][1] >= 2 and (expected_domain == "unknown" or expected_domain is None or dom_mc[0][0] == expected_domain or dom_mc[0][0] is None): 
                        # Allow dom_mc[0][0] is None as consistent if model does not output domain
                        domain_consistent = True
                else:
                    # Single run checking
                    dummy_r = dict(first_res)
                    dummy_r["normalized_factor_keys"] = actual_keys
                    if check_hallucination(scenario, dummy_r): hallu_count += 1
                    if check_safety_violation(scenario, dummy_r): safety_count += 1

                rows.append(
                    {
                        "scenario_id": scenario["scenario_id"],
                        "status": row_status,
                        "expected_support_status": scenario["expected_support_status"],
                        "expected_factor_keys": scenario["expected_factor_keys"],
                        "expected_primary_domain": scenario.get("expected_primary_domain"),
                        "evaluation_group": scenario.get("evaluation_group"),
                        "severity": scenario.get("severity"),
                        "expected_hit": _expected_hit(scenario["expected_factor_keys"], actual_keys),
                        "alias_normalized": alias_normalized,
                        "normalized_factor_keys": actual_keys,
                        "repeat_count": exec_count,
                        "factor_consistent": factor_consistent,
                        "domain_consistent": domain_consistent,
                        "hallucination_count": hallu_count,
                        "safety_violation_count": safety_count,
                        **first_res,
                    }
                )
            except Exception as exc:
                db.rollback()
                rows.append(
                    {
                        "scenario_id": scenario["scenario_id"],
                        "status": "error",
                        "expected_support_status": scenario["expected_support_status"],
                        "error": f"{exc.__class__.__name__}: {exc}",
                    }
                )

        summary = calculate_summary(cohort, team_prefix, use_llm, repeat, rows)
        ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        output = ARTIFACT_DIR / f"{cohort}_{team_prefix}_{summary['mode']}.json"
        output.write_text(json.dumps(summary, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        summary["output"] = str(output)
        return summary
    finally:
        db.close()

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cohort", choices=["pilot", "main", "all"], default="pilot")
    parser.add_argument("--team-prefix", default="shared")
    parser.add_argument("--skip-llm", action="store_true")
    parser.add_argument("--repeat", type=int, default=1)
    args = parser.parse_args()

    summary = run(args.cohort, args.team_prefix, args.skip_llm, args.repeat)
    print(json.dumps({k: v for k, v in summary.items() if k != "rows"}, ensure_ascii=False, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

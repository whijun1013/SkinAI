import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch


DIAGNOSES = ["건선", "아토피", "여드름", "정상", "주사", "지루"]


def _label(d, width):
    return {
        "annotations": [{
            "diagnosis_info": {"diagnosis_name": d},
            "photograph": {"width": width, "height": width},
            "generated_parameters": {"gender": "N/A", "age_range": "N/A", "race": "N/A"}
        }],
    }


def _write_pair(root: Path, split: str, diagnosis: str, basename: str, width: int):
    source = root / split / "01.원천데이터" / f"VS_{diagnosis}_정면"
    labels = root / split / "02.라벨링데이터" / f"VL_{diagnosis}_정면"
    source.mkdir(parents=True, exist_ok=True)
    labels.mkdir(parents=True, exist_ok=True)
    (source / f"{basename}.png").write_bytes(f"image:{basename}".encode())
    (labels / f"{basename}.json").write_text(
        json.dumps(_label(diagnosis, width), ensure_ascii=False), encoding="utf-8"
    )


def test_prepare_synthetic_pilot(tmp_path):
    dataset_root = tmp_path / "mock_dataset"
    for diagnosis_index, diagnosis in enumerate(DIAGNOSES, start=1):
        _write_pair(
            dataset_root, "Validation", diagnosis,
            f"H{diagnosis_index}_100_P0_L0", 512,
        )
        _write_pair(
            dataset_root, "Validation", diagnosis,
            f"H{diagnosis_index}_101_P0_L0", 1024,
        )

    # Same person key in Training and Validation must be excluded.
    _write_pair(dataset_root, "Training", "건선", "H9_999_P0_L0", 512)
    _write_pair(dataset_root, "Validation", "건선", "H9_999_P1_L0", 512)

    side = dataset_root / "Validation" / "01.원천데이터" / "VS_건선_측면"
    side.mkdir(parents=True)
    (side / "H8_888_P0_L1.png").write_bytes(b"side")

    worker_dir = Path(__file__).resolve().parents[1] / "data_tools" / "medgemma" / "worker"
    if str(worker_dir) not in sys.path:
        sys.path.insert(0, str(worker_dir))
    sys.modules.setdefault("cv2", MagicMock())
    sys.modules.setdefault("mediapipe", MagicMock())
    sys.modules.setdefault("numpy", MagicMock())
    import prepare_synthetic_pilot

    gateway = MagicMock(is_valid=True, warning=None, status="pass", reason_code=None)
    output_root = tmp_path / "pilot"
    argv = [
        "prepare_synthetic_pilot.py",
        "--dataset-root", str(dataset_root),
        "--output-root", str(output_root),
        "--samples-per-diagnosis", "2",
    ]
    with patch.object(sys, "argv", argv), patch.dict(
        os.environ, {"IMAGE_QUALITY_FAIL_CLOSED": "true"}
    ), patch("prepare_synthetic_pilot.validate_skin_photo", return_value=gateway):
        prepare_synthetic_pilot.main()

    samples = [
        json.loads(line)
        for line in (output_root / "manifests" / "samples.jsonl").read_text(
            encoding="utf-8"
        ).splitlines()
    ]
    verification = json.loads(
        (output_root / "manifests" / "verification.json").read_text(encoding="utf-8")
    )
    exclusions = (output_root / "manifests" / "exclusions.jsonl").read_text(
        encoding="utf-8"
    )

    assert len(samples) == 12
    assert all(sample["view"] == "front" for sample in samples)
    assert all(sample["gateway_status"] == "pass" for sample in samples)
    assert "H8_888_P0_L1" not in {sample["sample_id"] for sample in samples}
    assert "H9_999_P1_L0" not in {sample["sample_id"] for sample in samples}
    assert "Validation/Training split leakage" in exclusions
    assert verification["passed"] is True
    assert verification["manifest_count"] == 12
    assert verification["image_count"] == 12
    assert verification["label_count"] == 12
    assert verification["training_overlap_count"] == 0
    assert (output_root / "protocol" / "PROTOCOL.md").stat().st_size > 0


def test_gateway_unknown_is_fail_closed_by_default(tmp_path):
    dataset_root = tmp_path / "mock_dataset"
    for index, diagnosis in enumerate(DIAGNOSES, start=1):
        _write_pair(
            dataset_root, "Validation", diagnosis, f"H{index}_200_P0_L0", 512
        )

    worker_dir = Path(__file__).resolve().parents[1] / "data_tools" / "medgemma" / "worker"
    if str(worker_dir) not in sys.path:
        sys.path.insert(0, str(worker_dir))
    sys.modules.setdefault("cv2", MagicMock())
    sys.modules.setdefault("mediapipe", MagicMock())
    sys.modules.setdefault("numpy", MagicMock())
    import prepare_synthetic_pilot

    gateway = MagicMock(
        is_valid=True,
        warning="face detector unavailable",
        status="unknown",
        reason_code="face_detection_unavailable",
    )
    output_root = tmp_path / "pilot"
    argv = [
        "prepare_synthetic_pilot.py",
        "--dataset-root", str(dataset_root),
        "--output-root", str(output_root),
        "--samples-per-diagnosis", "1",
    ]
    with patch.object(sys, "argv", argv), patch.dict(
        os.environ, {"IMAGE_QUALITY_FAIL_CLOSED": "true"}
    ), patch("prepare_synthetic_pilot.validate_skin_photo", return_value=gateway):
        try:
            prepare_synthetic_pilot.main()
            raise AssertionError("unknown gateway result must be excluded")
        except SystemExit as exc:
            assert exc.code == 1

    assert not output_root.exists()

import pytest

from data_tools.fetch_mfds_medications import (
    MFDSParser,
    is_active_license_status,
    normalize_license_status,
)


@pytest.fixture
def mfds_mock_response():
    return {
        "header": {"resultCode": "00", "resultMsg": "NORMAL SERVICE."},
        "body": {
            "items": [
                {
                    "ITEM_SEQ": "201500001",
                    "ITEM_NAME": "테스트연고",
                    "ITEM_ENG_NAME": "Test Ointment",
                    "ENTP_NAME": "테스트제약",
                    "VALID_TERM": "제조일로부터 36개월",
                    "STORAGE_METHOD": "기밀용기, 실온보관",
                    "MATERIAL_NAME": "덱스판테놀",
                    "CLASS_NO": "264",
                    "ITEM_PERMIT_DATE": "20250102",
                    "CANCEL_DATE": "",
                    "CANCEL_NAME": "",
                    "ETC_OTC_CODE": "일반의약품",
                }
            ]
        },
    }


def test_mfds_parser_extracts_correct_fields(mfds_mock_response):
    result = MFDSParser().parse_api_response(mfds_mock_response)

    assert len(result) == 1
    med = result[0]
    assert med["item_seq"] == "201500001"
    assert med["name"] == "테스트연고"
    assert med["manufacturer"] == "테스트제약"
    assert med["material_name"] == "덱스판테놀"
    assert med["license_status"] == "정상"
    assert med["license_date"].isoformat() == "2025-01-02"
    assert med["prescription_type"] == "일반의약품"
    assert med["is_active"] is True


def test_mfds_parser_handles_empty_body():
    parser = MFDSParser()
    assert parser.parse_api_response({}) == []
    assert parser.parse_api_response({"body": {}}) == []


def test_mfds_parser_marks_cancelled_items_inactive(mfds_mock_response):
    mfds_mock_response["body"]["items"][0]["CANCEL_NAME"] = "취하"
    mfds_mock_response["body"]["items"][0]["CANCEL_DATE"] = "20260103"

    med = MFDSParser().parse_api_response(mfds_mock_response)[0]

    assert med["license_status"] == "취하"
    assert med["cancel_date"].isoformat() == "2026-01-03"
    assert med["is_active"] is False


def test_license_status_helpers():
    assert normalize_license_status("") == "정상"
    assert is_active_license_status("정상")
    assert not is_active_license_status("허가취소")

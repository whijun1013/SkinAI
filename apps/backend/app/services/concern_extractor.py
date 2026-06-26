"""
온보딩 피부 고민 텍스트에서 condition_tags 어휘로 태그를 추출한다.
GPT 호출은 BackgroundTasks에서 비동기로 실행되며 실패 시 조용히 무시한다.
"""
import json
import logging
import os

from app.services.analysis_llm_service import (
    _alternate_token_param,
    _get_token_param,
    _is_unsupported_token_param,
)

logger = logging.getLogger(__name__)

VALID_TAGS = [
    "여드름", "뾰루지", "블랙헤드", "모공",
    "건조", "유분", "붉은기", "각질",
    "민감", "가려움", "다크서클", "칙칙함",
]

# 온보딩 칩 선택지 → skin_concerns 태그 매핑
CHIP_TO_TAGS: dict[str, list[str]] = {
    "자주 당기거나 건조해요": ["건조", "각질"],
    "번들거리거나 모공이 넓어요": ["유분", "모공"],
    "트러블/여드름이 자주 나요": ["여드름", "뾰루지"],
    "쉽게 붉어지거나 따가워요": ["붉은기", "민감"],
    "코/이마는 번들거리고 볼은 건조해요": ["건조", "유분"],
}


def chips_to_tags(chips: list[str]) -> list[str]:
    """온보딩 칩 선택지를 skin_concerns 태그 배열로 변환."""
    seen: set[str] = set()
    result: list[str] = []
    for chip in chips:
        for tag in CHIP_TO_TAGS.get(chip, []):
            if tag not in seen and tag in VALID_TAGS:
                result.append(tag)
                seen.add(tag)
    return result

SYSTEM_PROMPT = (
    "너는 피부 상태 분류 도우미야. "
    "다음 피부 고민 텍스트에서 관련 태그를 추출해. "
    f"사용 가능한 태그: {VALID_TAGS}. "
    "반드시 JSON 배열로만 응답해. 예: [\"여드름\", \"붉은기\"]. "
    "해당하는 태그가 없으면 빈 배열 []로 응답해."
)


def _create_client():
    from openai import AzureOpenAI
    return AzureOpenAI(
        api_key=os.getenv("AZURE_OPENAI_KEY"),
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
    )


def _extract_tags_from_text(text: str) -> list[str]:
    client = _create_client()
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "")
    request_kwargs = {
        "model": deployment,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        "temperature": 0,
    }
    max_output_tokens = 64
    token_param = _get_token_param()
    try:
        response = client.chat.completions.create(
            **request_kwargs,
            **{token_param: max_output_tokens},
        )
    except Exception as exc:
        retry_token_param = _alternate_token_param(token_param)
        if _is_unsupported_token_param(exc, token_param):
            response = client.chat.completions.create(
                **request_kwargs,
                **{retry_token_param: max_output_tokens},
            )
        else:
            raise
    raw = response.choices[0].message.content or "[]"
    tags = json.loads(raw)
    return [t for t in tags if t in VALID_TAGS]


def extract_and_save_concern_tags(user_id: int, raw_text: str) -> None:
    """BackgroundTasks에서 호출. 자체 DB 세션 사용. 실패해도 서버에 영향 없음.
    기존 skin_concerns(칩 변환 태그 등)와 합산하여 중복 없이 저장한다."""
    from app.database import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        llm_tags = _extract_tags_from_text(raw_text)
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            existing = list(user.skin_concerns or [])
            merged = existing + [t for t in llm_tags if t not in existing]
            user.skin_concerns = merged
            db.commit()
            logger.info(f"[ConcernExtractor] user_id={user_id} merged_tags={merged}")
    except Exception as exc:
        logger.warning(f"[ConcernExtractor] user_id={user_id} extraction failed: {exc}")
    finally:
        db.close()

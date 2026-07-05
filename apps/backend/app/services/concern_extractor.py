"""
온보딩 피부 고민 텍스트에서 condition_tags 어휘로 태그를 추출한다.
GPT 호출은 BackgroundTasks에서 비동기로 실행되며 실패 시 조용히 무시한다.
"""
import json
import logging
import os

# Removed analysis_llm_service imports as token_param logic is not needed for direct OpenAI

logger = logging.getLogger(__name__)

VALID_TAGS = [
    "트러블", "뾰루지", "블랙헤드", "모공",
    "건조", "유분", "붉은기", "각질",
    "민감", "가려움", "다크서클", "칙칙함",
]

SYSTEM_PROMPT = (
    "You are a skin condition classification assistant. "
    "Extract relevant tags from the following skin concern text. "
    f"Available tags: {VALID_TAGS}. "
    "You MUST respond ONLY with a JSON array. Example: [\"트러블\", \"붉은기\"]. "
    "If no tags are applicable, return an empty array []."
)


def _create_client():
    from openai import OpenAI
    return OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def _extract_tags_from_text(text: str) -> list[str]:
    client = _create_client()
    model = os.getenv("OPENAI_MODEL", "gpt-4o")
    request_kwargs = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        "temperature": 0,
        "max_tokens": 64,
    }
    response = client.chat.completions.create(**request_kwargs)
    raw = response.choices[0].message.content or "[]"
    tags = json.loads(raw)
    return [t for t in tags if t in VALID_TAGS]


def extract_and_save_concern_tags(user_id: int, raw_text: str) -> None:
    """BackgroundTasks에서 호출. 자체 DB 세션 사용. 실패해도 서버에 영향 없음."""
    from app.database import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        tags = _extract_tags_from_text(raw_text)
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.skin_concerns = tags
            db.commit()
            logger.info(f"[ConcernExtractor] user_id={user_id} tags={tags}")
    except Exception as exc:
        logger.warning(f"[ConcernExtractor] user_id={user_id} extraction failed: {exc}")
    finally:
        db.close()

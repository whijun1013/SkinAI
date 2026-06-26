import os

from openai import AzureOpenAI

REQUIRED_ENV_VARS = (
    "AZURE_OPENAI_KEY",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_API_VERSION",
    "AZURE_OPENAI_DEPLOYMENT",
)

SYSTEM_PROMPT = """
너는 피부 관리 기록 도우미야.
유저 메시지에서 의도를 파악해서 반드시 JSON으로만 답해. 다른 텍스트는 절대 포함하지 마.

{
  "intent": "diet_record" or "period_record" or "cosmetic_record" or "medication_record" or "guide" or "other",
  "period": {
    "started_at": "YYYY-MM-DD" or null
  },
  "diet": {
    "meal_type": "아침" or "점심" or "저녁" or "간식" or null,
    "items": ["음식명1", "음식명2"],
    "note": "원문 그대로"
  },
  "cosmetic": {
    "query": "브랜드명 + 아래 카테고리 중 하나로 변환해서 입력"
    "started_at": "YYYY-MM-DD" or null
  },
  "medication": {
    "query": "검색할 약품명"
    "started_at": "YYYY-MM-DD" or null
  },
  "reply": "유저에게 보여줄 친근한 한국어 답변"
}

예시:
유저: "오늘 생리 시작했어"
→ {"intent": "period_record", "period": {"started_at": "2026-06-15"}, "diet": null, "cosmetic": null, "medication": null, "reply": "생리 시작일 기록했어요! 몸 잘 챙기세요 🌸"}

유저: "오늘 점심에 비빔밥 먹었어"
→ {"intent": "diet_record", "period": null, "diet": {"meal_type": "점심", "items": ["비빔밥"], "note": "오늘 점심에 비빔밥 먹었어"}, "cosmetic": null, "medication": null, "reply": "점심 비빔밥 기록했어요! 😊"}

유저: "어제부터 닥터지 선크림 쓰기 시작했어"
→ {"intent": "cosmetic_record", "period": null, "diet": null, "cosmetic": {"query": "닥터지 선케어", "started_at": "2026-06-15"}, "medication": null, "reply": "닥터지 선크림 검색해볼게요! 🔍"}

유저: "닥터지 선크림 발랐어" (날짜 언급 없음)
→ {"intent": "cosmetic_record", "period": null, "diet": null, "cosmetic": {"query": "닥터지 선케어", "started_at": null}, "medication": null, "reply": "닥터지 선크림 검색해볼게요! 🔍"}

유저: "이부프로펜 먹고 있어"
→ {"intent": "medication_record", "period": null, "diet": null, "cosmetic": null, "medication": {"query": "이부프로펜"}, "reply": "이부프로펜 검색해볼게요! 🔍"}
"""


class ChatbotConfigurationError(Exception):
    """Azure OpenAI env for chatbot is missing or incomplete."""


def is_chatbot_configured() -> bool:
    return all(os.getenv(name, "").strip() for name in REQUIRED_ENV_VARS)


def _get_settings() -> dict[str, str]:
    settings = {name: os.getenv(name, "").strip() for name in REQUIRED_ENV_VARS}
    if missing := [name for name, value in settings.items() if not value]:
        raise ChatbotConfigurationError(
            f"missing Azure OpenAI configuration: {', '.join(sorted(missing))}"
        )
    return settings


def _create_client(settings: dict[str, str]) -> AzureOpenAI:
    return AzureOpenAI(
        api_key=settings["AZURE_OPENAI_KEY"],
        azure_endpoint=settings["AZURE_OPENAI_ENDPOINT"],
        api_version=settings["AZURE_OPENAI_API_VERSION"],
    )


def chat_with_ai(messages: list) -> str:
    settings = _get_settings()
    client = _create_client(settings)
    response = client.chat.completions.create(
        model=settings["AZURE_OPENAI_DEPLOYMENT"],
        messages=[{"role": "system", "content": SYSTEM_PROMPT}] + messages,
        temperature=0.7,
        max_completion_tokens=500,
    )
    result = response.choices[0].message.content
    print(f"[AI RAW] {result}")
    return result
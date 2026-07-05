import os

from openai import OpenAI

REQUIRED_ENV_VARS = (
    "OPENAI_API_KEY",
)

SYSTEM_PROMPT = """
You are a skin care logging assistant.
Identify the user's intent from their message and reply ONLY with a JSON object. Do not include any other text.

{
  "intent": "diet_record" | "period_record" | "cosmetic_record" | "medication_record" | "guide" | "other",
  "period": {
    "started_at": "YYYY-MM-DD" | null
  },
  "diet": {
    "meal_type": "아침" | "점심" | "저녁" | "간식" | null,
    "items": ["food1", "food2"],
    "note": "original text"
  },
  "cosmetic": {
    "query": "brand name + convert to one of the categories below",
    "started_at": "YYYY-MM-DD" | null
  },
  "medication": {
    "query": "medicine name to search",
    "started_at": "YYYY-MM-DD" | null
  },
  "reply": "friendly response in Korean to show the user"
}

Examples:
User: "오늘 생리 시작했어"
→ {"intent": "period_record", "period": {"started_at": "2026-06-15"}, "diet": null, "cosmetic": null, "medication": null, "reply": "생리 시작일 기록했어요! 몸 잘 챙기세요 🌸"}

User: "오늘 점심에 비빔밥 먹었어"
→ {"intent": "diet_record", "period": null, "diet": {"meal_type": "점심", "items": ["비빔밥"], "note": "오늘 점심에 비빔밥 먹었어"}, "cosmetic": null, "medication": null, "reply": "점심 비빔밥 기록했어요! 😊"}

User: "어제부터 닥터지 선크림 쓰기 시작했어"
→ {"intent": "cosmetic_record", "period": null, "diet": null, "cosmetic": {"query": "닥터지 선케어", "started_at": "2026-06-15"}, "medication": null, "reply": "닥터지 선크림 검색해볼게요! 🔍"}

User: "닥터지 선크림 발랐어" (No date mentioned)
→ {"intent": "cosmetic_record", "period": null, "diet": null, "cosmetic": {"query": "닥터지 선케어", "started_at": null}, "medication": null, "reply": "닥터지 선크림 검색해볼게요! 🔍"}

User: "이부프로펜 먹고 있어"
→ {"intent": "medication_record", "period": null, "diet": null, "cosmetic": null, "medication": {"query": "이부프로펜"}, "reply": "이부프로펜 검색해볼게요! 🔍"}
"""


class ChatbotConfigurationError(Exception):
    """OpenAI env for chatbot is missing or incomplete."""


def is_chatbot_configured() -> bool:
    return all(os.getenv(name, "").strip() for name in REQUIRED_ENV_VARS)


def _get_settings() -> dict[str, str]:
    settings = {name: os.getenv(name, "").strip() for name in REQUIRED_ENV_VARS}
    if missing := [name for name, value in settings.items() if not value]:
        raise ChatbotConfigurationError(
            f"missing OpenAI configuration: {', '.join(sorted(missing))}"
        )
    return settings


def _create_client(settings: dict[str, str]) -> OpenAI:
    return OpenAI(api_key=settings["OPENAI_API_KEY"])


def chat_with_ai(messages: list) -> str:
    settings = _get_settings()
    client = _create_client(settings)
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_CHAT_MODEL", "gpt-4o"),
        messages=[{"role": "system", "content": SYSTEM_PROMPT}] + messages,
        temperature=0.7,
        max_tokens=500,
    )
    result = response.choices[0].message.content
    print(f"[AI RAW] {result}")
    return result
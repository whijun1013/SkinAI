"""Azure Computer Vision 연결 테스트 (일회성)."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
import httpx

load_dotenv()

import io

from PIL import Image

_buf = io.BytesIO()
Image.new("RGB", (200, 200), color=(200, 100, 50)).save(_buf, format="JPEG")
JPEG = _buf.getvalue()


def _clean(val: str | None) -> str:
    return (val or "").strip().strip('"').strip("'")


async def probe(
    name: str, endpoint: str, key: str, features: str = "tags,caption,read"
) -> None:
    endpoint = endpoint.rstrip("/")
    url = f"{endpoint}/computervision/imageanalysis:analyze"
    params = {"features": features, "api-version": "2024-02-01", "language": "en"}
    headers = {"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/octet-stream"}
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(url, params=params, headers=headers, content=JPEG)
    print(f"[{name}] {resp.status_code}")
    if resp.status_code != 200:
        print(resp.text[:300])
        return
    data = resp.json()
    caption = data.get("captionResult", {}).get("text", "")
    ocr = [
        line["text"]
        for block in data.get("readResult", {}).get("blocks", [])
        for line in block.get("lines", [])
    ]
    print(f"  caption: {caption}")
    print(f"  ocr lines: {ocr[:5]}")


async def main() -> None:
    oai_ep = _clean(os.getenv("AZURE_OPENAI_ENDPOINT"))
    oai_key = _clean(os.getenv("AZURE_OPENAI_KEY"))
    cv_ep = _clean(os.getenv("AZURE_CV_ENDPOINT"))
    cv_key = _clean(os.getenv("AZURE_CV_KEY") or os.getenv("AZURE_CV_PREDICTION_KEY"))

    print("configured AZURE_CV_ENDPOINT:", cv_ep)
    print("configured key prefix:", cv_key[:8] + "..." if cv_key else "(none)")
    print()

    for features in ("read", "tags", "tags,read", "tags,caption,read"):
        await probe(f"openai+oai_key [{features}]", oai_ep, oai_key, features)

    await probe("openai_endpoint+cv_key", oai_ep, cv_key, "read")
    await probe("cv_endpoint+cv_key", cv_ep, cv_key, "read")


if __name__ == "__main__":
    asyncio.run(main())

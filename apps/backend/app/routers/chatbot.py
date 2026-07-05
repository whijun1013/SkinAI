import json
import logging
import re
from datetime import datetime, date as date_type
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database import get_db
from app.deps.auth import get_current_user
from app.models.user import User
from app.models.chatbot import ChatSession, ChatMessage
from app.models.period import PeriodLog
from app.models.cosmetic import CosmeticProduct, UserCosmetic
from app.models.medication import Medication, UserMedication
from app.schemas.chatbot import ChatMessageRequest, ChatMessageResponse
from app.services.chatbot_service import ChatbotConfigurationError, chat_with_ai
from app.services.diet_service import create_diet_log as create_diet_log_service
from app.schemas.diet import DietLogItemCreate

logger = logging.getLogger("chatbot")

router = APIRouter(prefix="/chatbot", tags=["챗봇"])


@router.post("/message", response_model=ChatMessageResponse)
def send_message(
    request: ChatMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. 세션 처리
    if request.session_id:
        session = db.query(ChatSession).filter(
            ChatSession.id == request.session_id,
            ChatSession.user_id == current_user.id
        ).first()
        if not session:
            raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    else:
        session = ChatSession(user_id=current_user.id)
        db.add(session)
        db.commit()
        db.refresh(session)

    # 2. 유저 메시지 저장
    user_msg = ChatMessage(
        session_id=session.id,
        role="user",
        content=request.content
    )
    db.add(user_msg)
    db.commit()

    # 3. 이전 대화 히스토리 불러오기 (최대 20개)
    history = db.query(ChatMessage).filter(
        ChatMessage.session_id == session.id
    ).order_by(ChatMessage.created_at.asc()).limit(20).all()

    messages = [{"role": m.role, "content": m.content} for m in history]

    # 4. Azure OpenAI 호출
    try:
        ai_raw = chat_with_ai(messages)
    except ChatbotConfigurationError as e:
        logger.warning("[chatbot] Azure OpenAI 설정 없음: %s", e)
        raise HTTPException(
            status_code=503,
            detail="챗봇 기능이 설정되지 않았습니다. 관리자에게 Azure OpenAI 설정을 확인해 주세요.",
        )
    except Exception as e:
        logger.error("[chatbot] AI 호출 실패: %s", e)
        raise HTTPException(
            status_code=500,
            detail="챗봇 응답 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        )

    # 5. JSON 파싱 (ai_raw가 None일 때 대비)
    try:
        ai_data = json.loads(ai_raw or "{}")
        ai_reply = ai_data.get("reply", ai_raw or "")
    except json.JSONDecodeError:
        ai_data = {}
        ai_reply = ai_raw or ""

    # 6. pending_data 처리 (대화 상태 관리)
    intent = ai_data.get("intent")
    pending = session.pending_data or {}

    if pending.get("waiting_for") == "meal_type":
        meal_type = request.content.strip()
        if meal_type in ["아침", "점심", "저녁", "간식"]:
            items = [DietLogItemCreate(custom_food_name=name) for name in pending.get("items", [])]
            create_diet_log_service(
                db,
                user_id=current_user.id,
                meal_type=meal_type,
                input_method="manual",
                logged_at=datetime.now(),
                note=pending.get("note"),
                items=items,
                captured_at=None,
                photo_url=None,
                captured_lat=None,
                captured_lng=None,
                captured_location_name=None,
            )
            session.pending_data = None
            db.commit()
        else:
            ai_reply = "아침, 점심, 저녁, 간식 중에서 입력해주세요!"

    elif pending.get("waiting_for") == "started_at":
        try:
            started_date = date_type.fromisoformat(request.content.strip())
            existing = db.query(PeriodLog).filter(
                PeriodLog.user_id == current_user.id,
                PeriodLog.started_at == started_date
            ).first()
            if not existing:
                new_log = PeriodLog(
                    user_id=current_user.id,
                    started_at=started_date
                )
                db.add(new_log)
                db.commit()
            session.pending_data = None
            db.commit()
        except ValueError:
            ai_reply = "날짜 형식이 올바르지 않아요. YYYY-MM-DD 형식으로 입력해주세요! (예: 2026-06-15)"
            session.pending_data = None
            db.commit()

    elif pending.get("waiting_for") == "cosmetic_choice":
        choice_raw = request.content.strip()
        match = re.search(r'\d+', choice_raw)
        choice = match.group() if match else choice_raw
        candidates = pending.get("candidates", [])
        if choice.isdigit() and 1 <= int(choice) <= len(candidates):
            product_id = candidates[int(choice) - 1]["id"]
            existing = db.query(UserCosmetic).filter(
                UserCosmetic.user_id == current_user.id,
                UserCosmetic.product_id == product_id,
                UserCosmetic.is_current == True
            ).first()
            if existing:
                ai_reply = "이미 사용 중인 화장품이에요!"
            else:
                # started_at: pending에서 꺼내서 없으면 오늘
                raw_started_at = pending.get("started_at")
                started_date = date_type.fromisoformat(raw_started_at) if raw_started_at else date_type.today()
                new_cos = UserCosmetic(
                    user_id=current_user.id,
                    product_id=product_id,
                    is_current=True,
                    started_at=started_date
                )
                db.add(new_cos)
                db.commit()
                date_label = f"{started_date}" if raw_started_at else "오늘"
                ai_reply = f"{candidates[int(choice)-1]['name']} 등록했어요! ({date_label}부터 사용) 😊"
            session.pending_data = None
            db.commit()
        else:
            ai_reply = f"1~{len(candidates)} 중에서 번호로 입력해주세요!"

    elif pending.get("waiting_for") == "medication_choice":
        choice_raw = request.content.strip()
        match = re.search(r'\d+', choice_raw)
        choice = match.group() if match else choice_raw
        candidates = pending.get("candidates", [])
        if choice.isdigit() and 1 <= int(choice) <= len(candidates):
            medication_id = candidates[int(choice) - 1]["id"]
            existing = db.query(UserMedication).filter(
                UserMedication.user_id == current_user.id,
                UserMedication.medication_id == medication_id,
                UserMedication.is_current == True
            ).first()
            if existing:
                ai_reply = "이미 복용 중인 약이에요!"
            else:
                raw_started_at = pending.get("started_at")
                started_date = date_type.fromisoformat(raw_started_at) if raw_started_at else date_type.today()
                new_med = UserMedication(
                    user_id=current_user.id,
                    medication_id=medication_id,
                    is_current=True,
                    started_at=started_date
                )
                db.add(new_med)
                db.commit()
                date_label = f"{started_date}" if raw_started_at else "오늘"
                ai_reply = f"{candidates[int(choice)-1]['name']} 등록했어요! ({date_label}부터 복용) 💊"
            session.pending_data = None
            db.commit()
        else:
            ai_reply = f"1~{len(candidates)} 중에서 번호로 입력해주세요!"

    elif intent == "diet_record":
        diet = ai_data.get("diet") or {}
        meal_type = diet.get("meal_type")
        items = diet.get("items", [])
        note = diet.get("note")

        if not meal_type:
            session.pending_data = {
                "action": "diet_record",
                "items": items,
                "note": note,
                "waiting_for": "meal_type"
            }
            db.commit()
        else:
            diet_items = [DietLogItemCreate(custom_food_name=name) for name in items]
            create_diet_log_service(
                db,
                user_id=current_user.id,
                meal_type=meal_type,
                input_method="manual",
                logged_at=datetime.now(),
                note=note,
                items=diet_items,
                captured_at=None,
                photo_url=None,
                captured_lat=None,
                captured_lng=None,
                captured_location_name=None,
            )
            session.pending_data = None
            db.commit()

    elif intent == "period_record":
        if current_user.gender != "여":
            ai_reply = "생리 기록은 여성 회원만 사용할 수 있어요."
        else:
            period = ai_data.get("period") or {}
            started_at = period.get("started_at")

            if not started_at:
                session.pending_data = {
                    "action": "period_record",
                    "waiting_for": "started_at"
                }
                db.commit()
            else:
                try:
                    started_date = date_type.fromisoformat(started_at)
                    existing = db.query(PeriodLog).filter(
                        PeriodLog.user_id == current_user.id,
                        PeriodLog.started_at == started_date
                    ).first()
                    if not existing:
                        new_log = PeriodLog(
                            user_id=current_user.id,
                            started_at=started_date
                        )
                        db.add(new_log)
                        db.commit()
                except ValueError:
                    ai_reply = "날짜 형식이 올바르지 않아요. YYYY-MM-DD 형식으로 입력해주세요!"

    elif intent == "cosmetic_record":
        cosmetic = ai_data.get("cosmetic") or {}
        query = cosmetic.get("query")
        started_at = cosmetic.get("started_at")
        if not query:
            ai_reply = "어떤 화장품을 등록할까요?"
        else:
            categories = ["스킨케어", "마스크팩", "클렌징", "선케어", "메이크업",
                        "헤어케어", "더모코스메틱", "에센스/세럼/앰플", "크림",
                        "스킨/토너", "선크림/선로션"]

            matched_category = next((c for c in categories if c in query), None)
            brand_query = query.replace(matched_category, "").strip() if matched_category else query

            # 1차 검색
            if matched_category and brand_query:
                results = db.query(CosmeticProduct).filter(
                    CosmeticProduct.category == matched_category,
                    CosmeticProduct.brand.like(f"%{brand_query}%")
                ).limit(5).all()
            elif matched_category:
                results = db.query(CosmeticProduct).filter(
                    CosmeticProduct.category == matched_category
                ).limit(5).all()
            else:
                results = db.query(CosmeticProduct).filter(
                    or_(
                        CosmeticProduct.product_name.like(f"%{query}%"),
                        CosmeticProduct.brand.like(f"%{query}%")
                    )
                ).limit(5).all()

            # 2차 검색: 브랜드만으로 재검색
            if not results and brand_query:
                results = db.query(CosmeticProduct).filter(
                    CosmeticProduct.brand.like(f"%{brand_query}%")
                ).limit(5).all()

            if not results:
                ai_reply = "상품을 찾을 수 없습니다."
            else:
                candidates = [{"id": r.id, "name": f"{r.brand} {r.product_name}"} for r in results]
                session.pending_data = {
                    "action": "cosmetic_record",
                    "candidates": candidates,
                    "started_at": started_at,
                    "waiting_for": "cosmetic_choice"
                }
                db.commit()
                list_text = "\n".join([f"{i+1}. {c['name']}" for i, c in enumerate(candidates)])
                ai_reply = f"아래 제품 중 맞는 번호를 입력해주세요!\n{list_text}"

    elif intent == "medication_record":
        try:
            medication = ai_data.get("medication") or {}
            query = medication.get("query")
            started_at = medication.get("started_at")
            if not query:
                ai_reply = "어떤 약을 등록할까요?"
            else:
                results = db.query(Medication).filter(
                    Medication.name.like(f"%{query}%")
                ).limit(5).all()
                if not results:
                    ai_reply = f"'{query}' 약을 찾을 수 없어요. 다른 이름으로 검색해보세요!"
                else:
                    candidates = [{"id": r.id, "name": r.name} for r in results]
                    session.pending_data = {
                        "action": "medication_record",
                        "candidates": candidates,
                        "started_at": started_at,
                        "waiting_for": "medication_choice"
                    }
                    db.commit()
                    list_text = "\n".join([f"{i+1}. {c['name']}" for i, c in enumerate(candidates)])
                    ai_reply = f"아래 약 중 맞는 번호를 입력해주세요!\n{list_text}"
        except Exception as e:
            logger.error(f"[chatbot] medication_record 오류: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # 7. AI 메시지 저장
    ai_msg = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=ai_reply
    )
    db.add(ai_msg)
    db.commit()
    db.refresh(ai_msg)

    return ai_msg
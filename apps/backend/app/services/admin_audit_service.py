from sqlalchemy.orm import Session
from app.models.admin_audit_log import AdminAuditLog
import json
from typing import Optional

def log_admin_action(
    db: Session,
    admin_user_id: int,
    action: str,
    target_type: str,
    target_id: Optional[str] = None,
    before_data: Optional[dict] = None,
    after_data: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
):
    """
    관리자 액션을 감사 로그에 기록합니다.
    (비동기 처리를 고려할 수 있으나 MVP 단계에서는 동기적으로 기록)
    """
    log = AdminAuditLog(
        admin_user_id=admin_user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        before_json=json.dumps(before_data, ensure_ascii=False) if before_data else None,
        after_json=json.dumps(after_data, ensure_ascii=False) if after_data else None,
        ip_address=ip_address,
        user_agent=user_agent
    )
    db.add(log)
    # 호출하는 곳에서 db.commit()을 수행하는 것을 권장하나, 단일 트랜잭션 분리를 위해 여기서 commit 할 수도 있습니다.
    # 안전성을 위해 flush만 하고 호출자에게 커밋을 위임합니다.
    db.flush()

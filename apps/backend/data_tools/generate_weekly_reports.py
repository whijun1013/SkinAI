import os
import sys
import logging
from datetime import datetime, timedelta

# Add backend to path so we can import app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.user import User
from app.models.skin_log import SkinLog
from app.services.analysis_orchestrator import run_analysis
from app.database import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("WeeklyReportScheduler")

def generate_periodic_reports():
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        # 최근 7일 내 기록이 있는 유저 조회 (활성 유저 기준)
        seven_days_ago = datetime.now() - timedelta(days=7)
        
        # 1. 7일 내 skin_log가 있는 유저 목록 추출
        active_users_logs = (
            db.query(SkinLog.user_id, SkinLog.id)
            .filter(SkinLog.logged_at >= seven_days_ago)
            .order_by(SkinLog.user_id, SkinLog.logged_at.desc())
            .all()
        )
        
        # 각 유저별 최신 skin_log_id 매핑
        user_latest_log = {}
        for user_id, log_id in active_users_logs:
            if user_id not in user_latest_log:
                user_latest_log[user_id] = log_id
                
        logger.info(f"대상 유저 총 {len(user_latest_log)}명 발견.")
        
        # 2. 각 유저별로 정기 리포트 생성 (run_analysis)
        for user_id, skin_log_id in user_latest_log.items():
            logger.info(f"유저 {user_id}의 정기 리포트 생성 (기준 skin_log_id: {skin_log_id})...")
            try:
                # concern_note에 '정기 리포트'라는 키워드를 달아 정기 분석임을 표시
                request = run_analysis(
                    db=db,
                    user_id=user_id,
                    skin_log_id=skin_log_id,
                    lookback_days=7,  # 주간 리포트이므로 7일 기준
                    concern_note="[시스템 자동 생성] 주간 피부 상태 요약 리포트"
                )
                logger.info(f"유저 {user_id} 분석 요청 완료. Request ID: {request.id}")
            except Exception as e:
                logger.error(f"유저 {user_id} 분석 요청 실패: {e}")
                
    finally:
        db.close()

if __name__ == "__main__":
    generate_periodic_reports()

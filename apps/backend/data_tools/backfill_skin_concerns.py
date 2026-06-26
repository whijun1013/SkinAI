"""
기존 유저 skin_concerns 백필 스크립트

raw_concern_text가 있지만 skin_concerns가 비어있는 유저에 대해
extract_and_save_concern_tags를 실행하여 skin_concerns를 채워준다.

사용법:
  python -m data_tools.backfill_skin_concerns          # 전체 실행
  python -m data_tools.backfill_skin_concerns --dry-run # 대상 확인만
"""
import sys
import os
import argparse

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal
from app.models.user import User
from app.services.concern_extractor import extract_and_save_concern_tags


def run_backfill(dry_run: bool = False):
    db = SessionLocal()
    try:
        all_with_text = (
            db.query(User)
            .filter(User.raw_concern_text.isnot(None), User.raw_concern_text != "")
            .all()
        )
        to_backfill = [u for u in all_with_text if not u.skin_concerns]
        already_filled = [u for u in all_with_text if u.skin_concerns]

        print(f"[백필 대상 분석]")
        print(f"  concern 텍스트 있는 유저: {len(all_with_text)}명")
        print(f"  이미 skin_concerns 있음: {len(already_filled)}명")
        print(f"  백필 필요: {len(to_backfill)}명")

        if not to_backfill:
            print("  → 백필할 유저가 없습니다.")
            return

        if dry_run:
            print("\n[DRY RUN] 실제로 저장하지 않습니다. 대상 목록:")
            for u in to_backfill:
                print(f"  user_id={u.id}  text='{(u.raw_concern_text or '')[:40]}...'")
            return

        print(f"\n[백필 시작] {len(to_backfill)}명 처리 중...")
        success = 0
        failed = 0
        for u in to_backfill:
            try:
                extract_and_save_concern_tags(db, u.id, u.raw_concern_text)
                db.refresh(u)
                tags = u.skin_concerns or []
                print(f"  ✓ user_id={u.id}  skin_concerns={tags}")
                success += 1
            except Exception as e:
                print(f"  ✗ user_id={u.id}  오류: {e}")
                failed += 1

        print(f"\n[완료] 성공: {success}명, 실패: {failed}명")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="skin_concerns 백필")
    parser.add_argument("--dry-run", action="store_true", help="대상 확인만 (저장 안 함)")
    args = parser.parse_args()
    run_backfill(dry_run=args.dry_run)

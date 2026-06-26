import argparse
import sys
import os
import getpass
from datetime import datetime

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from app.models.user import User, SocialAccount
from app.models.cosmetic import UserCosmetic
from app.models.medication import UserMedication
from app.auth.security import get_password_hash

def run():
    parser = argparse.ArgumentParser(description="Create an admin user.")
    parser.add_argument("--email", required=True, help="Admin email")
    parser.add_argument("--password", required=False, help="Admin password (will prompt if not provided)")
    parser.add_argument("--name", default="Admin", help="Admin name")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == args.email).first()
        if user:
            print(f"User with email {args.email} already exists.")
            if not user.is_admin:
                print("Setting is_admin=True...")
                user.is_admin = True
                db.commit()
                print("Privileges escalated to Admin successfully.")
            else:
                print("User is already an Admin. No changes made.")
            return 0

        password = args.password or os.getenv("ADMIN_PASSWORD")
        if not password:
            password = getpass.getpass(f"Enter password for new admin {args.email}: ")
            if not password:
                print("Password is required.")
                return 1

        print(f"Creating new admin user: {args.email}")
        new_admin = User(
            email=args.email,
            name=args.name,
            hashed_password=get_password_hash(password),
            is_admin=True,
            is_onboarded=True,
            terms_agreed_at=datetime.now()
        )
        db.add(new_admin)
        db.commit()
        print("Admin user created successfully.")
        return 0
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        return 1
    finally:
        db.close()

if __name__ == "__main__":
    sys.exit(run())

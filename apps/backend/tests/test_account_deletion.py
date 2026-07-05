import pytest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from app.routers.auth import delete_account
from app.models.user import User
from app.models.cosmetic import UserCosmetic
from app.models.medication import UserMedication
from app.models.diet import DietLog, DietLogItem
from app.models.environment import EnvironmentLog
from app.models.skin_log import SkinLog

def test_delete_account_mongo_cleanup():
    mock_user = User(id=1, push_token="test_token")
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.all.return_value = []
    
    mock_mongo_db = MagicMock()
    mock_collection = MagicMock()
    mock_collection.delete_many = AsyncMock(return_value=MagicMock(deleted_count=1))
    mock_mongo_db.__getitem__.return_value = mock_collection

    with patch("app.database.get_mongo_db", return_value=mock_mongo_db), \
         patch("app.routers.auth.delete_blobs"):
        result = asyncio.run(delete_account(current_user=mock_user, db=mock_db))
        
    assert result["message"] == "계정이 성공적으로 탈퇴 처리되었습니다."
    assert mock_collection.delete_many.call_count == 5 # 5 collections

def test_delete_account_mongo_cleanup_logs_failure(caplog):
    import logging
    mock_user = User(id=1)
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.all.return_value = []
    
    mock_mongo_db = MagicMock()
    mock_collection = MagicMock()
    mock_collection.delete_many = AsyncMock(side_effect=Exception("MongoDB error"))
    mock_mongo_db.__getitem__.return_value = mock_collection

    with patch("app.database.get_mongo_db", return_value=mock_mongo_db), \
         patch("app.routers.auth.delete_blobs"), \
         caplog.at_level(logging.ERROR):
        result = asyncio.run(delete_account(current_user=mock_user, db=mock_db))
        
    assert result["message"] == "계정이 성공적으로 탈퇴 처리되었습니다."
    assert "[delete_account] MongoDB deletion failed for user_id=1: MongoDB error" in caplog.text

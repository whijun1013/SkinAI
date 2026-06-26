import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.medgemma_queue_service import (
    claim_next_medgemma_analysis_task,
    enqueue_medgemma_analysis_task,
    get_medgemma_task_status,
    is_medgemma_queue_enabled,
    mark_medgemma_analysis_task_done,
    mark_medgemma_analysis_task_failed,
    requeue_stale_running_tasks,
    sanitize_medgemma_error,
)
from datetime import datetime, timedelta, timezone

class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, length=None):
        return self.docs

class FakeCollection:
    def __init__(self):
        self.docs = []
        self.next_id = 1

    async def find_one(self, query, projection=None, **kwargs):
        for doc in self.docs:
            match = True
            for k, v in query.items():
                if isinstance(v, dict) and "$in" in v:
                    if doc.get(k) not in v["$in"]:
                        match = False
                elif doc.get(k) != v:
                    match = False
            if match:
                if projection == {"_id": 1}:
                    return {"_id": doc["_id"]}
                return dict(doc)
        return None

    def find(self, query, projection=None, **kwargs):
        results = []
        for doc in self.docs:
            match = True
            for k, v in query.items():
                if isinstance(v, dict) and "$lt" in v:
                    if not doc.get(k) or doc.get(k) >= v["$lt"]:
                        match = False
                elif doc.get(k) != v:
                    match = False
            if match:
                results.append(dict(doc))
        return FakeCursor(results)

    async def insert_one(self, doc):
        doc = dict(doc)
        doc["_id"] = self.next_id
        self.next_id += 1
        self.docs.append(doc)
        return SimpleNamespace(inserted_id=doc["_id"])

    async def find_one_and_update(self, query, update, sort=None, return_document=None):
        candidates = [
            doc
            for doc in self.docs
            if doc.get("status") == query["status"]
            and doc.get("attempts", 0) < query["attempts"]["$lt"]
        ]
        if not candidates:
            return None
        doc = sorted(candidates, key=lambda item: item["created_at"])[0]
        doc.update(update.get("$set", {}))
        for key, value in update.get("$inc", {}).items():
            doc[key] = doc.get(key, 0) + value
        return dict(doc)

    async def update_one(self, query, update):
        for doc in self.docs:
            if doc["_id"] != query["_id"]:
                continue
            doc.update(update.get("$set", {}))
            for key in update.get("$unset", {}):
                doc.pop(key, None)
            return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)

    async def update_many(self, query, update):
        modified = 0
        for doc in self.docs:
            match = True
            for k, v in query.items():
                if isinstance(v, dict):
                    if "$in" in v and doc.get(k) not in v["$in"]:
                        match = False
                    if "$lt" in v and (not doc.get(k) or doc.get(k) >= v["$lt"]):
                        match = False
                elif doc.get(k) != v:
                    match = False
            
            if match:
                doc.update(update.get("$set", {}))
                for key in update.get("$unset", {}):
                    doc.pop(key, None)
                modified += 1
        return SimpleNamespace(modified_count=modified)

class FakeDb(dict):
    def __getitem__(self, item):
        if item not in self:
            self[item] = FakeCollection()
        return dict.__getitem__(self, item)

class TestMedGemmaQueueService(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = FakeDb()
        self.patch_db = patch("app.services.medgemma_queue_service.get_mongo_db", return_value=self.db)
        self.patch_db.start()

    def tearDown(self):
        self.patch_db.stop()

    async def test_enqueue_cancels_pending_task(self):
        first = await enqueue_medgemma_analysis_task(
            skin_log_id=10,
            user_id=1,
            image_url="https://example.com/a.jpg",
        )
        second = await enqueue_medgemma_analysis_task(
            skin_log_id=10,
            user_id=1,
            image_url="https://example.com/b.jpg",
        )
    
        self.assertNotEqual(first, second)
        first_doc = await self.db["medgemma_analysis_tasks"].find_one({"_id": int(first)})
        self.assertEqual(first_doc["status"], "cancelled")
        self.assertEqual(len(self.db["medgemma_analysis_tasks"].docs), 2)

    async def test_claim_marks_task_running_and_increments_attempts(self):
        await enqueue_medgemma_analysis_task(
            skin_log_id=10,
            user_id=1,
            image_url="https://example.com/a.jpg",
        )

        task = await claim_next_medgemma_analysis_task(worker_id="worker-1")

        self.assertIsNotNone(task)
        self.assertEqual(task["status"], "running")
        self.assertEqual(task["attempts"], 1)
        self.assertEqual(task["worker_id"], "worker-1")

    async def test_done_and_failed_update_status(self):
        task_id = await enqueue_medgemma_analysis_task(
            skin_log_id=10,
            user_id=1,
            image_url="https://example.com/a.jpg",
        )
        task_id = int(task_id)

        await mark_medgemma_analysis_task_done(
            task_id=task_id, 
            result={"source": "medgemma"}, 
            timings={"inference_ms": 100}, 
            metadata={"width": 1024}
        )
        doc = self.db["medgemma_analysis_tasks"].docs[0]
        self.assertEqual(doc["status"], "done")
        self.assertEqual(doc["result"]["source"], "medgemma")
        self.assertEqual(doc["timings"]["inference_ms"], 100)
        self.assertEqual(doc["metadata"]["width"], 1024)

        await mark_medgemma_analysis_task_failed(
            task_id=task_id, 
            error="Test runtime error", 
            retry=False, 
            error_code="TEST_ERROR",
            timings={"total_worker_ms": 50},
            metadata={"worker_id": "test"}
        )
        status_res = await get_medgemma_task_status(skin_log_id=10, user_id=1)
        self.assertEqual(status_res["status"], "failed")
        self.assertEqual(status_res["error"], "Test runtime error")
        self.assertEqual(status_res["error_code"], "TEST_ERROR")
        self.assertIn("관찰 분석 실패", status_res["message_for_user"])
        self.assertIn("finished_at", status_res)
        
        doc = self.db["medgemma_analysis_tasks"].docs[0]
        self.assertEqual(doc["timings"]["total_worker_ms"], 50)
        self.assertEqual(doc["metadata"]["worker_id"], "test")

    async def test_retry_failure_resets_worker(self):
        task_id = await enqueue_medgemma_analysis_task(
            skin_log_id=10,
            user_id=1,
            image_url="https://example.com/a.jpg",
        )
        task_id = int(task_id)

        await claim_next_medgemma_analysis_task(worker_id="worker-1")

        await mark_medgemma_analysis_task_failed(
            task_id=task_id,
            error="Transient error",
            retry=True,
            error_code="TRANSIENT",
        )
        doc = self.db["medgemma_analysis_tasks"].docs[0]
        self.assertEqual(doc["status"], "pending")
        self.assertNotIn("worker_id", doc)
        self.assertNotIn("started_at", doc)
        self.assertEqual(doc["last_error"], "Transient error")
        self.assertIn("last_failed_at", doc)

        status_res = await get_medgemma_task_status(skin_log_id=10, user_id=1)
        self.assertEqual(status_res["status"], "pending")
        self.assertNotIn("error", status_res)
        self.assertIn("재시도 대기", status_res["message_for_user"])

    async def test_failure_error_is_sanitized(self):
        task_id = await enqueue_medgemma_analysis_task(
            skin_log_id=10,
            user_id=1,
            image_url="https://example.com/a.jpg",
        )
        task_id = int(task_id)

        await mark_medgemma_analysis_task_failed(
            task_id=task_id,
            error=(
                "HTTPError: 403 Client Error for url: "
                "https://storage.example.com/blob.jpg?sig=secret&token=abc"
            ),
            retry=False,
            error_code="HTTP_403",
        )

        doc = self.db["medgemma_analysis_tasks"].docs[0]
        self.assertIn("[url omitted]", doc["error"])
        self.assertNotIn("sig=secret", doc["error"])

    async def test_sanitize_medgemma_error_redacts_tokens_and_uris(self):
        sanitized = sanitize_medgemma_error(
            "hf_abcd1234 failed mongodb+srv://user:pass@example.mongodb.net/db"
        )
        self.assertIn("[hf token omitted]", sanitized)
        self.assertIn("[mongo uri omitted]", sanitized)
        self.assertNotIn("abcd1234", sanitized)
        self.assertNotIn("user:pass", sanitized)

    @patch("app.services.medgemma_queue_service.get_mongo_db")
    async def test_stale_task_prevented(self, mock_get_db):
        mock_get_db.return_value = self.db
        
        task_id = await enqueue_medgemma_analysis_task(
            skin_log_id=10,
            user_id=1,
            image_url="https://example.com/a.jpg",
        )
        task_id = int(task_id)
        
        await mark_medgemma_analysis_task_failed(
            task_id=task_id,
            error="stale result: photo_url changed",
            retry=False,
            error_code="STALE_RESULT"
        )
        status_res = await get_medgemma_task_status(skin_log_id=10, user_id=1)
        self.assertEqual(status_res["status"], "failed")
        self.assertEqual(status_res["error_code"], "STALE_RESULT")

    async def test_queue_enabled_env_flag(self):
        with patch.dict(os.environ, {"MEDGEMMA_QUEUE_ENABLED": "true"}):
            self.assertTrue(is_medgemma_queue_enabled())
        with patch.dict(os.environ, {"MEDGEMMA_QUEUE_ENABLED": "false"}):
            self.assertFalse(is_medgemma_queue_enabled())

    @patch("app.services.medgemma_queue_service.get_skin_ai_result")
    async def test_get_medgemma_task_status(self, mock_get_skin_ai_result):
        mock_get_skin_ai_result.return_value = None
        status = await get_medgemma_task_status(skin_log_id=99, user_id=1)
        self.assertEqual(status["status"], "not_requested")

        mock_get_skin_ai_result.return_value = {
            "signals": {
                "redness": 5,
                "active_lesion": 0,
                "barrier": 0
            },
            "photo_quality": "pass",
            "confidence": 0.8,
            "raw_analysis": {
                "medgemma": {
                    "role": "primary_skin_visual_interpretation",
                    "primary_visual_summary": "Test primary summary",
                    "dominant_signals": ["redness"],
                    "limitations": ["lighting"],
                    "recommendation": "fallback_rec",
                    "confidence": "high",
                    "capture_quality": "good",
                    "summary_for_report_model": "fallback_summary",
                    "usable": True,
                    "observations": {"redness": {"level": "mild"}}
                }
            }
        }
        status = await get_medgemma_task_status(skin_log_id=99, user_id=1)
        self.assertEqual(status["status"], "done")
        self.assertIn("display_summary", status)
        self.assertIn("observations", status)
        self.assertIn("redness", status["observations"])
        
        task_id = await enqueue_medgemma_analysis_task(
            skin_log_id=99, user_id=1, image_url="http://x"
        )
        status = await get_medgemma_task_status(skin_log_id=99, user_id=1)
        self.assertEqual(status["status"], "pending")
        self.assertIn("requested_at", status)
        self.assertIn("attempts", status)
        self.assertNotIn("summary_for_report_model", status)

        await mark_medgemma_analysis_task_done(
            task_id=int(task_id),
            result={
                "role": "primary_skin_visual_interpretation",
                "primary_visual_summary": "Test primary summary 2",
                "dominant_signals": ["dryness"],
                "limitations": [],
                "recommendation": "use",
                "capture_quality": "good",
                "usable": True,
                "observations": {"redness": {"level": "mild"}}
            }
        )
        status = await get_medgemma_task_status(skin_log_id=99, user_id=1)
        self.assertEqual(status["status"], "done")
        self.assertIn("display_summary", status)

    async def test_cancelled_status_maintained(self):
        first = await enqueue_medgemma_analysis_task(
            skin_log_id=99, user_id=1, image_url="http://x"
        )
        second = await enqueue_medgemma_analysis_task(
            skin_log_id=99, user_id=1, image_url="http://y"
        )
        collection = self.db["medgemma_analysis_tasks"]
        first_doc = await collection.find_one({"_id": int(first)})
        self.assertEqual(first_doc["status"], "cancelled")

        collection.docs = [d for d in collection.docs if d["_id"] == int(first)]
        status = await get_medgemma_task_status(skin_log_id=99, user_id=1)
        self.assertEqual(status["status"], "cancelled")
        self.assertEqual(status["error"], "superseded by new request")

    async def test_requeue_stale_running_tasks(self):
        now = datetime.now(timezone.utc)
        self.db["medgemma_analysis_tasks"].docs.append({
            "_id": 100,
            "skin_log_id": 100,
            "status": "running",
            "updated_at": now - timedelta(minutes=61),
            "worker_id": "worker-stale"
        })
        self.db["medgemma_analysis_tasks"].docs.append({
            "_id": 101,
            "skin_log_id": 101,
            "status": "running",
            "updated_at": now - timedelta(minutes=10),
            "worker_id": "worker-fresh"
        })

        modified = await requeue_stale_running_tasks(timeout_minutes=60)
        self.assertEqual(modified, 1)

        docs = self.db["medgemma_analysis_tasks"].docs
        stale_doc = next(d for d in docs if d["_id"] == 100)
        fresh_doc = next(d for d in docs if d["_id"] == 101)

        self.assertEqual(stale_doc["status"], "pending")
        self.assertNotIn("worker_id", stale_doc)
        self.assertIn("stale_requeued_at", stale_doc)
        self.assertEqual(stale_doc["previous_worker_id"], "worker-stale")
        
        self.assertEqual(fresh_doc["status"], "running")
        self.assertEqual(fresh_doc["worker_id"], "worker-fresh")
        self.assertNotIn("stale_requeued_at", fresh_doc)

if __name__ == "__main__":
    unittest.main()

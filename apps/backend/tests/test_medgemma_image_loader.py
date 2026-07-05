import os
from unittest.mock import patch, MagicMock

import pytest

# Now import the worker function
from data_tools.vision_poc.worker.run_queue_worker import MedGemmaLocalRunner


@pytest.fixture
def runner():
    with patch.dict("sys.modules", {"torch": MagicMock(), "transformers": MagicMock()}), \
         patch("data_tools.vision_poc.worker.run_queue_worker.HF_TOKEN", "fake_token"), \
         patch("data_tools.vision_poc.worker.run_queue_worker.os.getenv") as mock_getenv, \
         patch("data_tools.vision_poc.worker.run_queue_worker.MODEL_NAME", "fake_model"):

        mock_getenv.side_effect = lambda k, d=None: "fake" if k in ("MONGO_URL", "MONGO_DB_NAME") else d

        # Patch the model loading parts that are called in __init__
        with patch("data_tools.vision_poc.worker.run_queue_worker.AutoProcessor", create=True), \
             patch("data_tools.vision_poc.worker.run_queue_worker.AutoModelForImageTextToText", create=True), \
             patch("data_tools.vision_poc.worker.run_queue_worker.json.dumps", return_value="{}"):
            return MedGemmaLocalRunner()


def test_load_image_http(runner):
    with patch("data_tools.vision_poc.worker.run_queue_worker.requests.get") as mock_get, \
         patch("data_tools.vision_poc.worker.run_queue_worker.Image.open") as mock_img_open, \
         patch("data_tools.vision_poc.worker.run_queue_worker.ImageOps.exif_transpose") as mock_transpose:

        mock_get.return_value.content = b"fake_image_data"
        mock_transpose.return_value.convert.return_value = "fake_image"

        image, size = runner._load_image("http://example.com/image.jpg")

        assert mock_get.called
        assert image == "fake_image"
        assert size == len(b"fake_image_data")


def test_load_image_static_relative(runner):
    with patch("data_tools.vision_poc.worker.run_queue_worker.requests.get") as mock_get, \
         patch("data_tools.vision_poc.worker.run_queue_worker.Image.open") as mock_img_open, \
         patch("data_tools.vision_poc.worker.run_queue_worker.ImageOps.exif_transpose") as mock_transpose, \
         patch("os.getenv", return_value="http://backend-api:8000"):

        mock_get.return_value.content = b"fake_static_data"
        mock_transpose.return_value.convert.return_value = "fake_static_image"

        image, size = runner._load_image("/static/skin-img/test.jpg")

        mock_get.assert_called_once_with("http://backend-api:8000/static/skin-img/test.jpg", headers={"User-Agent": "medgemma-queue-worker"}, timeout=60)
        assert image == "fake_static_image"
        assert size == len(b"fake_static_data")




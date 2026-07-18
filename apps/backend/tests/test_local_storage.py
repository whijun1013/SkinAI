import os
import shutil
from unittest import mock

import pytest
from app.services.blob_storage import (
    build_blob_url,
    normalize_blob_storage_url,
    sign_blob_read_url,
    upload_blob,
    delete_blob,
    blob_exists,
    read_blob_bytes,
)


@pytest.fixture
def temp_storage_root(tmp_path):
    # Mock LOCAL_STORAGE_ROOT
    with mock.patch("app.services.blob_storage.LOCAL_STORAGE_ROOT", str(tmp_path)):
        yield str(tmp_path)


def test_build_blob_url():
    url = build_blob_url("skin-img", "test.jpg")
    assert url == "/static/skin-img/test.jpg"


def test_normalize_blob_storage_url():
    # 1. Null
    assert normalize_blob_storage_url(None) is None
    
    # 2. Local url
    assert normalize_blob_storage_url("/static/skin-img/test.jpg") == "/static/skin-img/test.jpg"
    
    # 3. Azure legacy url (without SAS)
    azure_url = "https://myaccount.blob.core.windows.net/skin-img/test.jpg"
    assert normalize_blob_storage_url(azure_url) == "/static/skin-img/test.jpg"
    
    # 4. Azure legacy url (with SAS)
    azure_url_sas = "https://myaccount.blob.core.windows.net/skin-img/test.jpg?sv=2020-08-04&ss=b"
    assert normalize_blob_storage_url(azure_url_sas) == "/static/skin-img/test.jpg"


def test_sign_blob_read_url():
    url = sign_blob_read_url("https://myaccount.blob.core.windows.net/food-img/test.jpg")
    assert url == "/static/food-img/test.jpg"


def test_upload_and_delete_blob(temp_storage_root):
    container = "test-img"
    blob_name = "test_upload.txt"
    content = b"hello local storage"
    
    # Upload
    url = upload_blob(container, blob_name, content)
    assert url == f"/static/{container}/{blob_name}"
    
    local_path = os.path.join(temp_storage_root, container, blob_name)
    assert os.path.exists(local_path)
    
    with open(local_path, "rb") as f:
        assert f.read() == content
    assert blob_exists(url)
    assert read_blob_bytes(url) == content
        
        
    # Delete
    delete_blob(url)
    assert not os.path.exists(local_path)
    assert not blob_exists(url)
    assert read_blob_bytes(url) is None


def test_local_storage_rejects_paths_outside_configured_root(temp_storage_root, tmp_path):
    outside = tmp_path.parent / "outside-secret.txt"
    outside.write_bytes(b"secret")

    assert read_blob_bytes("/static/../outside-secret.txt") is None
    delete_blob("/static/../outside-secret.txt")
    assert outside.read_bytes() == b"secret"

import pytest
from app.services.blob_storage import get_storage_provider, LocalStorageProvider, S3StorageProvider
import os

def test_storage_provider_selection(monkeypatch):
    monkeypatch.setenv("STORAGE_PROVIDER", "local")
    provider = get_storage_provider()
    assert isinstance(provider, LocalStorageProvider)

    monkeypatch.setenv("STORAGE_PROVIDER", "s3")
    provider = get_storage_provider()
    assert isinstance(provider, S3StorageProvider)

    monkeypatch.setenv("STORAGE_PROVIDER", "r2")
    provider = get_storage_provider()
    assert isinstance(provider, S3StorageProvider)

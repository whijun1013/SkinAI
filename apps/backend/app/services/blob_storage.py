"""Blob storage provider facade.

Public helper names are kept stable for existing routers/services.
Provider selection uses STORAGE_PROVIDER=local|s3|r2.
"""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from pathlib import Path, PurePosixPath
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger("blob_storage")

LOCAL_STORAGE_ROOT = os.getenv("LOCAL_STORAGE_ROOT", "./uploads")
STORAGE_PROVIDER = os.getenv("STORAGE_PROVIDER", "local")
_s3_client = None


def _provider_name() -> str:
    return os.getenv("STORAGE_PROVIDER", STORAGE_PROVIDER).lower()


def _s3_bucket() -> str:
    if _provider_name() == "r2":
        return os.getenv("R2_BUCKET", "")
    return os.getenv("S3_BUCKET_NAME", "")


def _s3_public_base() -> str:
    if _provider_name() == "r2":
        return os.getenv("R2_PUBLIC_BASE_URL", "").rstrip("/")
    return os.getenv("S3_PUBLIC_BASE_URL", "").rstrip("/")


def _get_s3_client():
    global _s3_client
    if _s3_client is not None:
        return _s3_client

    import boto3

    provider = _provider_name()
    if provider == "r2":
        account_id = os.getenv("R2_ACCOUNT_ID")
        endpoint = f"https://{account_id}.r2.cloudflarestorage.com" if account_id else None
        access_key = os.getenv("R2_ACCESS_KEY_ID")
        secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        region = "auto"
    else:
        endpoint = os.getenv("S3_ENDPOINT_URL")
        access_key = os.getenv("S3_ACCESS_KEY_ID")
        secret_key = os.getenv("S3_SECRET_ACCESS_KEY")
        region = os.getenv("S3_REGION", "auto")

    if not all([access_key, secret_key, _s3_bucket()]):
        raise RuntimeError(f"{provider} provider selected but credentials or bucket name is not set.")

    _s3_client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
    )
    return _s3_client


def normalize_blob_storage_url(blob_url: Optional[str]) -> Optional[str]:
    if not blob_url:
        return blob_url

    if "blob.core.windows.net" in blob_url:
        parsed = urlparse(blob_url)
        return f"/static{parsed.path}"

    base = _s3_public_base()
    if base and blob_url.startswith(base):
        return blob_url.replace(base, "/static", 1)

    return blob_url


class StorageProviderInterface(ABC):
    @abstractmethod
    def build_url(self, container_name: str, blob_name: str) -> str:
        raise NotImplementedError

    @abstractmethod
    def upload(self, container_name: str, blob_name: str, file_content: bytes) -> str:
        raise NotImplementedError

    @abstractmethod
    def delete(self, blob_url: Optional[str]) -> bool:
        raise NotImplementedError

    @abstractmethod
    def sign_read_url(self, blob_url: Optional[str]) -> Optional[str]:
        raise NotImplementedError

    @abstractmethod
    def exists(self, blob_url: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    def read(self, blob_url: Optional[str]) -> Optional[bytes]:
        raise NotImplementedError


class LocalStorageProvider(StorageProviderInterface):
    @property
    def root(self) -> str:
        return os.getenv("LOCAL_STORAGE_ROOT", LOCAL_STORAGE_ROOT)

    def _local_path(self, blob_url: Optional[str]) -> Optional[str]:
        blob_url = normalize_blob_storage_url(blob_url) or ""
        if not blob_url.startswith("/static/"):
            return None
        root = Path(self.root).resolve()
        candidate = (root / blob_url[len("/static/"):].replace("/", os.sep)).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            return None
        return str(candidate)

    def build_url(self, container_name: str, blob_name: str) -> str:
        return f"/static/{container_name}/{blob_name}"

    def upload(self, container_name: str, blob_name: str, file_content: bytes) -> str:
        local_path = os.path.join(self.root, container_name, blob_name)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as file:
            file.write(file_content)
        return self.build_url(container_name, blob_name)

    def delete(self, blob_url: Optional[str]) -> bool:
        local_path = self._local_path(blob_url)
        if not local_path or not os.path.exists(local_path):
            return False
        try:
            os.remove(local_path)
            logger.info("Local file deleted path=%s", local_path)
            return True
        except Exception as exc:
            logger.warning("Local file deletion failed path=%s err=%s", local_path, exc)
            return False

    def sign_read_url(self, blob_url: Optional[str]) -> Optional[str]:
        return normalize_blob_storage_url(blob_url)

    def exists(self, blob_url: str) -> bool:
        local_path = self._local_path(blob_url)
        return bool(local_path and os.path.exists(local_path))

    def read(self, blob_url: Optional[str]) -> Optional[bytes]:
        local_path = self._local_path(blob_url)
        if not local_path or not os.path.exists(local_path):
            return None
        try:
            with open(local_path, "rb") as file:
                return file.read()
        except Exception as exc:
            logger.warning("Local read failed path=%s err=%s", local_path, exc)
            return None


class S3StorageProvider(StorageProviderInterface):
    def _key(self, blob_url: Optional[str]) -> Optional[str]:
        blob_url = normalize_blob_storage_url(blob_url) or ""
        blob_url = blob_url.split("?", 1)[0]
        if not blob_url.startswith("/static/"):
            return None
        key = blob_url[len("/static/"):]
        path = PurePosixPath(key)
        if not key or path.is_absolute() or ".." in path.parts:
            return None
        return str(path)

    def build_url(self, container_name: str, blob_name: str) -> str:
        base = _s3_public_base()
        if base:
            return f"{base}/{container_name}/{blob_name}"
        return f"/static/{container_name}/{blob_name}"

    def upload(self, container_name: str, blob_name: str, file_content: bytes) -> str:
        key = f"{container_name}/{blob_name}"
        client = _get_s3_client()
        kwargs = {"Bucket": _s3_bucket(), "Key": key, "Body": file_content}
        if _provider_name() == "s3":
            kwargs["ACL"] = "private"
        client.put_object(**kwargs)
        logger.info("S3 object uploaded key=%s", key)
        return self.build_url(container_name, blob_name)

    def delete(self, blob_url: Optional[str]) -> bool:
        key = self._key(blob_url)
        if not key:
            return False
        try:
            _get_s3_client().delete_object(Bucket=_s3_bucket(), Key=key)
            logger.info("S3 object deleted key=%s", key)
            return True
        except Exception as exc:
            logger.warning("S3 deletion failed key=%s err=%s", key, exc)
            return False

    def sign_read_url(self, blob_url: Optional[str]) -> Optional[str]:
        # Convert /static/container/blob URLs into short-lived S3 presigned URLs.
        key = self._key(blob_url)
        if not key:
            return normalize_blob_storage_url(blob_url)
        try:
            return _get_s3_client().generate_presigned_url(
                "get_object",
                Params={"Bucket": _s3_bucket(), "Key": key},
                ExpiresIn=900,
            )
        except Exception as exc:
            logger.warning("S3 presigned URL failed key=%s err=%s", key, exc)
            return normalize_blob_storage_url(blob_url)

    def exists(self, blob_url: str) -> bool:
        key = self._key(blob_url)
        if not key:
            return False
        try:
            _get_s3_client().head_object(Bucket=_s3_bucket(), Key=key)
            return True
        except Exception:
            return False

    def read(self, blob_url: Optional[str]) -> Optional[bytes]:
        key = self._key(blob_url)
        if not key:
            return None
        try:
            response = _get_s3_client().get_object(Bucket=_s3_bucket(), Key=key)
            return response["Body"].read()
        except Exception as exc:
            logger.warning("S3 read failed key=%s err=%s", key, exc)
            return None


def get_storage_provider() -> StorageProviderInterface:
    if _provider_name() in {"s3", "r2"}:
        return S3StorageProvider()
    return LocalStorageProvider()


def build_blob_url(container_name: str, blob_name: str) -> str:
    return get_storage_provider().build_url(container_name, blob_name)


def upload_blob(container_name: str, blob_name: str, file_content: bytes) -> str:
    return get_storage_provider().upload(container_name, blob_name, file_content)


def delete_blob(blob_url: Optional[str]) -> None:
    get_storage_provider().delete(blob_url)


def delete_blobs(blob_urls: list[Optional[str]]) -> None:
    provider = get_storage_provider()
    for url in blob_urls:
        if not url:
            continue
        try:
            provider.delete(url)
        except Exception as exc:
            parsed = urlparse(url)
            safe_url = parsed.path or url.split("?", 1)[0]
            logger.error("Failed to delete blob path %s: %s", safe_url, exc)


def sign_blob_read_url(blob_url: Optional[str]) -> Optional[str]:
    return get_storage_provider().sign_read_url(blob_url)


def blob_exists(blob_url: str) -> bool:
    return get_storage_provider().exists(blob_url)


def read_blob_bytes(blob_url: Optional[str]) -> Optional[bytes]:
    return get_storage_provider().read(blob_url)

import logging
import os
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import unquote, urlparse

logger = logging.getLogger("blob_storage")

class StorageProvider(ABC):
    @abstractmethod
    def build_blob_url(self, container_name: str, blob_name: str) -> str:
        pass

    @abstractmethod
    def normalize_blob_storage_url(self, blob_url: Optional[str]) -> Optional[str]:
        pass

    @abstractmethod
    def sign_blob_read_url(self, blob_url: Optional[str], *, expiry_hours: int = 24) -> Optional[str]:
        pass

    @abstractmethod
    def delete_blob(self, blob_url: Optional[str]) -> None:
        pass

    def delete_blobs(self, blob_urls: list[Optional[str]]) -> None:
        for url in blob_urls:
            self.delete_blob(url)

class AzureBlobProvider(StorageProvider):
    def __init__(self):
        self.connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        self.account_name = os.getenv("AZURE_STORAGE_ACCOUNT_NAME")
        self.account_key = None
        self.blob_service_client = None
        self.blob_available = False

        try:
            from azure.storage.blob import BlobServiceClient, BlobSasPermissions, generate_blob_sas
            self.blob_available = True
            self.generate_blob_sas = generate_blob_sas
            self.BlobSasPermissions = BlobSasPermissions
        except ImportError:
            pass

        if self.connection_string:
            self._parse_connection_string()
            if self.blob_available:
                from azure.storage.blob import BlobServiceClient
                self.blob_service_client = BlobServiceClient.from_connection_string(self.connection_string)

    def _parse_connection_string(self) -> None:
        for part in self.connection_string.split(";"):
            if part.startswith("AccountName="):
                self.account_name = part.split("=", 1)[1]
            elif part.startswith("AccountKey="):
                self.account_key = part.split("=", 1)[1]

    def build_blob_url(self, container_name: str, blob_name: str) -> str:
        if not self.account_name:
            raise ValueError("AZURE_STORAGE_ACCOUNT_NAME이 설정되지 않았습니다.")
        return f"https://{self.account_name}.blob.core.windows.net/{container_name}/{blob_name}"

    def normalize_blob_storage_url(self, blob_url: Optional[str]) -> Optional[str]:
        if not blob_url:
            return blob_url
        if "?" in blob_url and "blob.core.windows.net" in blob_url:
            return blob_url.split("?", 1)[0]
        return blob_url

    def sign_blob_read_url(self, blob_url: Optional[str], *, expiry_hours: int = 24) -> Optional[str]:
        blob_url = self.normalize_blob_storage_url(blob_url)
        if not blob_url or "blob.core.windows.net" not in blob_url:
            return blob_url

        if not self.blob_available or not self.account_name or not self.account_key:
            logger.warning("Blob SAS 생성 불가: storage account 설정 누락")
            return blob_url

        try:
            parsed = urlparse(blob_url)
            path_parts = parsed.path.lstrip("/").split("/", 1)
            if len(path_parts) != 2:
                return blob_url

            container_name, blob_name = path_parts[0], unquote(path_parts[1])
            sas_token = self.generate_blob_sas(
                account_name=self.account_name,
                container_name=container_name,
                blob_name=blob_name,
                account_key=self.account_key,
                permission=self.BlobSasPermissions(read=True),
                expiry=datetime.now(timezone.utc) + timedelta(hours=expiry_hours),
            )
            return f"{blob_url}?{sas_token}"
        except Exception as exc:
            logger.warning("Blob SAS 생성 실패 url=%s err=%s", blob_url[:80], exc)
            return blob_url

    def delete_blob(self, blob_url: Optional[str]) -> None:
        blob_url = self.normalize_blob_storage_url(blob_url)
        if not blob_url or "blob.core.windows.net" not in blob_url:
            return
        if not self.blob_available or not self.blob_service_client:
            logger.warning("Blob 삭제 불가: SDK 미초기화 url=%s", blob_url[:80])
            return
        try:
            parsed = urlparse(blob_url)
            path_parts = parsed.path.lstrip("/").split("/", 1)
            if len(path_parts) != 2:
                return
            container_name, blob_name = path_parts[0], unquote(path_parts[1])
            self.blob_service_client.get_blob_client(
                container=container_name, blob=blob_name
            ).delete_blob(delete_snapshots="include")
            logger.info("Blob 삭제 완료 container=%s blob=%s", container_name, blob_name)
        except Exception as exc:
            logger.warning("Blob 삭제 실패 url=%s err=%s", blob_url[:80], exc)

class S3BlobProvider(StorageProvider):
    def __init__(self):
        self.bucket = os.getenv("S3_BUCKET_NAME")
        # TODO: Implement S3 logic

    def build_blob_url(self, container_name: str, blob_name: str) -> str:
        raise NotImplementedError("S3 provider is not implemented yet.")

    def normalize_blob_storage_url(self, blob_url: Optional[str]) -> Optional[str]:
        raise NotImplementedError("S3 provider is not implemented yet.")

    def sign_blob_read_url(self, blob_url: Optional[str], *, expiry_hours: int = 24) -> Optional[str]:
        raise NotImplementedError("S3 provider is not implemented yet.")

    def delete_blob(self, blob_url: Optional[str]) -> None:
        raise NotImplementedError("S3 provider is not implemented yet.")

# Global default provider
_provider_name = os.getenv("STORAGE_PROVIDER", "azure").lower()
if _provider_name == "s3":
    _provider: StorageProvider = S3BlobProvider()
else:
    _provider: StorageProvider = AzureBlobProvider()

def build_blob_url(container_name: str, blob_name: str) -> str:
    return _provider.build_blob_url(container_name, blob_name)

def normalize_blob_storage_url(blob_url: Optional[str]) -> Optional[str]:
    return _provider.normalize_blob_storage_url(blob_url)

def sign_blob_read_url(blob_url: Optional[str], *, expiry_hours: int = 24) -> Optional[str]:
    return _provider.sign_blob_read_url(blob_url, expiry_hours=expiry_hours)

def delete_blob(blob_url: Optional[str]) -> None:
    _provider.delete_blob(blob_url)

def delete_blobs(blob_urls: list[Optional[str]]) -> None:
    _provider.delete_blobs(blob_urls)

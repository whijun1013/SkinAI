from abc import ABC, abstractmethod
from typing import List, Optional
from pydantic import BaseModel

class ParsedCosmeticProduct(BaseModel):
    source: str                 # e.g., 'retailer_a'
    source_product_id: str      # e.g., 'A0000000123'
    brand: str
    product_name: str
    normalized_name: str        # e.g., Lowercased and stripped of special chars
    ingredients: Optional[str] = None  # Raw ingredient string
    category: Optional[str] = None
    product_url: Optional[str] = None
    status: str = "active"      # 'active', 'discontinued', etc.

class BaseCrawlerAdapter(ABC):
    
    @abstractmethod
    def fetch_product_list(self, category: str, page: int) -> List[dict]:
        """Fetches a list of products from the target source."""
        pass
        
    @abstractmethod
    def parse_product_detail(self, raw_data: str) -> ParsedCosmeticProduct:
        """Parses the raw HTML or JSON data into a standardized ParsedCosmeticProduct."""
        pass

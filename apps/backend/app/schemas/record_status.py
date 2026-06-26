from typing import Dict, Literal
from pydantic import BaseModel

RecordStatus = Literal["complete", "partial", "none"]


class MonthRecordStatusResponse(BaseModel):
    year: int
    month: int
    dates: Dict[str, RecordStatus]

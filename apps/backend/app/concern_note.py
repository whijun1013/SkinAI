MAX_CONCERN_NOTE_LENGTH = 100


def normalize_concern_note(value: str | None) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("concern_note must be a string")
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > MAX_CONCERN_NOTE_LENGTH:
        raise ValueError(
            f"concern_note must be at most {MAX_CONCERN_NOTE_LENGTH} characters"
        )
    return normalized

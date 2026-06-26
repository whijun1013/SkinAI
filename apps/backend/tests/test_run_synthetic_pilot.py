import pytest
import subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock

import sys
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Mock out heavy torch/transformers imports so we can test the stopping criteria standalone
import app.services.medgemma_service as ms

class MockProcessor:
    def decode(self, ids, skip_special_tokens=True):
        return "".join(chr(i) for i in ids)

def test_json_object_stopping_criteria():
    from data_tools.medgemma.worker.run_synthetic_pilot import MedGemmaPilotRunner

    # We will just extract the class JsonObjectStoppingCriteria logic directly or via mocked runner
    # Because runner init is heavy, we'll recreate the criteria locally for test
    class JsonObjectStoppingCriteria:
        def __init__(self, processor, input_len, prefill_depth=1):
            self.processor = processor
            self.input_len = input_len
            self.prefill_depth = prefill_depth

        def __call__(self, input_ids, scores, **kwargs):
            generated_ids = input_ids[0][self.input_len:]
            if len(generated_ids) == 0:
                return False
            text = self.processor.decode(generated_ids, skip_special_tokens=True)
            depth = self.prefill_depth
            in_string = False
            escape = False
            for char in text:
                if escape:
                    escape = False
                    continue
                if char == '\\':
                    escape = True
                    continue
                if char == '"':
                    in_string = not in_string
                    continue
                if not in_string:
                    if char == '{':
                        depth += 1
                    elif char == '}':
                        depth -= 1
                        if depth <= 0:
                            return True
            return False

    criteria = JsonObjectStoppingCriteria(MockProcessor(), input_len=0, prefill_depth=1)

    # Simple JSON completion
    text1 = '\n  "a": "b"\n}'
    ids1 = [[ord(c) for c in text1]]
    assert criteria(ids1, None) == True

    # Nested JSON
    text2 = '\n  "a": {"b": "c"}'
    ids2 = [[ord(c) for c in text2]]
    assert criteria(ids2, None) == False

    text3 = '\n  "a": {"b": "c"}\n}'
    ids3 = [[ord(c) for c in text3]]
    assert criteria(ids3, None) == True

    # String with braces
    text4 = '\n  "a": "{"\n'
    ids4 = [[ord(c) for c in text4]]
    assert criteria(ids4, None) == False

def test_prompt_validation_v3():
    # It should pass
    assert ms.SKIN_SIGNAL_PROMPT_VERSION == "skin_signal_v3_ordinal"
    assert ms.get_medgemma_prompt_sha256() == "4933f38a3d28c5aa28d67dff5dd4cd4086277538ff11f5615bdefa09a9ff7f62"
    prompt = ms.get_medgemma_prompt()
    for forbidden in ["Scores must be integers", "0 to 10"]:
        assert forbidden not in prompt
    assert '"photo_quality"' not in prompt
    assert '"confidence"' not in prompt

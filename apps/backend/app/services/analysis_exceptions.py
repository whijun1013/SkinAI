class AnalysisError(Exception):
    pass


class SkinLogNotFoundError(AnalysisError):
    pass


class DuplicateAnalysisRequestError(AnalysisError):
    pass


class InsufficientSkinLogError(AnalysisError):
    pass


class ReanalysisLockedError(AnalysisError):
    pass


class AnalysisContextError(AnalysisError):
    pass


class AnalysisLLMError(AnalysisError):
    pass


class AnalysisLLMResponseError(AnalysisLLMError):
    pass


class SkinTendencyLLMError(AnalysisError):
    pass


class SkinTendencyLLMResponseError(SkinTendencyLLMError):
    pass

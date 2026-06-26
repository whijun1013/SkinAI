import { REANALYSIS_COOLDOWN_DAYS, REQUIRED_SKIN_LOG_DAYS, getAnalysisBasisLabel } from "./reportUtils";

// ─── 상태 머신 ───────────────────────────────────────────────────────────────
export const getReportState = ({
  loading,
  isCreatingAnalysis,
  inProgressAnalysis,
  recentSkinLogDays,
  completedAnalysis,
  analysisIsStale,
  analysisLocked,
  failedAnalysis,
  failedAnalysisIsLatest,
  analysisReady,
}) => {
  if (loading) return "loading";
  if (isCreatingAnalysis || inProgressAnalysis) return "creating";
  if (recentSkinLogDays === 0) return "no_record";
  if (failedAnalysis && failedAnalysisIsLatest) return "failed";
  if (completedAnalysis && analysisIsStale && analysisLocked) return "locked";
  if (completedAnalysis && analysisIsStale) return "stale";
  if (completedAnalysis) return "complete";
  if (failedAnalysis) return "failed";
  if (analysisReady) return "ready";
  return "insufficient";
};

// ─── 카피 함수 ───────────────────────────────────────────────────────────────
export const getReportCopy = ({ state, actualDays, remainingDays, hasCompletedAnalysis, newScoredDaysAfterLastAnalysis = 0, lastContributingFactors = [] }) => {
  if (state === "loading") {
    return {
      title: "최근 흐름을 확인하고 있어요",
      description: "기록과 피부 리포트를 불러오는 중이에요.",
      insightTitle: "기록을 확인하고 있어요",
      insightDescription: "잠시만 기다려 주세요.",
      badge: "",
      primaryCta: "",
    };
  }
  if (state === "creating") {
    return {
      title: "피부 리포트를 만들고 있어요",
      description: "최근 기록을 바탕으로 흐름을 정리하고 있어요.",
      insightTitle: "정리하고 있어요",
      insightDescription: "완료되면 결과를 확인할 수 있어요.",
      badge: "진행 중",
      primaryCta: "진행 상황 확인하기",
    };
  }
  if (state === "no_record") {
    return {
      title: "오늘부터 피부 흐름을 기록해볼까요?",
      description: "최근 기록이 아직 없어요.",
      insightTitle: "피부 리포트 준비 전",
      insightDescription: "피부 기록이 쌓이면 최근 흐름을 정리할 수 있어요.",
      badge: "기록 필요",
      primaryCta: "오늘 기록하기",
    };
  }
  if (state === "locked") {
    const remainingLockDays = Math.max(REANALYSIS_COOLDOWN_DAYS - newScoredDaysAfterLastAnalysis, 0);
    const factors = Array.isArray(lastContributingFactors) ? lastContributingFactors : [];
    const factorLabel =
      factors.length >= 2
        ? `'${factors[0]}'·'${factors[1]}'`
        : factors.length === 1
          ? `'${factors[0]}'`
          : null;
    const description = factorLabel
      ? `지난 리포트에서 ${factorLabel} 흐름이 보였어요. ${remainingLockDays}일 더 기록하면 이번에도 반복됐는지 확인할 수 있어요.`
      : `새 기록이 ${newScoredDaysAfterLastAnalysis}일 추가됐어요. ${remainingLockDays}일 더 기록하면 새 리포트를 만들 수 있어요.`;
    return {
      title: "기록을 이어가고 있어요",
      description,
      insightTitle: `${newScoredDaysAfterLastAnalysis}/${REANALYSIS_COOLDOWN_DAYS}일 새 기록`,
      insightDescription: factorLabel
        ? `${factorLabel} 패턴이 다시 나타나는지 ${remainingLockDays}일 후 확인해봐요.`
        : `${remainingLockDays}일 더 기록이 쌓이면 새 리포트를 만들 수 있어요.`,
      badge: `${newScoredDaysAfterLastAnalysis}/${REANALYSIS_COOLDOWN_DAYS}일`,
      primaryCta: "최근 결과 보기",
    };
  }
  if (state === "stale") {
    return {
      title: "새 기록이 추가됐어요",
      description: "최신 기록으로 피부 리포트를 다시 만들 수 있어요.",
      insightTitle: "기존 리포트는 이전 기록을 바탕으로 만들었어요",
      insightDescription: "기존 결과를 보거나 최신 기록 기준으로 다시 만들 수 있어요.",
      badge: "업데이트 가능",
      primaryCta: "피부 리포트 다시 만들기",
      secondaryCta: hasCompletedAnalysis ? "최근 결과 보기" : "",
    };
  }
  if (state === "complete") {
    return {
      title: "최신 기록으로 본 피부 이야기",
      description: "최근 기록에서 함께 보인 흐름을 확인해보세요.",
      insightTitle: "피부 리포트가 준비됐어요",
      insightDescription: "최신 기록을 바탕으로 만든 리포트예요.",
      badge: "최신",
      primaryCta: "결과 보기",
    };
  }
  if (state === "failed") {
    return {
      title: hasCompletedAnalysis
        ? "피부 리포트를 다시 만들지 못했어요"
        : "피부 리포트를 만들지 못했어요",
      description: hasCompletedAnalysis
        ? "기존 리포트는 계속 확인할 수 있어요."
        : "다시 시도해볼 수 있어요.",
      insightTitle: "리포트를 만들지 못했어요",
      insightDescription: hasCompletedAnalysis
        ? "다시 시도하거나 기존 결과를 확인해보세요."
        : "네트워크 상태를 확인한 뒤 다시 시도해보세요.",
      badge: "확인 필요",
      primaryCta: "다시 시도하기",
      secondaryCta: hasCompletedAnalysis ? "최근 결과 보기" : "",
    };
  }
  if (state === "ready") {
    return {
      title: "피부 리포트를 만들 수 있어요",
      description: "최근 흐름을 정리할 만큼 기록이 쌓였어요.",
      insightTitle: "리포트 준비 완료",
      insightDescription: "최근 기록을 바탕으로 함께 보인 흐름을 정리해드려요.",
      badge: "준비 완료",
      primaryCta: "피부 리포트 만들기",
    };
  }
  return {
    title: "피부 리포트를 준비하고 있어요",
    description: `최근 14일 중 ${actualDays}일 기록했어요. ${remainingDays}일만 더 기록하면 피부 리포트를 만들 수 있어요.`,
    insightTitle: "조금 더 기록이 필요해요",
    insightDescription: "기록을 이어가면 최근 흐름을 정리할 수 있어요.",
    badge: `${remainingDays}일 더`,
    primaryCta: "이 날짜 기록하기",
  };
};

export const getInsightActionCopy = ({ state, reportCopy, completedAnalysis, hasCompletedAnalysis }) => {
  const analysisBasisLabel = completedAnalysis ? getAnalysisBasisLabel(completedAnalysis) : "";

  if (state === "complete") {
    return {
      icon: "document-text-outline",
      title: analysisBasisLabel ? `${analysisBasisLabel} 리포트` : "최근 리포트",
      description: "이후 새 기록이 없어 계속 확인할 수 있어요.",
    };
  }
  if (state === "locked") {
    return {
      icon: "lock-closed-outline",
      title: analysisBasisLabel ? `${analysisBasisLabel} 리포트` : "최근 리포트",
      description: "새 기록이 7일 쌓이면 새 리포트를 만들 수 있어요.",
    };
  }
  if (state === "stale") {
    return {
      icon: "refresh-outline",
      title: "새 기록이 추가됐어요",
      description: analysisBasisLabel
        ? `기존 리포트는 ${analysisBasisLabel}이에요.`
        : "기존 리포트는 이전 기록을 바탕으로 만들었어요.",
    };
  }
  if (state === "failed" && hasCompletedAnalysis) {
    return {
      icon: "alert-circle-outline",
      title: "다시 만들기가 완료되지 않았어요",
      description: analysisBasisLabel
        ? `${analysisBasisLabel} 리포트는 계속 확인할 수 있어요.`
        : "기존 리포트는 계속 확인할 수 있어요.",
    };
  }
  if (state === "ready") {
    return {
      icon: "sparkles-outline",
      title: "피부 리포트를 만들 수 있어요",
      description: "최근 기록을 바탕으로 흐름을 정리해드려요.",
    };
  }
  if (state === "creating") {
    return {
      icon: "time-outline",
      title: "피부 리포트를 만들고 있어요",
      description: "완료되면 결과를 확인할 수 있어요.",
    };
  }
  if (state === "failed") {
    return {
      icon: "alert-circle-outline",
      title: "피부 리포트를 만들지 못했어요",
      description: "다시 시도해볼 수 있어요.",
    };
  }
  if (state === "no_record" || state === "insufficient") {
    return {
      icon: "create-outline",
      title: reportCopy.insightTitle,
      description: reportCopy.insightDescription,
    };
  }
  return {
    icon: "leaf-outline",
    title: reportCopy.insightTitle,
    description: reportCopy.insightDescription,
  };
};

export const getBaseDateRecordCopy = ({ isBaseToday, hasRecord }) => {
  if (isBaseToday && hasRecord) {
    return {
      title: "오늘 기록도 담겼어요",
      description: "오늘 저장한 기록까지 함께 살펴봤어요.",
    };
  }
  if (isBaseToday) {
    return {
      title: "오늘 기록은 아직 없어요",
      description: "오늘 기록을 남기면 다음 리포트에 함께 담겨요.",
    };
  }
  if (hasRecord) {
    return {
      title: "선택한 날짜의 기록도 담겼어요",
      description: "선택한 날짜의 기록까지 함께 살펴봤어요.",
    };
  }
  return {
    title: "선택한 날짜 기록은 아직 없어요",
    description: "이 날짜의 기록을 남기면 다음 리포트에 함께 담겨요.",
  };
};

export const getRecordFlowCopy = ({ actualDays, analyzableDays, remainingDays }) => {
  if (actualDays === 0) {
    return {
      title: "최근 기록이 아직 없어요",
      description: "기록을 시작하면 이곳에 최근 흐름이 표시돼요.",
    };
  }
  if (analyzableDays < REQUIRED_SKIN_LOG_DAYS) {
    return {
      title: `최근 14일 중 ${actualDays}일 기록했어요`,
      description: `${remainingDays}일만 더 기록하면 피부 리포트를 만들 수 있어요.`,
    };
  }
  if (actualDays >= 14) {
    return {
      title: "기록 흐름이 꾸준히 이어지고 있어요",
      description: "최근 기록이 충분히 쌓였어요.",
    };
  }
  if (actualDays >= 11) {
    return {
      title: "최근 기록이 충분히 쌓였어요",
      description: "새로 남긴 기록까지 빠짐없이 함께 살펴볼게요.",
    };
  }
  return {
    title: "최근 흐름을 정리할 만큼 기록이 쌓였어요",
    description: "피부 리포트를 만들 만큼 기록이 쌓였어요.",
  };
};

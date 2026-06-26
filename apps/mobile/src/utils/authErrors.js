export const AUTH_ERROR_CODES = {
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  EMAIL_REGISTERED_WITH_SOCIAL: "EMAIL_REGISTERED_WITH_SOCIAL",
  PASSWORD_TOO_SHORT: "PASSWORD_TOO_SHORT",
  PASSWORD_TOO_LONG: "PASSWORD_TOO_LONG",
  NETWORK_ERROR: "NETWORK_ERROR",
  UNKNOWN: "UNKNOWN",
};

const SOCIAL_PROVIDER_LABELS = {
  google: "구글",
  kakao: "카카오",
  naver: "네이버",
};

function normalizeDetail(detail) {
  if (!detail) return null;
  if (typeof detail === "string") {
    return { code: null, message: detail };
  }
  if (typeof detail === "object" && detail.code && detail.message) {
    return {
      code: detail.code,
      message: detail.message,
      provider: detail.provider ?? null,
    };
  }
  if (Array.isArray(detail) && detail[0]?.msg) {
    return { code: null, message: detail[0].msg };
  }
  return null;
}

export function parseAuthApiError(error, fallbackMessage = "요청에 실패했습니다") {
  if (!error?.response) {
    return {
      code: AUTH_ERROR_CODES.NETWORK_ERROR,
      message: "서버에 연결할 수 없습니다. 앱 설정의 서버 주소를 확인해 주세요.",
      provider: null,
    };
  }

  const parsed = normalizeDetail(error.response?.data?.detail);
  if (parsed) {
    return {
      code: parsed.code ?? AUTH_ERROR_CODES.UNKNOWN,
      message: parsed.message,
      provider: parsed.provider ?? null,
    };
  }

  return {
    code: AUTH_ERROR_CODES.UNKNOWN,
    message: fallbackMessage,
    provider: null,
  };
}

export function getRegisterErrorMessage({ code, message, provider }) {
  switch (code) {
    case AUTH_ERROR_CODES.EMAIL_REGISTERED_WITH_SOCIAL: {
      const label = SOCIAL_PROVIDER_LABELS[provider] ?? "소셜";
      return `${label} 계정으로 가입된 이메일입니다.\n${label} 로그인으로 이용해 주세요.`;
    }
    case AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS:
      return "이미 사용 중인 이메일입니다.";
    case AUTH_ERROR_CODES.PASSWORD_TOO_SHORT:
      return "비밀번호는 최소 8자 이상 입력해 주세요.";
    case AUTH_ERROR_CODES.PASSWORD_TOO_LONG:
      return "비밀번호는 최대 72자까지 입력할 수 있습니다.";
    case AUTH_ERROR_CODES.NETWORK_ERROR:
      return message;
    default:
      return message || "회원가입에 실패했습니다.\n잠시 후 다시 시도해 주세요.";
  }
}

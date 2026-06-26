import axios from 'axios';
import { create } from 'zustand';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { API_BASE_URL } from '@env';
import { authAPI } from '../api/auth';
import { parseAuthApiError } from '../utils/authErrors';
import useRecordCacheStore from './recordCacheStore';

WebBrowser.maybeCompleteAuthSession();

const saveTokens = async (data) => {
  await SecureStore.setItemAsync('access_token', data.access_token);
  await SecureStore.setItemAsync('refresh_token', data.refresh_token);
};

const beginAuthSession = () => {
  useRecordCacheStore.getState().clearRecordCache();
};

const parseCallbackParams = (url) => {
  const params = {};
  const queryStart = url.indexOf('?');
  const fragmentStart = url.indexOf('#');
  const query =
    queryStart >= 0
      ? url.slice(queryStart + 1, fragmentStart >= 0 ? fragmentStart : undefined)
      : '';
  const fragment = fragmentStart >= 0 ? url.slice(fragmentStart + 1) : '';

  [query, fragment].filter(Boolean).forEach((part) => {
    part.split('&').forEach((pair) => {
      if (!pair) {
        return;
      }
      const [rawKey, rawValue = ''] = pair.split('=');
      const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      const value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
      params[key] = value;
    });
  });

  return params;
};

const finalizeSocialCallback = async (params, provider, set) => {
  if (params.error) {
    set({ error: params.error, isLoading: false });
    return { success: false, error: params.error };
  }

  if (!params.access_token || !params.refresh_token) {
    const message = '소셜 로그인 토큰을 받을 수 없습니다';
    set({ error: message, isLoading: false });
    return { success: false, error: message };
  }

  const isNewUser = params.is_new_user === 'true' || params.is_new_user === true;
  if (isNewUser) {
    set({ isLoading: false });
    return {
      success: true,
      requiresTerms: true,
      provider: params.provider || provider,
      pendingTokens: {
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      },
    };
  }

  beginAuthSession();
  await saveTokens({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });

  const user = await authAPI.getMe();
  set({ user, isAuthenticated: true, isLoading: false });
  return { success: true };
};

const runSocialAuthSession = ({ authUrl, provider, set, logLabel = '소셜 로그인' }) =>
  new Promise((resolve) => {
    let handled = false;

    const subscription = Linking.addEventListener('url', async ({ url }) => {
      if (handled) return;
      handled = true;
      subscription.remove();
      try {
        WebBrowser.dismissBrowser();
      } catch (_) {}

      try {
        console.log(`${logLabel} 콜백 url:`, url);
        const params = parseCallbackParams(url);
        console.log(`${logLabel} 콜백 params:`, params);
        resolve(await finalizeSocialCallback(params, provider, set));
      } catch (error) {
        console.error(`${logLabel} 처리 에러:`, error.message);
        const message = error.message || '소셜 로그인에 실패했습니다';
        set({ error: message, isLoading: false });
        resolve({ success: false, error: message });
      }
    });

    WebBrowser.openBrowserAsync(authUrl).then((result) => {
      if (handled) return;
      if (result.type === 'cancel' || result.type === 'dismiss') {
        handled = true;
        subscription.remove();
        const message = '소셜 로그인이 취소되었습니다';
        set({ error: message, isLoading: false });
        resolve({ success: false, error: message });
      }
    });
  });

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false, // 로그인/회원가입/소셜 액션용
  isInitializing: true, // 앱 시작 시 토큰 확인용
  error: null,

  // 로그인
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      beginAuthSession();
      const data = await authAPI.login(email, password);

      await saveTokens(data);

      const user = await authAPI.getMe();
      set({ user, isAuthenticated: true, isLoading: false });

      return { success: true };
    } catch (error) {
      const parsed = parseAuthApiError(error, '로그인에 실패했습니다');
      if (__DEV__) {
        console.log(
          '로그인 에러:',
          parsed.message,
          error.response?.status ?? 'no-response',
        );
      }

      set({ error: parsed.message, isLoading: false });
      return { success: false, error: parsed.message };
    }
  },

  // 회원가입
  register: async (payloadOrEmail, password, name) => {
    const payload =
      typeof payloadOrEmail === 'object'
        ? payloadOrEmail
        : { email: payloadOrEmail, password, name };

    set({ isLoading: true, error: null });
    try {
      await authAPI.register(payload);
    } catch (error) {
      console.log('회원가입 에러:', error.response?.data);
      const parsed = parseAuthApiError(error, '회원가입에 실패했습니다');
      set({ error: parsed.message, isLoading: false });
      return { success: false, ...parsed };
    }

    try {
      const loginResult = await useAuthStore.getState().login(payload.email, payload.password);
      return loginResult;
    } catch (error) {
      console.log('회원가입 후 자동 로그인 실패:', error.message);
      const message = '가입은 완료됐습니다. 로그인 화면에서 다시 로그인해 주세요.';
      set({ error: message, isLoading: false });
      return { success: false, error: message };
    }
  },

  // 소셜 로그인
  socialLogin: async (provider) => {
    set({ isLoading: true, error: null });

    const redirectUri = Linking.createURL('auth/social');
    const authUrl = authAPI.getSocialLoginUrl(provider, redirectUri);
    console.log('소셜 로그인 redirectUri:', redirectUri);
    console.log('소셜 로그인 authUrl:', authUrl);

    return runSocialAuthSession({ authUrl, provider, set });
  },

  completeSocialLoginAfterTerms: async (tokens) => {
    set({ isLoading: true, error: null });
    try {
      beginAuthSession();
      await saveTokens(tokens);

      // 실제 약관 동의 시점 서버 기록 (terms_agreed_at = now())
      await authAPI.agreeTerms();

      const user = await authAPI.getMe();
      set({ user, isAuthenticated: true, isLoading: false });
      return { success: true };
    } catch (error) {
      console.error('소셜 가입 완료 에러:', error.message);
      const message = error.message || '소셜 로그인에 실패했습니다';
      set({ error: message, isLoading: false });
      return { success: false, error: message };
    }
  },

  completeOnboardingProfile: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      const user = await authAPI.completeOnboardingProfile(payload);
      set({ user, isAuthenticated: true, isLoading: false });
      return { success: true, user };
    } catch (error) {
      console.log('온보딩 프로필 저장 에러:', error.response?.data || error.message);
      let message = '기본 프로필 저장에 실패했습니다';
      if (!error.response) {
        message = '서버에 연결할 수 없습니다. 앱 설정의 서버 주소를 확인해 주세요.';
      } else if (error.response?.data?.detail) {
        if (typeof error.response.data.detail === 'string') {
          message = error.response.data.detail;
        } else if (Array.isArray(error.response.data.detail)) {
          message = error.response.data.detail[0]?.msg || message;
        }
      }
      set({ error: message, isLoading: false });
      return { success: false, error: message };
    }
  },

  // 로그아웃
  logout: async () => {
    const secureKeys = [
      'access_token',
      'refresh_token',
      'saved_login_email',
      'remember_login_email',
    ];

    for (const key of secureKeys) {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch (error) {
        console.warn(`[Auth] failed to delete ${key} on logout`, error?.message || error);
      }
    }

    try {
      beginAuthSession();
      set({ user: null, isAuthenticated: false, error: null });
      return { success: true };
    } catch (error) {
      console.warn('[Auth] failed to clear session on logout', error?.message || error);
      return {
        success: false,
        error: '로그아웃 처리 중 문제가 발생했어요. 앱을 다시 시작해 주세요.',
      };
    }
  },

  // 비밀번호 재설정 요청
  requestPasswordReset: async (email) => {
    try {
      const data = await authAPI.requestPasswordReset(email);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || '이메일 전송에 실패했습니다.',
      };
    }
  },

  // 비밀번호 재설정 확인
  confirmPasswordReset: async (token, newPassword) => {
    try {
      const data = await authAPI.confirmPasswordReset(token, newPassword);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || '비밀번호 변경에 실패했습니다.',
      };
    }
  },

  // 비밀번호 변경 (로그인 상태)
  changePassword: async (currentPassword, newPassword) => {
    try {
      const data = await authAPI.changePassword(currentPassword, newPassword);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || '비밀번호 변경에 실패했습니다.',
      };
    }
  },

  // 회원 탈퇴
  deleteAccount: async () => {
    try {
      await authAPI.deleteAccount();
      // 로그아웃 처리
      await useAuthStore.getState().logout();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || '회원 탈퇴에 실패했습니다.' };
    }
  },

  // 토큰으로 자동 로그인 (interceptor 우회 — 초기화 중 logout() 충돌 방지)
  checkAuth: async () => {
    set({ isInitializing: true });
    try {
      const token = await SecureStore.getItemAsync('access_token');
      if (!token) {
        set({ isInitializing: false });
        return;
      }

      const rawGet = (accessToken) =>
        axios.get(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10000,
        });

      let userResponse;
      try {
        userResponse = await rawGet(token);
      } catch (err) {
        if (err.response?.status !== 401) throw err;

        // access_token 만료 → refresh 시도
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const refreshRes = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          { refresh_token: refreshToken },
          { timeout: 10000 }
        );
        const newToken = refreshRes.data.access_token;
        await SecureStore.setItemAsync('access_token', newToken);

        userResponse = await rawGet(newToken);
      }

      set({ user: userResponse.data, isAuthenticated: true, isInitializing: false });
    } catch (error) {
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('refresh_token');
      beginAuthSession();
      set({ user: null, isAuthenticated: false, isInitializing: false });
    }
  },

  // 에러 초기화
  clearError: () => set({ error: null }),
}));

export default useAuthStore;

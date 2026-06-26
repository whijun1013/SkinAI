import apiClient from './client';
import { OAUTH_BASE_URL } from '@env';

const resolveOAuthBaseUrl = () => {
  const oauthBase = (OAUTH_BASE_URL || '').trim();
  const apiBase = (apiClient.defaults.baseURL || '').replace(/\/$/, '');
  if (!oauthBase || oauthBase.includes('YOUR_PC_IP') || oauthBase.includes('YOUR_NGROK_URL')) {
    return apiBase;
  }
  return oauthBase.replace(/\/$/, '');
};

export const authAPI = {
  register: async (payloadOrEmail, password, name) => {
    const payload =
      typeof payloadOrEmail === 'object'
        ? {
            email: payloadOrEmail.email,
            password: payloadOrEmail.password,
            name: payloadOrEmail.name,
            birth_year: payloadOrEmail.birth_year ?? payloadOrEmail.birthYear,
            gender: payloadOrEmail.gender ?? payloadOrEmail.sex,
          }
        : { email: payloadOrEmail, password, name };

    const response = await apiClient.post('/auth/register', payload);
    return response.data;
  },

  login: async (email, password) => {
    const response = await apiClient.post('/auth/login', {
      email,
      password,
    });
    return response.data;
  },

  getSocialLoginUrl: (provider, redirectUri) => {
    const baseURL = resolveOAuthBaseUrl();
    const encodedRedirectUri = encodeURIComponent(redirectUri);
    return `${baseURL}/auth/social/${provider}/login?redirect_uri=${encodedRedirectUri}`;
  },

  getMe: async () => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  agreeTerms: async () => {
    const response = await apiClient.post('/auth/agree-terms');
    return response.data;
  },

  completeOnboardingProfile: async (payload) => {
    const response = await apiClient.patch('/auth/me/onboarding-profile', payload);
    return response.data;
  },

  updatePushToken: async (pushToken) => {
    const response = await apiClient.patch('/auth/me/push-token', { push_token: pushToken });
    return response.data;
  },

  requestPasswordReset: async (email) => {
    const response = await apiClient.post('/auth/password-reset/request', { email });
    return response.data;
  },

  confirmPasswordReset: async (token, newPassword) => {
    const response = await apiClient.post('/auth/password-reset/confirm', {
      token,
      new_password: newPassword,
    });
    return response.data;
  },

  changePassword: async (currentPassword, newPassword) => {
    const response = await apiClient.patch('/auth/me/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  },

  deleteAccount: async () => {
    const response = await apiClient.delete('/auth/me');
    return response.data;
  },
};

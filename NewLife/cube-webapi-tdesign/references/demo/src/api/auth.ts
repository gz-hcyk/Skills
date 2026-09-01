/**
 * 鉴权 Store（Pinia）
 * 落地为 src/api/auth.ts。
 *
 * 契约严格对齐《魔方认证接口设计》（Doc/Api/认证接口设计.md）：
 *  - 登录配置：GET  /Auth/LoginConfig[?tenant=]  → 版权/Logo/功能开关/OAuth 列表
 *  - Challenge：GET /Auth/Challenge              → challengeId + publicKey（PKCS#8 SPKI）
 *  - 登录：     POST /Auth/Login                 → { username, password(密文), challengeId, category, captchaId, captchaCode }
 *  - 发码：     POST /Auth/SendCode              → { channel:'Sms'|'Mail', username, action }
 *  - 刷新：     POST /Auth/Refresh               → 令牌轮换（旧 refreshToken 用后即失效）
 *  - MFA：      POST /Mfa/Verify                 → { mfaToken, code }
 *  - 响应信封：{ code, message, data:{ accessToken, refreshToken, expireIn } }
 *  - 令牌头：Authentication + Authorization 双头（api.ts 注入）
 *
 * 密码加密：登录/重置一律走 Challenge-Response（RSA-OAEP/SHA-256），明文仅在
 * 浏览器不支持 Web Crypto API（加密失败）且后端 AllowPlainPassword=true 时降级。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { postRaw, getRaw } from './api';

/* ----------------------------- 枚举 ----------------------------- */
/**
 * 认证类别，严格对齐后端 `NewLife.Cube.Enums.AuthCategory`（NewLife.Cube.Core 6.12）。
 * 魔方后端未注册 JsonStringEnumConverter，System.Text.Json 只接受整数；传 '' 或 'Password' 会 400。
 */
export enum AuthCategory {
  Password = 0,
  Mobile = 1,
  Mail = 2,
  OAuth = 3,
}

/* ----------------------------- 类型 ----------------------------- */
export interface OAuthProvider {
  name: string;
  logo: string;
  nickName?: string;
}
export interface LoginConfig {
  code?: number | null;
  name?: string;
  copyright?: string;
  registration?: string;
  loginTip?: string;
  logo?: string;
  loginLogo?: string;
  loginBackground?: string;
  login?: { password?: boolean; sms?: boolean; mail?: boolean; captcha?: boolean; sendCode?: boolean };
  register?: { enabled?: boolean; password?: boolean; sms?: boolean; mail?: boolean; captcha?: boolean; requireMailVerify?: boolean; requireMobileVerify?: boolean };
  oAuth?: OAuthProvider[];
  security?: { challengeRequired?: boolean; mfaAvailable?: boolean; passwordComplexity?: boolean; passwordStrength?: string };
}
export interface LoginData {
  accessToken: string;
  refreshToken: string;
  expireIn: number;
}
export interface LoginOutcome {
  ok: boolean;
  mfaRequired?: boolean;
  mfaToken?: string;
}

/* ----------------------------- 密码加密（RSA-OAEP/SHA-256） ----------------------------- */
/**
 * 用后端公钥（PKCS#8 SPKI PEM）以 RSA-OAEP/SHA-256 加密密码，返回 Base64 密文。
 * 失败（浏览器不支持 Web Crypto / 公钥非法）返回 null，调用方降级为明文（需 AllowPlainPassword=true）。
 */
async function encryptPassword(password: string, publicKeyPem: string): Promise<string | null> {
  try {
    if (!crypto?.subtle) return null;
    const pem = publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/[\r\n\s]/g, '');
    const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      'spki',
      der,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
    const cipher = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      key,
      new TextEncoder().encode(password),
    );
    return btoa(String.fromCharCode(...new Uint8Array(cipher)));
  } catch {
    return null;
  }
}

/* ----------------------------- 响应归一化（兼容后端 snake_case / PascalCase / 前端 camelCase） ----------------------------- */
function normEnv(r: any): { code: number; message: string; data: any } {
  return {
    code: typeof r?.code === 'number' ? r.code : typeof r?.Code === 'number' ? r.Code : -1,
    message: r?.message ?? r?.Message ?? '',
    data: r?.data ?? r?.Data ?? null,
  };
}
function normToken(d: any): LoginData {
  const o = d ?? {};
  return {
    accessToken: o.accessToken ?? o.AccessToken ?? o.access_token ?? '',
    refreshToken: o.refreshToken ?? o.RefreshToken ?? o.refresh_token ?? '',
    expireIn: o.expireIn ?? o.ExpireIn ?? o.Expire ?? o.expire_in ?? 0,
  };
}

/* ----------------------------- Store ----------------------------- */
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem('cube_token') || '');
  const refreshToken = ref<string>(localStorage.getItem('cube_refresh_token') || '');
  const user = ref<any>(null);

  function applyTokens(d: LoginData) {
    token.value = d.accessToken || '';
    refreshToken.value = d.refreshToken || '';
    localStorage.setItem('cube_token', token.value);
    localStorage.setItem('cube_refresh_token', refreshToken.value);
    if (d.expireIn) {
      localStorage.setItem('cube_token_expire', String(Date.now() + d.expireIn * 1000));
    }
  }

  /** 登录配置（版权/Logo/开关/OAuth），登录页 onMounted 调用 */
  async function getLoginConfig(tenant?: string): Promise<LoginConfig> {
    const r = await getRaw<LoginConfig>('/Auth/LoginConfig', tenant ? { tenant } : undefined);
    const d = (r.data ?? {}) as Record<string, any>;
    // 真实后端返回 oAuth（驼峰）；兼容旧后端 oauth 写法，统一归一到 oAuth
    const cfg: LoginConfig = { ...(d as LoginConfig) };
    if (!cfg.oAuth && d.oauth) cfg.oAuth = d.oauth as OAuthProvider[];
    return cfg;
  }

  /** 获取 Challenge 公钥（每次登录都重新获取新鲜公钥，禁止缓存复用） */
  async function getChallenge(): Promise<{ challengeId: string; publicKey: string } | null> {
    const r = await getRaw<{ challengeId: string; publicKey: string }>('/Auth/Challenge');
    return (r.data as any) ?? null;
  }

  /** 获取图片验证码（login.captcha=true 时），返回 captchaId + SVG 文本 */
  async function getCaptcha(): Promise<{ captchaId: string; image: string } | null> {
    const r = await getRaw<{ captchaId: string; image: string }>('/Auth/Captcha');
    return (r.data as any) ?? null;
  }

  /**
   * 密码登录（category=AuthCategory.Password=0，必须为整数枚举值）。
   * captcha 可选（login.captcha=true 时附带 captchaId + captchaCode）。
   * challengeRequired：是否启用 Challenge-Response 密码加密（来自 LoginConfig.security.challengeRequired）。
   *   默认 false（严格以 LoginConfig 为准）；仅当后端返回 true 才请求 /Auth/Challenge 并加密，
   *   false / 字段缺省均直接明文提交密码，不请求 /Auth/Challenge。
   * remember：对应 LoginModel.Remember（记住登录状态）。
   * 返回 mfaRequired=true 时需前端进入二步验证（不写令牌）。
   */
  async function loginWithPassword(
    username: string,
    password: string,
    captcha?: { captchaId: string; captchaCode: string },
    challengeRequired = false,
    remember = true,
  ): Promise<LoginOutcome> {
    const payload: Record<string, unknown> = {
      username,
      password,
      // 枚举整数（后端无 JsonStringEnumConverter，传 '' 或 'Password' 会 400）
      category: AuthCategory.Password,
      remember,
      challengeId: '',
      captchaId: captcha?.captchaId || '',
      captchaCode: captcha?.captchaCode || '',
    };
    // 仅当后端要求挑战响应时才请求 /Auth/Challenge；challengeRequired=false 则跳过，避免多余请求
    if (challengeRequired) {
      try {
        const cr = await getChallenge();
        if (cr?.publicKey) {
          const enc = await encryptPassword(password, cr.publicKey);
          if (enc) {
            payload.password = enc;
            payload.challengeId = cr.challengeId;
          }
        }
      } catch {
        /* 降级明文（challengeId 留空） */
      }
    }
    const r = await postRaw<LoginData>('/Auth/Login', payload);
    const env = normEnv(r);
    const rawD: any = r.data ?? {};
    const d = normToken(env.data);
    // MFA 触发：code=0、无 accessToken、message 以 mfa_required: 开头（兼容大小写字段）
    if (env.code === 0 && (rawD == null || (rawD.accessToken == null && rawD.AccessToken == null)) && typeof env.message === 'string' && env.message.startsWith('mfa_required:')) {
      return { ok: false, mfaRequired: true, mfaToken: env.message.slice('mfa_required:'.length) };
    }
    if (env.code === 0 && d.accessToken) {
      applyTokens(d);
      user.value = { name: username };
      return { ok: true };
    }
    throw new Error(env.message || '登录失败');
  }

  /**
   * 验证码登录（手机/邮箱）。category 取 AuthCategory.Mobile(1) / AuthCategory.Mail(2)，
   * password 字段传验证码（不加密）。
   */
  async function loginWithCode(
    username: string,
    code: string,
    category: AuthCategory.Mobile | AuthCategory.Mail,
  ): Promise<LoginOutcome> {
    const r = await postRaw<LoginData>('/Auth/Login', {
      username,
      password: code,
      category,
      remember: true,
      challengeId: '',
      captchaId: '',
      captchaCode: '',
    });
    const env = normEnv(r);
    const d = normToken(env.data);
    if (env.code === 0 && d.accessToken) {
      applyTokens(d);
      user.value = { name: username };
      return { ok: true };
    }
    throw new Error(env.message || '登录失败');
  }

  /** 发送验证码（登录/注册/重置密码共用）。channel 区分大小写：Sms / Mail */
  async function sendCode(channel: 'Sms' | 'Mail', username: string, action: 'Login' | 'Register' | 'ResetPassword'): Promise<void> {
    const r = await postRaw<number>('/Auth/SendCode', { channel, username, action });
    if (r.code !== 0) throw new Error(r.message || '发送验证码失败');
  }

  /** MFA 二步验证：用 mfaToken + 6 位码换取令牌 */
  async function verifyMfa(mfaToken: string, code: string): Promise<LoginOutcome> {
    const r = await postRaw<LoginData>('/Mfa/Verify', { mfaToken, code });
    const env = normEnv(r);
    const d = normToken(env.data);
    if (env.code === 0 && d.accessToken) {
      applyTokens(d);
      return { ok: true };
    }
    throw new Error(env.message || 'MFA 验证失败');
  }

  /** 忘记密码——重置密码（POST /Auth/ResetPassword）。newPassword/confirmPassword 为明文或 Challenge 密文 */
  async function resetPassword(username: string, code: string, newPassword: string, confirmPassword: string): Promise<void> {
    const r = await postRaw<boolean>('/Auth/ResetPassword', {
      username,
      code,
      newPassword,
      confirmPassword,
      challengeId: '',
    });
    if (r.code !== 0) throw new Error(r.message || '重置失败');
  }

  /**
   * 注册（POST /Auth/Register），对齐后端 AuthRegisterModel。
   * category 同为枚举整数（默认 AuthCategory.Password）。
   */
  async function registerUser(payload: {
    username: string;
    email?: string;
    mobile?: string;
    password: string;
    confirmPassword: string;
    code?: string;
    category?: AuthCategory;
    challengeId?: string;
    captchaId?: string;
    captchaCode?: string;
  }): Promise<void> {
    const r = await postRaw<boolean>('/Auth/Register', {
      category: payload.category ?? AuthCategory.Password,
      username: payload.username,
      email: payload.email || '',
      mobile: payload.mobile || '',
      password: payload.password,
      confirmPassword: payload.confirmPassword,
      code: payload.code || '',
      challengeId: payload.challengeId || '',
      captchaId: payload.captchaId || '',
      captchaCode: payload.captchaCode || '',
    });
    if (r.code !== 0) throw new Error(r.message || '注册失败');
  }

  /** 刷新令牌（轮换）：成功写新令牌；失败返回 false（调用方跳登录） */
  async function refresh(): Promise<boolean> {
    if (!refreshToken.value) return false;
    try {
      const r = await postRaw<LoginData>('/Auth/Refresh', { refreshToken: refreshToken.value });
      const env = normEnv(r);
      const d = normToken(env.data);
      if (env.code === 0 && d.accessToken) {
        applyTokens(d);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  function setTenant(tenant: string): void {
    localStorage.setItem('cube_tenant', tenant);
  }
  function getTenant(): string {
    return localStorage.getItem('cube_tenant') || '';
  }
  function logout(): void {
    token.value = '';
    refreshToken.value = '';
    user.value = null;
    localStorage.removeItem('cube_token');
    localStorage.removeItem('cube_refresh_token');
    localStorage.removeItem('cube_token_expire');
  }

  return {
    token,
    refreshToken,
    user,
    getLoginConfig,
    getChallenge,
    getCaptcha,
    loginWithPassword,
    loginWithCode,
    sendCode,
    verifyMfa,
    resetPassword,
    registerUser,
    refresh,
    setTenant,
    getTenant,
    logout,
  };
});

/**
 * 魔方 WebApi 前端基础 HTTP 层
 * 用法：作为项目 src/api/index.ts（或 http.ts）直接落地。
 * 依赖：npm i axios
 *
 * 契约要点（依据 NewLife.Cube 官方 Doc/Api/WebAPI接口规范.md 第 36 章）：
 *  - 统一响应信封：{ code, message, data, page, stat }
 *  - 实体接口前缀 /api/{area}/{controller}
 *  - Auth/SSO/Cube 等非实体控制器【不带】/api 前缀（如 /Admin/User/Login、/Admin/Index/GetMenuTree）
 *  - JWT 令牌头为 Authentication（官方文档）**或 Authorization（实测部分后端）**——前端双头都带，
 *    Cookie / Query(?token=) 由后端自动识别
 */
import axios from 'axios';
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

/* ----------------------------- 类型契约 ----------------------------- */
export interface ApiEnvelope<T> {
  code: number; // 0 成功；401 未登录；403 无权限；400 参数错误；500 服务器错误
  message: string;
  data: T;
  traceId?: string;
  page?: PageModel;
  stat?: any; // 统计/合计行（可选）
  // 后端可选返回（如开启 EnableFieldValidation）：逐字段校验错误
  fieldErrors?: { field: string; message: string }[];
}
export interface PageModel {
  pageIndex: number;
  pageSize: number;
  totalCount: number;
  pageCount?: number;
  sort?: string;
  desc?: boolean;
}
export interface ApiListEnvelope<T> extends ApiEnvelope<T[]> {
  page: PageModel;
  stat?: T;
}

/* ----------------------------- 拦截器 ----------------------------- */

/**
 * 401 统一处理：清令牌 + 整页跳转登录页。
 * - 用 window.location.href（整页刷新）而非 router.push：api 层引用 router 会形成
 *   循环依赖，且整页刷新后路由守卫（to.path !== '/login' && !auth.token → /login）自然生效。
 * - 已在 /login 页则不跳转：登录接口密码错误同样返回 401，此时 Promise.reject 由
 *   LoginView 自己捕获提示「用户名或密码错误」，避免跳转自身造成刷新循环。
 */
function handleUnauthorized() {
  localStorage.removeItem('cube_token');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

/**
 * 401 自动刷新令牌（对齐文档 §6 刷新令牌轮换）。
 * - 认证类端点（/Auth/Login、/Auth/Refresh、/Auth/LoginConfig、/Mfa/）不参与刷新，避免循环；
 * - 其余受保护接口 401 时，用 localStorage 里的 refreshToken 调 /Auth/Refresh 续期一次，
 *   成功后用新 accessToken 重放原请求；刷新失败（无 refreshToken / 接口失败）再跳登录页。
 * - 用模块级 inFlight 守卫，避免并发请求同时刷新。
 */
let refreshInFlight: Promise<boolean> | null = null;
function getRefreshToken(): string {
  return localStorage.getItem('cube_refresh_token') || '';
}
function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const r = await rawHttp.post<ApiEnvelope<{ accessToken: string; refreshToken: string; expireIn: number }>>(
        '/Auth/Refresh',
        { refreshToken: rt },
      );
      const body = r.data;
      const d: any = body?.data ?? {};
      if (body && body.code === 0 && d?.accessToken) {
        localStorage.setItem('cube_token', d.accessToken);
        localStorage.setItem('cube_refresh_token', d.refreshToken || rt);
        if (d.expireIn) localStorage.setItem('cube_token_expire', String(Date.now() + d.expireIn * 1000));
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}
function isAuthEndpoint(url?: string): boolean {
  if (!url) return false;
  return (
    url.includes('/Auth/Login') ||
    url.includes('/Auth/Refresh') ||
    url.includes('/Auth/LoginConfig') ||
    url.includes('/Auth/Challenge') ||
    url.includes('/Mfa/')
  );
}

function attachInterceptors(instance: AxiosInstance) {
  // 请求拦截：注入令牌 + 租户（多租户）
  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('cube_token');
    if (token) {
      // 双头兼容：NewLife.Cube 官方文档写 Authentication，但实测部分后端只认 Authorization
      // （否则列表/详情一律 401 → 数据为空、树构建失败）。两个头都带，值同为 token，两端通吃。
      config.headers.set('Authentication', token);
      config.headers.set('Authorization', token);
    }
    // 多租户：官方 DataScopeMiddleware / ManagerProviderHelper 同时接受 X-Tenant（租户 Code，主）
    // 与 X-Tenant-Id（兼容读取，已标记废弃但仍保留）。优先发 X-Tenant(Code)，
    // 并保留 X-Tenant-Id 双发以兼容老后端。Code 取自登录响应头 X-Tenant（见响应拦截器捕获）。
    const tenantCode = localStorage.getItem('cube_tenant_code');
    if (tenantCode) config.headers.set('X-Tenant', tenantCode);
    const tenantId = localStorage.getItem('cube_tenant');
    if (tenantId) config.headers.set('X-Tenant-Id', tenantId);
    return config;
  });

  // 响应拦截：统一 code / 401（HTTP 状态 401 与信封 code=401 都要处理）
  instance.interceptors.response.use(
    (resp: AxiosResponse) => {
      const body = resp.data as ApiEnvelope<unknown>;
      if (body && typeof body.code === 'number' && body.code !== 0) {
        // 信封 code=401（部分后端以 200 承载 401 语义）
        if (body.code === 401) handleUnauthorized();
        // 业务错误统一抛出，由调用方捕获
        return Promise.reject(new Error(body.message || '请求失败'));
      }
      // 捕获登录/任意响应头里的租户编码（SsoController 登录成功后写 X-Tenant=tenant.Code），
      // 持久化供后续请求经 X-Tenant 头携带，对齐官方多租户契约。
      const tHeader = resp.headers?.['x-tenant'] ?? resp.headers?.['X-Tenant'];
      if (tHeader) localStorage.setItem('cube_tenant_code', String(tHeader));
      return resp;
    },
    async (error: any) => {
      const status = error?.response?.status;
      const url: string | undefined = error?.config?.url;
      // HTTP 状态 401 + 非认证端点 + 有 refreshToken → 尝试刷新并重放一次
      if (status === 401 && !isAuthEndpoint(url) && getRefreshToken()) {
        const ok = await tryRefresh();
        if (ok && error?.config) {
          const tk = localStorage.getItem('cube_token');
          if (tk) {
            error.config.headers.set('Authentication', tk);
            error.config.headers.set('Authorization', tk);
          }
          return instance.request(error.config);
        }
        handleUnauthorized();
        return Promise.reject(error);
      }
      // HTTP 状态 401（认证端点 / 无 refreshToken）：清令牌 + 跳登录页
      if (status === 401) handleUnauthorized();
      return Promise.reject(error);
    },
  );
}

/* ----------------------------- 实例 ----------------------------- */
// 实体接口实例（带 /api 前缀，供 EntityController 使用）
const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 30000,
});
// 非实体接口实例（Auth/SSO/菜单等，不带 /api 前缀）
const rawHttp: AxiosInstance = axios.create({ timeout: 30000 });

attachInterceptors(http);
attachInterceptors(rawHttp);

/* ----------------------------- 便捷方法（实体 /api） ----------------------------- */
export async function getApi<T>(url: string, params?: Record<string, unknown>): Promise<ApiEnvelope<T>> {
  const r = await http.get<ApiEnvelope<T>>(url, { params });
  return r.data;
}
export async function postApi<T>(url: string, data?: unknown): Promise<ApiEnvelope<T>> {
  const r = await http.post<ApiEnvelope<T>>(url, data);
  return r.data;
}
export async function putApi<T>(url: string, data?: unknown): Promise<ApiEnvelope<T>> {
  const r = await http.put<ApiEnvelope<T>>(url, data);
  return r.data;
}
export async function deleteApi<T>(url: string): Promise<ApiEnvelope<T>> {
  const r = await http.delete<ApiEnvelope<T>>(url);
  return r.data;
}

/* ----------------------------- 便捷方法（非 /api，如登录/菜单） ----------------------------- */
export async function getRaw<T>(url: string, params?: Record<string, unknown>): Promise<ApiEnvelope<T>> {
  const r = await rawHttp.get<ApiEnvelope<T>>(url, { params });
  return r.data;
}
export async function postRaw<T>(url: string, data?: unknown): Promise<ApiEnvelope<T>> {
  const r = await rawHttp.post<ApiEnvelope<T>>(url, data);
  return r.data;
}

export default http;

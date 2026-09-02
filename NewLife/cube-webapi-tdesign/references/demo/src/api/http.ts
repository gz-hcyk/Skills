import axios, { AxiosInstance } from 'axios'
import { getToken, clearToken } from './token'
import { camelize } from '@/utils/camel'

// baseURL 用根路径：本后端实体接口在 /{area}/{ctrl}（无 /api 前缀），鉴权在 /Auth/Login
const http: AxiosInstance = axios.create({ baseURL: '/', timeout: 20000 })

// 鉴权端点（不走自动刷新）：/Auth/Login、/Auth/LoginConfig、/Auth/Challenge、/Auth/Refresh、/Mfa/*
function isAuthEndpoint(url?: string): boolean {
  if (!url) return false
  return (
    url.startsWith('/Auth/Login') ||
    url.startsWith('/Auth/LoginConfig') ||
    url.startsWith('/Auth/Challenge') ||
    url.startsWith('/Auth/Refresh') ||
    url.startsWith('/Mfa/')
  )
}

http.interceptors.request.use((cfg) => {
  const t = getToken()
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})

http.interceptors.response.use(
  (resp) => {
    const body = resp.data
    // 信封：code 存在且非 0 → 业务错误
    if (body && typeof body.code === 'number' && body.code !== 0) {
      return Promise.reject(new Error(body.message || `错误码 ${body.code}`))
    }
    resp.data = camelize(body)
    return resp
  },
  (err) => {
    const status = err.response?.status
    if (status === 401) {
      clearToken()
      if (location.pathname !== '/login') location.href = '/login'
    }
    return Promise.reject(err)
  },
)

// 统一返回信封对象（含 data / page / stat 等）
export const getApi = (u: string, p?: any) => http.get(u, { params: p }).then((r) => r.data)
export const postApi = (u: string, d?: any) => http.post(u, d).then((r) => r.data)
export const putApi = (u: string, d?: any) => http.put(u, d).then((r) => r.data)
export const deleteApi = (u: string, p?: any) => http.delete(u, { params: p }).then((r) => r.data)

// 不带 baseURL 前缀的原始请求（登录/菜单等已在路径里带 /Auth、/Admin）
export const rawHttp: AxiosInstance = axios.create({ baseURL: '/', timeout: 20000 })
rawHttp.interceptors.request.use((cfg) => {
  const t = getToken()
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})
rawHttp.interceptors.response.use(
  (resp) => {
    const body = resp.data
    if (body && typeof body.code === 'number' && body.code !== 0) {
      return Promise.reject(new Error(body.message || `错误码 ${body.code}`))
    }
    resp.data = camelize(body)
    return resp
  },
  (err) => {
    if (err.response?.status === 401) {
      clearToken()
      if (location.pathname !== '/login') location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export { isAuthEndpoint }
export default http

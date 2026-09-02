import { defineStore } from 'pinia'
import { rawHttp } from '@/api/http'
import { getToken, setToken, clearToken, getUsernameFromToken, normToken } from '@/api/token'

interface AuthState {
  token: string
  username: string
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: getToken(),
    username: getToken() ? getUsernameFromToken() : '',
  }),
  getters: {
    isAuthed: (s) => !!s.token,
  },
  actions: {
    async login(username: string, password: string) {
      const r = await rawHttp.post('/Auth/Login', { username, password })
      const env = r.data ?? r
      const t = normToken(env.data ?? env)
      if (!t.accessToken) throw new Error((env.message as string) || '登录失败')
      this.token = t.accessToken
      this.username = getUsernameFromToken()
      setToken(this.token)
      return t
    },
    logout() {
      this.token = ''
      this.username = ''
      clearToken()
    },
  },
})

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../api/auth';
import LoginView from '../pages/LoginView.vue';
import ForgotPasswordView from '../pages/ForgotPasswordView.vue';
import RegisterView from '../pages/RegisterView.vue';
import MainView from '../pages/MainView.vue';
import ThemeShowcase from '../pages/ThemeShowcase.vue';

// 匿名页（路由守卫不拦截）：登录 / 忘记密码 / 注册
const ANON_PAGES = ['/login', '/forgot-password', '/register'];

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: LoginView },
  { path: '/forgot-password', name: 'forgot-password', component: ForgotPasswordView },
  { path: '/register', name: 'register', component: RegisterView },
  // 已登录主框架：左侧菜单树 + 右侧实体列表页（由菜单点击切换实体）
  { path: '/', name: 'main', component: MainView },
  // 设计令牌板：登录后访问，全量预览主题令牌（色板/圆角/阴影/间距/字号/组件示例）
  { path: '/Theme', name: 'theme', component: ThemeShowcase },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 登录门禁：未登录跳 /login；已登录访问匿名页则回主页
router.beforeEach((to) => {
  const auth = useAuthStore();
  const isAnon = ANON_PAGES.includes(to.path);
  if (!auth.token && !isAnon) return '/login';
  if (auth.token && isAnon) return '/';
  return true;
});

export default router;

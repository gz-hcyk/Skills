import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/api/auth';
import BasicLayout from '@/layouts/BasicLayout.vue';
import LoginView from '@/pages/LoginView.vue';
import EntityPage from '@/pages/EntityPage.vue';

/**
 * 路由策略：
 *  - /login 为独立全屏登录页；其余页面套用 BasicLayout（侧边栏 + 顶栏 + 内容区）。
 *  - 内置管理模块（用户/角色/部门/菜单/权限/参数/日志）显式注册为薄封装页；
 *  - 其余任意 area/controller 走泛型 /:area/:controller 子路由，由 EntityPage 渲染 ListPage；
 *  - 菜单树 url（如 Admin/User）映射至此；新增一个后端实体 ≈ 直接访问 /Area/Controller。
 */
const authed: RouteRecordRaw[] = [
  { path: 'Admin/User', name: 'user', component: () => import('@/pages/admin/UserPage.vue') },
  { path: 'Admin/Role', name: 'role', component: () => import('@/pages/admin/RolePage.vue') },
  { path: 'Admin/Department', name: 'department', component: () => import('@/pages/admin/DepartmentPage.vue') },
  { path: 'Admin/Menu', name: 'menu', component: () => import('@/pages/admin/MenuPage.vue') },
  { path: 'Admin/Permission', name: 'permission', component: () => import('@/pages/admin/PermissionPage.vue') },
  { path: 'Sys/Config', name: 'config', component: () => import('@/pages/sys/ConfigPage.vue') },
  { path: 'Sys/Log', name: 'log', component: () => import('@/pages/sys/LogPage.vue') },
  { path: 'Theme', name: 'theme', component: () => import('@/pages/ThemeShowcase.vue') },
  { path: ':area/:controller', name: 'entity', component: EntityPage },
];

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: LoginView },
  { path: '/', component: BasicLayout, redirect: '/Admin/User', children: authed },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 登录门禁：未登录跳转 /login
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.path !== '/login' && !auth.token) return '/login';
  if (to.path === '/login' && auth.token) return '/';
  return true;
});

export default router;

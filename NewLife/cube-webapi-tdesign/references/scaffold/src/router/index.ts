import { createRouter, createWebHashHistory } from 'vue-router'
import { isAuthed } from '@/api/token'
import LoginView from '@/pages/LoginView.vue'
import BasicLayout from '@/layouts/BasicLayout.vue'
import DataSourceConfigView from '@/pages/DataSourceConfigView.vue'
import SyncCenter from '@/pages/SyncCenter.vue'
import AdvisorClassView from '@/pages/AdvisorClassView.vue'
import EntityPage from '@/pages/EntityPage.vue'
import ExtAttrPreview from '@/pages/ExtAttrPreview.vue'
import DashboardView from '@/pages/DashboardView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    {
      path: '/',
      component: BasicLayout,
      redirect: '/dashboard',
      children: [
        { path: 'dashboard', name: 'dashboard', component: DashboardView },
        { path: 'datasource', name: 'datasource', component: DataSourceConfigView },
        { path: 'sync', name: 'sync', component: SyncCenter },
        { path: 'myclass', name: 'myclass', component: AdvisorClassView },
        // 扩展属性映射配置（复用通用实体页）
        { path: 'entity/WeCom/ExtAttrMapping', name: 'extattr-mapping', component: EntityPage, props: { area: 'WeCom', controller: 'ExtAttrMapping', title: '扩展属性映射' } },
        // 扩展属性映射预览
        { path: 'extattr-preview', name: 'extattr-preview', component: ExtAttrPreview },
        // 通用实体页（全量页可按此扩展）
        { path: 'entity/:area/:controller', name: 'entity', component: EntityPage, props: true },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/datasource' },
  ],
})

router.beforeEach((to) => {
  if (to.path !== '/login' && !isAuthed()) return '/login'
  if (to.path === '/login' && isAuthed()) return '/'
  return true
})

export default router

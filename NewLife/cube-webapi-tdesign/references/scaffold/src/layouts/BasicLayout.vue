<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getUsernameFromToken } from '@/api/token'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const menuGroups = [
  {
    title: '概览',
    items: [
      { path: '/dashboard', title: '系统仪表盘' },
    ],
  },
  {
    title: '核心',
    items: [
      { path: '/datasource', title: '数据源配置' },
      { path: '/sync', title: '同步中心' },
      { path: '/myclass', title: '班主任本班视图' },
    ],
  },
  {
    title: '基础数据',
    items: [
      { path: '/entity/WeCom/Class', title: '班级管理' },
      { path: '/entity/WeCom/Employee', title: '教职工管理' },
      { path: '/entity/WeCom/Advisor', title: '班主任管理' },
      { path: '/entity/WeCom/ExternalPerson', title: '校外人员管理' },
    ],
  },
  {
    title: '缓存与日志',
    items: [
      { path: '/entity/WeCom/WeComDepartment', title: '企微部门缓存' },
      { path: '/entity/WeCom/WeComMember', title: '企微成员缓存' },
    ],
  },
  {
    title: '扩展属性',
    items: [
      { path: '/entity/WeCom/ExtAttrMapping', title: '扩展属性映射' },
      { path: '/extattr-preview', title: '映射预览' },
    ],
  },
  {
    title: '系统管理',
    items: [
      { path: '/entity/Admin/User', title: '用户管理' },
      { path: '/entity/Admin/Role', title: '角色管理' },
      { path: '/entity/Admin/Menu', title: '菜单管理' },
      { path: '/entity/Admin/Department', title: '部门管理' },
      { path: '/entity/Admin/Parameter', title: '参数配置' },
      { path: '/entity/Admin/Log', title: '审计日志' },
      { path: '/entity/Admin/OAuthConfig', title: 'OAuth 配置' },
      { path: '/entity/Admin/Tenant', title: '租户管理' },
      { path: '/entity/Cube/App', title: '应用管理' },
    ],
  },
]

const allMenus = menuGroups.flatMap((g) => g.items)
const currentTitle = computed(
  () => allMenus.find((m) => route.path.startsWith(m.path))?.title || '控制台',
)
const username = computed(() => auth.username || getUsernameFromToken())

function logout() {
  auth.logout()
  router.replace('/login')
}
</script>

<template>
  <t-layout class="app-layout">
    <t-aside class="app-aside" width="220px">
      <div class="brand">
        <div class="brand-logo">WX</div>
        <div class="brand-text">企业微信<br />通讯录管理</div>
      </div>
      <nav class="nav">
        <template v-for="g in menuGroups" :key="g.title">
          <div class="nav-group">{{ g.title }}</div>
          <router-link
            v-for="m in g.items"
            :key="m.path"
            :to="m.path"
            class="nav-item"
            :class="{ active: route.path.startsWith(m.path) }"
          >
            {{ m.title }}
          </router-link>
        </template>
      </nav>
    </t-aside>
    <t-layout>
      <t-header class="app-header">
        <div class="header-title">{{ currentTitle }}</div>
        <div class="header-right">
          <span class="user">{{ username }}</span>
          <t-button theme="default" variant="text" @click="logout">退出登录</t-button>
        </div>
      </t-header>
      <t-content class="app-content">
        <router-view />
      </t-content>
    </t-layout>
  </t-layout>
</template>

<style scoped>
.app-layout {
  height: 100vh;
}
.app-aside {
  background: var(--cube-sidebar-bg);
  color: #fff;
  display: flex;
  flex-direction: column;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px;
  border-bottom: 1px solid var(--cube-topbar-border);
}
.brand-logo {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
}
.brand-text {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}
.nav {
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-item {
  display: block;
  padding: 11px 14px;
  border-radius: 8px;
  color: var(--cube-sidebar-text-weak);
  text-decoration: none;
  font-size: 14px;
  transition: background 0.15s, color 0.15s;
}
.nav-item:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}
.nav-item.active {
  color: #fff;
  background: var(--cube-sidebar-active-bg);
  box-shadow: inset 3px 0 0 var(--cube-sidebar-active-bar);
}
.nav-group {
  font-size: 12px;
  color: var(--cube-sidebar-text-weak);
  padding: 12px 14px 4px;
  letter-spacing: 1px;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  padding: 0 20px;
  border-bottom: 1px solid var(--cube-topbar-border);
  height: 56px;
}
.header-title {
  font-size: 16px;
  font-weight: 600;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.user {
  color: #444;
  font-size: 14px;
}
.app-content {
  padding: 20px;
  background: #f3f4f6;
  overflow: auto;
}
</style>

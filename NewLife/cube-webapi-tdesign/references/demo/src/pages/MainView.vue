<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">魔方 WebApi</div>
      <MenuSidebar @navigate="onNavigate" />
      <t-link class="nav-extra" theme="default" hover="color" @click="goTheme">
        设计令牌板
      </t-link>
      <div class="user-bar">
        <span>{{ auth.user?.name }}</span>
        <t-link theme="danger" @click="onLogout">退出</t-link>
      </div>
    </aside>
    <main class="content">
      <div class="crumb">{{ current.area }} / {{ current.controller }}</div>
      <ListPage :area="current.area" :controller="current.controller" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../api/auth';
import MenuSidebar from '../components/cube/MenuSidebar.vue';
import ListPage from '../components/cube/ListPage.vue';

const auth = useAuthStore();
const router = useRouter();

// 当前实体（由菜单点击切换）
const current = ref({ area: 'IoTHub', controller: 'Device' });
function onNavigate(url: string) {
  const [area, controller] = url.split('/');
  if (area && controller) current.value = { area, controller };
}
function onLogout() {
  auth.logout();
  router.push('/login');
}
function goTheme() {
  router.push('/Theme');
}
</script>

<style scoped>
.layout { display: flex; height: 100%; }
.sidebar { width: 240px; border-right: 1px solid #e7e7e7; display: flex; flex-direction: column; background: #fff; }
.brand { height: 56px; line-height: 56px; padding: 0 16px; font-weight: 600; border-bottom: 1px solid #e7e7e7; }
.user-bar { margin-top: auto; padding: 12px 16px; border-top: 1px solid #e7e7e7; display: flex; justify-content: space-between; align-items: center; }
.nav-extra { padding: 10px 16px; border-top: 1px solid #e7e7e7; color: var(--td-text-color-secondary); cursor: pointer; }
.content { flex: 1; padding: 16px; overflow: auto; }
.crumb { color: #888; margin-bottom: 12px; font-size: 13px; }
</style>

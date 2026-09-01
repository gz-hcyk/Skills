<template>
  <t-layout class="basic-layout">
    <t-aside width="232px" class="side">
      <div class="side-brand">
        <div class="lg">C</div>
        <b>魔方控制台</b>
      </div>
      <div class="side-menu">
        <MenuSidebar @navigate="onNavigate" />
      </div>
      <div class="user-bar">
        <t-avatar size="28px">{{ initial }}</t-avatar>
        <span class="uname">{{ auth.user?.name || '管理员' }}</span>
        <t-link theme="danger" hover="color" @click="onLogout">退出</t-link>
      </div>
    </t-aside>

    <t-layout>
      <t-header class="topbar">
        <div class="crumb-nav">
          <span>{{ area }}</span>
          <t-icon name="chevron-right" />
          <b>{{ controller }}</b>
        </div>
        <t-input class="top-search" placeholder="搜索设备名称 / 编号 / IP" clearable>
          <template #prefix-icon><t-icon name="search" /></template>
        </t-input>
        <div class="top-actions">
          <t-select
            :value="tenant"
            class="tenant"
            :options="tenantOptions"
            @change="onTenant"
            :auto-width="true"
          />
          <t-tooltip content="通知">
            <t-button theme="default" shape="square" variant="text">
              <t-icon name="notification" /><span v-if="false"></span>
            </t-button>
          </t-tooltip>
          <t-dropdown :options="userMenu" @click="onUserMenu">
            <t-avatar size="32px" class="avatar-btn">{{ initial }}</t-avatar>
          </t-dropdown>
        </div>
      </t-header>

      <t-content class="content">
        <router-view v-slot="{ Component }">
          <component :is="Component" :key="route.path" />
        </router-view>
      </t-content>
    </t-layout>
  </t-layout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { useAuthStore } from '@/api/auth';
import MenuSidebar from '@/components/cube/MenuSidebar.vue';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const area = computed(() => (route.params.area as string) || (route.path.startsWith('/Sys') ? 'Sys' : 'Admin'));
const controller = computed(() => (route.params.controller as string) || route.name?.toString() || '');
const initial = computed(() => (auth.user?.name || '管').slice(0, 1).toUpperCase());

const tenant = ref(auth.getTenant());
const tenantOptions = [
  { value: '', label: '默认租户（总控）' },
  { value: 'east', label: '华东物联网公司' },
  { value: 'south', label: '华南智造工厂' },
];

function onNavigate(url: string) {
  if (!url) return;
  // 归一化菜单 url → SPA 路由 /Area/Controller（取前两段）
  // 兼容后端返回的多种形态：Admin/User、/Admin/User、/api/Admin/User、Admin/User/Index
  const stripped = url.replace(/^\/+/, '').replace(/^api\//i, '');
  const parts = stripped.split('/').filter(Boolean);
  const clean = '/' + parts.slice(0, 2).join('/');
  // 去重：已在当前路由则跳过，避免重复 router.push 触发重挂载/“页面多次自动刷新”
  if (clean === route.path) return;
  router.push(clean);
}
function onTenant(v: string) {
  tenant.value = v;
  auth.setTenant(v);
  MessagePlugin.success(v ? '已切换租户，刷新数据' : '已切回总控');
  // 切换租户后刷新当前页数据（请求头 X-Tenant-Id 随之变化）
  window.location.reload();
}
const userMenu = [{ content: '退出登录', value: 'logout' }];
function onUserMenu(d: { value: string }) {
  if (d.value === 'logout') {
    auth.logout();
    router.push('/login');
  }
}
</script>

<style scoped>
.basic-layout { height: 100vh; }
.side { background: #fff; border-right: 1px solid var(--td-component-stroke); display: flex; flex-direction: column; }
.side-brand { height: 56px; display: flex; align-items: center; gap: 10px; padding: 0 16px; border-bottom: 1px solid var(--td-component-stroke); }
.side-brand .lg { width: 30px; height: 30px; border-radius: 8px; background: var(--cube-brand-gradient); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
.side-brand b { font-size: 15px; }
.side-menu { flex: 1; overflow-y: auto; padding: 8px; }
.user-bar { margin-top: auto; padding: 12px 16px; border-top: 1px solid var(--td-component-stroke); display: flex; align-items: center; gap: 10px; }
.user-bar .uname { flex: 1; font-size: 13px; color: var(--td-text-color-secondary); }
.topbar { height: 56px; background: #fff; border-bottom: 1px solid var(--td-component-stroke); display: flex; align-items: center; padding: 0 20px; gap: 16px; }
.crumb-nav { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--td-text-color-secondary); }
.crumb-nav b { color: var(--td-text-color-primary); }
.top-search { flex: 1; max-width: 360px; }
.top-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.tenant { width: 180px; }
.avatar-btn { cursor: pointer; background: var(--cube-brand-gradient); color: #fff; }
/* 内容区：min-width:0 是关键——作为 t-layout 的 flex 子项，默认 min-width:auto 会被
   超宽表格内容撑大（页面超出屏幕出现浏览器横向滚动条），且 TDesign t-table 的
   isWidthOverflow（scrollWidth > clientWidth）因容器被撑大而永远检测不到溢出，
   表格自身横向滚动失效。min-width:0 让内容区宽度回归视口，超宽由表格/内容区内部滚动。 */
.content { padding: 20px; overflow: auto; background: var(--td-bg-color-page); min-width: 0; }
</style>

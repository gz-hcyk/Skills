<template>
  <!-- 侧边布局：垂直菜单（支持折叠） -->
  <t-menu
    v-if="orientation === 'vertical'"
    :value="active"
    :expanded="expanded"
    :accordion="true"
    :collapsed="collapsed"
    :theme="theme"
    class="cube-menu"
    @change="onChange"
    @expand="onExpand"
  >
    <template v-for="(node, i) in menus" :key="nodeKey(node, i)">
      <!-- 含子节点的菜单：渲染为可展开菜单组（标题=分组名，带图标） -->
      <t-submenu
        v-if="hasChildren(node)"
        :value="pathOf(node, i)"
        :title="labelOf(node)"
      >
        <template #icon>
          <t-icon :name="iconOf(node)" />
        </template>
        <t-menu-item
          v-for="(c, ci) in childrenOf(node)"
          :key="nodeKey(c, ci)"
          :value="pathOf(c, ci)"
          @click="onClick(c)"
        >
          <template #icon v-if="iconOf(c)">
            <t-icon :name="iconOf(c)" />
          </template>
          {{ labelOf(c) }}
        </t-menu-item>
      </t-submenu>

      <!-- 叶子菜单 -->
      <t-menu-item v-else :value="pathOf(node, i)" @click="onClick(node)">
        <template #icon>
          <t-icon :name="iconOf(node)" />
        </template>
        {{ labelOf(node) }}
      </t-menu-item>
    </template>
  </t-menu>

  <!-- 顶部布局：横向菜单（HeadMenu，子菜单以弹层呈现） -->
  <t-head-menu
    v-else
    :value="active"
    :expanded="expanded"
    expand-type="popup"
    :theme="theme"
    class="cube-menu cube-menu-head"
    @change="onChange"
    @expand="onExpand"
  >
    <template #logo>
      <slot name="logo" />
    </template>
    <template #operations>
      <slot name="operations" />
    </template>
    <template v-for="(node, i) in menus" :key="nodeKey(node, i)">
      <t-submenu
        v-if="hasChildren(node)"
        :value="pathOf(node, i)"
        :title="labelOf(node)"
      >
        <template #icon>
          <t-icon :name="iconOf(node)" />
        </template>
        <t-menu-item
          v-for="(c, ci) in childrenOf(node)"
          :key="nodeKey(c, ci)"
          :value="pathOf(c, ci)"
          @click="onClick(c)"
        >
          <template #icon v-if="iconOf(c)">
            <t-icon :name="iconOf(c)" />
          </template>
          {{ labelOf(c) }}
        </t-menu-item>
      </t-submenu>

      <t-menu-item v-else :value="pathOf(node, i)" @click="onClick(node)">
        <template #icon>
          <t-icon :name="iconOf(node)" />
        </template>
        {{ labelOf(node) }}
      </t-menu-item>
    </template>
  </t-head-menu>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getRaw } from '../../api/api';

const emit = defineEmits<{ (e: 'navigate', url: string): void }>();

// 个性化配置：orientation / theme / collapsed 由 BasicLayout 按「菜单布局」传入
//   vertical → 侧边栏内的 t-menu（支持折叠）
//   horizontal → 顶栏内的 t-head-menu（子菜单弹层）
defineProps<{
  orientation?: 'vertical' | 'horizontal';
  theme?: 'light' | 'dark';
  collapsed?: boolean;
}>();

const menus = ref<any[]>([]);
const active = ref('');
const expanded = ref<string[]>([]);

/* ---------- 字段兼容（真实后端与 Mock 字段名可能不同） ----------
 * NewLife 魔方菜单树常见 PascalCase：Name / Url / Childs / Icon
 * 这里大小写兜底，避免 value 解析失败导致“点一个全展开”。 */
// 真实后端魔方菜单树节点同时含 displayName（友好显示名）与 name（内部名），
// 必须优先 displayName，否则会显示成控制器/内部名。
const LABEL_KEYS = ['displayName', 'DisplayName', 'text', 'Text', 'title', 'Title', 'name', 'Name', 'label', 'Label'];
const URL_KEYS = ['url', 'Url', 'route', 'Route', 'path', 'Path', 'link', 'Link'];
const CHILD_KEYS = ['children', 'Children', 'items', 'Items', 'submenu', 'Submenu', 'Childs', 'childs'];
const ICON_KEYS = ['icon', 'Icon', 'iconName', 'IconName', 'ico', 'Ico'];

function pick(node: any, keys: string[]): any {
  if (!node || typeof node !== 'object') return undefined;
  for (const k of keys) {
    const v = node[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}
function labelOf(n: any): string {
  const v = pick(n, LABEL_KEYS);
  return v != null ? String(v) : '未命名';
}
function urlOf(n: any): string {
  return pick(n, URL_KEYS) || '';
}
function childrenOf(n: any): any[] {
  const v = pick(n, CHILD_KEYS);
  return Array.isArray(v) ? v : [];
}
function hasChildren(n: any): boolean {
  return childrenOf(n).length > 0;
}

/** 稳定唯一值：优先 url → id → 层级路径（m-i / m-i-j）。
 *  这是修复“点一个全展开”的关键——value 必须唯一，不能用会冲突的 text/title。 */
function pathOf(n: any, idx: number | string): string {
  const u = urlOf(n);
  if (u) return u.replace(/^\/+/, '').replace(/^api\//i, '');
  if (n && n.id !== undefined && n.id !== null && n.id !== '') return 'id-' + n.id;
  return 'm-' + idx;
}
/** v-for 的 key 必须与 value 同源，保证稳定唯一 */
function nodeKey(n: any, idx: number | string): string {
  return pathOf(n, idx);
}

/** 图标：后端 icon 字段优先；否则按名称/url 推断默认图标（设计系统要求每个菜单带图标） */
const ICON_MAP: Record<string, string> = {
  user: 'user', users: 'usergroup', role: 'usergroup', permission: 'lock-on',
  department: 'apartment', dept: 'apartment', menu: 'menu', config: 'setting',
  setting: 'setting', log: 'file', logger: 'file', device: 'root-list',
  group: 'usergroup', data: 'chart', chart: 'chart', alarm: 'notification',
  alert: 'notification', monitor: 'dashboard', dashboard: 'dashboard',
  system: 'system', iothub: 'internet', iot: 'internet', net: 'internet',
  report: 'file-copy', message: 'mail', tenant: 'building',
};
function iconOf(n: any): string {
  const v = pick(n, ICON_KEYS);
  if (v) return String(v);
  const hay = (labelOf(n) + ' ' + urlOf(n)).toLowerCase();
  for (const k of Object.keys(ICON_MAP)) if (hay.includes(k)) return ICON_MAP[k];
  return 'layers';
}

onMounted(async () => {
  // 真实后端所有接口统一在 /api 下；只返回当前用户有权限的菜单。
  // 必须 try/catch：未登录/令牌失效时该请求 401，Axios 拒绝若无接收方会冒泡成
  // Uncaught AxiosError 红错并打断渲染链；api.ts 拦截器已统一处理 401（清 token + 跳 /login），
  // 此处 401 静默忽略即可，其余异常仅告警，绝不 throw。
  try {
    const r = await getRaw<any[]>('/api/Admin/Index/GetMenuTree');
    if (r.code === 0 && Array.isArray(r.data)) {
      menus.value = r.data;
      syncActiveByRoute();
    }
  } catch (e) {
    if ((e as any)?.response?.status !== 401) console.warn('[MenuSidebar] 菜单加载失败', e);
  }
});

/** 根据当前路由，默认只高亮 + 展开对应的父菜单（手风琴，一次仅一个） */
function syncActiveByRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const segs = hash.split('/').filter(Boolean).slice(0, 2).join('/').toLowerCase();
  if (!segs) return;
  for (let i = 0; i < menus.value.length; i++) {
    const node = menus.value[i];
    if (!hasChildren(node)) continue;
    for (const c of childrenOf(node)) {
      const cu = urlOf(c).replace(/^\/+/, '').replace(/^api\//i, '').toLowerCase();
      if (cu && cu.startsWith(segs)) {
        active.value = pathOf(c, childrenOf(node).indexOf(c));
        expanded.value = [pathOf(node, i)];
        return;
      }
    }
  }
}

function onClick(node: any) {
  const u = urlOf(node);
  if (u) emit('navigate', u);
  active.value = pathOf(node, menus.value.indexOf(node));
}
function onChange(val: any) {
  active.value = val;
}
function onExpand(vals: string[]) {
  // 受控展开：配合 accordion 保证手风琴（一次仅一个）
  expanded.value = vals;
}
</script>

<style scoped>
.cube-menu {
  height: 100%;
  border-right: none;
  /* 透明背景，露出侧边栏浅蓝渐变；顶栏（head）由 .cube-menu-head 接管底色 */
  background-color: transparent;
}

/* ===== 侧边栏（垂直 · 深色主题）：仅此处强制弱白文字，白底蓝调高亮 =====
 * 关键：用 :not(.cube-menu-head) 把白色文字规则限定在侧边栏，
 * 避免顶部横向菜单（白底）被强制成白字而不可见。 */
.cube-menu:not(.cube-menu-head),
.cube-menu:not(.cube-menu-head) :deep(.t-menu__item),
.cube-menu:not(.cube-menu-head) :deep(.t-submenu__title) {
  color: var(--cube-sidebar-text, rgba(255, 255, 255, 0.82));
}

/* 激活项：蓝调浅底 + 纯白文字 + 字重 500（企业蓝侧栏 .menu-item.active） */
.cube-menu:not(.cube-menu-head) :deep(.t-menu__item.t-is-active) {
  color: var(--cube-sidebar-text-strong, #fff);
  background-color: var(--cube-sidebar-active-bg, rgba(38, 111, 232, 0.30));
  font-weight: 500;
}
/* 左侧 3px 亮蓝强调条（仅侧边栏适用，顶部横向菜单不应出现竖条） */
.cube-menu:not(.cube-menu-head) :deep(.t-menu__item.t-is-active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--cube-sidebar-active-bar, #8fb6ff);
  border-radius: 0 var(--td-radius-small) var(--td-radius-small) 0;
}
/* 悬停态：半透明白底 + 纯白文字（设计系统 .menu-item:hover） */
.cube-menu:not(.cube-menu-head) :deep(.t-menu__item:not(.t-is-active):hover),
.cube-menu:not(.cube-menu-head) :deep(.t-submenu__title:hover) {
  background-color: var(--cube-sidebar-hover-bg, rgba(255, 255, 255, 0.14));
  color: var(--cube-sidebar-text-strong, #fff);
}

/* ===== 顶栏（横向 · 浅/深色主题）：显式主题感知文字色，杜绝「白底白字」 =====
 * 默认（非激活/非悬停）菜单项强制使用主题主文本色：浅色模式下为深字、深色模式下
 * 自动转浅字，两种模式都不会出现「同色不可见」；背景显式贴容器底色（白/深灰）。
 * 这层显式规则优先级高于 TDesign 默认继承，确保即使组件库默认异常也始终可读。 */
.cube-menu-head {
  background-color: var(--td-bg-color-container);
  border-bottom: none;
}
.cube-menu-head :deep(.t-menu__item),
.cube-menu-head :deep(.t-submenu__title) {
  color: var(--td-text-color-primary);
}
.cube-menu-head :deep(.t-menu__item.t-is-active),
.cube-menu-head :deep(.t-submenu__title.t-is-active) {
  color: var(--td-brand-color);
}
.cube-menu-head :deep(.t-menu__item:not(.t-is-active):hover),
.cube-menu-head :deep(.t-submenu__title:hover) {
  color: var(--td-brand-color);
  background-color: var(--td-brand-color-light);
}

/* 菜单项圆角、字号、高度对齐设计系统（14px / 40px；子级 13px）——两侧共用 */
.cube-menu :deep(.t-menu__item) {
  border-radius: var(--td-radius-default);
  font-size: 14px;
  height: 40px;
  transition: background-color var(--td-anim-duration-base), color var(--td-anim-duration-base);
}
.cube-menu :deep(.t-menu__sub .t-menu__item) {
  font-size: 13px;
  height: 38px;
}
/* 一级菜单组标题（分组名）视觉弱化，贴近设计系统 menu-grp */
.cube-menu :deep(.t-submenu__title) {
  font-size: 14px;
  font-weight: 500;
}

/* 顶部布局（HeadMenu）：内边距收敛（背景色已由上方 .cube-menu-head 显式设定） */
.cube-menu-head {
  border-bottom: none;
}
.cube-menu-head :deep(.t-menu__logo),
.cube-menu-head :deep(.t-head-menu__logo) {
  padding-left: 20px;
}
.cube-menu-head :deep(.t-menu__operations),
.cube-menu-head :deep(.t-head-menu__operations) {
  padding-right: 20px;
}
/* 确保图标与文字间距（设计系统 gap:10px） */
.cube-menu :deep(.t-menu__item .t-icon),
.cube-menu :deep(.t-submenu__title .t-icon) {
  margin-right: 2px;
}
</style>

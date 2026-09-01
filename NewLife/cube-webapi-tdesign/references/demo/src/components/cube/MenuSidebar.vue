<template>
  <t-menu :value="active" theme="light" class="cube-menu" @change="onChange">
    <template v-for="node in menus" :key="nodeKey(node)">
      <!-- 含子节点的菜单组 -->
      <t-submenu v-if="node.children && node.children.length" :value="node.text || node.title" :title="node.text || node.title">
        <t-menu-item
          v-for="c in node.children"
          :key="nodeKey(c)"
          :value="c.url || c.text || c.title"
          @click="onClick(c)"
        >
          {{ c.text || c.title }}
        </t-menu-item>
      </t-submenu>
      <!-- 叶子菜单 -->
      <t-menu-item v-else :value="node.url || node.text || node.title" @click="onClick(node)">
        {{ node.text || node.title }}
      </t-menu-item>
    </template>
  </t-menu>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getRaw } from '../../api/api';

const emit = defineEmits<{ (e: 'navigate', url: string): void }>();

const menus = ref<any[]>([]);
const active = ref('');

/** 菜单树节点 key：后端字段名可能不同，做多重兜底 */
function nodeKey(n: any): string {
  return n.url || n.id || n.text || n.title || Math.random().toString();
}

onMounted(async () => {
  // 官方菜单接口：/Admin/Index/GetMenuTree（只返回当前用户有权限的菜单）
  const r = await getRaw<any[]>('/Admin/Index/GetMenuTree');
  if (r.code === 0 && Array.isArray(r.data)) menus.value = r.data;
});

function onClick(node: any) {
  if (node.url) emit('navigate', node.url);
}
function onChange(val: any) {
  active.value = val;
}
</script>

<style scoped>
.cube-menu { height: 100%; }
</style>

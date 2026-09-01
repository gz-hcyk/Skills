<template>
  <!-- 底部（对应魔方 MVC 的 _List_Footer.cshtml 分部视图）
       统计/合计行（Index 响应的 stat）+ 记录数摘要，由 GetPage.setting.enableFooter 控制显隐。 -->
  <div v-if="visible" class="cube-list-footer">
    <span v-if="total != null">共 {{ total }} 条</span>
    <span v-if="statText">{{ statText }}</span>
    <div class="ft-right">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** 响应信封的 stat 统计/合计行 */
  stat?: unknown;
  /** 总记录数（分页信息） */
  total?: number;
  /** GetPage.setting.enableFooter */
  enableFooter?: boolean;
}>();

const statText = computed(() => {
  const s = props.stat;
  if (!s) return '';
  if (typeof s === 'string') return `统计：${s}`;
  try {
    return `统计：${JSON.stringify(s)}`;
  } catch {
    return '统计：-';
  }
});
const visible = computed(() => props.enableFooter !== false && (!!statText.value || props.total != null));
</script>

<style scoped>
.cube-list-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
  color: var(--td-text-color-secondary);
  font-size: 13px;
}
.ft-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
</style>

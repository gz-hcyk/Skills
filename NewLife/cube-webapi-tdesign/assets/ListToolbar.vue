<template>
  <!-- 工具栏（对应魔方 MVC 的 _List_Toolbar.cshtml 分部视图）
       按钮显隐由 GetPage.setting 驱动：enableToolbar / enableAdd / isReadOnly / enableSelect。 -->
  <t-space v-if="visible" class="cube-list-toolbar">
    <t-button v-if="canAdd" theme="primary" @click="emit('add')">
      <template #icon><t-icon name="add" /></template>新增
    </t-button>
    <t-button v-if="canDelete && selectedCount" theme="danger" @click="emit('batch-delete')">
      批量删除（{{ selectedCount }}）
    </t-button>
    <!-- 宿主自定义按钮（如导入/导出） -->
    <slot />
  </t-space>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** GetPage.setting.enableToolbar：是否显示工具栏 */
  enableToolbar?: boolean;
  /** 允许新增（!isReadOnly && enableAdd !== false） */
  canAdd?: boolean;
  /** 允许删除（!isReadOnly） */
  canDelete?: boolean;
  /** GetPage.setting.enableSelect：开启选择列时才显示批量删除 */
  showSelect?: boolean;
  /** 已勾选行数 */
  selectedCount?: number;
}>();
const emit = defineEmits<{ (e: 'add'): void; (e: 'batch-delete'): void }>();

const visible = computed(
  () =>
    props.enableToolbar !== false &&
    (!!props.canAdd || (!!props.showSelect && !!props.canDelete && (props.selectedCount ?? 0) > 0)),
);
</script>

<style scoped>
.cube-list-toolbar { margin-bottom: 12px; }
</style>

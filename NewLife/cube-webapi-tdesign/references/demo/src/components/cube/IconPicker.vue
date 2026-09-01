<template>
  <div class="icon-field">
    <!-- 当前选中图标预览（点击也可打开） -->
    <div class="icon-preview" :class="{ clickable: !disabled }" @click="!disabled && open()">
      <t-icon v-if="modelValue" :name="modelValue" />
      <span v-else class="icon-placeholder">未选择</span>
    </div>
    <t-button theme="default" variant="outline" :disabled="disabled" @click="open">选择图标</t-button>

    <!-- 图标选择器弹窗：可搜索的 TDesign 图标网格（枚举 tdesign-icons-vue-next 全部 SVG 组件） -->
    <t-dialog
      v-model:visible="visible"
      header="选择图标"
      width="760px"
      :confirm-btn="null"
      @close="visible = false"
    >
      <t-input v-model="keyword" placeholder="搜索图标名称（英文，如 browse / setting / user）" clearable />
      <div class="icon-grid">
        <div
          v-for="it in filtered"
          :key="it.name"
          class="icon-cell"
          :class="{ active: it.name === modelValue }"
          :title="it.name"
          @click="pick(it.name)"
        >
          <component :is="it.comp" />
          <span class="icon-label">{{ it.name }}</span>
        </div>
      </div>
      <template #footer>
        <t-button theme="default" variant="outline" @click="visible = false">取消</t-button>
      </template>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
// TDesign Vue Next 的 SVG 图标包（Vue 3 版），由 tdesign-vue-next 传递依赖引入，
// 已随组件库一并加载图标字体，<t-icon name> 可正常回显。
import * as Icons from 'tdesign-icons-vue-next';

const props = withDefaults(
  defineProps<{ modelValue?: string; disabled?: boolean }>(),
  { modelValue: '', disabled: false },
);
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const visible = ref(false);
const keyword = ref('');

/**
 * 枚举全部 SVG 图标组件（*Icon），转成 kebab 名称用于存储与 <t-icon> 回显。
 * 例：BrowseIcon → browse、AddAndSubtractIcon → add-and-subtract。
 * 存储值统一用 kebab 名称，与 TDesign 字体图标（t-icon-{name}）契约一致。
 */
const all = Object.keys(Icons)
  .filter((k) => k.endsWith('Icon'))
  .map((k) => {
    const base = k.slice(0, -'Icon'.length);
    const name = base.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    return { comp: (Icons as Record<string, any>)[k], name };
  });

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return kw ? all.filter((i) => i.name.includes(kw)) : all;
});

function open() {
  visible.value = true;
  keyword.value = '';
}
function pick(name: string) {
  emit('update:modelValue', name);
  visible.value = false;
}
</script>

<style scoped>
.icon-field {
  display: flex;
  gap: 8px;
  align-items: center;
}
.icon-preview {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--td-component-border);
  border-radius: var(--td-radius-default, 3px);
  font-size: 20px;
  color: var(--td-text-color-primary);
}
.icon-preview.clickable {
  cursor: pointer;
}
.icon-placeholder {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
.icon-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 8px;
  max-height: 360px;
  overflow: auto;
}
.icon-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border: 1px solid transparent;
  border-radius: var(--td-radius-default, 3px);
  cursor: pointer;
  font-size: 18px;
}
.icon-cell:hover {
  background: var(--td-bg-color-container-hover);
}
.icon-cell.active {
  border-color: var(--td-brand-color, #0f4c9e);
  background: var(--td-brand-color-light, #ecf2fe);
}
.icon-label {
  font-size: 11px;
  color: var(--td-text-color-secondary);
  word-break: break-all;
  text-align: center;
}
</style>

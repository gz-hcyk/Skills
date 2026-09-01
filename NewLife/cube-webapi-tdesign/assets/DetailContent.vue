<template>
  <!-- 图像（itemType=image）：缩略图展示，点击新窗口打开大图 -->
  <t-image
    v-if="img"
    :src="v"
    fit="contain"
    style="max-width: 200px; max-height: 160px; border-radius: 4px; cursor: zoom-in; display: block"
    @click="openImage && openImage(f)"
  />
  <!-- 颜色（itemType=color）：色块 + 色值文本 -->
  <span v-else-if="color" class="color-swatch">
    <i class="swatch" :style="{ background: v || 'transparent' }"></i>
    {{ v || '-' }}
  </span>
  <!-- 文件（itemType=file）：下载/查看链接 -->
  <t-link v-else-if="file" :href="v || undefined" target="_blank" hover="color">
    {{ v ? '下载/查看' : '-' }}
  </t-link>
  <!-- 图标（itemType=icon）：图标回显 -->
  <span v-else-if="icon">
    <t-icon v-if="v" :name="v" style="font-size: 20px" />
    <span v-else>-</span>
  </span>
  <!-- 多值外键（xxxIDs/xxxIds）：逐个映射为标签，绝不显示原始 ID 串 -->
  <span v-else-if="tags" class="tag-group">
    <t-tag v-for="(lb, i) in tags" :key="i" theme="primary" variant="light">{{ lb }}</t-tag>
  </span>
  <!-- 映射字段（外键 / 枚举 / ParentID 树）：一律回显映射名称，绝不显示原始 ID -->
  <span v-else-if="mapped">{{ labelOf(props.f, v, props.lookups, props.lovOptions) ?? '-' }}</span>
  <!-- 布尔（typeName === Boolean） -->
  <t-tag v-else-if="ctrl === 'switch'" :theme="v ? 'success' : 'default'">
    {{ v ? '是' : '否' }}
  </t-tag>
  <span v-else>{{ v ?? '-' }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { camel, type DataField } from '../../api/useEntityResource';
import {
  labelOf,
  selectFormControl,
  isForeignRef,
  isEnumType,
  isMappedField,
  isMultiValue,
  type LookupMap,
} from '../../api/fieldRender';

const props = defineProps<{
  /** 当前字段元数据 */
  f: DataField;
  /** 详情数据对象（DetailDrawer 传入的是响应式 ref，子组件内自动解包） */
  data: any;
  /** 外键关联源字典，用于 xxxID 字段回显名称 */
  lookups?: LookupMap;
  /** LovController 枚举值集（lovCode=Enum.* 权威选项），用于枚举字段回显名称 */
  lovOptions?: Record<string, { value: string | number; label: string }[]>;
  /** 点击图片打开大图回调 */
  openImage?: (f: DataField) => void;
}>();

// data 可能是 ref（DetailDrawer 传入），自动解包为原始对象
const row = computed(() => {
  const d = props.data as any;
  return d && typeof d === 'object' && 'value' in d ? d.value : d;
});
// 当前字段值（后端 PascalCase，经 camel 归一到数据键）
const v = computed(() => row.value?.[camel(props.f.name)]);

const itemType = computed(() => (props.f.itemType ?? '').toString().trim().toLowerCase());
const img = computed(() => itemType.value === 'image');
const color = computed(() => itemType.value === 'color');
const file = computed(() => itemType.value === 'file');
const icon = computed(() => itemType.value === 'icon');

/** 映射字段：mapField / map / dataSource / 外键 / 枚举类型名 → 回显映射名称 */
const mapped = computed(
  () => isMappedField(props.f) || !!props.f.map || !!props.f.dataSource || isForeignRef(props.f) || isEnumType(props.f),
);
const ctrl = computed(() => selectFormControl(props.f));

/** 多值字段（自身 xxxIDs 或映射自 RoleIds，值形如 "1,3,5"）→ 拆成标签逐个回显名称 */
const tags = computed<string[] | null>(() => {
  if (!isMultiValue(props.f)) return null;
  const raw = v.value;
  if (raw == null || raw === '') return null;
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts.map((p) => String(labelOf(props.f, p, props.lookups, props.lovOptions))) : null;
});
</script>

<style scoped>
/* 多值外键（RoleIds 等）在详情里以标签组回显 */
.tag-group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
/* 颜色字段：色块 + 色值 */
.color-swatch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.color-swatch .swatch {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid var(--td-component-border);
}
</style>

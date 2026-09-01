<template>
  <t-drawer :visible="visible" :header="title || '详情'" size="480px" @close="$emit('close')">
    <!-- 多分组（category 命中）：分 tab 组织详情字段 -->
    <t-tabs v-if="useTabs" v-model="activeTab" theme="card" class="cube-category-tabs">
      <t-tab-panel v-for="g in groups" :key="g.category" :value="g.category" :label="g.category">
        <t-descriptions :column="1" bordered>
          <t-descriptions-item v-for="f in g.items" :key="f.name" :label="f.displayName">
            <DetailContent :f="f" :data="data" :lookups="lookups" :lov-options="lovOptions" :open-image="openImage" />
          </t-descriptions-item>
        </t-descriptions>
      </t-tab-panel>
    </t-tabs>
    <!-- 单分组 / 无 category：扁平描述列表 -->
    <t-descriptions v-else :column="1" bordered>
      <t-descriptions-item v-for="f in fields" :key="f.name" :label="f.displayName">
        <DetailContent :f="f" :data="data" :lookups="lookups" :lov-options="lovOptions" :open-image="openImage" />
      </t-descriptions-item>
    </t-descriptions>
  </t-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  groupDataFieldsByCategory,
  DEFAULT_CATEGORY,
  type LookupMap,
} from '../../api/fieldRender';
import DetailContent from './DetailContent.vue';
import { camel, useEntityResource, type DataField, type PageSchema } from '../../api/useEntityResource';

const props = defineProps<{
  area: string;
  controller: string;
  schema: PageSchema | null;
  id: string | number | null;
  /** 列表已返回的行数据：作为接口返回前的即时展示 / 接口不可用时的兜底（详情以接口数据为准） */
  row?: Record<string, any> | null;
  visible: boolean;
  title?: string;
  /** 外键关联源字典：{ Category: { "1": "类别A" } }，用于 xxxID 字段回显名称 */
  lookups?: LookupMap;
  /** LovController 枚举值集（lovCode=Enum.* 权威选项），用于枚举字段回显名称 */
  lovOptions?: Record<string, { value: string | number; label: string }[]>;
}>();
const emit = defineEmits<{ (e: 'close'): void }>();

const res = useEntityResource(props.area, props.controller);
const data = ref<Record<string, any>>({});
// 详情字段遍历原始 DataField[]（而非 buildFormItems 输出），确保 labelOf 能读到 map/dataSource/primaryKey
const fields = computed<DataField[]>(() => (props.schema?.detail ?? []).filter((f) => !f.primaryKey));
// 按 category 分组成 tab（空 category → DEFAULT_CATEGORY「基础设置」组，排在最前）
const groups = computed(() => groupDataFieldsByCategory(fields.value, DEFAULT_CATEGORY));
// 仅 1 个分组（无有效 category）时退化为扁平描述列表，不显示 tab 头
const useTabs = computed(() => groups.value.length > 1);
const activeTab = ref<string>(DEFAULT_CATEGORY);
watch(
  groups,
  (g) => {
    if (g.length && !g.some((x) => x.category === activeTab.value)) {
      activeTab.value = g[0].category;
    }
  },
  { immediate: true },
);

/**
 * 点击图片新窗口打开大图（image 字段回显由 DetailContent 负责；此回调供其调用）
 */
function openImage(f: DataField) {
  const v = data.value[camel(f.name)];
  if (v) window.open(String(v), '_blank');
}

watch(
  () => [props.visible, props.id, props.row],
  async ([v, id, row]) => {
    if (!v) return;
    // 先用列表行即时展示（接口返回前抽屉不空白）
    if (row && typeof row === 'object' && Object.keys(row).length > 0) {
      data.value = row;
    }
    // **接口优先（数据一致性）**：列表行可能陈旧（他人已改过），
    // 详情一律用 `res.getById(id)` 拉最新单条（真实后端 `/Detail?id=` 实测可用），
    // 接口失败/返回空时保留列表行兜底展示。
    if (id != null) {
      try {
        const entity = await res.getById(id);
        if (entity && Object.keys(entity).length) data.value = entity;
      } catch {
        /* 静默：接口不可用则用列表行 */
      }
    }
  },
  { immediate: true },
);
</script>

<style scoped>
/* 详情分类 tab 容器与表单/配置页统一（.cube-category-tabs 在 tokens.css 全局定义） */
</style>

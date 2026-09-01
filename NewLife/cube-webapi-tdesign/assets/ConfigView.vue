<script setup lang="ts">
/**
 * ConfigView —— ConfigController<T> 专用「系统设置」单表单页（无 GetPage，单列处理）。
 *
 * 数据来源（两层，优先取元数据）：
 *  1) 元数据优先：GET /api/{area}/{controller}/GetFields?kind=EditForm 取 DataField[]，
 *     复用 buildFormItems / buildFormRules（与实体表单同源、组件选型/校验一致），
 *     再由 GET 单对象回填当前值。这是「元数据驱动、不硬编码」原则的【标准落地】。
 *  2) 兜底：若 GetFields 不可用（老部署 / 自定义控制器），退回静态 fields 声明或
 *     按返回对象键 + JS 类型动态推断控件（未知 schema 也能先跑起来）。
 *
 * 注意：ConfigController 仍【无 GetPage】，故绝不能走 ListPage（ListPage 依赖 GetPage 列定义）；
 * 它只是「有 GetFields、无 GetPage」——单表单页用 GetFields 驱动，列表页照旧单列处理。
 * 后端接口形态见 cube-webapi-backend §9（Get 读 Config<T>.Current 单对象 / Update 回存整对象）。
 */
import { ref, reactive, computed, onMounted } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { getApi, postApi, putApi } from '@/api/api';
import {
  buildFormRules,
  formItemName,
  selectFormControl,
  groupFormItemsByCategory,
  DEFAULT_CATEGORY,
} from '@/api/fieldRender';
import { normalizeSchema, type DataField } from '@/api/useEntityResource';

export interface ConfigField {
  name: string;
  label: string;
  type?: 'input' | 'textarea' | 'number' | 'switch' | 'select' | 'password';
  options?: { label: string; value: string | number }[];
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

/** 内部统一渲染字段（屏蔽 DataField / ConfigField / 动态推断三种来源） */
interface RenderField {
  name: string;
  label: string;
  control: string; // input | textarea | number | switch | select | password
  options?: { label: string; value: string | number }[];
  required?: boolean;
  placeholder?: string;
  /** 分组名：来自 GetFields 的 category；空/未设置时归入默认分组 */
  category?: string;
}

const props = withDefaults(
  defineProps<{
    area: string;
    controller: string;
    title?: string;
    /** 静态字段声明（GetFields 不可用时的兜底） */
    fields?: ConfigField[];
    /** 取元数据的 kind，默认 EditForm（配置单对象即一个编辑表单） */
    fieldsKind?: 'List' | 'Detail' | 'AddForm' | 'EditForm' | 'Search';
    /** 自定义加载端点（默认 /{area}/{controller}，相对 /api 基址） */
    loadUrl?: string;
    /** 自定义保存端点（默认同 loadUrl） */
    saveUrl?: string;
    saveMethod?: 'POST' | 'PUT';
    /**
     * 默认分组名：GetFields 返回的字段 category 为 null/空串时归入此分组。
     * 默认 '基础设置'（统一于 fieldRender.DEFAULT_CATEGORY），可经业务自定义（如「常规」）。
     */
    defaultCategory?: string;
  }>(),
  {
    title: '',
    fieldsKind: 'EditForm',
    loadUrl: '',
    saveUrl: '',
    saveMethod: 'POST',
    defaultCategory: DEFAULT_CATEGORY,
  },
);

const model = reactive<Record<string, any>>({});
const loading = ref(false);
const saving = ref(false);
const metaLoaded = ref(false); // GetFields 是否成功取到元数据

const _loadUrl = computed(() => props.loadUrl || `/${props.area}/${props.controller}`);
const _saveUrl = computed(() => props.saveUrl || `/${props.area}/${props.controller}`);

// 信封解包：有 code 字段视为 ApiEnvelope（取 data），否则视为裸对象
function unwrap(env: any): Record<string, any> {
  return env && typeof env === 'object' && 'code' in env ? env.data : env;
}

// 从配置对象中按字段取当前值（后端 PascalCase，formItemName 给 camelCase，大小写兜底）
function pickValue(obj: Record<string, any>, name: string, origName: string): any {
  if (obj == null) return '';
  if (obj[name] !== undefined) return obj[name];
  if (obj[origName] !== undefined) return obj[origName];
  const lower = name.toLowerCase();
  for (const k of Object.keys(obj)) if (k.toLowerCase() === lower) return obj[k];
  return '';
}

// 取枚举/字典选项（优先 dataSource，其次 map；后端已内联，无需异步 lookups）
function toOptions(f: DataField): { label: string; value: string | number }[] | undefined {
  if (Array.isArray(f.dataSource) && f.dataSource.length) {
    return f.dataSource.map((d) => ({ label: d.text, value: d.value }));
  }
  if (f.map && typeof f.map === 'object') {
    return Object.entries(f.map).map(([k, v]) => ({ label: String(v), value: k }));
  }
  return undefined;
}

/** 取 GetFields 返回的字段数组（兼容 5 段 / 扁平 fields / 裸数组多种结构） */
function extractMetaFields(raw: any): DataField[] {
  if (!raw || typeof raw !== 'object') return [];
  const sc = normalizeSchema(raw);
  if (sc && (sc.editForm?.length || sc.addForm?.length || sc.list?.length)) {
    return (sc.editForm?.length ? sc.editForm : sc.addForm?.length ? sc.addForm : sc.list) as DataField[];
  }
  if (Array.isArray(raw)) return raw as DataField[];
  return [];
}

/** 元数据来源 → 内部渲染字段 */
const metaFields = ref<DataField[]>([]);
const renderFields = computed<RenderField[]>(() => {
  if (metaLoaded.value && metaFields.value.length) {
    return metaFields.value
      .filter((f) => !f.primaryKey && !f.isIdentity)
      .map((f) => {
        const ctrl = selectFormControl(f);
        const control =
          ctrl === 'switch'
            ? 'switch'
            : ctrl === 'number'
              ? 'number'
              : ctrl === 'textarea' || ctrl === 'html'
                ? 'textarea'
                : ctrl === 'password' || f.itemType === 'password'
                  ? 'password'
                  : ctrl === 'select' || ctrl === 'multi-select'
                    ? 'select'
                    : 'input';
        const opts = toOptions(f);
        return {
          name: formItemName(f),
          label: f.displayName ?? f.name,
          control,
          options: opts && opts.length ? opts : undefined,
          required: !!f.required,
          placeholder: f.description,
          category: f.category ?? undefined,
        };
      });
  }
  // 兜底：静态声明
  if (props.fields && props.fields.length) {
    return props.fields.map((f) => ({
      name: f.name,
      label: f.label,
      control: f.type ?? 'input',
      options: f.options,
      required: f.required,
      placeholder: f.placeholder,
    }));
  }
  // 兜底：按返回对象动态推断（加载完成后才有 model 键）
  return Object.keys(model).map((k) => {
    const v = model[k];
    let control: RenderField['control'] = 'input';
    if (typeof v === 'boolean') control = 'switch';
    else if (typeof v === 'number') control = 'number';
    else if (typeof v === 'string' && v.length > 100) control = 'textarea';
    return { name: k, label: k, control };
  });
});

const rules = computed<Record<string, any>>(() => {
  if (metaLoaded.value && metaFields.value.length) {
    return buildFormRules(metaFields.value);
  }
  const r: Record<string, any> = {};
  for (const f of renderFields.value) {
    if (f.required) {
      r[f.name] = [
        { required: true, message: `${f.label}必填`, type: f.control === 'number' ? 'number' : 'error' },
      ];
    }
  }
  return r;
});

/**
 * 按 GetFields 的 category 字段分组，组织成 tab（复用 fieldRender.groupFormItemsByCategory）。
 * - 没有 category（空串/null）的字段归入默认分组（props.defaultCategory，默认「基础设置」）。
 * - 默认分组始终排在最前，其余分组按 category 首次出现顺序排列。
 * - 仅 1 个分组时（即没有有效 category）退化为扁平表单，不显示 tab 头。
 */
interface TabGroup {
  name: string;
  fields: RenderField[];
}

const activeTab = ref<string>(props.defaultCategory);

const tabGroups = computed<TabGroup[]>(() =>
  groupFormItemsByCategory(renderFields.value, props.defaultCategory).map((g) => ({
    name: g.category,
    fields: g.items,
  })),
);

const useTabs = computed(() => tabGroups.value.length > 1);

async function loadMeta(): Promise<boolean> {
  try {
    const env = await getApi<any>(`${_loadUrl.value}/GetFields?kind=${props.fieldsKind}`);
    const fields = extractMetaFields(unwrap(env));
    if (fields.length) {
      metaFields.value = fields;
      metaLoaded.value = true;
      return true;
    }
  } catch {
    /* GetFields 不可用 → 走兜底 */
  }
  metaLoaded.value = false;
  return false;
}

async function load() {
  loading.value = true;
  try {
    await loadMeta();
    const env = await getApi<Record<string, any>>(_loadUrl.value);
    const obj = unwrap(env) || {};
    const keys = metaLoaded.value
      ? metaFields.value.map((f) => ({ name: formItemName(f), orig: f.name }))
      : Object.keys(model);
    const next: Record<string, any> = {};
    for (const k of keys) {
      const key = typeof k === 'string' ? k : (k as any).name;
      const orig = typeof k === 'string' ? k : (k as any).orig;
      next[key] = pickValue(obj, key, orig);
    }
    Object.keys(model).forEach((k) => delete model[k]);
    Object.assign(model, next);
    const first = tabGroups.value[0];
    if (first) activeTab.value = first.name;
  } catch (e: any) {
    MessagePlugin.error(`加载配置失败：${e?.message || e}`);
  } finally {
    loading.value = false;
  }
}

async function save({ validateResult }: { validateResult: boolean }) {
  if (validateResult !== true) return;
  saving.value = true;
  try {
    const fn = props.saveMethod === 'PUT' ? putApi : postApi;
    await fn(_saveUrl.value, { ...model });
    MessagePlugin.success('配置已保存');
    await load();
  } catch (e: any) {
    MessagePlugin.error(`保存失败：${e?.message || e}`);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="config-view">
    <t-card :title="title || `${controller} 设置`" :loading="loading">
      <t-form v-if="!loading" :data="model" :rules="rules" label-width="200px" @submit="save">
        <!-- 多分组（category 命中）：分 tab 组织字段 -->
        <t-tabs v-if="useTabs" v-model="activeTab" theme="card" class="cube-category-tabs">
          <t-tab-panel
            v-for="g in tabGroups"
            :key="g.name"
            :value="g.name"
            :label="g.name"
          >
            <t-form-item
              v-for="f in g.fields"
              :key="f.name"
              :name="f.name"
              :label="f.label"
            >
              <t-textarea
                v-if="f.control === 'textarea'"
                v-model="model[f.name]"
                :placeholder="f.placeholder"
                :rows="4"
              />
              <t-input-number
                v-else-if="f.control === 'number'"
                v-model="model[f.name]"
                theme="column"
              />
              <t-switch v-else-if="f.control === 'switch'" v-model="model[f.name]" />
              <t-select
                v-else-if="f.control === 'select'"
                v-model="model[f.name]"
                :options="f.options"
                :placeholder="f.placeholder"
              />
              <t-input
                v-else
                v-model="model[f.name]"
                :type="f.control === 'password' ? 'password' : 'text'"
                :placeholder="f.placeholder"
              />
            </t-form-item>
          </t-tab-panel>
        </t-tabs>
        <!-- 单分组 / 无 category：扁平表单 -->
        <template v-else>
          <t-form-item
            v-for="f in renderFields"
            :key="f.name"
            :name="f.name"
            :label="f.label"
          >
            <t-textarea
              v-if="f.control === 'textarea'"
              v-model="model[f.name]"
              :placeholder="f.placeholder"
              :rows="4"
            />
            <t-input-number
              v-else-if="f.control === 'number'"
              v-model="model[f.name]"
              theme="column"
            />
            <t-switch v-else-if="f.control === 'switch'" v-model="model[f.name]" />
            <t-select
              v-else-if="f.control === 'select'"
              v-model="model[f.name]"
              :options="f.options"
              :placeholder="f.placeholder"
            />
            <t-input
              v-else
              v-model="model[f.name]"
              :type="f.control === 'password' ? 'password' : 'text'"
              :placeholder="f.placeholder"
            />
          </t-form-item>
        </template>
        <t-form-item>
          <t-space>
            <t-button theme="primary" type="submit" :loading="saving">保存</t-button>
            <t-button theme="default" :disabled="saving" @click="load">重置</t-button>
          </t-space>
        </t-form-item>
      </t-form>
    </t-card>
  </div>
</template>

<style scoped>
.config-view {
  max-width: 820px;
  margin: 0 auto;
}
</style>

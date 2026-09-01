<template>
  <t-dialog
    :visible="true"
    :header="editId == null ? '新增' : '编辑'"
    width="760px"
    :confirm-btn="{ content: editId == null ? '新增' : '保存', theme: 'primary' }"
    @close="$emit('close')"
    @confirm="onConfirm"
  >
    <t-form ref="formRef" :data="formData" :rules="rules" label-align="top">
      <!-- 仅当分组就绪（schema 已加载、至少有 1 个 tab）才渲染 t-tabs：
           TDesign t-tabs 在「activeTab 与任何 panel 都不匹配」的空/未就绪状态下渲染，
           会因 active-bar 收集到的 nav el 为 null 而在后续切换 tab 时触发
           TypeError: can't access property "parentNode", node is null。 -->
      <t-tabs v-if="groups.length" v-model="activeTab" theme="card" class="cube-category-tabs form-tabs">
        <t-tab-panel v-for="g in groups" :key="g.category" :value="g.category" :label="g.category">
          <div class="form-grid">
            <!-- 每个字段渲染为单一稳定的 t-form-item（v-for 直接挂真实元素，非 <template> 片段），
                 控件用 v-if 链在内部切换，避免 keyed 片段在 tab 重渲染时产生 null el 的 patch 崩溃 -->
            <t-form-item
              v-for="item in g.items"
              :key="item.name"
              :label="item.label"
              :name="item.name"
              :class="{ 'grid-full': item.full }"
            >
              <!-- 树形下拉（ParentID 等自引用树，选项来自同实体 Index，排除自身） -->
              <t-tree-select
                v-if="item.control === 'tree-select'"
                v-model="formData[item.name]"
                :data="treeOptions"
                :disabled="item.disabled"
                :keys="{ value: 'value', label: 'label', children: 'children' }"
                clearable
              />

              <!-- 多选下拉（xxxIDs/xxxIds 复数外键，如 RoleIds、DataDepartmentIds） -->
              <t-select
                v-else-if="item.control === 'multi-select'"
                v-model="formData[item.name]"
                :options="item.options"
                :disabled="item.disabled"
                multiple
                clearable
              />

              <!-- 下拉（枚举 / xxxID 单数外键 / 字典映射源） -->
              <t-select
                v-else-if="item.control === 'select'"
                v-model="formData[item.name]"
                :options="item.options"
                :disabled="item.disabled"
                clearable
              />

              <!-- 开关（typeName === Boolean） -->
              <t-switch v-else-if="item.control === 'switch'" v-model="formData[item.name]" :disabled="item.disabled" />

              <!-- 数字 -->
              <t-input-number v-else-if="item.control === 'number'" v-model="formData[item.name]" :disabled="item.disabled" />

              <!-- 日期时间 -->
              <t-date-picker
                v-else-if="item.control === 'datetime'"
                v-model="formData[item.name]"
                enable-time-picker
                value-type="YYYY-MM-DD HH:mm:ss"
                :disabled="item.disabled"
              />

              <!-- 日期 -->
              <t-date-picker
                v-else-if="item.control === 'date'"
                v-model="formData[item.name]"
                value-type="YYYY-MM-DD"
                :disabled="item.disabled"
              />

              <!-- 日期范围（itemType=daterange）：控件值为 [start,end] 数组，
                   提交前由 serializeRangeValue 转为「开始,结束」逗号串存实体单列。
                   value-type 显式指定，确保提交格式确定（勿依赖 format 推断）。 -->
              <t-date-range-picker
                v-else-if="item.control === 'daterange'"
                v-model="formData[item.name]"
                value-type="YYYY-MM-DD"
                clearable
                :disabled="item.disabled"
                style="width: 100%"
              />

              <!-- 日期时间范围（itemType=datetimerange）：同上，值含时分秒 -->
              <t-date-range-picker
                v-else-if="item.control === 'datetimerange'"
                v-model="formData[item.name]"
                enable-time-picker
                value-type="YYYY-MM-DD HH:mm:ss"
                clearable
                :disabled="item.disabled"
                style="width: 100%"
              />

              <!-- 富文本（itemType=html，如 Remark） -->
              <t-textarea
                v-else-if="item.control === 'html'"
                v-model="formData[item.name]"
                :disabled="item.disabled"
                :autosize="{ minRows: 4, maxRows: 8 }"
                placeholder="支持 HTML 内容"
              />

              <!-- 图像（itemType=image）：图片上传组件，支持上传/回显/删除，值回写为 URL 字符串 -->
              <t-upload
                v-else-if="item.control === 'image'"
                v-model="imageFiles[item.name]"
                theme="image"
                accept="image/*"
                :request-method="(f: any) => uploadRequest(item, f)"
                :max="1"
                :disabled="item.disabled"
                :show-upload-progress="true"
                @success="(ctx: any) => onUploadSuccess(item, ctx)"
                @remove="(ctx: any) => onUploadRemove(item, ctx)"
              />

              <!-- 长文本 -->
              <t-textarea
                v-else-if="item.control === 'textarea'"
                v-model="formData[item.name]"
                :maxlength="item.maxlength"
                :disabled="item.disabled"
              />

              <!-- 邮箱（itemType=mail） -->
              <t-input
                v-else-if="item.control === 'email'"
                v-model="formData[item.name]"
                type="email"
                :maxlength="item.maxlength"
                :placeholder="item.placeholder || '请输入邮箱'"
                :disabled="item.disabled"
              />

              <!-- 手机号（itemType=mobile） -->
              <t-input
                v-else-if="item.control === 'tel'"
                v-model="formData[item.name]"
                type="tel"
                :maxlength="item.maxlength"
                :placeholder="item.placeholder || '请输入手机号'"
                :disabled="item.disabled"
              />

              <!-- 网址（itemType=url）：t-input type=url + 校验 {type:'url'} -->
              <t-input
                v-else-if="item.control === 'url'"
                v-model="formData[item.name]"
                type="url"
                :maxlength="item.maxlength"
                :placeholder="item.placeholder || '请输入网址'"
                :disabled="item.disabled"
              />

              <!-- 颜色（itemType=color）：颜色选择器，值存色值字符串 -->
              <t-color-picker
                v-else-if="item.control === 'color'"
                v-model="formData[item.name]"
                :disabled="item.disabled"
                :show-primary="true"
              />

              <!-- 文件（itemType=file）：文件上传，值存 URL 字符串 -->
              <t-upload
                v-else-if="item.control === 'file'"
                v-model="fileFiles[item.name]"
                theme="file"
                accept="*"
                :request-method="(f: any) => uploadRequest(item, f)"
                :disabled="item.disabled"
                :show-upload-progress="true"
                @success="(ctx: any) => onUploadSuccess(item, ctx)"
                @remove="(ctx: any) => onUploadRemove(item, ctx)"
              />

              <!-- JSON（itemType=json）：CodeMirror JSON 编辑器（语法高亮） -->
              <CodeEditor
                v-else-if="item.control === 'json'"
                v-model="formData[item.name]"
                language="json"
                :readonly="item.disabled"
              />

              <!-- Markdown（itemType=markdown）：CodeMirror Markdown 编辑器（语法高亮） -->
              <CodeEditor
                v-else-if="item.control === 'markdown'"
                v-model="formData[item.name]"
                language="markdown"
                :readonly="item.disabled"
              />

              <!-- 图标（itemType=icon）：图标选择器，值存图标名字符串（kebab，如 browse） -->
              <IconPicker
                v-else-if="item.control === 'icon'"
                v-model="formData[item.name]"
                :disabled="item.disabled"
              />

              <!-- LOV 弹窗表格选择（lovTable / lovTableMulti / singleSelect+multipleSelect 走 List.*） -->
              <div v-else-if="item.control === 'lov-table' || item.control === 'lov-table-multi'" class="lov-field">
                <t-input
                  :model-value="lovLabels[item.name] || ''"
                  readonly
                  :placeholder="item.placeholder || '请选择'"
                  :disabled="item.disabled"
                  @click="openLov(item)"
                />
                <t-button theme="default" variant="outline" :disabled="item.disabled" @click="openLov(item)">选择</t-button>
              </div>

              <!-- 默认：文本输入 -->
              <t-input
                v-else
                v-model="formData[item.name]"
                :maxlength="item.maxlength"
                :placeholder="item.placeholder"
                :disabled="item.disabled"
              />
            </t-form-item>
          </div>
        </t-tab-panel>
      </t-tabs>
    </t-form>

    <!-- LOV 弹窗表格选择器（lov-table / lov-table-multi）：解析 lovCode=List.{area}.{controller} 拉取实体列表 -->
    <t-dialog
      v-if="lovActive"
      :visible="true"
      header="选择数据"
      width="640px"
      @close="lovActive = null"
      @confirm="confirmLov"
    >
      <t-loading :loading="lovActive.loading">
        <t-table
          :row-key="lovRowKey"
          :data="lovActive.rows"
          :columns="lovColumns"
          :selected-row-keys="lovActive.item.multiple ? lovSelected : undefined"
          @select-change="(keys: any) => (lovSelected = keys)"
          @row-click="(row: any) => { if (!lovActive.item.multiple) lovSelected = [String(row[lovRowKey] ?? row.ID)] }"
          size="small"
          max-height="360"
        />
      </t-loading>
    </t-dialog>
  </t-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useEntityResource, camel, type DataField, type PageSchema } from '../../api/useEntityResource';
import {
  buildFormItems,
  buildTree,
  toTreeSelectData,
  groupFormItemsByCategory,
  DEFAULT_CATEGORY,
  deserializeMultiValue,
  serializeMultiValue,
  deserializeRangeValue,
  serializeRangeValue,
  buildFormRules,
  parseLovListCode,
} from '../../api/fieldRender';
import { getApi, postApi } from '../../api/api';
import CodeEditor from './CodeEditor.vue';
import IconPicker from './IconPicker.vue';

const props = defineProps<{
  area: string;
  controller: string;
  schema: PageSchema | null;
  editId: string | number | null;
  /** 列表已返回的行数据：编辑时优先复用回填，避免 NewLife.Cube 无单条详情接口（/{id} 常 404） */
  row?: Record<string, any> | null;
  /** 外键关联源字典：{ Category: { "1": "类别A" } }，用于 xxID 字段下拉/回显 */
  lookups?: Record<string, Record<string, string>>;
  /** LovController 枚举值集（lovCode=Enum.* 权威选项），用于 select 下拉与 labelOf 回显 */
  lovOptions?: Record<string, { value: string | number; label: string }[]>;
  /** LovController 列表型值集配置（lovCode=List.*），用于 LOV 弹窗表格的权威路径/列/搜索 */
  lovListConfig?: Record<string, import('../../api/useLov').LovListMeta>;
  /**
   * 图像字段（itemType=image）上传端点；默认取 VITE_UPLOAD_URL，兜底 `/{area}/{controller}/UploadFile`
   * （NewLife.Cube 官方契约：POST form-data，字段名 file，返回信封 data.url；/api 前缀由 http 实例 baseURL 承载，勿重复）。
   */
  uploadUrl?: string;
}>();
const emit = defineEmits<{ (e: 'saved'): void; (e: 'close'): void }>();

const res = useEntityResource(props.area, props.controller);
const formRef = ref();
const formData = reactive<Record<string, any>>({});

// 图像上传：上传端点（可经 prop/环境变量覆盖）+ 与表单值（URL 字符串）互转的文件列表。
// 关键：postApi 走 http 实例（baseURL=/api），uploadUrl 默认值**不带 /api 前缀**（/api 由实例承载），
// 否则拼成 /api/api/... 双前缀 → 路由错位 405（实体接口双 /api 前缀高频坑，见 SKILL.md §七）。
const uploadUrl = computed(
  () => props.uploadUrl || import.meta.env.VITE_UPLOAD_URL || `/${props.area}/${props.controller}/UploadFile`,
);
// 图像字段上传后的文件列表（t-upload v-model），与 formData[字段]（URL 字符串）互转
const imageFiles = reactive<Record<string, any[]>>({});
// 文件字段（itemType=file）上传后的文件列表，与 formData[字段]（URL 字符串）互转
const fileFiles = reactive<Record<string, any[]>>({});

// LOV 弹窗表格选择器（lov-table / lov-table-multi）状态
const lovActive = ref<{
  item: any;
  rows: any[];
  /** 取值字段（行里作为 ID/值的列），默认 id */
  valueField: string;
  /** 显示字段（行里作为名称的列），默认 name */
  labelField: string;
  loading: boolean;
} | null>(null);
const lovSelected = ref<any[]>([]);
const lovLabels = reactive<Record<string, string>>({});

// LOV 弹窗列定义：有 lovListConfig.TableColumns 时按其权威列渲染，否则默认 ID/名称两列
const lovColumns = computed(() => {
  const code = lovActive.value?.item?.lovCode;
  const cfg = code ? props.lovListConfig?.[code] : undefined;
  if (cfg?.tableColumns?.length) {
    return cfg.tableColumns.map((c) => ({
      colKey: camel(c.field),
      title: c.title,
      width: c.width || undefined,
      align:
        c.align === 'center' ? 'center' : c.align === 'right' ? 'right' : c.align === 'left' ? 'left' : undefined,
    }));
  }
  const vf = cfg?.valueField ? camel(cfg.valueField) : 'id';
  const lf = cfg?.labelField ? camel(cfg.labelField) : 'name';
  return [
    { colKey: vf, title: 'ID', width: 90 },
    { colKey: lf, title: '名称' },
  ];
});
// LOV 弹窗行键：取 valueField 的 camel 键
const lovRowKey = computed(() => {
  const code = lovActive.value?.item?.lovCode;
  const cfg = code ? props.lovListConfig?.[code] : undefined;
  return cfg?.valueField ? camel(cfg.valueField) : 'id';
});

/** 按点路径从对象取值（如 "data.rows" / "Data"），失败返回 undefined */
function extractPath(obj: any, path: string): any {
  if (obj == null) return undefined;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
/** 从行对象按字段名取显示名（兼容大小写 + Name/name 兜底） */
function rowLabelOf(row: any, field: string): string {
  if (row == null) return '';
  const v = row[field] ?? row[field?.toLowerCase?.()] ?? row.Name ?? row.name;
  return v == null ? '' : String(v);
}

// 实体基路径（官方：/api/{area}/{controller}）；/api 由 http 实例 baseURL 统一承载，此处不重复，避免双前缀 /api/api/...
const base = computed(() => `/${props.area}/${props.controller}`);

// 树形下拉选项（ParentID）：来自同实体 Index，排除自身
const treeOptions = ref<any[]>([]);
const hasTree = computed(() => items.value.some((i) => i.control === 'tree-select'));
async function loadTreeOptions() {
  if (!hasTree.value) return;
  // 取完整数据集构建树（超大 pageSize），避免层级因分页被截断
  const r = await getApi<any>(`${base.value}?pageSize=10000`);
  if (r.code === 0 && Array.isArray(r.data)) {
    treeOptions.value = toTreeSelectData(buildTree(r.data), props.editId ?? undefined);
  }
}

// 编辑用 addForm 字段；新增用 addForm（如需不同可切 editForm）
const fields = computed<DataField[]>(() =>
  props.editId == null ? (props.schema?.addForm ?? []) : (props.schema?.editForm ?? []),
);
const items = computed(() => buildFormItems(fields.value, props.lookups, props.lovOptions));
// 按 category 分组成 tab（空 category → DEFAULT_CATEGORY 组「基础设置」，排在最前）
const groups = computed(() => groupFormItemsByCategory(items.value, DEFAULT_CATEGORY));
// 当前激活的 tab（默认取第一个分组，确保始终有有效 value）
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
 * 表单校验规则（元数据驱动，单源）：由 buildFormRules 根据 addForm/editForm 字段元数据生成。
 *  1) 必填：resolveFieldBehavior(f).required 为真 → required 规则。
 *  2) itemType=mail → TDesign 内置 `{ type:'email' }` 格式校验（铁律 R2 优先用内置规则）。
 *  3) itemType=mobile → TDesign 内置 `{ telnumber:true }` 校验。
 * 规则键与 buildFormItems 共用 formItemName 契约（映射字段用原始字段名），确保与 t-form-item 的
 * name 完全一致，校验生效。非必填空值由 async-validator 自动跳过格式校验，无需手工判空。
 */
const rules = computed(() => buildFormRules(fields.value));

// 弹窗打开/切换记录时，回填表单，并刷新树形下拉选项
watch(
  () => props.editId,
  async (id) => {
    for (const k of Object.keys(formData)) delete formData[k];
    // 清空图像/文件上传文件列表（避免上次记录残留）
    for (const k of Object.keys(imageFiles)) delete imageFiles[k];
    for (const k of Object.keys(fileFiles)) delete fileFiles[k];
    // 防御：先把所有多值外键字段初始化为 []，避免 t-select multiple 在
    // 表单首帧绑定到 null/undefined 而触发 getMultipleContent 的 for...of 崩溃。
    // 日期范围字段（daterange/datetimerange）同理初始化为 []：t-date-range-picker
    // 的 value 期望两元数组，绑定到 null/undefined 会导致内部取 value[0]/value[1] 异常。
    for (const it of items.value) {
      if (it.multiple || it.range) formData[it.name] = [];
    }
    // **编辑回填：接口优先（数据一致性）**
    // 列表行 row 可能是陈旧的（他人已改过），直接拿它回填并保存会**覆盖他人修改**。
    // 故有 id 时一律先 `res.getById(id)` 拉最新单条（真实后端 `/Detail?id=` 可用），
    // 接口失败/返回空时才回退列表行 props.row（并保留 row 作为接口返回前的即时展示）。
    if (id != null && props.row && typeof props.row === 'object' && Object.keys(props.row).length > 0) {
      Object.assign(formData, props.row); // 先填 row：接口返回前界面不空白
    }
    if (id != null) {
      try {
        const entity = await res.getById(id);
        if (entity && Object.keys(entity).length) Object.assign(formData, entity); // 接口最新值覆盖 row
      } catch {
        /* 静默：接口不可用时用列表行兜底 */
      }
    }
    // 多值外键（RoleIds="1,3"）→ 拆成数组，供多选下拉正确回显
    for (const it of items.value) {
      if (it.multiple) formData[it.name] = deserializeMultiValue(formData[it.name]);
      // 日期范围（"2026-01-01,2026-01-31"）→ [start,end] 数组，供 t-date-range-picker 回显；
      // 单值（只存了一个日期）补齐为单日闭区间，避免半空数组导致范围显示错乱。
      else if (it.range) formData[it.name] = deserializeRangeValue(formData[it.name]);
    }
    // 下拉值类型对齐（关键，修复「下拉显示数字 ID 而非名称」）：
    // TDesign t-select 用**严格相等 ===** 匹配 value。options 的 value 来自 lookups 字典键
    // （useLookups 用 String(id) 建键 → 字符串），而接口/列表行返回的外键 ID 常是**数字**，
    // 类型不同即匹配失败 → 下拉显示不出 label、回退显示原始数字 ID。
    // 这里在 options 中按「值相同」找到命中项，用它的 value（保持其原类型）写回 formData。
    for (const it of items.value) {
      const opts = (it.options ?? []) as { value: any; label: string }[];
      if (!opts.length) continue;
      if (it.multiple) {
        const arr = Array.isArray(formData[it.name]) ? formData[it.name] : [];
        formData[it.name] = arr.map((v: any) => {
          const hit = opts.find((o) => String(o.value) === String(v));
          return hit ? hit.value : v;
        });
      } else {
        const v = formData[it.name];
        if (v === undefined || v === null || v === '') continue;
        const hit = opts.find((o) => String(o.value) === String(v));
        if (hit) formData[it.name] = hit.value;
      }
    }
    // 图像/文件字段：表单值（URL 字符串）→ t-upload 文件列表（编辑回显）
    for (const it of items.value) {
      if (it.control === 'image') {
        const v = formData[it.name];
        imageFiles[it.name] = v ? [{ name: String(v).split('/').pop() || 'image', url: String(v), status: 'success' }] : [];
      }
      if (it.control === 'file') {
        const v = formData[it.name];
        fileFiles[it.name] = v ? [{ name: String(v).split('/').pop() || 'file', url: String(v), status: 'success' }] : [];
      }
    }
    loadTreeOptions();
  },
  { immediate: true },
);

/**
 * 图像上传（itemType=image）：postApi 直接 POST FormData 到上传端点。
 * 对齐 NewLife.Cube 官方契约 `POST /{Area}/{Controller}/UploadFile(IFormFile file, String id, String title)`：
 *  - `file`：multipart form-data 字段名 `file`；
 *  - `id`：实体主键 query 参数——编辑场景传当前 editId（关联已有实体），新增场景不传（后端按零=临时实体归类）；
 *  - `title`：附件标题 query 参数——传字段 displayName（为空时后端回退 entity.ToString()）。
 * 返回解析兼容多种结构（官方 FAQ 示例）：data 直接是 URL 字符串 / `{url}` / `{id,url}`（附件编号+路径）/ `{id,url,contentType}`。
 * 返回 TDesign t-upload requestMethod 契约：{ status:'success', response:{ url } }。
 */
async function uploadRequest(
  item: any,
  file: any,
): Promise<{ status: 'success' | 'fail'; response?: any; error?: string }> {
  try {
    const fd = new FormData();
    fd.append('file', file.raw);
    // 拼 query：id（编辑场景关联已有实体；新增场景省略，后端走临时实体路径）+ title（附件标题）
    const qs: string[] = [];
    if (props.editId != null) qs.push(`id=${encodeURIComponent(String(props.editId))}`);
    if (item?.label) qs.push(`title=${encodeURIComponent(String(item.label))}`);
    const url = qs.length ? `${uploadUrl.value}?${qs.join('&')}` : uploadUrl.value;
    const r: any = await postApi<any>(url, fd);
    const data = r?.data;
    // 兼容：data 直接是 URL 字符串 / {url} / {id,url} / {id,url,contentType} / {path} 等
    const url2 =
      typeof data === 'string'
        ? data
        : data?.url ?? data?.Url ?? data?.path ?? data?.Path ?? data?.filePath ?? data?.FileName;
    if (!url2) return { status: 'fail', error: '上传响应缺少 url：' + JSON.stringify(r).slice(0, 200) };
    return { status: 'success', response: { url: String(url2) } };
  } catch (e: any) {
    return { status: 'fail', error: e?.message ?? String(e) };
  }
}

/** 上传成功后：把返回 URL 写回表单值（formData[字段] = url），供提交时带上 */
function onUploadSuccess(item: any, ctx: any) {
  const url = ctx?.file?.response?.url ?? ctx?.response?.url;
  if (url) formData[item.name] = url;
}

/** 删除已上传文件：清空表单值（兼容 image / file 两种上传控件） */
function onUploadRemove(item: any, _ctx?: any) {
  formData[item.name] = '';
  if (imageFiles[item.name]) imageFiles[item.name] = [];
  if (fileFiles[item.name]) fileFiles[item.name] = [];
}

/**
 * 打开 LOV 弹窗表格选择器（lov-table / lov-table-multi）。
 * 优先用 LovController `Meta` 下发的列表型配置（lovListConfig[lovCode]）拉取数据：
 *   - ListConfig.RequestUrl（或 ProxyRequest 经 /api/Admin/Lov/ListData 代理）取数据；
 *   - ValueField/LabelField 定取值/显示列；TableColumns 定弹窗列。
 * 无配置时退化到「解析 lovCode=List.{area}.{controller} 拉目标实体 Index」的约定式逻辑。
 */
async function openLov(item: any) {
  const code = item.lovCode || '';
  const cfg = props.lovListConfig?.[code];
  const valueField = (cfg?.valueField || 'id') as string;
  const labelField = (cfg?.labelField || 'name') as string;
  // 已选值初始化（单选取当前值；多选取逗号串拆分），统一转字符串便于与表格 row-key 比较
  lovSelected.value = item.multiple
    ? deserializeMultiValue(formData[item.name]).map(String)
    : formData[item.name] != null && formData[item.name] !== ''
      ? [String(formData[item.name])]
      : [];
  lovActive.value = { item, rows: [], valueField, labelField, loading: true };
  try {
    let rows: any[] = [];
    if (cfg && cfg.listConfig) {
      rows = await fetchLovRows(cfg);
    } else {
      const parsed = parseLovListCode(code);
      if (!parsed) {
        MessagePlugin.warning('lovCode 无法解析，无法打开 LOV 选择器');
        lovActive.value = null;
        return;
      }
      const r: any = await getApi<any>(`/${parsed.area}/${parsed.controller}?pageSize=10000`);
      const raw = Array.isArray(r?.data)
        ? r.data
        : r?.data?.rows ?? r?.data?.page?.rows ?? [];
      rows = (Array.isArray(raw) ? raw : []).map((row: any) => ({
        id: row.id ?? row.ID,
        name: row.name ?? row.Name ?? row.id ?? row.ID,
      }));
    }
    lovActive.value = { item, rows, valueField, labelField, loading: false };
  } catch {
    lovActive.value = { item, rows: [], valueField, labelField, loading: false };
  }
}

/** 按 lovListConfig 拉取列表型值集数据（权威路径） */
async function fetchLovRows(cfg: import('../../api/useLov').LovListMeta): Promise<any[]> {
  const lc = cfg.listConfig!;
  // requestUrl 可能带 /api 前缀（避免与 http 实例 baseURL 双前缀），统一剥离后再走 getApi
  const normUrl = (u: string) => (u.startsWith('/api/') ? u.slice(4) : u.startsWith('/api') ? u.slice(4) : u);
  if (lc.proxyRequest) {
    // 经 LovController 代理：POST /api/Admin/Lov/ListData
    const r = await postApi<any>(`/Admin/Lov/ListData`, { lovCode: cfg.lovCode, pageSize: 10000 });
    const data = extractPath(r?.data, lc.dataPath || 'Data') ?? extractPath(r?.data, 'data') ?? [];
    return Array.isArray(data) ? data : [];
  }
  if (lc.requestUrl) {
    const sep = lc.requestUrl.includes('?') ? '&' : '?';
    const r = await getApi<any>(`${normUrl(lc.requestUrl)}${sep}pageSize=10000`);
    const data = extractPath(r?.data, lc.dataPath || 'data') ?? Array.isArray(r?.data) ? r.data : [];
    return Array.isArray(data) ? data : [];
  }
  return [];
}

/** 取某行在 LOV 表格中的显示名（按 valueField 匹配） */
function lovRowName(rows: any[], id: any): string {
  const row = rows.find((r) => String(r[lovActive.value?.valueField ?? 'id']) === String(id));
  return row ? rowLabelOf(row, lovActive.value?.labelField ?? 'name') : String(id);
}

/** 确认 LOV 选择：写回 formData 与展示标签 */
function confirmLov() {
  const a = lovActive.value;
  if (!a) return;
  if (a.item.multiple) {
    const ids = [...lovSelected.value];
    formData[a.item.name] = ids.join(',');
    lovLabels[a.item.name] = ids.map((id) => lovRowName(a.rows, id)).join('、');
  } else {
    const id = lovSelected.value[0];
    formData[a.item.name] = id;
    lovLabels[a.item.name] = id != null ? lovRowName(a.rows, id) : '';
  }
  lovActive.value = null;
  lovSelected.value = [];
}

async function onConfirm() {
  const ok = await formRef.value?.validate();
  if (ok !== true && ok !== undefined) return; // 校验未过
  // 多值外键（多选数组）→ 序列化为逗号分隔字符串提交（库中以 String 存储）
  const payload: Record<string, any> = { ...formData };
  for (const it of items.value) {
    if (it.multiple) {
      payload[it.name] = serializeMultiValue(payload[it.name]);
      continue;
    }
    // 日期范围（[start,end] 数组）→「开始,结束」逗号串提交（实体单列存储）；
    // 未选/清空 → 空串（清空该列），避免把数组原样提交导致后端绑定失败。
    if (it.range) {
      payload[it.name] = serializeRangeValue(payload[it.name]);
      continue;
    }
    // 单选下拉 / LOV 单选：回填时为匹配 options 被归一为字典 value（字符串键），提交前把
    // 「纯数字字符串」还原为数字——后端 Int32/Int64 字段严格反序列化，字符串可能绑定失败。
    // 仅对 select / lov-table 控件生效，普通文本数字字段（如 Code="123"）不受影响。
    if (it.control === 'select' || it.control === 'lov-table') {
      const v = payload[it.name];
      if (typeof v === 'string' && v !== '' && /^-?\d+$/.test(v)) payload[it.name] = Number(v);
    }
  }
  const r =
    props.editId == null
      ? await res.insert(payload)
      : await res.update(props.editId, payload);
  if (r.code === 0) {
    MessagePlugin.success(props.editId == null ? '已新增' : '已保存');
    emit('saved');
  } else if (r.fieldErrors?.length) {
    // 后端 EnableFieldValidation 返回的字段级错误
    MessagePlugin.error(r.fieldErrors.map((e: any) => `${e.field}: ${e.message}`).join('；'));
  }
}
</script>

<style scoped>
/* 表单字段按 category 分 tab；每个 tab 内用 2 列网格横向组织字段 */
.form-tabs {
  margin-top: 4px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24px;
  row-gap: 0;
  padding-top: 8px;
}
/* 宽字段（长文本 / 树形下拉 / 日期时间）占满整行，避免挤压 */
.grid-full {
  grid-column: 1 / -1;
}
/* 单列场景（仅一个 tab / 窄屏）退化为单列，避免过宽 */
@media (max-width: 560px) {
  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .grid-full {
    grid-column: auto;
  }
}
/* JSON / Markdown 字段：等宽字体，便于阅读结构化文本 */
.code-textarea :deep(textarea) {
  font-family: var(--td-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 13px;
}
/* LOV 弹窗表格选择字段：只读输入框 + 选择按钮横向排列 */
.lov-field {
  display: flex;
  gap: 8px;
  align-items: center;
}
.lov-field :deep(.t-input) {
  flex: 1;
  cursor: pointer;
}
</style>

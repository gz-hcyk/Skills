<template>
  <!-- 搜索栏（对应魔方 MVC 的 _List_Search.cshtml 分部视图）
       GetPage.search 字段驱动；控件选型复用 buildFormItems（与表单页同源）。
       注意：@submit 勿加 .prevent！TDesign t-form 内部已 e.preventDefault()（form.mjs _onSubmit），
       onSubmit 回调参数是 { validateResult, firstError, e } 对象（无 preventDefault 方法），
       .prevent 会让 Vue withModifiers 先调 e.preventDefault() 导致 TypeError。 -->
  <t-form v-if="visible" layout="inline" :data="model" :rules="rules" class="cube-search-bar" @submit="onSubmit">
    <!-- 关键词（Q）：NewLife.Cube 全局模糊搜索，**默认自带**（setting.enableKey 控制）。
         实测 ?Q=行政部 生效；字符串字段精确参数不生效，统一走 Q 关键词。 -->
    <t-form-item v-if="enableKey !== false" label="关键词" name="Q">
      <t-input v-model="keyword" clearable placeholder="关键词" style="width: 180px" @enter="onSubmit" />
    </t-form-item>
    <template v-for="item in items" :key="item.name">
      <t-form-item :label="item.label" :name="item.name">
        <t-select v-if="item.control === 'select'" v-model="model[item.name]" :options="item.options" clearable style="width: 180px" />
        <!-- 多值外键（xxxIDs / 映射自 RoleIds）：多选下拉 -->
        <t-select v-else-if="item.control === 'multi-select'" v-model="model[item.name]" :options="item.options" multiple clearable style="width: 220px" />
        <!-- 布尔（typeName=Boolean）：开关。v-model 初始 undefined（useVModel 原样透传），
             未操作不发参数；开=true / 关=false 才筛选；「重置」清空恢复不筛选 -->
        <t-switch v-else-if="item.control === 'switch'" v-model="model[item.name]" style="margin-top: 6px" />
        <t-tree-select v-else-if="item.control === 'tree-select'" v-model="model[item.name]" :data="item.treeOptions" clearable style="width: 180px" />
        <t-date-picker v-else-if="item.control === 'datetime' || item.control === 'date'" v-model="model[item.name]" clearable style="width: 180px" />
        <!-- 日期范围（itemType=daterange / 搜索栏 DateTime 字段）：提交 dtStart/dtEnd（后端 Search 按 MasterTime 过滤） -->
        <t-date-range-picker v-else-if="item.control === 'daterange'" v-model="model[item.name]" clearable style="width: 280px" />
        <t-date-range-picker v-else-if="item.control === 'datetimerange'" v-model="model[item.name]" enable-time-picker clearable style="width: 320px" />
        <t-input-number v-else-if="item.control === 'number'" v-model="model[item.name]" clearable style="width: 160px" />
        <!-- 邮箱（itemType=mail）：email 输入 + 格式校验 -->
        <t-input v-else-if="item.control === 'email'" v-model="model[item.name]" type="email" clearable placeholder="邮箱" style="width: 180px" />
        <!-- 手机号（itemType=mobile）：tel 输入 + 格式校验 -->
        <t-input v-else-if="item.control === 'tel'" v-model="model[item.name]" type="tel" clearable placeholder="手机号" style="width: 180px" />
        <!-- 其余（html/textarea/image/input）搜索场景统一文本输入 -->
        <t-input v-else v-model="model[item.name]" clearable style="width: 180px" />
      </t-form-item>
    </template>
    <t-form-item>
      <t-space>
        <t-button theme="primary" type="submit">查询</t-button>
        <t-button theme="default" @click="onReset">重置</t-button>
      </t-space>
    </t-form-item>
    <slot name="extra" />
  </t-form>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { buildFormItems, buildFormRules, formItemName, selectFormControl, type LookupMap } from '../../api/fieldRender';
import type { DataField } from '../../api/useEntityResource';

/**
 * 搜索栏：渲染 + 查询参数拼装（内聚 NewLife.Cube Search 契约）。
 * 对外只 emit search(params)——宿主（ListPage）无需关心参数语义，直接交给列表接口。
 */
const props = defineProps<{
  /** GetPage.search 字段集合 */
  fields: DataField[];
  /** 外键/枚举字典（关联源 lookups，含 /Cube/Lookup 按 typeName 解析的枚举字典） */
  lookups?: LookupMap;
  /** LovController 枚举值集（lovCode=Enum.*），供搜索栏枚举字段下拉 */
  lovOptions?: Record<string, { value: string | number; label: string }[]>;
  /** 搜索参数名映射：{ 搜索项键 : 后端真实参数名 }（虚拟映射字段如 User.RoleID 映射到 roleIds） */
  searchParamMap?: Record<string, string>;
  /**
   * GetPage.setting.enableKey：**是否显示关键词（Q）搜索框**——魔方 MVC 语义是「启用关键字搜索」，
   * 默认自带（传 undefined/true 均显示）。与列表主键列显隐无关（那是 `showIdColumn`）。
   */
  enableKey?: boolean;
}>();
const emit = defineEmits<{ (e: 'search', params: Record<string, unknown>): void }>();

const model = reactive<Record<string, any>>({});
// 关键词（全局模糊搜索 Q）：独立于 search 字段组，默认自带
const keyword = ref('');
const items = computed(() => buildFormItems(props.fields, props.lookups, props.lovOptions, true));
/**
 * 搜索栏校验规则（元数据驱动，单源）：复用 buildFormRules，**不含必填规则**——
 * 搜索项均为可选；但 itemType=mail→`{type:'email'}`、itemType=mobile→`{telnumber:true}`
 * 格式规则仍追加，输入非法格式时拦截查询（TDesign t-form 提交时自动校验，
 * 通过 @submit 的 firstError 判断是否放行）。
 */
const rules = computed(() => buildFormRules(props.fields, { required: false }));
// 关键词框存在时，即使 search 组为空也应显示搜索栏
const visible = computed(() => items.value.length > 0 || props.enableKey !== false);

/**
 * Search 参数契约（curl 实测）：
 *  - 数值/枚举/布尔/日期字段：字段参数直接过滤（parentID / enable / type，大小写不敏感）；
 *  - 字符串字段精确参数不生效（code=011、name=行政部 返回全量）→ 并入 Q 关键词模糊搜索；
 *  - 数组（多值外键）原样发；虚拟映射字段（User.RoleID）经 searchParamMap 映射。
 */
function buildParams(): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  // 关键词优先（放在 Q 串最前），与字符串字段条件合并为一个 Q（空格分隔）
  const q: string[] = [];
  const kw = keyword.value != null ? String(keyword.value).trim() : '';
  if (kw) q.push(kw);
  for (const f of props.fields) {
    if (f.primaryKey || f.isIdentity) continue;
    let k = formItemName(f);
    const v = model[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    // 日期范围 → dtStart/dtEnd（后端 ReadOnlyEntityController2.Search 统一按 MasterTime 过滤）。
    // 日期范围取值为 [start, end] 数组：日期型补 00:00:00 / 23:59:59 成当天闭区间；
    // 日期时间型（enable-time-picker）值已含时分秒，原样下发。
    const ctrl = selectFormControl(f);
    if (ctrl === 'daterange' || ctrl === 'datetimerange') {
      if (Array.isArray(v) && v.length === 2) {
        const s = v[0];
        const e = v[1];
        if (s) params['dtStart'] = ctrl === 'datetimerange' ? String(s) : `${s} 00:00:00`;
        if (e) params['dtEnd'] = ctrl === 'datetimerange' ? String(e) : `${e} 23:59:59`;
      }
      continue;
    }
    k = props.searchParamMap?.[k] ?? k;
    const tn = ((f.typeName ?? f.type ?? '') as string).toLowerCase();
    if (Array.isArray(v)) {
      params[k] = v;
    } else if (tn === 'string' || tn === 'text' || tn.includes('char')) {
      q.push(String(v));
    } else {
      params[k] = v;
    }
  }
  if (q.length) params.Q = q.join(' ');
  return params;
}

/**
 * 查询提交：TDesign t-form 在提交时会自动按 :rules 校验，并把结果通过
 * `{ validateResult, firstError }` 传给 @submit。firstError 非空即校验未过，
 * 拦截查询；否则拼装参数 emit 给宿主（ListPage）。
 */
function onSubmit(ctx?: { validateResult?: Record<string, any>; firstError?: string }) {
  if (ctx?.firstError) return; // 校验未过（如邮箱/手机号格式非法），不发起查询
  emit('search', buildParams());
}
function onReset() {
  for (const k of Object.keys(model)) delete model[k];
  keyword.value = ''; // 关键词一并清空
  emit('search', {}); // 重置后重新加载（无过滤条件）
}
</script>

<style scoped>
.cube-search-bar { margin-bottom: 12px; }
</style>

/**
 * 字段渲染器 —— 把后端 DataField 翻译成 TDesign 控件定义
 * 落地为 src/api/fieldRender.ts。规则表见 references/field-renderers.md。
 *
 * 本文件贯彻两大核心规则（详见 references/field-renderers.md §3、§7）：
 *  1) 字段映射（xxxID 双模式）：列表一律显示“映射后的名称”，表单一律用“映射源”渲染下拉。
 *  2) 组件/页面选型（元数据驱动）：ListPage 用哪种表格、表单用哪种控件，全部由后端字段集合决定。
 */
import type { DataField } from './useEntityResource';
import { camel } from './useEntityResource';
import { Image, Link, Icon } from 'tdesign-vue-next';

export type FieldControl =
  | 'input'
  | 'textarea'
  | 'number'
  | 'switch'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multi-select'
  | 'tree-select'
  | 'email'
  | 'tel'
  | 'html'
  | 'image'
  | 'file' // itemType=file：文件上传（t-upload theme=file），值存 URL 字符串
  | 'color' // itemType=color：颜色选择器（t-color-picker），值存色值字符串
  | 'icon' // itemType=icon：图标选择器，值存图标名字符串
  | 'url' // itemType=url：网址输入（t-input type=url，校验 {type:'url'}）
  | 'json' // itemType=json：JSON 编辑器（无第三方库时退化为 t-textarea，待接编辑器）
  | 'markdown' // itemType=markdown：Markdown 编辑器（无第三方库时退化为 t-textarea）
  | 'lov-table' // itemType=lovTable / singleSelect(lovCode=List.*)：LOV 弹窗表格单选
  | 'lov-table-multi' // itemType=lovTableMulti / multipleSelect(lovCode=List.*)：LOV 弹窗表格多选
  | 'daterange' // itemType=daterange / 搜索栏 DateTime 字段：日期范围，提交 dtStart/dtEnd
  | 'datetimerange'; // itemType=datetimerange：日期时间范围，提交 dtStart/dtEnd

// ---------- 字段展示行为（元数据属性 → 前端行为）----------

/**
 * 字段展示行为：由后端元数据属性推导，**各属性语义独立，不可互相推导**。
 */
export interface FieldBehavior {
  /** 界面是否必填（加校验规则 + 红星） */
  required: boolean;
  /** 是否只读（控件禁用，值只展示） */
  readOnly: boolean;
  /** 数据库是否允许为空（NOT NULL 约束），仅作辅助提示 */
  nullable: boolean;
  /** 是否主键（主键由系统维护，表单/列表通常排除） */
  primaryKey: boolean;
}

/**
 * 推导字段的展示行为。
 *
 * **必填判定（关键，易错）**：
 *  - `required === true` → 必填（UI 层明确要求）；
 *  - 否则（后端未下发 / 下发 false / null）→ 用 `nullable === false` **兜底推断**
 *    （数据库 NOT NULL 通常意味着必填），但排除「系统维护字段」：
 *    主键、自增、只读、以及 CreateTime/UpdateTime/CreateUserID/UpdateUserID/CreateIP 等
 *    审计字段由系统自动赋值，不应要求用户填写。
 *
 *  > 为何不把 `required === false` 当作「明确不必填」：实测本后端对所有字段都下发
 *  > `required:false`（0 个 true），若照此判定则连 `Name` 这类业务必填项都不校验。
 *  > 故 `required` 只在为 `true` 时生效，其余情况交给 `nullable` 兜底推断。
 *
 * **此前 bug**：直接用 `nullable === false` 当必填，未排除主键/审计/只读字段，
 *   导致 ID、CreateTime、CreateUserID 等也被标红星要求用户填写。
 */
export function resolveFieldBehavior(f: DataField): FieldBehavior {
  const required = f.required === true ? true : inferRequired(f);
  return {
    required,
    readOnly: f.readOnly === true,
    nullable: f.nullable !== false,
    primaryKey: f.primaryKey === true,
  };
}

/** 由系统自动赋值、不应要求用户填写的字段（按字段名小写匹配） */
const SYSTEM_MANAGED_FIELDS = new Set([
  'createtime', 'updatetime', 'createuserid', 'updateuserid',
  'createuser', 'updateuser', 'createip', 'updateip',
]);

/**
 * `required` 缺省时用 `nullable` 兜底推断是否必填。
 * 排除主键/自增/只读/系统维护字段，避免把审计字段误判为用户必填。
 */
function inferRequired(f: DataField): boolean {
  if (f.nullable !== false) return false; // 允许为空 → 不必填
  if (f.primaryKey || f.isIdentity) return false; // 主键/自增由系统生成
  if (f.readOnly === true) return false; // 只读字段无需用户填写
  if (SYSTEM_MANAGED_FIELDS.has(f.name.toLowerCase())) return false; // 审计字段自动赋值
  return true;
}

// ---------- 字段分类辅助 ----------

/** 以 ID/Id 结尾的字段名后缀 */
const ID_SUFFIXES = ['ID', 'Id'];
/** 以 IDs/Ids 结尾（复数）→ 多值外键 → 多选下拉 */
const IDS_SUFFIXES = ['IDs', 'Ids'];

/**
 * 是否为“映射字段”：字段名以 ID/Id 结尾，且不是自身主键/自增。
 * 如 StatusID、CategoryID、CreateUserID、ParentID 都算；实体自身的 Id 不算。
 */
export function isIdField(f: DataField): boolean {
  if (f.primaryKey || f.isIdentity) return false;
  return ID_SUFFIXES.some((s) => f.name.endsWith(s));
}

/**
 * 是否为“多值映射字段”：字段名以 IDs/Ids 结尾（如 RoleIds、DataDepartmentIds）。
 * 这类字段在库中以逗号分隔字符串存储（typeName 为 String），表单应渲染多选下拉。
 */
export function isIdsField(f: DataField): boolean {
  if (f.primaryKey || f.isIdentity) return false;
  return IDS_SUFFIXES.some((s) => f.name.endsWith(s));
}

/**
 * 是否为“映射字段”：**`mapField` 属性非空即为映射字段**，该属性值就是**原始字段名称**。
 * 如 TenantName(mapField=TenantId)、RoleNames(mapField=RoleIds)、ParentName(mapField=ParentID)。
 * 映射字段一律用下拉列表展示，选项来自原始字段的关联源。
 */
export function isMappedField(f: DataField): boolean {
  return !!(f.mapField && String(f.mapField).trim());
}

/** 取映射字段指向的原始字段名（即 mapField 值）；非映射字段返回空串 */
export function mappedFieldName(f: DataField): string {
  return isMappedField(f) ? String(f.mapField).trim() : '';
}

/**
 * 该字段是否“指向”某个外键：字段名本身是 xxxID/xxxIDs，或它是映射字段（mapField 非空）。
 * 实测所有 mapField 值均以 ID/Id/IDs/Ids 结尾（TenantId/RoleIds/ParentID…），
 * 但按“mapField 非空即映射”的契约，此处不再要求后缀匹配。
 */
export function isForeignRef(f: DataField): boolean {
  return isIdField(f) || isIdsField(f) || isMappedField(f);
}

/** 映射字段（TenantName）的 mapField 是否指向外键字段（TenantId / RoleIds） */
export function refersToForeignKey(f: DataField): boolean {
  const m = f.mapField;
  if (!m) return false;
  return ID_SUFFIXES.some((s) => m.endsWith(s)) || IDS_SUFFIXES.some((s) => m.endsWith(s));
}

/**
 * 取外键基名（去 ID/IDs 后缀），用于 lookups 字典键：
 * CategoryID → Category、RoleIds → Role、ProductTypeId → ProductType。
 *
 * **映射字段（mapField 非空）一律以原始字段名（mapField 值）为准**：
 * TenantName(mapField=TenantId) → Tenant、RoleNames(mapField=RoleIds) → Role。
 */
export function lookupBaseName(f: DataField): string {
  // LOV 实体列表（lovCode=List.{area}.{controller}）：基名取 controller，
  // 列表/详情回显名称时按此基名查 lookups（如 List.CubeDemo.Role → 'Role'）。
  const lc = (f.lovCode ?? '').toString().trim();
  if (lc.toLowerCase().startsWith('list.')) {
    const p = parseLovListCode(lc);
    if (p) return p.controller;
  }
  // 映射字段：用 mapField（原始字段名）；否则用自身字段名
  const n = isMappedField(f) && !isIdField(f) && !isIdsField(f) ? mappedFieldName(f) : f.name;
  if (n.endsWith('IDs')) return n.slice(0, -3);
  if (n.endsWith('Ids')) return n.slice(0, -3);
  if (n.endsWith('ID')) return n.slice(0, -2);
  if (n.endsWith('Id')) return n.slice(0, -2);
  return n;
}

/**
 * 基础类型名集合（小写比较）。typeName 不在此集合内 → 判定为**枚举类型名** → 下拉。
 * 实测后端枚举：DepartmentTypes / SexKinds / MenuTypes / DataScopes / RoleTypes。
 */
const PRIMITIVE_TYPES = new Set([
  'int16', 'int32', 'int64', 'int', 'long', 'short', 'byte', 'sbyte',
  'uint16', 'uint32', 'uint64', 'uint', 'ulong', 'ushort',
  'single', 'float', 'double', 'decimal',
  'string', 'boolean', 'bool', 'datetime', 'date', 'time', 'timespan', 'guid',
]);

/** typeName 是否为枚举类型名（非基础类型且非空）→ 该字段应渲染为下拉 */
export function isEnumType(f: DataField): boolean {
  const t = ((f.typeName ?? f.type ?? '') as string).trim();
  if (!t) return false;
  return !PRIMITIVE_TYPES.has(t.toLowerCase());
}

// ---------- LOV（值集）关联源：lovCode 驱动的两种取值方式 ----------

/**
 * 关联源（lovCode）类型：
 *  - `enum`：枚举字典（`lovCode` 形如 `Enum.{命名空间}.{枚举名}`，如
 *    `Enum.CubeDemo.Areas.Test.测试枚举`）→ 走枚举字典接口，前端渲染为下拉/多选下拉。
 *  - `list`：实体列表（`lovCode` 形如 `List.{area}.{controller}`，如 `List.CubeDemo.Role`）
 *    → 走该实体 `Index` 列表弹窗表格选择，渲染为 LOV 弹窗表格（单选/多选）。
 *  - `null`：无显式关联源（纯外键走 useLookups 约定式兜底）。
 *
 * > 这是魔方「值集」字段的两种取值通道：枚举是静态字典（单/多选下拉），实体列表是动态
 * > 数据（弹窗表格）。`singleSelect`/`multipleSelect` 的 `lovCode` 决定走哪条。
 */
export function lovTypeOf(f: DataField): 'enum' | 'list' | null {
  const code = (f.lovCode ?? '').toString().trim();
  if (!code) return null;
  const lower = code.toLowerCase();
  if (lower.startsWith('list.')) return 'list';
  if (lower.startsWith('enum.')) return 'enum';
  // 兜底：未知前缀当作枚举字典
  return 'enum';
}

/**
 * 解析 `List.{area}.{controller}` 形式的 lovCode，得到 LOV 弹窗表格要拉取的实体。
 *  - `List.CubeDemo.Role` → { area: 'CubeDemo', controller: 'Role' }
 *  - 多段命名空间取首段为 area、末段为 controller（中间段并入 area，如
 *    `List.CubeDemo.Areas.Test.Role` → area='CubeDemo/Areas/Test', controller='Role'）。
 * 不含 `List.` 前缀或不足两段 → 返回 null。
 */
export function parseLovListCode(code: string): { area: string; controller: string } | null {
  const parts = code.split('.').filter(Boolean);
  if (parts.length && parts[0].toLowerCase() === 'list') parts.shift();
  if (parts.length < 2) return null;
  const controller = parts.pop() as string;
  const area = parts.join('/');
  return { area, controller };
}

// ---------- 组件选型（元数据驱动，见 field-renderers.md §7）----------

export type ListComponent = 'flat' | 'tree';

/** 列表组件选型：依据 list 字段集合判定用普通表还是树形表 */
export function selectListComponent(fields: DataField[]): ListComponent {
  return isTreeSchema(fields) ? 'tree' : 'flat';
}

/**
 * 表单控件选型（元数据驱动，按优先级自上而下，首个命中即采用）。
 *
 * 1. `itemType` 特化编辑器：html / mail / mobile / image / TimeSpan
 * 2. `typeName === 'Boolean'` → 开关
 * 3. **映射字段（`mapField` 非空）→ 下拉**：原始字段为复数（xxxIDs/xxxIds）
 *    → 多选下拉；为 ParentID → 树形下拉；其余 → 单选下拉
 * 4. 字段名 `xxxIDs/xxxIds`（复数外键）→ 多选下拉
 * 5. `typeName` 为枚举类型名（非基础类型）→ 单选下拉
 * 6. 字段名 `xxxID/xxxId`：ParentID → 树形下拉；其余 → 单选下拉
 * 7. 有 `map`/`dataSource` → 单选下拉
 * 8. 按基础 `typeName` 兜底：DateTime/数字/长文本/输入
 */
export function selectFormControl(f: DataField): FieldControl {
  // 1) itemType 特化编辑器（按优先级自上而下，首个命中即采用）
  const it = (f.itemType ?? '').toString().trim().toLowerCase();
  if (it === 'html') return 'html';
  if (it === 'mail') return 'email';
  if (it === 'mobile') return 'tel';
  if (it === 'image') return 'image';
  if (it === 'file') return 'file';
  if (it === 'color') return 'color';
  if (it === 'icon') return 'icon';
  if (it === 'url') return 'url';
  if (it === 'json') return 'json';
  if (it === 'markdown') return 'markdown';
  // LOV 弹窗表格选择（itemType 显式指定）
  if (it === 'lovtable') return 'lov-table';
  if (it === 'lovtablemulti') return 'lov-table-multi';
  // 日期范围（搜索栏常用）：提交 dtStart/dtEnd（后端 Search 统一按 MasterTime 过滤）
  if (it === 'daterange') return 'daterange';
  if (it === 'datetimerange') return 'datetimerange';
  // singleSelect / multipleSelect：有 lovCode=List.* → LOV 弹窗表格；否则下拉
  if (it === 'singleselect' || it === 'multipleselect') {
    const lov = lovTypeOf(f);
    if (lov === 'list') return it === 'multipleselect' ? 'lov-table-multi' : 'lov-table';
    return it === 'multipleselect' ? 'multi-select' : 'select';
  }

  // 2) Boolean → 开关
  const tn = ((f.typeName ?? f.type ?? '') as string).trim();
  const t = tn.toLowerCase();
  if (t === 'boolean' || t === 'bool') return 'switch';

  // 3) 映射字段（mapField 非空）→ 下拉；按原始字段名细分控件类型
  if (isMappedField(f)) {
    const src = mappedFieldName(f);
    if (IDS_SUFFIXES.some((s) => src.endsWith(s))) return 'multi-select';
    if (src.toLowerCase() === 'parentid') return 'tree-select';
    return 'select';
  }

  // 4) 复数外键 xxxIDs/xxxIds → 多选下拉
  if (isIdsField(f)) return 'multi-select';

  // 5) 枚举类型名（非基础类型）→ 单选下拉
  if (isEnumType(f)) return 'select';

  // 6) 单值外键 xxxID/xxxId
  if (isIdField(f)) {
    return f.name.toLowerCase() === 'parentid' ? 'tree-select' : 'select';
  }

  // 7) 枚举/字典选项源
  if (f.map || f.dataSource) return 'select';

  // 8) 基础类型兜底
  if (t.includes('datetime')) return 'datetime';
  if (t === 'date') return 'date';
  if (t === 'timespan') return 'input'; // 时长：暂无专用控件，退化为输入
  if (['int16', 'int32', 'int64', 'int', 'long', 'short', 'byte', 'sbyte',
       'uint16', 'uint32', 'uint64', 'uint', 'ulong', 'ushort',
       'single', 'float', 'double', 'decimal'].includes(t)) return 'number';
  if (t === 'string' && (f.length || 0) > 200) return 'textarea';
  return 'input';
}

/** 兼容旧名 controlOf → 委托 selectFormControl */
export function controlOf(f: DataField): FieldControl {
  return selectFormControl(f);
}

/**
 * 是否为「日期范围」控件（daterange / datetimerange）。
 * 这类控件的值是 `[start, end]` 两元数组，与单值控件的读写语义不同：
 *  - 搜索栏（ListSearchBar）：拆成后端 `dtStart` / `dtEnd` 两个查询参数（后端 Search 按 MasterTime 过滤）；
 *  - 表单页（FormDialog）：实体只有一列，按逗号分隔字符串存储（见 serializeRangeValue）。
 */
export function isRangeControl(ctrl: FieldControl): boolean {
  return ctrl === 'daterange' || ctrl === 'datetimerange';
}

// ---------- 字段映射（xxxID 双模式，见 field-renderers.md §3）----------

/** lookups：外键关联源字典，键为 lookupBaseName（去 ID 后缀），值为 { 原始值: 显示名 } */
export type LookupMap = Record<string, Record<string, string>>;

/**
 * 在 lookups 中按基名（大小写不敏感）取字典：兼容 PascalCase(Parent) 与 camelCase(parent) 两种后端命名，
 * 避免“键大小写不匹配”导致外键/ParentID 列回显不出名称。
 */
function lookupDict(lookups: LookupMap | undefined, base: string): Record<string, string> | undefined {
  if (!lookups || !base) return undefined;
  const t = base.toLowerCase();
  const hit = Object.keys(lookups).find((k) => k.toLowerCase() === t);
  return hit ? lookups[hit] : undefined;
}

/** 枚举/字典 → 下拉选项（映射源） */
export function toOptions(f: DataField): { value: string | number; label: string }[] {
  if (f.map) return Object.entries(f.map).map(([value, label]) => ({ value, label }));
  if (f.dataSource) return f.dataSource.map((d) => ({ value: d.value, label: d.text }));
  return [];
}

/**
 * 是否为多值字段：自身字段名以 `IDs/Ids` 结尾，或作为映射字段其原始字段（mapField）
 * 以 `IDs/Ids` 结尾（如 RoleNames → RoleIds）。多值以逗号分隔字符串存储。
 */
export function isMultiValue(f: DataField): boolean {
  if (isIdsField(f)) return true;
  const src = mappedFieldName(f);
  return !!src && IDS_SUFFIXES.some((s) => src.endsWith(s));
}

/**
 * 解析下拉选项（映射源解析顺序）：
 *   1) field.map（值→名 字典，同时充当选项）
 *   2) field.dataSource（{text,value}[] 选项源）
 *   3) lovOptions[lovCode]：由 LovController `Meta` 拉取的**权威枚举值集**（lovCode=Enum.*）
 *   4) lookups[关联源基名]：由页面/前端异步拉取的 id→名 字典
 *      —— 映射字段（mapField 非空）用**原始字段名**取基名（TenantName → Tenant）
 * 四者皆无则返回空（此时该字段在表单中退化为普通输入或隐藏，由页面策略决定）。
 */
export function resolveOptions(
  f: DataField,
  lookups?: LookupMap,
  lovOptions?: Record<string, { value: string | number; label: string }[]>,
): { value: string | number; label: string }[] {
  const base = toOptions(f);
  if (base.length) return base;
  // LovController 枚举值集（lovCode=Enum.*）优先于约定式 lookups
  if (f.lovCode && lovOptions) {
    const code = String(f.lovCode).trim();
    const opts = lovOptions[code];
    if (opts && opts.length) return opts;
  }
  // 通道1：官方 /Cube/Lookup 枚举字典（按枚举类型名解析，存于 lookups[f.typeName]）。
  // 覆盖未配 lovCode 的纯枚举字段（sex/role/enable 等无实体表的静态字典）。
  if (isEnumType(f) && !f.lovCode && !f.map && !f.dataSource && lookups) {
    const ed = lookupDict(lookups, f.typeName ?? '');
    if (ed) return Object.entries(ed).map(([value, label]) => ({ value, label }));
  }
  if (isForeignRef(f) && lookups) {
    const dict = lookupDict(lookups, lookupBaseName(f));
    if (dict) return Object.entries(dict).map(([value, label]) => ({ value, label }));
  }
  return [];
}

/**
 * 列表回显（xxxID 一律显示映射名称，绝不显示原始 ID 数值）：
 *   1) field.map[value]
 *   2) field.dataSource 中 value 对应的 text
 *   3) lovOptions[lovCode]：由 LovController `Meta` 拉取的**权威枚举值集**（lovCode=Enum.*）
 *   4) lookups[关联源基名][value]
 * 都没有则返回原值（通常是无法解析的外键，页面可选择隐藏该列）。
 */
export function labelOf(
  f: DataField,
  value: unknown,
  lookups?: LookupMap,
  lovOptions?: Record<string, { value: string | number; label: string }[]>,
): unknown {
  if (value == null) return value;
  if (f.map) return f.map[String(value)] ?? value;
  if (f.dataSource) return f.dataSource.find((d) => d.value === value)?.text ?? value;
  // LovController 枚举值集（lovCode=Enum.*）优先于约定式 lookups
  if (f.lovCode && lovOptions) {
    const code = String(f.lovCode).trim();
    const opts = lovOptions[code];
    if (opts && opts.length) {
      if (isMultiValue(f)) {
        const parts = String(value)
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length > 1) {
          return parts
            .map((p) => opts.find((o) => String(o.value) === p)?.label ?? p)
            .join('、');
        }
      }
      const hit = opts.find((o) => String(o.value) === String(value));
      if (hit) return hit.label;
    }
  }
  // 通道1：官方 /Cube/Lookup 枚举字典（按枚举类型名解析，存于 lookups[f.typeName]）
  if (isEnumType(f) && !f.lovCode && !f.map && !f.dataSource && lookups) {
    const ed = lookupDict(lookups, f.typeName ?? '');
    if (ed) {
      const hit = ed[String(value)];
      if (hit != null) return hit;
    }
  }
  if (isForeignRef(f) && lookups) {
    const dict = lookupDict(lookups, lookupBaseName(f));
    if (dict) {
      // 多值外键（RoleIds="1,3,5"）：逐个映射后用顿号拼接
      if (isMultiValue(f)) {
        const parts = String(value)
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length > 1) {
          return parts.map((p) => dict[p] ?? p).join('、');
        }
      }
      return dict[String(value)] ?? value;
    }
  }
  // Boolean 字段在列表里显示为「是/否」，比 true/false 更友好
  const t = ((f.typeName ?? f.type ?? '') as string).toLowerCase();
  if (t === 'boolean' || t === 'bool') {
    if (value === true || value === 1 || value === '1' || value === 'true') return '是';
    if (value === false || value === 0 || value === '0' || value === 'false') return '否';
  }
  return value;
}

// ---------- 树形（见 field-renderers.md §4）----------

/**
 * 树形判定：传入**全部字段组聚合**（list + addForm + editForm + detail + search），
 * 命中任一即树形：
 *  1) 存在名为 ParentID 的字段（不区分大小写）；
 *  2) 存在 `mapField === ParentID` 的**映射字段**（如 ParentName —— 列表列用映射名称显示
 *     父级，但 ParentID 本身可能不在 list 组、只在表单/搜索组出现）。
 * 只查 list 组会漏判：NewLife.Cube 常把 ParentID 从 list 列隐藏、仅以 ParentName 映射列展示。
 */
export function isTreeSchema(fields: DataField[]): boolean {
  return fields.some(
    (f) =>
      f.name.toLowerCase() === 'parentid' ||
      String(f.mapField ?? '').toLowerCase() === 'parentid',
  );
}

/**
 * 扁平数组（含 parentID）→ 树（带 children）。
 *
 * **归一化（关键，修复真实后端树状显示失效）**：
 * NewLife.Cube 真实后端常返回 **PascalCase** 字段名（ID/ParentID/Name），
 * 而前端列 colKey、t-table 的 `row-key="id"`、t-tree-select 的 value/label
 * 均按 **camelCase**（id/parentID/name）访问。
 * 若直接按 'parentID' 取父键会得到 undefined，导致所有节点都被判为根节点
 * → 树塌成平铺（用户看到的“表没树状显示”）。
 * 故此处先把每行 key 归一到 camelCase（同时兼容 PascalCase/混合命名），
 * 保证父子链接、row-key、列回显三者一致。返回新对象，不改动原始 rows（避免污染编辑回填）。
 */
export function buildTree(rows: any[], idKey = 'id', parentKey = 'parentID'): any[] {
  if (!rows.length) return [];
  // 归一化每行 key 为 camelCase（兼容后端 PascalCase / 混合命名）
  const nodes = rows.map((r) => {
    const o: Record<string, any> = {};
    for (const k of Object.keys(r)) o[camel(k)] = r[k];
    return o;
  });
  const childrenMap = new Map<any, any[]>();
  const roots: any[] = [];
  for (const r of nodes) {
    const pid = r[parentKey];
    if (pid == null || pid === '' || pid === 0) roots.push(r);
    else {
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid)!.push(r);
    }
  }
  const link = (node: any) => {
    const c = childrenMap.get(node[idKey]);
    if (c) {
      node.children = c;
      c.forEach(link);
    }
  };
  roots.forEach(link);
  return roots;
}

/** 树节点 → t-tree-select 数据格式（排除自身，避免选自己为父） */
export function toTreeSelectData(nodes: any[], excludeId?: string | number): any[] {
  return nodes
    .filter((n) => excludeId == null || String(n[idName(n)]) !== String(excludeId))
    .map((n) => ({
      label: n.name ?? n[idName(n)],
      value: n[idName(n)],
      children: n.children ? toTreeSelectData(n.children, excludeId) : undefined,
    }));
}
function idName(n: any): string {
  return 'id' in n ? 'id' : Object.keys(n).find((k) => k.toLowerCase() === 'id') ?? 'id';
}

// ---------- 列 / 表单项生成（统一使用选型函数）----------

/**
 * 由 list 字段生成 t-table 列定义。xxxID / 有 map / 有 dataSource 的列一律回显映射名称。
 *
 * **自适应列宽 + 不抖动的关键设计（同时满足“自适应列宽”与“操作列固定右侧”两项原始需求）**：
 *  - 列定义（colKey/title/ellipsis/sortable/cell）**只由 schema 字段决定**，与字典/行数据解耦。
 *    字典分批到达（schema → lookups → data）时，列定义数组引用**保持不变**，
 *    因此 TDesign 表格不会反复重建列头/重分布列宽（这是此前“列宽不断刷新”的根因）。
 *  - 单元格映射名称通过 `getLookups()` 在**渲染时**按需读取（getLookups 返回响应式字典，
 *    字典到达后表格自动重渲对应单元格），只刷新单元格内容、不重建列。
 *  - 数据列**必须给显式 width**（元数据类型/length 推导，见下方实现）：TDesign 固定列
 *    仅 `table-layout:fixed` 下可靠生效，`auto` 布局会让超宽内容撑爆容器（页面横向
 *    滚动 + sticky 操作列失效）。超宽内容交由 `ellipsis` 截断。
 *
 * @param fields   list 字段集合（来自 GetPage.schema.list）
 * @param getLookups  可选；返回当前外键/枚举字典的 getter（应为响应式读取，如 `() => columnLookups.value`）。
 *                    传值而非闭包捕获构建时的字典，列定义引用才不随字典分批到达而反复变化。
 * @param showKey  可选；为 true 时保留主键列（GetPage.setting.enableKey=true 显示编号列），默认隐藏。
 * @param getLovOptions  可选；返回 LovController 枚举值集的 getter（响应式，如 `() => lovOptions.value`），
 *                    供 labelOf 在第 3 优先级回显枚举值集名称（lovCode=Enum.*）。
 */
export function buildColumns(
  fields: DataField[],
  getLookups?: () => LookupMap | undefined,
  showKey?: boolean,
  getLovOptions?: () => Record<string, { value: string | number; label: string }[]> | undefined,
): any[] {
  return fields
    .filter((f) => !f.primaryKey || showKey)
    .map((f) => {
      const key = camel(f.name);
      // 链接操作列：typeName 为空/null 且 url 非空（如 Link/Token/Log/OAuthLog:
      // url="/Admin/UserConnect?userId={ID}"）——渲染为行级链接，{ID} 替换为主键。
      const isLink = !((f.typeName ?? f.type ?? '').toString().trim()) && !!f.url;
      const isLovList = lovTypeOf(f) === 'list';
      // 映射字段（mapField 非空）/ 外键 / 枚举 / 有 map / 有 dataSource / Boolean → 显示映射名称或「是否」
      const isMapped = isMappedField(f) || isForeignRef(f) || isEnumType(f) || !!f.map || !!f.dataSource || isLovList;
      const isBool = ['boolean', 'bool'].includes(((f.typeName ?? f.type ?? '') as string).toLowerCase());
      const itemType = (f.itemType ?? '').toString().trim().toLowerCase();
      const isImage = itemType === 'image';
      const isColor = itemType === 'color';
      const isFile = itemType === 'file';
      const isIcon = itemType === 'icon';
      // 列对齐：GetPage.textAlign 0=左 1=中 2=右（TDesign col.align 取值 left/center/right）
      const align: any = [0, 1, 2].includes(f.textAlign as number)
        ? (['left', 'center', 'right'][f.textAlign as number] as const)
        : undefined;
      // 列宽（table-layout:fixed 下列必须有显式 width，否则被 defaultColWidth=100px 压缩，
      // 且 auto 布局会让内容撑爆容器、fixed 列失效——见 ListPage 注释）：
      //  ① 元数据 length/maxWidth 语义=「列内容最大字符宽」（区别于表单 maxlength），按 13px/字符换算并钳制 [120,260]；
      //  ② 特殊类型给经验宽：bool 80、图片/图标/颜色 90、数值 100、日期时间 170、日期 120；
      //  ③ 其余文本兜底 150，超宽内容走 ellipsis 截断（本列已有 ellipsis:true）。
      const colMaxWidth = f.maxWidth && f.maxWidth > 0 ? f.maxWidth : f.length && f.length > 0 ? f.length : undefined;
      const tn = ((f.typeName ?? f.type ?? '') as string).toLowerCase();
      let width: number;
      if (isBool) width = 80;
      else if (isImage || isIcon || isColor) width = 90;
      else if (/int|decimal|float|double|number/.test(tn)) width = 100;
      else if (/datetime|time/.test(tn)) width = 170;
      else if (/date/.test(tn)) width = 120;
      else width = colMaxWidth ? Math.min(Math.max(colMaxWidth * 13, 120), 260) : 150;
      return {
        colKey: key,
        title: f.displayName,
        align,
        width,
        // 超宽内容 ellipsis 截断（fixed 布局下单元格不会撑宽列）。
        ellipsis: true,
        sortable: f.sortable ? true : undefined,
        // 列表一律显示映射名称（map/dataSource/lookup/枚举/是否），不显示原始 ID。
        // 注意：TDesign 1.20.x 的 col.cell 签名为 (h, params) —— 第 1 参数是渲染函数 h，
        // row 在 params.row 里，切勿写成 ({ row }) => ...（会把 h 当 params，row 恒为 undefined）。
        // 字典在渲染时经 getLookups() 取最新值（响应式），字典随后到达也能正确回显名称。
        cell:
          isImage
            ? (_h: any, params: any) => {
                const v = params?.row?.[key];
                if (v == null || v === '') return '-';
                // 图像字段：缩略图展示，点击新窗口打开大图
                return _h(
                  Image,
                  {
                    src: String(v),
                    fit: 'cover',
                    style: { width: '48px', height: '48px', borderRadius: '4px', cursor: 'pointer', display: 'block' },
                    onClick: () => window.open(String(v), '_blank'),
                  },
                );
              }
            : isColor
              ? (_h: any, params: any) => {
                  const v = params?.row?.[key];
                  if (v == null || v === '') return '-';
                  return _h('div', { style: { display: 'inline-flex', alignItems: 'center' } }, [
                    _h('span', {
                      style: {
                        display: 'inline-block',
                        width: '14px',
                        height: '14px',
                        borderRadius: '3px',
                        background: String(v),
                        border: '1px solid var(--td-component-border)',
                        marginRight: '6px',
                      },
                    }),
                    _h('span', { style: { color: 'var(--td-text-color-secondary)' } }, String(v)),
                  ]);
                }
                : isFile
                ? (_h: any, params: any) => {
                    const v = params?.row?.[key];
                    if (v == null || v === '') return '-';
                    return _h(
                      Link,
                      { href: String(v), target: '_blank', hover: 'color', onClick: (e: any) => e.stopPropagation() },
                      () => '下载/查看',
                    );
                  }
                : isIcon
                  ? (_h: any, params: any) => {
                      const v = params?.row?.[key];
                      if (v == null || v === '') return '-';
                      // 图标字段：用 TDesign 字体图标 <Icon name> 回显（name 为 kebab 图标名）
                      return _h(Icon, { name: String(v), style: { fontSize: '18px' } });
                    }
                  : isLink
                  ? (_h: any, params: any) => {
                  // 链接操作列：url 模板中 {ID} 占位符替换为当前行主键（兼容行键大小写），新窗口打开
                  const row = params?.row;
                  const idKey = row ? Object.keys(row).find((k) => k.toLowerCase() === 'id') : undefined;
                  const id = idKey ? String(row[idKey] ?? '') : '';
                  const href = String(f.url || '').replaceAll('{ID}', encodeURIComponent(id)).replaceAll('{Id}', encodeURIComponent(id));
                  return _h(
                    Link,
                    {
                      title: f.title ?? f.headerTitle ?? f.description ?? undefined,
                      onClick: () => window.open(href, '_blank'),
                    },
                    () => f.displayName,
                  );
                }
              : isMapped || isBool
                ? (_h: any, params: any) =>
                  labelOf(
                    f,
                    params?.row?.[key],
                    getLookups ? getLookups() : undefined,
                    getLovOptions ? getLovOptions() : undefined,
                  )
                : undefined,
      };
    });
}

/** 由 form 字段生成表单项定义（供 FormDialog 渲染） */
/**
 * 表单字段提交/回填/校验的统一键名（关键契约）：
 * **映射字段（mapField 非空）用原始字段名**（RoleName→roleID、DepartmentName→departmentID、
 * ParentName→parentID、AreaName→areaId）——后端 POST/详情只认真实列，映射字段是虚拟属性，
 * 按自身名提交（roleName:2）会被后端忽略 → 保存后外键为空（实测 User 新增后角色/部门列空白）。
 * 非映射字段用自身字段名。buildFormItems / FormDialog.rules / 回填 / v-model 必须共用此函数，防止键漂移。
 */
export function formItemName(f: DataField): string {
  const mappedSrc = f.mapField && String(f.mapField).trim();
  return mappedSrc ? camel(mappedSrc) : camel(f.name);
}

export function buildFormItems(
  fields: DataField[],
  lookups?: LookupMap,
  lovOptions?: Record<string, { value: string | number; label: string }[]>,
  isSearch?: boolean,
): any[] {
  return fields
    .filter((f) => !f.primaryKey && !f.isIdentity)
    .map((f) => {
      let ctrl = selectFormControl(f);
      // 搜索栏：日期字段渲染为范围选择器（后端 Search 只读 dtStart/dtEnd 过滤 MasterTime），
      // 单日期搜索后端无对应支持，故 DateTime/date 一律按范围处理。
      if (isSearch) {
        const sit = (f.itemType ?? '').toString().trim().toLowerCase();
        if (sit === 'datetimerange') ctrl = 'datetimerange';
        else if (sit === 'daterange') ctrl = 'daterange';
        else if (ctrl === 'datetime' || ctrl === 'date') ctrl = 'daterange';
      }
      const isTree = ctrl === 'tree-select';
      const isSelect = ctrl === 'select' || ctrl === 'multi-select';
      const behavior = resolveFieldBehavior(f);
      // 宽字段在 2 列网格中占满整行，避免挤压：
      // 长文本 / 富文本 / 树形下拉 / 多选 / 日期时间 / 图像 / 文件上传 / JSON / Markdown / LOV 弹窗表格
      const full =
        ctrl === 'textarea' ||
        ctrl === 'html' ||
        isTree ||
        ctrl === 'multi-select' ||
        ctrl === 'datetime' ||
        ctrl === 'image' ||
        ctrl === 'file' ||
        ctrl === 'json' ||
        ctrl === 'markdown' ||
        ctrl === 'lov-table' ||
        ctrl === 'lov-table-multi' ||
        ctrl === 'daterange' ||
        ctrl === 'datetimerange';
      // 多值外键（自身 xxxIDs 或映射自 RoleIds）以逗号分隔字符串存储 → 表单值与数组互转
      const multiple = ctrl === 'multi-select' || ctrl === 'lov-table-multi';
      const isLovTable = ctrl === 'lov-table' || ctrl === 'lov-table-multi';
      // 日期范围控件（daterange / datetimerange）：控件值为 [start, end] 数组。
      // 搜索栏由 ListSearchBar 映射为 dtStart/dtEnd 两个查询参数；
      // 表单页（FormDialog）落到实体单列，按逗号分隔字符串存储（serializeRangeValue）。
      const range = isRangeControl(ctrl);
      return {
        name: formItemName(f),
        label: f.displayName,
        // 分组：后端返回 camelCase `category`（可能为空串/null）→ 交由页面归到「默认」
        category: ((f.category ?? (f as any).Category ?? '') as string) || '',
        control: ctrl,
        // 必填取 UI 语义的 required（nullable 仅作兜底推断），只读取 readOnly
        required: behavior.required,
        disabled: behavior.readOnly,
        nullable: behavior.nullable,
        full,
        multiple,
        // 日期范围字段标记：控件值为 [start, end] 数组（供 FormDialog 回填/提交时转字符串）
        range,
        maxlength: f.length && f.length > 0 && f.length <= 200 && !isLovTable && !range ? f.length : undefined,
        // 映射源：map/dataSource 直接给；枚举 lovCode 走 LovController 权威值集；外键用 lookups 异步字典
        options: isSelect ? resolveOptions(f, lookups, lovOptions) : undefined,
        // 树形下拉选项（ParentID）：由页面取同实体 Index 组装，且排除自身
        treeOptions: isTree ? lookups?.__selfTree : undefined,
        // LOV 关联源（singleSelect/multipleSelect/lovTable/lovTableMulti）：
        // lovCode（Enum.*=枚举字典下拉 / List.*=实体列表弹窗表格）+ lovType 提示通道
        lovCode: (f.lovCode ?? null) as string | null,
        lovType: lovTypeOf(f),
        placeholder: f.description,
      };
    });
}

/**
 * 由 addForm/editForm 字段元数据生成 TDesign 表单校验规则（**元数据驱动，单源**）。
 *
 * 与 buildFormItems 共用同一套键名契约（formItemName：映射字段用原始字段名，
 * 如 RoleName→roleID），保证规则键与 t-form-item 的 name 完全一致，规则才真正生效。
 *
 * **规则生成（对齐铁律 R2：组件库/框架内置校验规则优先，禁止手写正则重复实现）**：
 *  1) 必填：resolveFieldBehavior(f).required 为真 → `{ required: true, message }`。
 *  2) itemType === 'mail' → 追加 TDesign/async-validator **内置** `{ type:'email', message }`
 *     （非必填空值由 async-validator 自动跳过格式校验，无需手工判空）。
 *  3) itemType === 'mobile' → 追加 TDesign **内置** `{ telnumber: true, message }`
 *     （正则 /^1[3-9]\d{9}$/，复用框架内置规则，不重复实现）。
 *
 * 系统维护字段（主键/自增）不做界面校验，直接跳过。
 */
export interface BuildFormRulesOptions {
  /**
   * 是否包含「必填」规则。
   *  - 表单页（addForm/editForm）默认 true：必填项加红星 + required 校验。
   *  - 搜索栏传 false：搜索项均为可选，不强制必填；但 itemType 的**格式规则**
   *    （mail→email / mobile→telnumber）仍追加，输入非法格式时拦截查询。
   */
  required?: boolean;
}

export function buildFormRules(fields: DataField[], opts: BuildFormRulesOptions = {}): Record<string, any[]> {
  const withRequired = opts.required !== false; // 默认包含必填规则
  const r: Record<string, any[]> = {};
  for (const f of fields) {
    if (f.primaryKey || f.isIdentity) continue; // 系统维护字段不做界面校验
    const name = formItemName(f);
    const list: any[] = [];
    // 必填（仅表单页；搜索栏搜索项均可选，不强制必填）
    if (withRequired && resolveFieldBehavior(f).required) {
      list.push({ required: true, message: `请填写${f.displayName}` });
    }
    const it = (f.itemType ?? '').toString().trim().toLowerCase();
    // itemType 特化格式校验：优先用 TDesign/async-validator 内置规则（铁律 R2）
    // 注意：非必填空值由 async-validator 自动跳过格式校验，故搜索栏留空不会误报。
    if (it === 'mail') {
      list.push({ type: 'email', message: `${f.displayName}格式不正确` });
    } else if (it === 'mobile') {
      list.push({ telnumber: true, message: `${f.displayName}格式不正确` });
    } else if (it === 'url') {
      list.push({ type: 'url', message: `${f.displayName}格式不正确` });
    }
    if (list.length) r[name] = list;
  }
  return r;
}

/**
 * 多值外键字段值的序列化：数组 → 逗号分隔字符串（提交给后端）。
 * 如 RoleIds: ['1','3'] → '1,3'
 */
export function serializeMultiValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.join(',');
  return value;
}

/**
 * 多值外键字段值的反序列化：逗号分隔字符串 → 数组（回填表单多选控件）。
 * 如 RoleIds: '1,3' → ['1','3']
 *
 * **防御（关键，修复 select.tsx 崩溃）**：
 * TDesign 多选 `t-select` 内部的 `getMultipleContent` 会用 `for...of` 遍历 `props.value`，
 * 一旦收到 `null`/`undefined`/空串就会抛
 * `TypeError: can't access property Symbol.iterator, r is null`。
 * 因此这里保证返回值**永远是数组**：
 *  - `null`/`undefined`/空串 → `[]`
 *  - 已是数组 → 原样返回
 *  - 逗号分隔串 → 拆分、去空白、去空项
 *  - 其它单值（如 '3'）→ 包装为 `[value]`
 * 绝不下发 `null`/`undefined`，从源头杜绝多选崩溃。
 */
export function deserializeMultiValue(value: unknown): unknown {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [value];
}

/**
 * 日期范围字段值的序列化：`[start, end]` 数组 → 逗号分隔字符串（提交给后端单列存储）。
 *  - `['2026-01-01','2026-01-31']` → `'2026-01-01,2026-01-31'`
 *  - 空数组 / 全空项 → `''`（清空该列，而非提交 `'[object Object]'` 或 `'undefined'`）
 *
 * > 表单页与搜索栏语义不同：搜索栏的范围拆成 `dtStart`/`dtEnd` 两个**查询参数**
 * > （见 `ListSearchBar.buildParams`）；表单页落到实体的**一个列**，只能存字符串。
 */
export function serializeRangeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const parts = value.map((v) => (v == null ? '' : String(v).trim())).filter(Boolean);
    return parts.join(',');
  }
  if (value == null) return '';
  return value;
}

/**
 * 日期范围字段值的反序列化：逗号分隔字符串 → `[start, end]` 数组（回填 t-date-range-picker）。
 *
 * **防御（关键）**：TDesign `t-date-range-picker` 的 `value` 期望**两元数组**，
 * 收到 `null`/`undefined`/字符串会导致内部取 `value[0]`/`value[1]` 异常或范围显示错乱。
 * 因此这里保证返回值**永远是数组**：
 *  - `null`/`undefined`/空串 → `[]`（picker 显示为空，可正常选择）
 *  - 已是数组 → 取前两项（多余项丢弃；不足 2 项时用首项补齐成单日范围）
 *  - `'a,b'` → `['a','b']`
 *  - 单值 `'2026-01-01'` → `['2026-01-01','2026-01-01']`（语义为单日闭区间，避免半空数组）
 */
export function deserializeRangeValue(value: unknown): string[] {
  const pick = (arr: string[]): string[] => {
    const parts = arr.map((v) => (v == null ? '' : String(v).trim())).filter(Boolean);
    if (!parts.length) return [];
    if (parts.length === 1) return [parts[0], parts[0]];
    return [parts[0], parts[1]];
  };
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return pick(value as string[]);
  if (typeof value === 'string') return pick(value.split(','));
  return pick([String(value)]);
}

/**
 * 表单/详情「按 category 分 tab」统一默认分组名。
 * category 为空串 / null / 空白时，字段归入此默认分组；该分组始终排在最前。
 * 各页面（ConfigView / FormDialog）可经 prop 覆盖为业务自定义名。
 */
export const DEFAULT_CATEGORY = '基础设置';

/**
 * 通用：把带 `category` 字段的项按 category 分组（供表单/详情渲染 tab）。
 * 规则：category 为空 / 空白 → 归入 defaultCategory 组；defaultCategory 组排在最前，其余按出现顺序。
 * 返回数组顺序即 tab 顺序；调用方用 `groups.length > 1` 决定是否显示 tab 头（仅 1 组时退化为扁平）。
 */
export function groupByCategory<T extends { category?: string | null }>(
  items: T[],
  defaultCategory: string = DEFAULT_CATEGORY,
): { category: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const cat = (it.category ?? '').toString().trim() || defaultCategory;
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(it);
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === defaultCategory) return -1;
    if (b === defaultCategory) return 1;
    return 0;
  });
  return keys.map((cat) => ({ category: cat, items: map.get(cat)! }));
}

/**
 * 表单项（buildFormItems 输出，含 .category）按 category 分组（供 FormDialog 渲染 tab）。
 * @param defaultCategory 空 category 归入的分组名，默认 DEFAULT_CATEGORY（'基础设置'）。
 */
export function groupFormItemsByCategory(items: any[], defaultCategory: string = DEFAULT_CATEGORY): { category: string; items: any[] }[] {
  return groupByCategory(items, defaultCategory);
}

/**
 * DataField[]（详情页 / ConfigView）按 category 分组（供详情页渲染 tab）。
 * @param defaultCategory 空 category 归入的分组名，默认 DEFAULT_CATEGORY（'基础设置'）。
 */
export function groupDataFieldsByCategory(fields: DataField[], defaultCategory: string = DEFAULT_CATEGORY): { category: string; items: DataField[] }[] {
  return groupByCategory(fields, defaultCategory);
}

/**
 * 实体资源 composable —— 一个 area/controller 的 CRUD + 元数据封装
 * 落地为 src/api/useEntityResource.ts。配合 fieldRender.ts / auth.ts 使用。
 */
import { ref, computed } from 'vue';
import { getApi, postApi, putApi, deleteApi } from './api';

/**
 * 字段描述符（对齐 NewLife.Cube WebApi 真实 GetPage 返回，字段名 camelCase 且为 PascalCase 原样）。
 *
 * 真实契约（实测 https://localhost:7116 的 /api/Admin/{Entity}/GetPage）：
 *  - `typeName` 既可能是基础类型（Int32/String/Boolean/Double/DateTime/Int64），
 *    也可能是**枚举类型名**（DepartmentTypes/SexKinds/MenuTypes/DataScopes/RoleTypes），
 *    后者表示该字段是枚举 → 单选下拉。
 *  - `mapField` 是外键关联的真实字段名（TenantName→TenantId、RoleNames→RoleIds）。
 *  - `lovCode` 命名关联源（如 Role）用于异步下拉字典。
 *  - `itemType` 标识特化编辑器（html/mail/mobile/TimeSpan）。
 *  - `category` 为 camelCase 分组名，可能为空串或 null。
 */
export interface DataField {
  name: string;
  displayName: string;
  description?: string;
  /** 分组/分类：用于表单按 category 组织 tab；后端返回 camelCase，可能为空串或 null */
  category?: string | null;
  /** 类型名：基础类型或枚举类型名（枚举 → 下拉）。后端为 PascalCase `typeName` */
  typeName?: string | null;
  /** 兼容旧字段：部分后端用 `type` 表达类型 */
  type?: string;
  /** 特化编辑器标识：html / mail / mobile / TimeSpan */
  itemType?: string | null;
  /** 外键关联的真实字段名（TenantName→TenantId）；由 `Name` 类映射字段携带 */
  mapField?: string | null;
  /** 关联源编码（如 Role），用于异步下拉字典 */
  lovCode?: string | null;
  length?: number;
  precision?: number;
  scale?: number;
  /**
   * 数据库是否允许为空（NOT NULL 约束）。
   * **注意**：这是数据库层约束，不等同于界面必填；界面必填看 `required`。
   */
  nullable?: boolean;
  /** 界面是否必填（true → 表单加必填校验 + 红星），这才是 UI 层的必填依据 */
  required?: boolean;
  primaryKey?: boolean;
  isIdentity?: boolean;
  /** 是否只读（true → 表单控件禁用，值只展示不可编辑） */
  readOnly?: boolean;
  /** 是否可见（后端实测恒为 false，不可用于判断是否隐藏列，勿依赖） */
  visible?: boolean;
  sortable?: boolean;
  /** 字段级权限（后端实测为 null，预留） */
  authority?: string | null;
  /** 前端自维护：枚举/字典选项 */
  map?: Record<string, string>;
  dataSource?: { text: string; value: string | number }[];
}

export interface PageSchema {
  setting: Record<string, any>;
  list: DataField[];
  addForm: DataField[];
  editForm: DataField[];
  detail: DataField[];
  search: DataField[];
}

/** 大驼峰字段名 → 小驼峰键（与 JS 对象/JSON camelCase 对齐）。
 *  兼容纯大写缩写（ID→id、URL→url、IP→ip）与 PascalCase（ParentID→parentID、Name→name），
 *  避免朴素“仅小写首字母”把 ID 变成 iD、URL 变成 uRL（会导致 row-key / 列回显 / 树链接全部错位）。 */
export function camel(name: string): string {
  if (!name) return name;
  const m = name.match(/^([A-Z]+)([a-z].*)?$/);
  if (m) {
    if (!m[2]) return name.toLowerCase(); // ID / URL / IP → id / url / ip
    return name.charAt(0).toLowerCase() + name.slice(1); // ParentID → parentID
  }
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * 从行对象中取主键值，兼容 id / ID / Id 等多种大小写。
 * NewLife.XCode 实体主键字段常为大写 `ID`，而列表行经 camelCase 后可能为 `id`，
 * 直接用 `row.id` 在小写未命中时取不到。遍历行键、按小写精确匹配 "id" 可覆盖所有形态。
 */
export function getRowKey(row: any): string | number | null {
  if (!row || typeof row !== 'object') return null;
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === 'id') return row[k];
  }
  return null;
}

/**
 * 把行数组的 key 归一到 camelCase（兼容后端 PascalCase：ID/ParentID/Name），
 * 与列 colKey、t-table 的 row-key="id"、buildTree 的父子链接保持一致。
 * camelCase 数据（如 Mock）原样返回，避免无谓拷贝；仅当检测到含大写开头 key 时才真正归一。
 */
export function normalizeRows(rows: any[]): any[] {
  if (!rows.length) return rows;
  const keys = Object.keys(rows[0]);
  if (keys.every((k) => k === camel(k))) return rows;
  return rows.map((r) => {
    const o: any = {};
    for (const k of Object.keys(r)) o[camel(k)] = r[k];
    return o;
  });
}

/**
 * 归一化 GetPage 响应为前端统一 schema（兼容多种真实后端返回结构）：
 *  - 契约 A（本项目约定）：data 内含独立的 list/addForm/editForm/detail/search 五段数组。
 *  - 契约 B（NewLife.Cube 真实常见）：data 内含扁平 fields 数组，每个字段用 ShowInList/ShowInForm/
 *    ShowInDetail/ShowInSearch（或 List/Form/Detail/Search，或 showIn* 小驼峰）布尔标志标识所属视图。
 *  - 兜底：无任何可识别结构时返回空 schema（由调用方显式报错，避免静默空白）。
 */
export function normalizeSchema(raw: any): PageSchema | null {
  if (!raw || typeof raw !== 'object') return null;
  const arr = (x: any): DataField[] => (Array.isArray(x) ? x : []);

  // 契约 A：存在任一视图数组即采用
  if (raw.list || raw.addForm || raw.editForm || raw.detail || raw.search) {
    return {
      setting: raw.setting ?? {},
      list: arr(raw.list),
      addForm: arr(raw.addForm),
      editForm: arr(raw.editForm),
      detail: arr(raw.detail),
      search: arr(raw.search),
    };
  }

  // 契约 B：扁平 fields + 视图标志位
  if (Array.isArray(raw.fields)) {
    const fields: DataField[] = raw.fields;
    const pick = (...flags: string[]) =>
      fields.filter((f) =>
        flags.some((flg) => (f as any)[flg] === true || (f as any)[flg] === 1),
      );
    // 兼容多种后端字段视图标志位命名（小驼峰 / 大驼峰 / showIn* / Is*）
    const list = pick('list', 'List', 'isList', 'IsList', 'showInList', 'ShowInList');
    const addForm = pick('addForm', 'AddForm', 'form', 'Form', 'isForm', 'IsForm', 'showInAddForm', 'ShowInAddForm', 'showInForm');
    const editForm = pick('editForm', 'EditForm', 'isEditForm', 'IsEditForm', 'showInEditForm', 'ShowInEditForm');
    const detail = pick('detail', 'Detail', 'isDetail', 'IsDetail', 'showInDetail', 'ShowInDetail');
    const search = pick('search', 'Search', 'isSearch', 'IsSearch', 'showInSearch', 'ShowInSearch');
    const anyView = list.length || addForm.length || editForm.length || detail.length || search.length;
    if (!anyView) {
      // 字段无视图标志：退化为全部视图共用全部字段（保证至少能渲染）
      return { setting: raw.setting ?? {}, list: fields, addForm: fields, editForm: fields, detail: fields, search: [] };
    }
    return {
      setting: raw.setting ?? {},
      list,
      addForm: addForm.length ? addForm : fields,
      editForm: editForm.length ? editForm : fields,
      detail: detail.length ? detail : fields,
      search,
    };
  }

  return { setting: raw.setting ?? {}, list: [], addForm: [], editForm: [], detail: [], search: [] };
}

/**
 * 从响应 data（信封内的业务数据）中提取行数组与分页信息，兼容多种固定包裹：
 *  - data 直接为数组（本项目约定 / Mock 列表端点）；
 *  - { rows, page } / { page:{rows} } / { Page:{Rows} }（PascalCase，NewLife.Cube 常见）；
 *  - { data:[...] }。
 *
 * **固定契约（修复“表格行显示字段 name”的 bug）**：
 * GetPage/列表接口返回格式固定——`list` 永远是**字段元数据**（字段描述符），**不是数据行**；
 * 数据行只出现在 `rows` / `page.rows` / `Page.Rows` / `data` 这四个确定载体中。
 * 因此本函数**绝不把 `list` 当数据行**（不读取该键）：当某端点只返回 `{ list:[字段] }`
 * （无任何数据载体）时返回空数组，杜绝 t-table 的 Name 列渲染出 `row.name`=字段名
 * （如 ClassName/parentID），即“行中显示了字段的 name”。
 */
export function extractListPayload(data: any): { rows: any[]; page?: any } {
  if (Array.isArray(data)) return { rows: data };
  if (data && typeof data === 'object') {
    // 1) 真实数据载体（覆盖 NewLife.Cube 的 rows / page.rows / Page.Rows / data 包裹）
    if (Array.isArray(data.rows)) return { rows: data.rows, page: data.page ?? data.Page };
    if (data.page && Array.isArray(data.page.rows)) return { rows: data.page.rows, page: data.page };
    if (data.Page && Array.isArray(data.Page.rows)) return { rows: data.Page.rows, page: data.Page };
    if (data.Page && Array.isArray(data.Page.Rows)) return { rows: data.Page.Rows, page: data.Page };
    if (Array.isArray(data.data)) return { rows: data.data };
    // 2) 无数据载体 → 空数组（绝不退化为 list：list 是字段元数据，不是数据行）
  }
  return { rows: [] };
}

/**
 * 从单条响应中抽取实体对象，兼容多种真实后端返回结构：
 *  - 标准业务信封 `{code,message,data:entity}`
 *  - 嵌套 `{data:{...}}` / `{data:{data:entity}}`（返回结构再包一层 data）
 *  - 直接返回实体对象（无外层信封）
 * 失败时返回 `{}`，由调用方决定如何提示（详情/编辑优先复用列表行数据，通常无需再请求）。
 */
export function extractEntity(r: any): Record<string, any> {
  if (!r || typeof r !== 'object') return {};
  let e: any = r.data;
  if (e === undefined) e = r; // 直接是实体
  // 双层 data 兜底：{ data: { data: entity } }
  if (e && typeof e === 'object' && !Array.isArray(e) && e.data !== undefined && typeof e.data === 'object' && !Array.isArray(e.data)) {
    e = e.data;
  }
  if (e && typeof e === 'object' && !Array.isArray(e)) return e;
  return {};
}

export function useEntityResource(area: string, controller: string) {
  // base 仅含实体路径（不含 /api 前缀），/api 由 api.ts 中 http 实例的 baseURL 统一承载，
  // 避免「base 带 /api + http 又带 /api」导致请求变成 /api/api/... 的双前缀 404。
  const base = `/${area}/${controller}`;
  const schema = ref<PageSchema | null>(null);
  const rows = ref<any[]>([]);
  const pagination = ref({ current: 1, pageSize: 20, total: 0 });
  const loading = ref(false);
  const stat = ref<any>(null); // 统计/合计行
  const error = ref<string | null>(null); // 加载失败信息（前端显式暴露，避免静默空白）
  // 已探测到可用列表端点则优先直连，避免每次加载都回退探测多个候选 Action
  // （否则单页会发 2~4 个 GET，表现为“进入列表页后页面多次自动刷新”）
  let discoveredListEndpoint: string | null = null;

  /**
   * 拉取页面 schema（setting + 字段），兼容扁平 fields 等多种结构。
   * **契约（固定）**：GetPage 只返回元数据（字段描述符），**不含数据行**；
   * 数据行一律由列表接口（裸 GET / Search / GetList / Index）返回（见 loadData）。
   */
  async function loadSchema(): Promise<void> {
    error.value = null;
    try {
      const r = await getApi<PageSchema>(`${base}/GetPage`);
      schema.value = normalizeSchema(r.data);
      if (!schema.value) {
        error.value = 'GetPage 未返回可识别的 schema（请检查后端返回结构，可在控制台 Network 查看原始响应）';
        return;
      }
    } catch (e: any) {
      schema.value = null;
      error.value = 'GetPage 请求失败：' + (e?.message ?? String(e));
    }
  }

  /**
   * 拉取行数据：依次尝试多个候选列表端点（兼容不同后端 Action 命名），首个成功（非 404）即采用。
   * NewLife.Cube 不同版本/部署下，列表 Action 名称可能为 裸GET / Search / GetList / Index，
   * 逐一回退可避免“裸 GET 恰好 404”导致整页无数据。返回结构兼容多种包裹（见 extractListPayload）。
   */
  async function loadData(params?: Record<string, unknown>): Promise<void> {
    loading.value = true;
    error.value = null;
    // 已探测到可用列表端点则把它放最前，避免每次加载都回退探测多个候选 Action
    // （NewLife.Cube 各部署列表 Action 命名不一，裸 GET 常 404，未缓存时会连发 2~4 个 GET）
    const candidates = discoveredListEndpoint
      ? [discoveredListEndpoint, '', '/Search', '/GetList', '/Index']
      : ['', '/Search', '/GetList', '/Index'];
    let lastErr: any = null;
    try {
      for (const cand of candidates) {
        try {
          const r = await getApi<any>(`${base}${cand}`, {
            pageIndex: pagination.value.current,
            pageSize: pagination.value.pageSize,
            ...params,
          });
          const env = r as any;
          const { rows: rs, page } = extractListPayload(env.data);
          rows.value = normalizeRows(rs ?? []);
          const pg = page ?? env.page ?? env.Page;
          if (pg) {
            pagination.value = {
              current: pg.pageIndex ?? pg.PageIndex ?? 1,
              pageSize: pg.pageSize ?? pg.PageSize ?? 20,
              total: pg.totalCount ?? pg.TotalCount ?? rs.length,
            };
          }
          stat.value = env.stat ?? env.data?.stat ?? null;
          discoveredListEndpoint = cand; // 记录本次命中端点，后续直连
          return; // 成功命中，结束回退
        } catch (e: any) {
          // 仅当该端点不存在（404）才尝试下一个候选；其它错误（401/500/网络/业务）直接中止
          if (e?.response?.status === 404) {
            lastErr = e;
            continue;
          }
          lastErr = e;
          break;
        }
      }
      error.value = '加载数据失败：' + (lastErr?.message ?? String(lastErr));
    } finally {
      loading.value = false;
    }
  }

  async function insert(row: Record<string, unknown>) {
    return postApi(`${base}`, row);
  }

  /**
   * 拉取全部行数据（不分页），用于树形列表 / 树形下拉：
   * 父子层级必须基于完整数据集构建，分页只返回当前页会使树断链（子节点找不到父节点）。
   * 用超大 pageSize 一次性取回（兼容后端 {page,rows} 包裹），并忽略前端分页 UI。
   */
  async function loadAll(params?: Record<string, unknown>): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const r = await getApi<any>(`${base}`, { pageIndex: 1, pageSize: 10000, ...params });
      const { rows: rs } = extractListPayload(r.data);
      rows.value = normalizeRows(rs ?? []);
      const pg = (r.data as any)?.page ?? (r.data as any)?.Page;
      if (pg) {
        pagination.value = {
          current: 1,
          pageSize: 10000,
          total: pg.totalCount ?? pg.TotalCount ?? rs.length,
        };
      }
    } catch (e: any) {
      error.value = '加载全部数据失败：' + (e?.message ?? String(e));
    } finally {
      loading.value = false;
    }
  }
  /**
   * 更新（编辑保存）：官方路由 **PUT /{Area}/{Controller}**（主键在 body，不在 URL）。
   * 契约依据：NewLife.CubeVue 前端 `update: request({url: type, method:'put', data})`，
   * ObjectController 源码 `[HttpPut("/[area]/[controller]")] Update(TObject obj)`。
   * 若写成 `PUT /{base}/{id}`（id 在 URL path），后端无此路由 → 405 Method Not Allowed。
   * 主键兜底：若 row 未含主键（id/Id），用参数 id 补上。
   */
  async function update(id: string | number, row: Record<string, unknown>) {
    const body = { ...row };
    if (body.id == null && body.Id == null) body.id = id;
    return putApi(`${base}`, body);
  }

  /**
   * 删除：官方路由 **DELETE /{Area}/{Controller}?id=xxx**（id 在 query，不在 URL path）。
   * 契约依据：NewLife.CubeVue 前端 `remove: request({url: type, method:'delete', params:{id}})`。
   * 若写成 `DELETE /{base}/{id}`（id 在 URL path），后端无此路由 → 405 Method Not Allowed。
   */
  async function remove(id: string | number) {
    return deleteApi(`${base}?id=${encodeURIComponent(String(id))}`);
  }

  /**
   * 按 id 取单条实体（**详情/编辑的数据主来源——防止用陈旧列表行覆盖他人修改**）。
   *
   * **契约（curl 实测 NewLife.Cube WebApi）**：单条接口是 **`/Detail?id={id}`（query 传 id，不是 path）**，
   * 返回信封 `data` 为**实体对象**（code:0）；REST 路径形式 `/{id}`、`/Detail/{id}`、`/Get/{id}` 均 404。
   * 候选顺序（首个成功即返回，404 继续下一个，其余错误终止）：
   *   ① `GET /{base}/Detail?id=` → 对象（主路径，实测 200）
   *   ② `GET /{base}/Get?id=` → 对象（部分部署）
   *   ③ `GET /{base}?id=` → **数组**（列表接口 + 主键过滤，取首行；实测 200，兜底可靠）
   *   ④ `GET /{base}/{id}` → 对象（REST 风格部署）
   * 行数据经 `normalizeRows` 归一为 camelCase；全部失败返回 `{}`（调用方回退列表行 row）。
   */
  async function getById(id: string | number): Promise<Record<string, any>> {
    const q = encodeURIComponent(String(id));
    const candidates: { url: string; asList: boolean }[] = [
      { url: `${base}/Detail?id=${q}`, asList: false },
      { url: `${base}/Get?id=${q}`, asList: false },
      { url: `${base}?id=${q}`, asList: true },
      { url: `${base}/${q}`, asList: false },
    ];
    let lastErr: any = null;
    for (const c of candidates) {
      try {
        const r = await getApi<any>(c.url);
        if (c.asList) {
          // 列表接口 + 主键过滤：data 为数组（取首行）
          const { rows: rs } = extractListPayload(r?.data);
          const row = normalizeRows(rs ?? [])[0];
          if (row && Object.keys(row).length) return row;
          continue;
        }
        const e = extractEntity(r);
        if (e && Object.keys(e).length) return normalizeRows([e])[0];
      } catch (e: any) {
        if (e?.response?.status === 404) {
          lastErr = e;
          continue;
        }
        lastErr = e;
        break;
      }
    }
    error.value = '加载详情失败：' + (lastErr?.message ?? String(lastErr));
    return {};
  }

  /**
   * 树形判定：聚合全部字段组（list+addForm+editForm+detail+search），
   * 命中「字段名 ParentID」或「mapField=ParentID 的映射字段（ParentName）」即树形。
   * 只查 list 组会漏判：ParentID 常不在列表列（用 ParentName 映射列显示父级）。
   */
  const isTree = computed(() => {
    const sc = schema.value;
    if (!sc) return false;
    const all = [
      ...(sc.list ?? []),
      ...(sc.addForm ?? []),
      ...(sc.editForm ?? []),
      ...(sc.detail ?? []),
      ...(sc.search ?? []),
    ];
    return all.some(
      (f) =>
        f.name.toLowerCase() === 'parentid' ||
        String(f.mapField ?? '').toLowerCase() === 'parentid',
    );
  });

  return {
    base,
    schema,
    rows,
    pagination,
    loading,
    stat,
    error,
    isTree,
    loadSchema,
    loadData,
    loadAll,
    insert,
    update,
    remove,
    getById,
  };
}

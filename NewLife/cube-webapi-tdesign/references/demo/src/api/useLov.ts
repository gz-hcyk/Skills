/**
 * LovController 值集加载器 —— 让前端字段映射（mapField）/下拉列表走 LovController 权威源。
 * 落地为 src/api/useLov.ts。配合 fieldRender.ts 的 resolveOptions / labelOf / toOptions 使用。
 *
 * 背景：本 skill 的「字段映射双模式」依赖两类取值通道：
 *   - 枚举型（lovCode 形如 `Enum.XXX`）：静态键值字典，应下拉 + 列表回显名称；
 *   - 列表型（lovCode 形如 `List.{area}.{controller}`）：动态数据，弹窗表格选择。
 * 此前 `useLookups` 用「字段名去 ID 后缀猜控制器」的约定式兜底，脆弱且无法覆盖枚举。
 * LovController（`Admin/Lov`）是这些值集的**权威管理系统**，其 `Meta` 接口一次性给出：
 *   - ENUM：`Options:[{Value,Label,Extra}]`
 *   - LIST：`ListConfig`(RequestUrl/Method/Pageable/DataPath/TotalPath/FixedParams/ProxyRequest)
 *           + `SearchFields[]` + `TableColumns[]`
 * 本 hook 把 `Meta` 结果归一化到前端可直接消费的 `lovOptions` / `lovListConfig`。
 *
 * 设计要点：
 *   - 批量拉取：schema 中所有字段的 lovCode 收集后，逗号拼接一次 `GET /api/Admin/Lov/Meta`；
 *   - 退化：LovController 不可达（老版本无此控制器）→ 静默跳过，完全退化为既有约定式 useLookups，
 *     不阻断主页面；
 *   - 大小写：后端 PascalCase（Value/Label/Options/ListConfig），此处统一归一到 camelCase
 *     （value/label），与前端 camelCase 键约定一致。
 */
import { ref } from 'vue';
import { getApi } from './api';
import type { DataField } from './useEntityResource';

/** 下拉选项（枚举值集归一化后） */
export interface LovOption {
  value: string | number;
  label: string;
  extra?: any;
}

/** 列表型值集的代理配置（来自 Meta.ListConfig，已归一到 camelCase） */
export interface LovListConfig {
  requestUrl?: string;
  method?: string;
  pageable?: boolean;
  pageNumField?: string;
  pageSizeField?: string;
  /** 代理返回里取数据的路径（如 "data" / "rows" / "data.rows"），默认 data */
  dataPath?: string;
  /** 代理返回里取总数的路径，默认 total */
  totalPath?: string;
  /** 固定查询参数（对象） */
  fixedParams?: Record<string, any>;
  /** 是否经 LovController 代理（POST /api/Admin/Lov/ListData）拉取，而非直连 RequestUrl */
  proxyRequest?: boolean;
}

/** 列表型值集完整元数据（来自 Meta，已归一到 camelCase） */
export interface LovListMeta {
  lovCode: string;
  type: 'ENUM' | 'LIST';
  name?: string;
  /** 取值字段（行里作为 ID/值的列），默认 id */
  valueField?: string;
  /** 显示字段（行里作为名称的列），默认 name */
  labelField?: string;
  listConfig?: LovListConfig;
  searchFields?: {
    field: string;
    title: string;
    componentType?: string;
    paramType?: string;
    required?: boolean;
    defaultValue?: any;
    sort?: number;
    refLovCode?: string;
  }[];
  tableColumns?: {
    field: string;
    title: string;
    width?: number;
    align?: string;
    sortable?: boolean;
    refLovCode?: string;
    formatType?: string;
    sort?: number;
  }[];
}

/** 把 `{Value,Label,Extra}` 或 `{value,label,extra}` 归一化为 LovOption */
function toLovOption(o: any): LovOption {
  return {
    value: o.Value ?? o.value,
    label: o.Label ?? o.label,
    extra: o.Extra ?? o.extra,
  };
}

export function useLov() {
  /** 枚举值集：lovCode → 选项数组 */
  const lovOptions = ref<Record<string, LovOption[]>>({});
  /** 列表型值集配置：lovCode → 元数据 */
  const lovListConfig = ref<Record<string, LovListMeta>>({});
  const loading = ref(false);

  /** 从字段集合收集去重后的 lovCode（枚举与列表都收集） */
  function collectCodes(fields: DataField[]): string[] {
    const set = new Set<string>();
    for (const f of fields ?? []) {
      const code = (f.lovCode ?? '').toString().trim();
      if (code) set.add(code);
    }
    return [...set];
  }

  /** 把 Meta[] 归一化写入 lovOptions / lovListConfig（已存在的键会被覆盖刷新） */
  function normalizeMeta(meta: any[]): void {
    const options: Record<string, LovOption[]> = { ...lovOptions.value };
    const listCfg: Record<string, LovListMeta> = { ...lovListConfig.value };
    for (const m of meta ?? []) {
      const code = m.LovCode ?? m.lovCode;
      const type = (m.Type ?? m.type ?? '').toString().toUpperCase();
      if (!code) continue;
      if (type === 'ENUM') {
        options[code] = (m.Options ?? m.options ?? []).map(toLovOption);
      } else if (type === 'LIST') {
        const lc = m.ListConfig ?? m.listConfig ?? {};
        listCfg[code] = {
          lovCode: code,
          type: 'LIST',
          name: m.Name ?? m.name,
          valueField: m.ValueField ?? m.valueField,
          labelField: m.LabelField ?? m.labelField,
          listConfig: {
            requestUrl: lc.RequestUrl ?? lc.requestUrl,
            method: lc.Method ?? lc.method,
            pageable: lc.Pageable ?? lc.pageable,
            pageNumField: lc.PageNumField ?? lc.pageNumField,
            pageSizeField: lc.PageSizeField ?? lc.pageSizeField,
            dataPath: lc.DataPath ?? lc.dataPath,
            totalPath: lc.TotalPath ?? lc.totalPath,
            fixedParams: lc.FixedParams ?? lc.fixedParams,
            proxyRequest: lc.ProxyRequest ?? lc.proxyRequest,
          },
          searchFields: (m.SearchFields ?? m.searchFields ?? []).map((s: any) => ({
            field: s.Field ?? s.field,
            title: s.Title ?? s.title,
            componentType: s.ComponentType ?? s.componentType,
            paramType: s.ParamType ?? s.paramType,
            required: s.Required ?? s.required,
            defaultValue: s.DefaultValue ?? s.defaultValue,
            sort: s.Sort ?? s.sort,
            refLovCode: s.RefLovCode ?? s.refLovCode,
          })),
          tableColumns: (m.TableColumns ?? m.tableColumns ?? []).map((c: any) => ({
            field: c.Field ?? c.field,
            title: c.Title ?? c.title,
            width: c.Width ?? c.width,
            align: c.Align ?? c.align,
            sortable: c.Sortable ?? c.sortable,
            refLovCode: c.RefLovCode ?? c.refLovCode,
            formatType: c.FormatType ?? c.formatType,
            sort: c.Sort ?? c.sort,
          })),
        };
      }
    }
    lovOptions.value = options;
    lovListConfig.value = listCfg;
  }

  /**
   * 拉取 schema 中所有 lovCode 对应的值集。
   * 仅在存在 lovCode 时发起请求；LovController 不可达（404/老版本）静默跳过，
   * 完全退化为既有约定式 useLookups，不阻断主页面。
   */
  async function load(fields: DataField[]): Promise<void> {
    const codes = collectCodes(fields);
    if (!codes.length) return;
    loading.value = true;
    try {
      // Meta 支持逗号分隔多 code 一次拉取；/api 由 http 实例 baseURL 承载，此处不重复
      const r = await getApi<any>(`/Admin/Lov/Meta?lovCode=${encodeURIComponent(codes.join(','))}`);
      if (r.code === 0 && r.data) {
        const metaArr = Array.isArray(r.data) ? r.data : r.data.Meta;
        if (Array.isArray(metaArr)) normalizeMeta(metaArr);
        // 内联枚举：InlineEnums 也可能携带枚举项（对象：lovCode → 选项数组）
        const inline = r.data.InlineEnums;
        if (inline && typeof inline === 'object') {
          const merged: Record<string, LovOption[]> = { ...lovOptions.value };
          for (const [code, opts] of Object.entries(inline)) {
            merged[code] = (opts as any[]).map(toLovOption);
          }
          lovOptions.value = merged;
        }
      }
    } catch (e: any) {
      // LovController 不可达（老版本无此控制器 / 未授权）→ 静默跳过，退化为约定式兜底
    } finally {
      loading.value = false;
    }
  }

  return { lovOptions, lovListConfig, loading, load };
}

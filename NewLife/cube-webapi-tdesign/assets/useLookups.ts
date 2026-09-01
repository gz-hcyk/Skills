/**
 * 外键关联源字典加载器 —— 让 skill 自带 lookups 拉取能力（约定式 + 覆盖机制）
 * 落地为 src/api/useLookups.ts。配合 fieldRender.ts 的 labelOf / resolveOptions 使用。
 *
 * 背景：本 skill 的“字段映射双模式”依赖 lookups（{ 基名: { id: 名称 } }）来把
 * 纯 xxxID 外键字段（无 map/dataSource）在列表/详情回显名称、在表单渲染下拉。
 * 但通用框架无从推断 CategoryID 该映射到哪个 area/controller，因此提供：
 *   1) 约定式：CategoryID → 基名 Category → 同 area 下 /api/{area}/Category 的 Index 列表，
 *      取每行 主键 与 Name 字段组装字典；
 *   2) 覆盖机制：通过 overrides[baseName] 自定义 area/controller/idField/nameField。
 */
import { ref } from 'vue';
import { getApi, getRaw } from './api';
import type { DataField } from './useEntityResource';
import { isEnumType, isMappedField } from './fieldRender';

/** 单个关联源的覆盖配置 */
export interface LookupSource {
  /** 关联实体所在 area，默认同当前实体 area */
  area?: string;
  /** 关联控制器名，默认用基名（如 Category） */
  controller?: string;
  /** 关联实体主键字段名（后端原始名），默认 "ID" */
  idField?: string;
  /** 关联实体显示字段名（后端原始名），默认 "Name" */
  nameField?: string;
}

/** 基名 → 覆盖配置 */
export type LookupOverrides = Record<string, LookupSource>;

/** 大小写不敏感地从行对象里找键（避免依赖具体的 camel 实现，如 "ID"→"id"/"iD"） */
function findKey(row: Record<string, any>, ...candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  const lower = keys.map((k) => k.toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx >= 0) return keys[idx];
  }
  return undefined;
}

/**
 * 字段名去 ID/IDs 后缀得基名：CategoryID→Category、RoleIds→Role、ProductTypeId→ProductType。
 * 与 fieldRender.lookupBaseName 保持一致（复数外键也要能解析，用于多选下拉）。
 */
function baseNameOf(name: string): string {
  if (name.endsWith('IDs')) return name.slice(0, -3);
  if (name.endsWith('Ids')) return name.slice(0, -3);
  if (name.endsWith('ID')) return name.slice(0, -2);
  if (name.endsWith('Id')) return name.slice(0, -2);
  return name;
}

/**
 * 拉取官方 /Cube/Lookup 枚举字典：GET 返回 `{ code:0, data: { <枚举类型名>: [{Label, Value}] } }`，
 * data 的键即传入的 codes（枚举类型名），值为 Label/Value 列表。
 * CubeController 为非 Area 控制器、属性路由根路径 `/Cube/Lookup`（无 /api 前缀）。
 * 为兼容不同部署，先试 `/api/Cube/Lookup`（带 api 前缀），404 再回退 `/Cube/Lookup`（根路径）；
 * 两者都不可达（老版本无此接口）→ 返回 null，由调用方静默退化（字段退化为原始值显示，不阻断页面）。
 */
async function fetchCubeLookup(codes: string[]): Promise<Record<string, any> | null> {
  const q = `?codes=${encodeURIComponent(codes.join(','))}`;
  // 先探带 /api 前缀（部分部署 convention 路由 api/{area}/{controller}）
  try {
    const r = await getApi<any>(`/Cube/Lookup${q}`);
    if (r.code === 0 && r.data && typeof r.data === 'object') return r.data as Record<string, any>;
  } catch (e: any) {
    if (e?.response?.status !== 404) return null; // 非 404（401/500/网络）直接放弃，不回退
  }
  // 回退根路径（魔方默认属性路由 /Cube/Lookup）
  try {
    const r2 = await getRaw<any>(`/Cube/Lookup${q}`);
    if (r2.code === 0 && r2.data && typeof r2.data === 'object') return r2.data as Record<string, any>;
  } catch {
    // 不可达 → null，静默退化
  }
  return null;
}

export function useLookups(area: string, overrides?: LookupOverrides) {
  const lookups = ref<Record<string, Record<string, string>>>({});
  const loading = ref(false);

  /**
   * 审计字段判定：CreateUserID/UpdateUserID（及复数变体）。它们**不是业务外键**——
   * 列表列显示后端已映射的名称字符串、表单只读（后端自动维护），无需 id→name 字典。
   * 若不排除，会按 xxxID 约定拉出 `/api/{area}/CreateUser`、`/api/{area}/UpdateUser`
   * 这类**不存在的控制器**请求（实测列表页多出 `?pageSize=1000` 无效请求）。
   */
  const isAuditField = (n: string) =>
    ['createuserid', 'updateuserid', 'createuserids', 'updateuserids'].includes(
      String(n ?? '').toLowerCase(),
    );

  /**
   * 根据实体字段集合中的映射/外键字段，约定式拉取关联实体 Index，
   * 组装 { [baseName]: { [idValue]: name } } 字典写入 lookups。
   *
   * 需要拉取的字段：
   *   1) **映射字段（`mapField` 非空）**——用其原始字段名（mapField 值）取基名，
   *      如 TenantName(mapField=TenantId) → Tenant、RoleNames(mapField=RoleIds) → Role；
   *   2) 字段名本身是 xxxID/xxxIDs（无内联 map/dataSource 的）。
   *
   * 关联源基名优先级（后端显式契约 > 推断）：
   *   `lovCode`（GetPage 显式下发，如 search 组 RoleID.lovCode="Role"）> mapField 去 ID 后缀 > 自身名去 ID 后缀。
   */
  async function load(fields: DataField[]): Promise<void> {
    loading.value = true;
    const fkFields = fields.filter((f) => {
      // 审计字段（自身或 mapField 指向审计字段）一律不拉字典
      if (isAuditField(f.name) || (f.mapField && isAuditField(f.mapField))) return false;
      if (f.primaryKey || f.isIdentity || f.map || f.dataSource) return false;
      // 显式 lovCode 即为外键关联源
      if (f.lovCode && String(f.lovCode).trim()) return true;
      // 映射字段：mapField 非空即为映射字段（该值就是原始字段名）
      if (f.mapField && String(f.mapField).trim()) return true;
      const n = f.name.toLowerCase();
      return n.endsWith('ids') || n.endsWith('id');
    });
    // 基名：lovCode 优先（后端显式关联源编码），其次映射字段用 mapField、否则用自身字段名
    const bases = Array.from(
      new Set(
        fkFields.map((f) => {
          const lc = f.lovCode && String(f.lovCode).trim();
          if (lc) return baseNameOf(lc);
          const mapped = f.mapField && String(f.mapField).trim();
          const n = f.name.toLowerCase();
          const own = n.endsWith('ids') || n.endsWith('id');
          return baseNameOf(mapped && !own ? String(f.mapField).trim() : f.name);
        }),
      ),
    );

    const result: Record<string, Record<string, string>> = { ...lookups.value };

    // 通道1：纯枚举字段（无 lovCode / 无 map/dataSource / 非映射字段）走官方 /Cube/Lookup
    // （按枚举类型名解析），结果以 typeName 为键存入 lookups，供 resolveOptions/labelOf 在第 3 优先级回显。
    // 覆盖 sex/role/enable 等无实体表、约定式「去 ID 后缀猜控制器」天然失效的静态字典。
    // CubeController 为非 Area 控制器，属性路由为根路径 /Cube/Lookup（无 /api 前缀）；
    // 部分部署若带 /api 前缀则首探 /api/Cube/Lookup，404 回退 /Cube/Lookup。
    const enumFields = fields.filter((f) => {
      if (f.lovCode && String(f.lovCode).trim()) return false; // 有 lovCode 走 LovController（通道2）
      if (f.map || f.dataSource) return false; // 内联选项源优先
      if (isMappedField(f)) return false; // 映射字段按外键处理（通道3）
      return isEnumType(f);
    });
    const enumCodes = Array.from(
      new Set(enumFields.map((f) => (f.typeName ?? '').trim()).filter(Boolean)),
    );
    if (enumCodes.length) {
      const cubeData = await fetchCubeLookup(enumCodes);
      if (cubeData) {
        for (const code of enumCodes) {
          const list = cubeData[code];
          if (Array.isArray(list) && list.length) {
            const dict: Record<string, string> = {};
            for (const o of list) {
              const v = o.Value ?? o.value;
              const l = o.Label ?? o.label;
              if (v == null) continue;
              dict[String(v)] = l != null ? String(l) : String(v);
            }
            if (Object.keys(dict).length) result[code] = dict;
          }
        }
      }
    }

    await Promise.all(
      bases.map(async (base) => {
        const ov = overrides?.[base] ?? {};
        const ctrl = ov.controller ?? base; // 约定：同 area 下同名控制器
        const a = ov.area ?? area;
        const idField = ov.idField ?? 'ID';
        const nameField = ov.nameField ?? 'Name';
        // area 候选：当前 area 优先；404 时兜底 `Cube`（NewLife.Cube 标准布局——
        // 框架系统实体如 Area/Dictionary 常挂在 Cube area，业务/账号实体才在 Admin area。
        // 实测 /api/Admin/Area 404、/api/Cube/Area 200）。overrides.area 显式指定则只试该 area。
        const areaCandidates = ov.area ? [ov.area] : Array.from(new Set([area, 'Cube']));
        for (const cand of areaCandidates) {
          try {
            // 仅传实体路径（不含 /api），/api 由 api.ts 中 http 实例 baseURL 统一承载，避免双前缀 /api/api/...
            const r = await getApi<any>(`/${cand}/${ctrl}?pageSize=1000`);
            if (r.code === 0 && Array.isArray(r.data)) {
              const dict: Record<string, string> = {};
              for (const row of r.data) {
                const idKey = findKey(row, idField, 'id') ?? 'id';
                const nameKey = findKey(row, nameField, 'name') ?? Object.keys(row)[1] ?? 'id';
                const idv = row[idKey];
                if (idv == null) continue;
                dict[String(idv)] = row[nameKey] != null ? String(row[nameKey]) : String(idv);
              }
              result[base] = dict;
              break; // 命中即止，不再探测下一 area
            }
          } catch (e: any) {
            // 仅 404（控制器不在该 area）继续尝试下一候选；其它错误（401/500/网络）直接跳过该关联源
            if (e?.response?.status === 404) continue;
            break;
          }
        }
        // 全部候选不可达：跳过，该字段退化为原始 ID 显示（不阻断主页面）
      }),
    );
    lookups.value = result;
    loading.value = false;
  }

  return { lookups, loading, load };
}

/**
 * 非实体（特殊）控制器注册表 —— 单列处理的分发依据。
 *
 * 为什么需要它：NewLife.Cube 的三类控制器中，只有「实体控制器」有 GetPage（驱动 ListPage）。
 * 另外两类【无 GetPage】，若误进 ListPage 会拉不到 schema → 空白/只剩操作列（TDZ 类崩溃）：
 *   - ConfigController<T>（系统配置类，仅 Get 单对象 + Update）→ ConfigView 单表单页；
 *   - ControllerBaseX 派生但非实体的控制器（自定义端点，如 Db）→ 各自专属页。
 *
 * 关键约定（来自源码核对结论）：
 *  1) 以 `area/controller` 为键，而非仅 controller 名——避免跨区重名碰撞
 *     （如 Admin/Cube 与未来 School/Config 不会互相串）。
 *  2) 【命名不可靠】——`*Config`/`Parameter` 多为实体控制器（有 GetPage，能正常走 ListPage），
 *     真正的 Config<T> 反而不带 Config 名（Cube/Sys/XCode/Core）。
 *     故本表必须【显式策划】，绝不能靠命名启发式自动判定。
 *  3) 新增特殊控制器只在此追加一条映射；未在此表且 GetPage 可用的，一律走 ListPage。
 *
 * 详见 @skill:cube-webapi-tdesign §4.17（ConfigController）/ §4.18（ControllerBaseX）/ §十一。
 */
import type { Component } from 'vue';
import ConfigView from '@/components/cube/ConfigView.vue';
import DbView from '@/components/cube/DbView.vue';

export type SpecialKind = 'config' | 'db' | 'custom';

export interface SpecialDescriptor {
  /** 语义类型（仅作说明/扩展用，不强约束组件） */
  kind: SpecialKind;
  /** 渲染组件 */
  view: Component;
  /** 可选：ConfigView 取元数据的 kind（默认 EditForm） */
  fieldsKind?: 'List' | 'Detail' | 'AddForm' | 'EditForm' | 'Search';
  /** 可选：覆盖加载端点（默认 /{area}/{controller}） */
  loadUrl?: string;
  /** 可选：覆盖保存端点（默认同 loadUrl） */
  saveUrl?: string;
  saveMethod?: 'POST' | 'PUT';
}

export const SPECIAL_CONTROLLERS: Record<string, SpecialDescriptor> = {
  // —— ConfigController<T>：GetFields 元数据驱动单表单页（无 GetPage，故单列） ——
  'Admin/Cube': { kind: 'config', view: ConfigView },
  'Admin/Sys': { kind: 'config', view: ConfigView },
  'Admin/XCode': { kind: 'config', view: ConfigView },
  'Admin/Core': { kind: 'config', view: ConfigView },

  // —— ControllerBaseX 工具型：自定义端点，专属页 ——
  'Admin/Db': { kind: 'db', view: DbView },
  // 'Admin/Index': { kind: 'custom', view: DashboardView },  // 若经泛型路由可达再补
};

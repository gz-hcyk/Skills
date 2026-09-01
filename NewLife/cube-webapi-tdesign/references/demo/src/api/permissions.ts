/**
 * 魔方权限位（PermissionFlags，XCode.Membership，UInt32 [Flags]）
 * 自定义业务权限：在标准 4 位之外使用更高位 + 后端 [DisplayName] 命名。
 * 例：下发指令 = 16，远程配置 = 32（与 cube-webapi-backend 第十节示例一致）。
 */
export const PermissionFlags = {
  None: 0,
  Detail: 1, // 查看
  Insert: 2, // 新增
  Update: 4, // 修改
  Delete: 8, // 删除
  Custom1: 16, // 自定义业务权限位 1（如“下发指令”）
  Custom2: 32, // 自定义业务权限位 2（如“远程配置”）
  All: 0xffffffff,
} as const;

export type PermissionFlag = (typeof PermissionFlags)[keyof typeof PermissionFlags];

/** 以 area/controller 拼出菜单 key（与后端菜单路径一致） */
export function menuKey(area: string, controller: string): string {
  return `${area}/${controller}`;
}

/** 判断权限位集合是否包含目标位（位与） */
export function hasFlag(bits: number, flag: number): boolean {
  if (bits === PermissionFlags.All) return true;
  return (bits & flag) === flag;
}

/** 常用位的中文语义（用于按钮 tooltip / 日志） */
export const PermissionLabels: Record<number, string> = {
  1: '查看',
  2: '新增',
  3: '更新',
  4: '删除',
  16: '自定义1',
  32: '自定义2',
};

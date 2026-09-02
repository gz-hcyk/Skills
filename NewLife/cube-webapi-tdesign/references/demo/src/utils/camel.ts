// PascalCase/任意大小写键 → 首字母小写（精确匹配本后端契约：SchoolID→schoolID、ID→id、Name→name）
// 注意：本后端实体行数据已是「首字母小写其余保留」(schoolID/createUserID)，故 camelize 对其幂等。
function camelKey(key: string): string {
  if (!key) return key
  return key.charAt(0).toLowerCase() + key.slice(1)
}

export function camelize(value: any): any {
  if (Array.isArray(value)) return value.map(camelize)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: any = {}
    for (const k of Object.keys(value)) out[camelKey(k)] = camelize(value[k])
    return out
  }
  return value
}

// 仅对单个字符串做首字母小写（用于字段 name 值映射为列 key）
export function camelFieldName(name: string): string {
  return camelKey(name)
}

import { ref } from 'vue'
import { getApi } from './http'
import { DataField, lookupBaseName, mapDictOf } from './fieldRender'

// 约定式外键字典：扫描 xxxID 字段，拉同 area 同名控制器 Index 组装 {id:名称}；
// 关联实体不可达（如 Cube 内置 Department）时回退 /Cube/{base}，仍失败则降级（该字段显原始 ID）。
// 已有 [Map] 字典源的字段（枚举）不参与——它的选项由 mapField 直接解析，无需网络请求。
export function useLookups() {
  const lookups = ref<Record<string, Record<string, string>>>({})

  async function load(area: string, fields: DataField[]) {
    const all = fields || []
    const targets = all.filter(
      (f) =>
        !f.primaryKey &&
        /IDs?$/i.test(f.name) &&
        f.name.toLowerCase() !== 'id' &&
        !mapDictOf(f, all),
    )
    for (const f of targets) {
      const base = lookupBaseName(f, all)
      const key = base.toLowerCase()
      if (lookups.value[key]) continue
      const dict = await fetchDict(area, base)
      if (dict) lookups.value[key] = dict
    }
  }

  return { lookups, load }
}

async function fetchDict(area: string, base: string): Promise<Record<string, string> | null> {
  const urls = [`/${area}/${base}`, `/Cube/${base}`]
  for (const u of urls) {
    try {
      const env = await getApi(`${u}?pageSize=1000`)
      const rows = env?.data
      if (Array.isArray(rows)) {
        const dict: Record<string, string> = {}
        for (const r of rows) {
          const id = r.id ?? r.ID
          const name = r.name ?? r.Name ?? id
          if (id != null) dict[String(id)] = String(name)
        }
        return dict
      }
    } catch {
      /* 尝试下一个候选 */
    }
  }
  return null
}

import { ref, reactive, computed } from 'vue'
import { getApi, postApi, putApi, deleteApi } from './http'
import { DataField, isMappedField } from './fieldRender'
import { camelize, camelFieldName } from '@/utils/camel'

// 表单键(camel) → 真实字段名(Pascal)：创建/更新时把 camelCase 载荷还原为后端期望的字段名。
// 注意 mapField 双语义——只有「指向真实字段」才是映射字段；[Map] 字典串不能当字段名提交。
function buildKeyMap(fields: DataField[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const f of fields) {
    const target = isMappedField(f, fields) ? (f.mapField as string).trim() : f.name
    m.set(camelFieldName(target), target)
  }
  return m
}

function toPascal(row: any, keyMap: Map<string, string>): any {
  if (!row || typeof row !== 'object') return row
  const out: any = {}
  for (const k of Object.keys(row)) {
    const target = keyMap.get(k) || k
    out[target] = row[k]
  }
  return out
}

export interface EntitySchema {
  list: DataField[]
  addForm: DataField[]
  editForm: DataField[]
  detail: DataField[]
  search: DataField[]
}

/**
 * 实体资源层：对接本后端契约
 *  - GetPage: GET /{area}/{ctrl}/GetPage → {data:{setting, list, addForm, editForm, detail, search}}
 *      · list    列表列（含虚拟显示字段，如 ClassName→ClassID）
 *      · addForm 新增表单字段、editForm 编辑表单字段、detail 详情字段
 *      · search  可查询字段，**给出真实查询参数名**（如 Student 的 ClassID）
 *  - Index:   GET /{area}/{ctrl} → {data:[rows(camelCase)], page:{pageIndex,pageSize,totalCount}}
 *  - Create:  POST /{area}/{ctrl}（实体体，字段名 PascalCase）
 *  - Update:  PUT  /{area}/{ctrl}（主键在 body）
 *  - Delete:  DELETE /{area}/{ctrl}?id=N
 */
export function useEntityResource(area: () => string, controller: () => string) {
  // area/controller 以 getter 传入，使其随 props 变化保持响应式（控制器切换时重新拉取）
  const base = computed(() => `/${area()}/${controller()}`)
  const fields = ref<DataField[]>([])
  const schema = ref<EntitySchema>({ list: [], addForm: [], editForm: [], detail: [], search: [] })
  const setting = ref<any>({})
  const rows = ref<any[]>([])
  const pagination = reactive({ current: 1, pageSize: 20, total: 0 })
  const loading = ref(false)
  const error = ref('')
  const isTree = ref(false)

  function pick(v: any): DataField[] {
    return Array.isArray(v) ? (v as DataField[]) : []
  }

  async function loadSchema() {
    try {
      const env = await getApi(`${base.value}/GetPage`)
      const data = env?.data || {}
      setting.value = data.setting || {}
      const list = pick(data.list)
      fields.value = list
      const detail = pick(data.detail)
      const addForm = pick(data.addForm)
      const editForm = pick(data.editForm)
      schema.value = {
        list,
        addForm: addForm.length ? addForm : list,
        editForm: editForm.length ? editForm : addForm.length ? addForm : list,
        detail: detail.length ? detail : list,
        search: pick(data.search),
      }
      isTree.value = list.some(
        (f) => f.name && (f.name.toLowerCase() === 'parentid' || (f.mapField && f.mapField.toLowerCase() === 'parentid')),
      )
    } catch (e: any) {
      error.value = `GetPage 失败：${e?.message || e}`
    }
  }

  async function loadData(params?: any) {
    loading.value = true
    error.value = ''
    try {
      const p = { pageIndex: pagination.current, pageSize: pagination.pageSize, ...(params || {}) }
      const env = await getApi(base.value, p)
      const data = env?.data
      rows.value = Array.isArray(data) ? data.map(camelize) : []
      if (env?.page) pagination.total = Number(env.page.totalCount || 0)
    } catch (e: any) {
      error.value = `列表加载失败：${e?.message || e}`
    } finally {
      loading.value = false
    }
  }

  async function create(row: any) {
    return postApi(base.value, toPascal(row, buildKeyMap(schema.value.addForm)))
  }
  async function update(row: any) {
    return putApi(base.value, toPascal(row, buildKeyMap(schema.value.editForm)))
  }
  async function remove(id: any) {
    return deleteApi(`${base.value}?id=${encodeURIComponent(String(id))}`)
  }

  return {
    base, fields, schema, setting, rows, pagination, loading, error, isTree,
    loadSchema, loadData, create, update, remove,
  }
}

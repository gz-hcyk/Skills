import { h } from 'vue'
import { Tag } from 'tdesign-vue-next'
import { camelFieldName } from '@/utils/camel'

/**
 * Cube 6.13 实测下发的 DataField（NewLife.Cube/ViewModels/DataField.cs）。
 * 注意：本变体**没有** map / dataSource / width / align 字段——[Map] 的映射源被塞进了 mapField，
 * 导致 mapField 承载两种语义（见 mapFieldKind）。列宽/对齐只能由前端按 typeName/itemType 自行决策。
 */
export interface DataField {
  name: string
  displayName: string
  description?: string | null
  category: string
  typeName: string
  itemType: string | null
  length: number
  precision?: number
  scale?: number
  nullable: boolean
  primaryKey: boolean
  readOnly: boolean
  visible: boolean
  required: boolean
  mapField: string | null
  lovCode: string | null
  textAlign: number
  maxWidth: number
  /** 少数后端变体下发；Cube 6.13 实测无此键，保留仅为兼容 */
  map?: Record<string, string> | null
  header?: string | null
  headerTitle?: string | null
  text?: string | null
  url?: string | null
  target?: string | null
}

export const DEFAULT_CATEGORY = '基础设置'

export function fieldKey(f: DataField): string {
  return camelFieldName(f.name)
}

/* ------------------------------------------------------------------ *
 * mapField 双语义判别（核心）
 *
 * GetPage 把 FieldItem.Map 的「源串」原样序列化进 mapField，于是同一个键承载两种语义：
 *   ① 虚拟映射字段：[Map(nameof(ClassID), typeof(Class), "ID")] → mapField="ClassID"（真实字段名）
 *   ② 枚举字典源：[Map("1=男,2=女")]                            → mapField="1=男,2=女"（k=v 字典串）
 * 判别法：mapField 能在字段集里命中同名字段 ⇒ ①；否则 ⇒ ②。
 * 无字段集可对照时退化为形状判别（纯标识符且不含 =/逗号 ⇒ ①）。
 * ------------------------------------------------------------------ */
export type MapFieldKind = 'none' | 'field' | 'dict'

const DICT_CACHE = new Map<string, Record<string, string> | null>()

function isIdentifier(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s)
}

/** 解析 [Map] 字典源串："1=男,2=女" → { '1': '男', '2': '女' }（支持中文逗号，带缓存） */
export function parseMapSource(src: string): Record<string, string> | null {
  if (!src) return null
  const cached = DICT_CACHE.get(src)
  if (cached !== undefined) return cached
  if (!/[=,，]/.test(src)) {
    DICT_CACHE.set(src, null)
    return null
  }
  const dict: Record<string, string> = {}
  for (const part of src.split(/[,，]/)) {
    const p = part.trim()
    if (!p) continue
    const i = p.indexOf('=')
    if (i <= 0) continue
    const k = p.slice(0, i).trim()
    if (k) dict[k] = p.slice(i + 1).trim()
  }
  const result = Object.keys(dict).length ? dict : null
  DICT_CACHE.set(src, result)
  return result
}

export function mapFieldKind(f: DataField, fields?: DataField[]): MapFieldKind {
  const mf = (f.mapField ?? '').trim()
  if (!mf) return 'none'
  if (fields && fields.length) {
    return fields.some((x) => x.name && x.name.toLowerCase() === mf.toLowerCase()) ? 'field' : 'dict'
  }
  return isIdentifier(mf) ? 'field' : 'dict'
}

/** mapField 指向另一个真实字段 ⇒ 该字段是「显示名」虚拟字段（如 ClassName→ClassID） */
export function isMappedField(f: DataField, fields?: DataField[]): boolean {
  return mapFieldKind(f, fields) === 'field'
}

export function mappedFieldName(f: DataField): string {
  return camelFieldName((f.mapField ?? f.name).trim())
}

/** 字段自带的枚举字典：[Map("k=v,...")] 解析结果，或后端直接下发的 map */
export function mapDictOf(f: DataField, fields?: DataField[]): Record<string, string> | null {
  if (f.map && Object.keys(f.map).length) return f.map
  if (mapFieldKind(f, fields) !== 'dict') return null
  return parseMapSource((f.mapField ?? '').trim())
}

export function lookupBaseName(f: DataField, fields?: DataField[]): string {
  const raw = isMappedField(f, fields) ? (f.mapField as string) : f.name
  return raw.replace(/IDs?$/i, '')
}

export function isMultiValue(f: DataField): boolean {
  return /IDs$/i.test(f.name)
}

export function isTreeSchema(fields: DataField[]): boolean {
  return fields.some(
    (f) => f.name.toLowerCase() === 'parentid' || (f.mapField && f.mapField.toLowerCase() === 'parentid'),
  )
}

function lookDict(lookups: any, base: string): Record<string, any> | undefined {
  if (!lookups) return undefined
  return lookups[base.toLowerCase()] || lookups[base]
}

function dictHit(dict: Record<string, any>, value: any): string | null {
  if (dict[value] != null) return String(dict[value])
  if (dict[String(value)] != null) return String(dict[String(value)])
  return null
}

/**
 * 取值 → 显示文本。优先字段自带 [Map] 字典，其次约定式外键字典（lookups），都没有则回落原值。
 * fields 传入才能判别 mapField 语义，务必从调用处透传。
 */
export function labelOf(f: DataField, value: any, lookups?: any, fields?: DataField[]): string {
  if (value == null || value === '') return ''
  const md = mapDictOf(f, fields)
  if (md) {
    const hit = dictHit(md, value)
    if (hit != null) return hit
  }
  const dict = lookDict(lookups, lookupBaseName(f, fields))
  if (dict) {
    if (isMultiValue(f)) {
      const parts = String(value)
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
      if (parts.length > 1) return parts.map((p) => dictHit(dict, p) ?? p).join('、')
    }
    const hit = dictHit(dict, value)
    if (hit != null) return hit
  }
  return String(value)
}

function optionValue(k: string): any {
  if (k === '') return k
  const n = Number(k)
  return isNaN(n) ? k : n
}

export function resolveOptions(f: DataField, lookups?: any, fields?: DataField[]): { label: string; value: any }[] {
  const opts: { label: string; value: any }[] = []
  const md = mapDictOf(f, fields)
  if (md) {
    for (const k of Object.keys(md)) opts.push({ label: String(md[k]), value: optionValue(k) })
  }
  const dict = lookDict(lookups, lookupBaseName(f, fields))
  if (dict) {
    for (const k of Object.keys(dict)) opts.push({ label: String(dict[k]), value: optionValue(k) })
  }
  return opts
}

/** 控件选型：映射字段/枚举字典 → select；按 typeName/itemType 细分其余 */
export function controlOf(f: DataField, fields?: DataField[]): string {
  if (isMappedField(f, fields)) {
    if (isMultiValue(f)) return 'multi-select'
    if (/^parentIDs?$/i.test((f.mapField ?? '').trim())) return 'tree-select'
    return 'select'
  }
  if (mapDictOf(f, fields)) return 'select'
  const tn = (f.typeName || '').toLowerCase()
  const it = (f.itemType || '').toLowerCase()
  if (it === 'mail') return 'email'
  if (it === 'mobile') return 'tel'
  if (it === 'image') return 'image'
  if (it === 'html') return 'textarea'
  if (tn === 'boolean') return 'switch'
  if (tn.includes('int') || tn === 'double' || tn === 'decimal' || tn === 'single') return 'number'
  if (tn.includes('date') || tn.includes('time')) return 'date'
  if (tn === 'string' && f.length > 200) return 'textarea'
  if (/IDs?$/i.test(f.name) && !f.primaryKey) return 'select'
  return 'input'
}

function isBool(f: DataField): boolean {
  const tn = (f.typeName || '').toLowerCase()
  return tn === 'boolean' || tn === 'bool'
}

function colWidth(f: DataField): number {
  const tn = (f.typeName || '').toLowerCase()
  const it = (f.itemType || '').toLowerCase()
  if (isBool(f)) return 80
  if (it === 'image') return 90
  if (tn.includes('int') || tn === 'double' || tn === 'decimal' || tn === 'single') return 100
  if (tn.includes('time')) return 170
  if (tn.includes('date')) return 120
  const limit = f.maxWidth && f.maxWidth > 0 ? f.maxWidth : f.length && f.length > 0 ? f.length : 0
  return limit ? Math.min(260, Math.max(120, limit * 13)) : 150
}

/** GetPage.textAlign：0=左 1=中 2=右 */
const COL_ALIGNS: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right']

/** 列表列：枚举/映射/外键一律显名，布尔显「是/否」，其余按类型定宽对齐 */
export function buildColumns(fields: DataField[], getLookups?: () => any): any[] {
  return fields.map((f) => {
    const key = fieldKey(f)
    const hasDict = !!mapDictOf(f, fields) || isMappedField(f, fields) || /IDs?$/i.test(f.name)
    const col: any = {
      colKey: key,
      title: f.header || f.displayName || f.name,
      align: COL_ALIGNS[f.textAlign],
      width: key === 'id' ? 80 : colWidth(f),
      ellipsis: true,
    }
    if (hasDict) {
      col.cell = (_h: any, params: any) => {
        const text = labelOf(f, params?.row?.[key], getLookups ? getLookups() : null, fields)
        return h(Tag, { theme: text ? 'primary' : 'default', variant: 'light' }, () => text || '-')
      }
    } else if (isBool(f)) {
      col.cell = (_h: any, params: any) =>
        h(Tag, { theme: params?.row?.[key] ? 'success' : 'default', variant: 'light' }, () =>
          params?.row?.[key] ? '是' : '否',
        )
    }
    return col
  })
}

export interface FormItem {
  /**
   * 表单 v-model 键（camelCase）。**映射字段取原始字段名的 camel**（ClassName→classID）——
   * 后端 POST/详情只认真实列，按自身名提交会被忽略导致外键存不进去。
   */
  key: string
  /** 回填兜底键：映射字段在行数据里以自身名存在（row.className），key 取不到时用它 */
  fallbackKey?: string
  /** 提交给后端的真实字段名（映射字段取 mapField，其余取 name） */
  paramName: string
  label: string
  control: string
  options?: { label: string; value: any }[]
  multiple?: boolean
  required?: boolean
  readOnly?: boolean
  full?: boolean
  category: string
  maxlength?: number
  rules?: any[]
}

export const AUDIT_FIELDS = [
  'createuserid',
  'updateuserid',
  'createuser',
  'updateuser',
  'createip',
  'updateip',
  'createtime',
  'updatetime',
]

function isAudit(f: DataField): boolean {
  return AUDIT_FIELDS.includes(fieldKey(f).toLowerCase())
}

/**
 * 校验规则：一律复用 TDesign/async-validator 内置类型（email/url/number/required/max …），
 * 不手写正则。内置类型对空值自动跳过，故「必填」与「格式」是两条独立规则。
 */
export function rulesOf(f: DataField, fields?: DataField[]): any[] {
  const rules: any[] = []
  const label = f.displayName || f.name
  if (requiredOf(f, fields)) rules.push({ required: true, message: `请填写${label}`, type: 'error' })
  const tn = (f.typeName || '').toLowerCase()
  const it = (f.itemType || '').toLowerCase()
  const control = controlOf(f, fields)
  if (it === 'mail') rules.push({ type: 'email', message: `${label}格式不正确` })
  if (it === 'url') rules.push({ type: 'url', message: `${label}格式不正确` })
  if (control === 'number') rules.push({ type: 'number', message: `${label}必须是数字`, transform: Number })
  if (f.length > 0 && f.length <= 500 && (control === 'input' || control === 'email' || control === 'tel')) {
    rules.push({ max: f.length, message: `${label}不能超过 ${f.length} 个字符` })
  }
  // async-validator 无内置手机号类型，只能用 pattern（内置无同类能力时的自定义兜底）
  if (it === 'mobile') rules.push({ pattern: /^1[3-9]\d{9}$/, message: `${label}格式不正确` })
  void tn
  return rules
}

function requiredOf(f: DataField, _fields?: DataField[]): boolean {
  if (f.required) return true
  // nullable=false 兜底，但排除审计/自增/只读字段
  if (f.nullable === false && !f.readOnly && !f.primaryKey && !isAudit(f)) return true
  return false
}

function toFormItem(f: DataField, lookups: any, fields: DataField[]): FormItem {
  const control = controlOf(f, fields)
  const isSelect = control === 'select' || control === 'multi-select' || control === 'tree-select'
  const mapped = isMappedField(f, fields)
  return {
    key: mapped ? mappedFieldName(f) : fieldKey(f),
    fallbackKey: mapped ? fieldKey(f) : undefined,
    paramName: mapped ? (f.mapField as string).trim() : f.name,
    label: f.displayName || f.name,
    control,
    options: isSelect ? resolveOptions(f, lookups, fields) : undefined,
    multiple: control === 'multi-select',
    required: requiredOf(f, fields),
    readOnly: f.readOnly,
    full: control === 'textarea' || control === 'image',
    category: f.category || '',
    maxlength: f.length > 0 && f.length <= 200 ? f.length : undefined,
    rules: rulesOf(f, fields),
  }
}

/** 表单项：新增走 addForm、编辑走 editForm（后端 GetPage 已按场景裁剪好字段集） */
export function buildFormItems(fields: DataField[], lookups?: any): FormItem[] {
  const all = fields || []
  return all
    .filter((f) => !f.primaryKey && !f.readOnly && !isAudit(f))
    .map((f) => toFormItem(f, lookups, all))
}

/** 详情项：后端 detail 组，主键/审计字段已由后端裁剪，此处仅兜底 */
export function buildDetailItems(fields: DataField[], lookups?: any): FormItem[] {
  const all = fields || []
  return all.filter((f) => !f.primaryKey).map((f) => toFormItem(f, lookups, all))
}

/**
 * 搜索项：来自 GetPage.search（**真实查询参数名**，如 Student 的 ClassID——list 里只有虚拟字段 ClassName）。
 * 这正好替代「手工配置 searchParamMap」：后端自己声明了可查询列。
 */
export function buildSearchItems(fields: DataField[], lookups?: any): FormItem[] {
  const all = fields || []
  return all.map((f) => ({ ...toFormItem(f, lookups, all), required: false, rules: [] }))
}

/** Index 保留参数名：搜索条件与之冲突会被后端当成分页/排序参数（实测 ?sort=1 会让列表返回 0 行） */
export const RESERVED_PARAMS = new Set([
  'q', 'pageindex', 'pagesize', 'sort', 'orderby', 'desc', 'asc', 'format', 'token', 'fields',
])

/**
 * 搜索模型 → 查询参数。
 * 契约（curl 实测）：数值/枚举/布尔/日期走**字段参数**（大小写不敏感，但布尔值必须小写 true/false）；
 * 字符串并入 **Q 关键词**模糊搜索（字段参数在部分 Cube 变体上不生效）。
 */
export function buildSearchParams(items: FormItem[], model: Record<string, any>): Record<string, any> {
  const p: Record<string, any> = {}
  const keywords: string[] = []
  for (const it of items) {
    const v = model?.[it.key]
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue
    const lower = String(it.paramName).toLowerCase()
    if (RESERVED_PARAMS.has(lower)) continue
    const isText = ['input', 'textarea', 'email', 'tel'].includes(it.control)
    if (isText) {
      keywords.push(String(v).trim())
      continue
    }
    p[it.paramName] = typeof v === 'boolean' ? (v ? 'true' : 'false') : v
  }
  if (keywords.length) p.Q = keywords.join(' ')
  return p
}

export function groupByCategory<T extends { category: string }>(
  items: T[],
  defaultCategory = DEFAULT_CATEGORY,
): { category: string; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const cat = it.category && it.category.trim() ? it.category : defaultCategory
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(it)
  }
  const groups: { category: string; items: T[] }[] = []
  if (map.has(defaultCategory)) groups.push({ category: defaultCategory, items: map.get(defaultCategory)! })
  for (const [cat, arr] of map) {
    if (cat === defaultCategory) continue
    groups.push({ category: cat, items: arr })
  }
  return groups
}

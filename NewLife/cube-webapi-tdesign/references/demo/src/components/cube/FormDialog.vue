<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormItem, DataField } from '@/api/fieldRender'
import { groupByCategory } from '@/api/fieldRender'

const props = defineProps<{
  resource: any
  fields?: DataField[]
  items?: FormItem[]
  lookups?: Record<string, Record<string, string>>
  editRow?: any | null
}>()

const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ (e: 'saved'): void }>()

const formRef = ref<any>(null)
const model = ref<any>({})
const submitting = ref(false)

const isEdit = computed(() => !!props.editRow)
const formItems = computed<FormItem[]>(() => props.items || [])
const groups = computed(() => groupByCategory(formItems.value))

/**
 * 校验规则一律走 TDesign/async-validator 内置类型（required / email / url / number / max …），
 * 由 buildFormItems 依据字段元数据生成——不手写正则，也不自己遍历校验。
 */
const rules = computed(() => {
  const r: Record<string, any[]> = {}
  for (const it of formItems.value) {
    if (it.rules && it.rules.length) r[it.key] = it.rules
  }
  return r
})

function defaultValue(it: FormItem): any {
  if (it.control === 'switch') return false
  if (it.multiple) return []
  if (it.control === 'number') return null
  return ''
}

function buildModel() {
  const m: any = {}
  for (const it of formItems.value) {
    const row = props.editRow
    // 映射字段提交键是原始字段名（classID），但行数据里可能只有自身名（className）
    const v = row ? (row[it.key] ?? (it.fallbackKey ? row[it.fallbackKey] : undefined)) : undefined
    m[it.key] = v ?? defaultValue(it)
  }
  model.value = m
}

watch(visible, (v) => {
  if (!v) return
  buildModel()
  nextTick(() => formRef.value?.clearValidate?.())
})

async function onSubmit() {
  // 内置校验：validate 返回 true 或校验结果对象，不抛异常
  const result = await formRef.value?.validate?.()
  if (result !== true) return
  submitting.value = true
  try {
    const row: any = { ...model.value }
    if (isEdit.value && props.editRow) row.id = props.editRow.id ?? props.editRow.ID
    if (isEdit.value) await props.resource.update(row)
    else await props.resource.create(row)
    MessagePlugin.success(isEdit.value ? '保存成功' : '新增成功')
    visible.value = false
    emit('saved')
  } catch (e: any) {
    MessagePlugin.error(e?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <t-dialog
    v-model:visible="visible"
    :header="isEdit ? '编辑' : '新增'"
    :confirm-btn="{ content: '保存', loading: submitting }"
    cancel-btn="取消"
    width="680px"
    @confirm="onSubmit"
  >
    <t-form ref="formRef" :data="model" :rules="rules" label-width="120px">
      <template v-for="g in groups" :key="g.category">
        <div class="fd-cat">{{ g.category }}</div>
        <t-form-item v-for="it in g.items" :key="it.key" :label="it.label" :name="it.key">
          <t-input
            v-if="it.control === 'input' || it.control === 'email' || it.control === 'tel'"
            v-model="model[it.key]"
            :type="it.control === 'email' ? 'email' : it.control === 'tel' ? 'tel' : 'text'"
            :maxlength="it.maxlength"
            :readonly="it.readOnly"
            :placeholder="`请输入${it.label}`"
          />
          <t-textarea
            v-else-if="it.control === 'textarea'"
            v-model="model[it.key]"
            :readonly="it.readOnly"
            :placeholder="`请输入${it.label}`"
          />
          <t-input-number
            v-else-if="it.control === 'number'"
            v-model="model[it.key]"
            :readonly="it.readOnly"
            theme="column"
            style="width: 100%"
          />
          <t-switch v-else-if="it.control === 'switch'" v-model="model[it.key]" :disabled="it.readOnly" />
          <t-date-picker
            v-else-if="it.control === 'date'"
            v-model="model[it.key]"
            value-type="YYYY-MM-DD HH:mm:ss"
            format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
          <t-select
            v-else-if="it.control === 'select' || it.control === 'multi-select'"
            v-model="model[it.key]"
            :multiple="it.multiple"
            :options="it.options"
            :readonly="it.readOnly"
            :placeholder="`请选择${it.label}`"
            filterable
          />
          <t-tree-select
            v-else-if="it.control === 'tree-select'"
            v-model="model[it.key]"
            :data="it.options"
            :readonly="it.readOnly"
            clearable
            filterable
          />
          <t-input v-else v-model="model[it.key]" :readonly="it.readOnly" />
        </t-form-item>
      </template>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.fd-cat {
  font-size: 13px;
  font-weight: 600;
  color: var(--cube-category-tabs, #0f4c9e);
  margin: 8px 0 4px;
  padding-left: 8px;
  border-left: 3px solid var(--cube-category-tabs, #0f4c9e);
}
</style>

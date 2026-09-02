<script setup lang="ts">
import { computed } from 'vue'
import { labelOf, DataField, mapDictOf, isMappedField } from '@/api/fieldRender'
import { camelFieldName } from '@/utils/camel'

const props = defineProps<{
  /** 通常传 GetPage.detail 字段集（后端已按详情场景裁剪） */
  fields?: DataField[]
  row?: any
  lookups?: Record<string, Record<string, string>>
}>()
const visible = defineModel<boolean>('visible', { default: false })

const items = computed(() => {
  const fs = props.fields || []
  return fs
    .filter((f) => !f.primaryKey)
    .map((f) => {
      const key = camelFieldName(f.name)
      const raw = props.row ? props.row[key] : undefined
      const text = labelOf(f, raw, props.lookups, fs)
      return {
        label: f.header || f.displayName || f.name,
        value: text === '' || text == null ? '-' : String(text),
        tag: isMappedField(f, fs) || !!mapDictOf(f, fs),
      }
    })
})
</script>

<template>
  <t-drawer v-model:visible="visible" header="详情" size="460px" :footer="false">
    <t-descriptions :column="1" bordered>
      <t-descriptions-item v-for="it in items" :key="it.label" :label="it.label">
        <t-tag v-if="it.tag && it.value !== '-'" theme="primary" variant="light">{{ it.value }}</t-tag>
        <span v-else>{{ it.value }}</span>
      </t-descriptions-item>
    </t-descriptions>
  </t-drawer>
</template>

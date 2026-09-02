<script setup lang="ts">
import ListPage from '@/components/cube/ListPage.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{
  area: string
  controller: string
  title?: string
  readOnly?: boolean
}>()

const route = useRoute()

// 宿主页面/路由可透传：固定查询参数 extra、搜索参数名映射 searchParamMap
const extra = computed<Record<string, any> | undefined>(() => (route.query.extra as any) || undefined)
const readOnly = computed(() => props.readOnly === true || route.query.readOnly === '1')
</script>

<template>
  <ListPage
    :area="area"
    :controller="controller"
    :title="title"
    :read-only="readOnly"
    :extra="extra"
  />
</template>

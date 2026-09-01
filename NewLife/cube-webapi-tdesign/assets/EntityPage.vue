<template>
  <div class="entity-page">
    <ListPage
      :area="area"
      :controller="controller"
      :title="title"
      :search-param-map="searchParamMap"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import ListPage from '@/components/cube/ListPage.vue';

/**
 * 泛型实体页：既可由显式薄页面通过 props 传入 area/controller（见 src/pages/admin/*），
 * 也可由泛型路由 /:area/:controller 通过路由参数驱动。新实体只需复制 5 行即可落地。
 * searchParamMap：透传给 ListPage（后端虚拟映射字段 → 真实查询字段，如 User.RoleID → roleIds）。
 */
const props = defineProps<{
  area?: string;
  controller?: string;
  title?: string;
  searchParamMap?: Record<string, string>;
}>();
const route = useRoute();

const area = computed(() => props.area ?? (route.params.area as string));
const controller = computed(() => props.controller ?? (route.params.controller as string));
const title = computed(() => props.title ?? `${area.value} / ${controller.value}`);
</script>

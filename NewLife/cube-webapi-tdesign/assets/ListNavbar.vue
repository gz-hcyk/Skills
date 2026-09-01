<template>
  <!-- 导航栏（对应魔方 MVC 的 _List_Navbar.cshtml 分部视图）
       标题 + 实体路径（area / controller），由 GetPage.setting.enableNavbar 控制显隐。 -->
  <div v-if="enableNavbar !== false" class="cube-list-navbar">
    <div class="nb-left">
      <span class="nb-title">{{ title }}</span>
      <t-tag v-if="area" theme="primary" variant="light" size="small">{{ area }} / {{ controller }}</t-tag>
    </div>
    <div class="nb-right">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** 页面标题（宿主传入，缺省由 area/controller 拼） */
  title?: string;
  area?: string;
  controller?: string;
  /** GetPage.setting.enableNavbar */
  enableNavbar?: boolean;
}>();
</script>

<style scoped>
.cube-list-navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.nb-left { display: flex; align-items: center; gap: 10px; }
.nb-title { font-size: 16px; font-weight: 600; color: var(--td-text-color-primary); }
.nb-right { display: flex; align-items: center; gap: 8px; }
</style>

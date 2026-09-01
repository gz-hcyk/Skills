<template>
  <!-- 悬浮齿轮按钮：点击打开个性化配置抽屉 -->
  <t-button
    class="setting-fab"
    theme="primary"
    shape="circle"
    size="large"
    @click="visible = true"
  >
    <t-icon name="setting" />
  </t-button>

  <t-drawer
    v-model:visible="visible"
    :header="false"
    :footer="false"
    size="360px"
    class="setting-drawer"
  >
    <div class="setting-panel">
      <div class="sp-head">
        <t-icon name="setting" />
        <span>个性化配置</span>
      </div>

      <!-- 主题模式 -->
      <section class="sp-section">
        <div class="sp-title">主题模式</div>
        <div class="sp-row">
          <button
            v-for="opt in modeOptions"
            :key="opt.value"
            class="sp-card"
            :class="{ active: setting.mode === opt.value }"
            @click="setting.set('mode', opt.value)"
          >
            <span class="sp-card-ico" :class="opt.value">
              <t-icon :name="opt.icon" />
            </span>
            <span>{{ opt.label }}</span>
          </button>
        </div>
      </section>

      <!-- 品牌色 -->
      <section class="sp-section">
        <div class="sp-title">品牌主色</div>
        <div class="sp-swatches">
          <button
            v-for="c in brandPresets"
            :key="c"
            class="sp-swatch"
            :class="{ active: sameColor(c, setting.brandColor) }"
            :style="{ background: c }"
            :title="c"
            @click="setting.set('brandColor', c)"
          />
          <t-tooltip content="自定义颜色">
            <t-color-picker
              :value="setting.brandColor"
              :swatch-colors="brandPresets"
              @change="(v: string) => setting.set('brandColor', v)"
            />
          </t-tooltip>
        </div>
      </section>

      <!-- 菜单布局 -->
      <section class="sp-section">
        <div class="sp-title">菜单布局</div>
        <t-radio-group
          :value="setting.layout"
          variant="default-filled"
          @change="(v: LayoutMode) => setting.set('layout', v)"
        >
          <t-radio-button value="side">侧边</t-radio-button>
          <t-radio-button value="top">顶部</t-radio-button>
        </t-radio-group>
      </section>

      <!-- 侧边栏折叠（仅侧边布局可用） -->
      <section class="sp-section">
        <div class="sp-title">
          侧边栏折叠
          <t-switch
            :value="setting.collapsed"
            :disabled="setting.layout !== 'side'"
            size="small"
            @change="(v: boolean) => setting.set('collapsed', v)"
          />
        </div>
        <div class="sp-hint" v-if="setting.layout !== 'side'">顶部布局下不可用</div>
      </section>

      <!-- 元素尺寸 -->
      <section class="sp-section">
        <div class="sp-title">元素尺寸</div>
        <t-radio-group
          :value="compactValue"
          variant="default-filled"
          @change="(v: string) => setting.set('compact', v === 'compact')"
        >
          <t-radio-button value="default">默认</t-radio-button>
          <t-radio-button value="compact">紧凑</t-radio-button>
        </t-radio-group>
      </section>

      <t-button theme="default" block class="sp-reset" @click="setting.reset()">
        <template #icon><t-icon name="rollback" /></template>
        恢复默认
      </t-button>
    </div>
  </t-drawer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSettingStore, type LayoutMode } from '@/stores/setting';

const setting = useSettingStore();
const visible = ref(false);

// 品牌主色预设：政务蓝为默认并置首，其余沿用 TDesign Starter 官方色板
const brandPresets = [
  '#0F4C9E', // 政务蓝（默认）
  '#0052D9',
  '#0594FA',
  '#00A870',
  '#EB2F96',
  '#ED7B2F',
  '#834EC2',
  '#D54941',
  '#2BA471',
];

const modeOptions = [
  { value: 'light', label: '亮色', icon: 'sunny' },
  { value: 'dark', label: '暗色', icon: 'moon' },
] as const;

// compact 在 store 是 boolean，这里转成 radio 的 string 值（响应式读取）
const compactValue = computed(() => (setting.compact ? 'compact' : 'default'));

// 颜色比较忽略大小写
function sameColor(a: string, b: string) {
  return (a || '').toLowerCase() === (b || '').toLowerCase();
}
</script>

<style scoped>
.setting-fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1500;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}
.setting-panel { padding: 8px 4px 16px; }
.sp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  padding: 12px 12px 16px;
  color: var(--td-text-color-primary);
}
.sp-head :deep(.t-icon) { color: var(--td-brand-color); }
.sp-section { padding: 10px 12px; border-top: 1px solid var(--td-component-stroke); }
.sp-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 500;
  color: var(--td-text-color-secondary);
  margin-bottom: 12px;
}
.sp-hint { font-size: 12px; color: var(--td-text-color-placeholder); margin-top: 8px; }
.sp-row { display: flex; gap: 12px; }
.sp-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 8px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-default);
  background: var(--td-bg-color-container);
  color: var(--td-text-color-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: border-color var(--td-anim-duration-base), color var(--td-anim-duration-base);
}
.sp-card:hover { border-color: var(--td-brand-color); }
.sp-card.active { border-color: var(--td-brand-color); color: var(--td-brand-color); }
.sp-card-ico {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.sp-card-ico.light { background: linear-gradient(135deg, #f5f7fa, #c9d6e8); color: #333; }
.sp-card-ico.dark { background: linear-gradient(135deg, #2b2f3a, #0c111c); }
.sp-swatches { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sp-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: transform var(--td-anim-duration-base);
}
.sp-swatch:hover { transform: scale(1.12); }
.sp-swatch.active { border-color: var(--td-text-color-primary); box-shadow: 0 0 0 2px var(--td-brand-color-focus); }
.sp-reset { margin: 16px 12px 0; }
</style>

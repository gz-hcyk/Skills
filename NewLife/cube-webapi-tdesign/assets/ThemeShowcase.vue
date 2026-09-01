<template>
  <div class="theme-showcase">
    <t-card title="设计令牌板 · Design Tokens" :bordered="false" class="head-card">
      <template #actions>
        <t-tag theme="primary" variant="light">TDesign 主题覆盖</t-tag>
        <t-tag theme="success" variant="light">无侵入落地</t-tag>
      </template>
      <p class="desc">
        下列所有色块 / 圆角 / 阴影 / 间距均来自
        <code>src/styles/tokens.css</code> 的设计令牌，与组件库共用同一套变量。
        修改令牌即可全局换肤，业务页零改动。
      </p>
    </t-card>

    <!-- 品牌主色 -->
    <t-card title="品牌主色 Brand" :bordered="false" class="block">
      <div class="row">
        <div class="swatch" v-for="c in brandRow" :key="c.label">
          <div class="chip" :style="{ background: c.value }"></div>
          <div class="meta"><b>{{ c.label }}</b><span>{{ c.value }}</span></div>
        </div>
      </div>
      <div class="scale-row">
        <div v-for="(c, i) in brand.scale" :key="i" class="scale-chip" :style="{ background: c }" :title="c"></div>
      </div>
      <div class="grad-row">
        <div class="grad-chip" :style="{ background: gradient.brand }">品牌渐变</div>
        <div class="grad-chip" :style="{ background: gradient.iot }">IoT 融合渐变</div>
      </div>
    </t-card>

    <!-- 语义色 -->
    <t-card title="语义色 Semantic" :bordered="false" class="block">
      <div class="row">
        <div class="swatch" v-for="s in semanticList" :key="s.label">
          <div class="chip" :style="{ background: s.value }"></div>
          <div class="meta"><b>{{ s.label }}</b><span>{{ s.value }}</span></div>
        </div>
      </div>
    </t-card>

    <!-- IoT 青 + 状态 -->
    <t-card title="IoT 青辅助色 + 状态映射" :bordered="false" class="block">
      <div class="scale-row">
        <div v-for="(c, i) in cyan.scale" :key="i" class="scale-chip" :style="{ background: c }" :title="c"></div>
      </div>
      <div class="row status-row">
        <t-tag :style="{ background: status.online, color: '#fff' }">在线 Online</t-tag>
        <t-tag :style="{ background: status.offline, color: '#fff' }">离线 Offline</t-tag>
        <t-tag :style="{ background: status.busy, color: '#fff' }">忙碌 Busy</t-tag>
        <t-tag :style="{ background: status.error, color: '#fff' }">异常 Error</t-tag>
      </div>
    </t-card>

    <!-- 圆角 -->
    <t-card title="圆角 Radius" :bordered="false" class="block">
      <div class="radius-row">
        <div class="radius-box" :style="{ borderRadius: radius.sm + 'px' }">小 {{ radius.sm }}px</div>
        <div class="radius-box" :style="{ borderRadius: radius.md + 'px' }">中 {{ radius.md }}px</div>
        <div class="radius-box" :style="{ borderRadius: radius.lg + 'px' }">大 {{ radius.lg }}px</div>
        <div class="radius-box" :style="{ borderRadius: radius.xl + 'px' }">超大 {{ radius.xl }}px</div>
        <div class="radius-box" :style="{ borderRadius: radius.pill + 'px' }">胶囊</div>
      </div>
    </t-card>

    <!-- 阴影 -->
    <t-card title="阴影 Shadow" :bordered="false" class="block">
      <div class="shadow-row">
        <div class="shadow-box" :style="{ boxShadow: shadow.pop }">气泡 pop</div>
        <div class="shadow-box" :style="{ boxShadow: shadow.card }">卡片 card</div>
        <div class="shadow-box" :style="{ boxShadow: shadow.overlay }">弹层 overlay</div>
      </div>
    </t-card>

    <!-- 间距 -->
    <t-card title="间距阶梯 Spacing (4px base)" :bordered="false" class="block">
      <div class="spacing-row">
        <div class="spacing-item" v-for="(s, i) in spacing" :key="i">
          <div class="spacing-bar" :style="{ width: s + 'px' }"></div>
          <span>{{ s }}px</span>
        </div>
      </div>
    </t-card>

    <!-- 字号 -->
    <t-card title="字号阶梯 Font Size" :bordered="false" class="block">
      <div class="font-row">
        <span v-for="(f, i) in fontSize" :key="i" :style="{ fontSize: f + 'px' }">{{ f }}px 魔方</span>
      </div>
    </t-card>

    <!-- 组件主题示例 -->
    <t-card title="组件主题示例（受令牌驱动）" :bordered="false" class="block">
      <div class="demo-row">
        <t-button theme="primary">主要按钮</t-button>
        <t-button theme="success">成功</t-button>
        <t-button theme="warning">警告</t-button>
        <t-button theme="danger">危险</t-button>
        <t-switch :value="true" />
        <t-tag theme="primary">品牌标签</t-tag>
        <t-input placeholder="输入框（焦点环）" style="width: 200px" />
      </div>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import tokens from '@/theme/tokens';

const { brand, semantic, cyan, status, radius, shadow, spacing, fontSize, gradient } = tokens;

const brandRow = [
  { label: '主色', value: brand.color },
  { label: 'hover', value: brand.hover },
  { label: 'active', value: brand.active },
  { label: '浅底', value: brand.light },
  { label: 'focus', value: brand.focus },
  { label: 'disabled', value: brand.disabled },
];

const semanticList = [
  { label: '成功', value: semantic.success },
  { label: '警告', value: semantic.warning },
  { label: '错误', value: semantic.error },
  { label: '信息', value: semantic.info },
];
</script>

<style scoped>
.theme-showcase { max-width: var(--cube-content-max-width); margin: 0 auto; display: flex; flex-direction: column; gap: var(--cube-spacing-4); }
.head-card { background: var(--td-brand-color-light); }
.desc { color: var(--td-text-color-secondary); font-size: 13px; line-height: 1.7; margin: 8px 0 0; }
.desc code { font-family: var(--td-font-family-mono); background: rgba(0, 0, 0, 0.06); padding: 1px 6px; border-radius: 4px; }
.block :deep(.t-card__body) { padding: var(--cube-spacing-4); }
.row { display: flex; flex-wrap: wrap; gap: var(--cube-spacing-4); }
.swatch { display: flex; align-items: center; gap: var(--cube-spacing-2); }
.chip { width: 40px; height: 40px; border-radius: var(--cube-radius-md); box-shadow: var(--td-shadow-1); }
.meta { display: flex; flex-direction: column; }
.meta b { font-size: 13px; }
.meta span { font-size: 11px; color: var(--td-text-color-placeholder); font-family: var(--td-font-family-mono); }
.scale-row { display: flex; gap: 2px; margin-top: var(--cube-spacing-3); border-radius: var(--cube-radius-sm); overflow: hidden; }
.scale-chip { flex: 1; height: 28px; }
.grad-row { display: flex; gap: var(--cube-spacing-3); margin-top: var(--cube-spacing-3); }
.grad-chip { flex: 1; height: 44px; border-radius: var(--cube-radius-md); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; box-shadow: var(--td-shadow-1); }
.status-row { gap: var(--cube-spacing-2); margin-top: var(--cube-spacing-3); }
.radius-row { display: flex; gap: var(--cube-spacing-4); flex-wrap: wrap; }
.radius-box { width: 92px; height: 64px; background: var(--td-brand-color-light); border: 1px solid var(--td-component-border); display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--td-text-color-secondary); }
.shadow-row { display: flex; gap: var(--cube-spacing-5); flex-wrap: wrap; }
.shadow-box { width: 120px; height: 72px; background: #fff; border-radius: var(--cube-radius-md); display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--td-text-color-secondary); }
.spacing-row { display: flex; gap: var(--cube-spacing-3); align-items: flex-end; flex-wrap: wrap; }
.spacing-item { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 11px; color: var(--td-text-color-secondary); }
.spacing-bar { height: 40px; background: var(--td-brand-color); border-radius: 2px; }
.font-row { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.font-row span { color: var(--td-text-color-primary); }
.demo-row { display: flex; align-items: center; gap: var(--cube-spacing-3); flex-wrap: wrap; }
</style>

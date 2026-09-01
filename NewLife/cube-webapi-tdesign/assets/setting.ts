/**
 * 个性化配置 store（对齐 TDesign Starter 的「设置」能力）
 * -------------------------------------------------------------
 * 用户可自定义：主题模式（亮/暗）、品牌主色、菜单布局（侧边/顶部）、
 * 侧边栏折叠、元素尺寸（默认/紧凑）。所有偏好持久化到 localStorage，
 * 应用启动（main.ts）时 load() 还原并 apply() 到 <html>。
 *
 * 设计要点：
 *  - 仅覆盖 chrome 层与 CSS 变量，不侵入 TDesign 组件主题变量定义；
 *  - 品牌色通过 inline style 写入 documentElement，优先级高于 tokens.css；
 *  - 暗色模式因 tdesign-vue-next@1.20.7 未内置 dark css，由 theme-dark.css
 *    提供中性语义令牌覆盖，这里只负责切换 .t-theme-dark 根类。
 */
import { defineStore } from 'pinia';
import { getBrandPalette } from '@/utils/color';

export type ThemeMode = 'light' | 'dark';
export type LayoutMode = 'side' | 'top';

export interface PersonalizationState {
  mode: ThemeMode;
  brandColor: string;
  layout: LayoutMode;
  collapsed: boolean;
  compact: boolean;
}

const STORAGE_KEY = 'cube-personalization';

// 与 tokens.css 中默认品牌色保持一致（政务蓝 #0f4c9e），重置时回退到此
export const DEFAULT_BRAND = '#0f4c9e';

const DEFAULTS: PersonalizationState = {
  mode: 'light',
  brandColor: DEFAULT_BRAND,
  layout: 'side',
  collapsed: false,
  compact: false,
};

function readStorage(): Partial<PersonalizationState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<PersonalizationState>) : null;
  } catch {
    return null;
  }
}

function writeStorage(state: PersonalizationState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        mode: state.mode,
        brandColor: state.brandColor,
        layout: state.layout,
        collapsed: state.collapsed,
        compact: state.compact,
      }),
    );
  } catch {
    /* localStorage 不可用时静默降级（仍内存生效） */
  }
}

export const useSettingStore = defineStore('setting', {
  state: (): PersonalizationState => ({ ...DEFAULTS }),
  actions: {
    /** 启动时还原持久化偏好并应用到 DOM */
    load() {
      const saved = readStorage();
      if (saved) {
        if (saved.mode) this.mode = saved.mode;
        if (saved.brandColor) this.brandColor = saved.brandColor;
        if (saved.layout) this.layout = saved.layout;
        if (typeof saved.collapsed === 'boolean') this.collapsed = saved.collapsed;
        if (typeof saved.compact === 'boolean') this.compact = saved.compact;
      }
      this.apply();
    },

    /** 将当前 state 落到 <html>：根类 + 品牌色 CSS 变量 */
    apply() {
      const root = document.documentElement;
      root.classList.toggle('t-theme-dark', this.mode === 'dark');
      root.classList.toggle('cube-compact', this.compact);

      const palette = getBrandPalette(this.brandColor);
      for (const [key, value] of Object.entries(palette)) {
        root.style.setProperty(key, value);
      }
    },

    /** 通用 setter：改值即应用 + 持久化（实现「即时预览」） */
    set<K extends keyof PersonalizationState>(key: K, value: PersonalizationState[K]) {
      this[key] = value;
      // 顶部布局下侧栏折叠无意义，自动复位
      if (key === 'layout' && value === 'top') this.collapsed = false;
      this.apply();
      writeStorage(this.$state as PersonalizationState);
    },

    /** 一键恢复默认 */
    reset() {
      this.$patch({ ...DEFAULTS });
      this.apply();
      writeStorage(this.$state as PersonalizationState);
    },
  },
});

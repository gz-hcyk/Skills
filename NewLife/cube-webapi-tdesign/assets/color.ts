/**
 * 颜色工具：用于「个性化配置」中根据用户选择的品牌主色，
 * 实时生成 TDesign 所需的完整品牌色阶（hover / active / light / 1-8 步进 /
 * 渐变），并直接写入 CSS 变量，无需引入额外依赖。
 *
 * 算法参考 TDesign 官方主题生成：以主色为基准，向白/黑线性混合得到各档。
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** #rgb / #rrggbb → RGB（容错：自动补 3 位缩写） */
export function hexToRgb(hex: string): RGB {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  if (Number.isNaN(num)) return { r: 0, g: 82, b: 217 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** 把 a 向 b 方向混合 weight（0~1），返回 hex */
export function mix(hexA: string, hexB: string, weight: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex(a.r + (b.r - a.r) * w, a.g + (b.g - a.g) * w, a.b + (b.b - a.b) * w);
}

/** 带透明度的 rgba 字符串（用于 focus 环） */
export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 由主色生成完整品牌色阶映射（CSS 变量名 → 值）。
 * 键名与 tokens.css / TDesign 主题变量一一对应，直接 setProperty 即可全局生效。
 */
export function getBrandPalette(hex: string): Record<string, string> {
  const base = hex;
  // 交互态：hover 向白、active 向黑
  const hover = mix(base, '#ffffff', 0.14);
  const active = mix(base, '#000000', 0.12);
  // 浅底：选中行 / 标签背景（向白混合越多越浅）
  const light = mix(base, '#ffffff', 0.88);
  const lightHover = mix(base, '#ffffff', 0.83);
  const lightActive = mix(base, '#ffffff', 0.77);
  // 禁用 / 聚焦
  const disabled = mix(base, '#ffffff', 0.45);
  const focus = rgba(base, 0.2);

  // 1(最浅) → 8(最深)，基准约落在 5~6 之间
  const steps: string[] = [];
  for (let i = 1; i <= 8; i++) {
    steps.push(i <= 5 ? mix(base, '#ffffff', (6 - i) * 0.15) : mix(base, '#000000', (i - 5) * 0.15));
  }

  // 品牌渐变：logo / 头像 / 强调块
  const grad = `linear-gradient(135deg, ${mix(base, '#ffffff', 0.22)} 0%, ${base} 100%)`;
  // 品牌同色系渐变（登录左栏 / 大屏 banner）：浅→主色，随品牌色联动，保证与控制台同色系
  const gradIot = `linear-gradient(135deg, ${mix(base, '#ffffff', 0.25)} 0%, ${base} 100%)`;

  /* ===== 控制台 chrome：侧边栏(菜单栏) / 顶栏 跟随品牌主色联动 =====
   * 以下令牌原本在 tokens.css 写死为政务蓝，导致切换品牌色时侧栏/顶栏不跟随；
   * 现统一由 base 推导并 inline 注入（优先级高于 tokens.css / theme-dark.css），
   * 实现「登录左栏 + 菜单栏 + 顶栏」三处品牌同源、随品牌变更实时同步。
   * 侧栏底部向黑混合 20% 以保证白字对比（WCAG AA）。 */
  const sidebarTop = mix(base, '#ffffff', 0.10);
  const sidebarBottom = mix(base, '#000000', 0.20);
  const sidebarBg = `linear-gradient(180deg, ${sidebarTop} 0%, ${sidebarBottom} 100%)`;
  const sidebarSolid = mix(base, '#000000', 0.14);
  const sidebarActiveBg = rgba(base, 0.30);          // 激活项品牌浅底高亮
  const sidebarActiveBar = mix(base, '#ffffff', 0.45); // 激活项左侧强调条（更亮，深底显眼）
  const topbarBorder = base;                          // 顶栏底部强调线 = 品牌主色

  return {
    '--td-brand-color': base,
    '--td-brand-color-hover': hover,
    '--td-brand-color-active': active,
    '--td-brand-color-light': light,
    '--td-brand-color-light-hover': lightHover,
    '--td-brand-color-light-active': lightActive,
    '--td-brand-color-focus': focus,
    '--td-brand-color-disabled': disabled,
    '--td-brand-color-1': steps[0],
    '--td-brand-color-2': steps[1],
    '--td-brand-color-3': steps[2],
    '--td-brand-color-4': steps[3],
    '--td-brand-color-5': steps[4],
    '--td-brand-color-6': steps[5],
    '--td-brand-color-7': steps[6],
    '--td-brand-color-8': steps[7],
    // Cube 扩展令牌
    '--cube-brand-gradient': grad,
    '--cube-brand-gradient-iot': gradIot,
    // 侧边栏（菜单栏）：品牌纵向渐变 + 激活态品牌高亮
    '--cube-sidebar-bg': sidebarBg,
    '--cube-sidebar-bg-solid': sidebarSolid,
    '--cube-sidebar-active-bg': sidebarActiveBg,
    '--cube-sidebar-active-bar': sidebarActiveBar,
    // 顶栏底部强调线：品牌主色
    '--cube-topbar-border': topbarBorder,
  };
}

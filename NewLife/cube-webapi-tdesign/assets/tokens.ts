/**
 * Cube WebApi 前端 · 设计令牌（TypeScript 源）
 * -------------------------------------------------------------
 * 与 `src/styles/tokens.css` 单一事实来源保持一致，供图表配色、
 * 逻辑运算、动态样式等非 CSS 场景使用（如 ECharts 设备在线饼图）。
 *
 * 修改令牌时请同步维护 tokens.css，二者不得冲突。
 */

/** 品牌主色系 */
export const brand = {
  color: '#0f4c9e',
  hover: '#3165ac',
  active: '#0d438b',
  light: '#e2eaf3',
  focus: 'rgba(15, 76, 158, 0.2)',
  disabled: '#7b9dca',
  /** 8 级浅色阶梯（1 最浅 → 8 最深，对应 --td-brand-color-1..8） */
  scale: ['#c3d2e7', '#9fb7d8', '#7b9dca', '#5782bb', '#3367ad', '#0d4186', '#0b356f', '#082a57'],
} as const;

/** 语义色系 */
export const semantic = {
  success: '#2BA471',
  warning: '#E37318',
  error: '#D54941',
  info: '#0594FA',
} as const;

/** IoT 青色辅助色（设备在线 / 数据可视化强调） */
export const cyan = {
  color: '#0090D4',
  hover: '#25A6E0',
  active: '#0077AD',
  light: '#D9F1FB',
  scale: ['#E6F6FC', '#C9ECF8', '#A9E0F3', '#7ECFEC', '#4BB6E1', '#1F9FD6', '#0090D4', '#0077AD'],
} as const;

/** 中性灰阶 */
export const gray = {
  textPrimary: 'rgba(0,0,0,.9)',
  textSecondary: 'rgba(0,0,0,.6)',
  textPlaceholder: 'rgba(0,0,0,.4)',
  textDisabled: 'rgba(0,0,0,.26)',
  bgPage: '#F3F3F3',
  bgContainer: '#FFFFFF',
  border: '#E7E7E7',
} as const;

/** 圆角 */
export const radius = {
  sm: 3,
  md: 6,
  lg: 9,
  xl: 12,
  pill: 999,
} as const;

/** 阴影（与 tokens.css --td-shadow-* 对应） */
export const shadow = {
  pop: '0 1px 10px rgba(0,0,0,.05)',
  card: '0 1px 10px rgba(0,0,0,.05), 0 4px 5px rgba(0,0,0,.08)',
  overlay: '0 3px 14px 2px rgba(0,0,0,.05), 0 8px 10px 1px rgba(0,0,0,.06)',
} as const;

/** 间距阶梯（px） */
export const spacing = [4, 8, 12, 16, 24, 32, 48, 64] as const;

/** 字号阶梯（px） */
export const fontSize = [12, 14, 16, 18, 20, 24, 28, 36] as const;

/** 品牌渐变（CSS 字符串） */
export const gradient = {
  brand: 'linear-gradient(135deg, #3165ac 0%, #0f4c9e 100%)',
  iot: 'linear-gradient(135deg, #1466c4 0%, #0f4c9e 55%, #0a3d82 100%)',
} as const;

/** 设备/连接状态色映射 */
export const status = {
  online: cyan.color,
  offline: gray.textPlaceholder,
  busy: semantic.warning,
  error: semantic.error,
} as const;

/** 统一导出 */
export const tokens = {
  brand,
  semantic,
  cyan,
  gray,
  radius,
  shadow,
  spacing,
  fontSize,
  gradient,
  status,
} as const;

export default tokens;

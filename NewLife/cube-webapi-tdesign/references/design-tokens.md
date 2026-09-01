# 设计令牌与 TDesign 主题规范（cube-webapi-tdesign）

本文件把「魔方 WebApi 前端」的设计基础（色彩 / 字体 / 间距 / 圆角 / 阴影 / 动效）固化为可落地的设计令牌，
落地方式采用 **TDesign 官方 CSS 变量覆盖**（无侵入、零新增依赖）。配套资产：

- `assets/tokens.css` —— 设计令牌源（`:root` 覆盖 `--td-*` 原生变量 + 新增 `--cube-*` 业务扩展令牌）
- `assets/tokens.ts` —— 同源 TS 导出，供图表 / 逻辑等非 CSS 场景
- `assets/ThemeShowcase.vue` —— 设计令牌板页面（落地为 `src/pages/ThemeShowcase.vue`，路由 `/Theme`，可视化验证）

---

## 一、设计基础（Design Foundations）

### 1.1 色彩
- **主色 Brand（默认政务蓝）**：`#0F4C9E`（hover `#3165AC` / active `#0D438B` / 浅底 `#E2EAF3`）
- **语义色**：成功 `#2BA471` · 警告 `#E37318` · 错误 `#D54941` · 信息 `#0594FA`
- **中性灰阶**：文本主 `rgba(0,0,0,.9)`、次 `rgba(0,0,0,.6)`、占位 `rgba(0,0,0,.4)`；背景页 `#F3F3F3`、卡片 `#FFFFFF`、边框 `#E7E7E7`
- **IoT 青辅助色**（设备在线 / 数据可视化强调，避免与主蓝冲突）：`#0090D4`

### 1.2 字体
- 中文：`PingFang SC` / `Microsoft YaHei`；西文：`Inter` / `Segoe UI`；等宽（ID / JSON）：`JetBrains Mono`
- 正文 14px / 行高 22px；字号阶梯 12 / 14 / 16 / 18 / 20 / 24 / 28 / 36；字重 400 / 500 / 600 / 700

### 1.3 间距与栅格
- 基准 4px，阶梯：4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
- 内容区最大宽 1280px；侧边栏固定 232px（收起 64px）

### 1.4 圆角 / 阴影 / 动效
- 圆角：小 3px / 中 6px / 大 9px / 超大 12px / 胶囊 999px
- 阴影：卡片 `0 1px 10px rgba(0,0,0,.05), 0 4px 5px rgba(0,0,0,.08)`；弹层 `0 3px 14px 2px rgba(0,0,0,.05), 0 8px 10px 1px rgba(0,0,0,.06)`
- 动效：150ms 快 / 300ms 常规；尊重 `prefers-reduced-motion`

---

## 二、落地方式：TDesign CSS 变量覆盖（无侵入）

工程在 `main.ts` 中**先**引入 `tdesign-vue-next/es/style/index.css`（编译后 CSS），**后**引入 `tokens.css`：
```ts
import 'tdesign-vue-next/es/style/index.css';
import '@/styles/tokens.css'; // 覆盖 TDesign 主题变量
```
`tokens.css` 以 `:root` 覆盖 TDesign 原生变量，并新增 `--cube-*` 业务扩展令牌。

**优势**：零新增依赖、不动 TDesign 源码、改色即全站（含组件）生效、业务页零改动。

> 若工程引入的是 TDesign **SCSS 源**（非编译后 CSS），可改用 `css.preprocessorOptions.scss.modifyVars` 编译期换肤（需安装 `sass`）；本技能默认走 CSS 变量覆盖方案。

---

## 三、令牌源文件职责

| 文件 | 落地位置 | 用途 |
|------|----------|------|
| `assets/tokens.css` | `src/styles/tokens.css` | 设计=代码，全站主题变量（含 `--td-*` 与 `--cube-*`） |
| `assets/tokens.ts` | `src/theme/tokens.ts` | 同源 TS 导出（brand/semantic/cyan/gray/radius/shadow/spacing/fontSize/gradient/status），供 ECharts 等 |
| `assets/ThemeShowcase.vue` | `src/pages/ThemeShowcase.vue` | 设计令牌板，路由 `/Theme` 可视化验证 |

---

## 四、`--cube-*` 业务扩展令牌（节选）

- `--cube-accent-cyan` / `-hover` / `-active` / `-light`：IoT 青辅助色
- `--cube-brand-gradient`：`linear-gradient(135deg, #3165AC, #0F4C9E)`（logo / 头像）
- `--cube-brand-gradient-iot`：`linear-gradient(135deg, #1466C4, #0F4C9E 55%, #0A3D82)`（登录左栏 / IoT 科技感）
- `--cube-status-online` / `-offline` / `-busy` / `-error`：设备 / 连接状态色映射
- `--cube-spacing-1..8`：4 / 8 / 12 / 16 / 24 / 32 / 48 / 64（px）
- `--cube-radius-sm/md/lg`：3 / 6 / 9（px）；`--cube-content-max-width`：1280px
- 可见聚焦环：`--td-brand-color-focus`（品牌色 20% 透明）

> 完整变量与色值以 `assets/tokens.css` 为准（单一事实来源）。

---

## 五、扩展路径

- **换肤**：编辑 `tokens.css` 中对应 `--td-*` / `--cube-*` 变量，全站（含 TDesign 组件）即时生效，业务页零改动。
- **暗色主题**：TDesign 原生支持 `t-theme-dark`（组件加 `class="t-theme-dark"` 或根节点 `html.t-theme-dark`）。
  在 `tokens.css` 增加 `.t-theme-dark { /* 暗色覆盖 */ }` 或 `@media (prefers-color-scheme: dark)` 补充暗色令牌即可。
- **多品牌**：复制 `tokens.css` 为 `tokens-brand-b.css`，在 `main.ts` 按 `import.meta.env.VITE_BRAND` 动态 `import` 不同令牌文件。
- **SCSS 深度定制**：改引 `tdesign-vue-next/esm/` 入口，在 `vite.config.ts` 配 `css.preprocessorOptions.scss.modifyVars` + 安装 `sass`。

---

## 六、无障碍基线

对比度 4.5:1（正文）/ 3:1（大字）；全键盘可达；可见聚焦环 2px；触控目标 ≥ 44px；
表单 `label` + `aria`；`prefers-reduced-motion` 降级动效。

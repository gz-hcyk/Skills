# 生产级编排层脚手架（references/scaffold/）

`references/demo/` 是**最小端到端验证**（单实体 IoTHub 设备）。本目录在 demo 之上，提供更贴近真实工程的
**编排层模板**：已落地覆盖魔方 7 个内置模块（Admin 的 User / Role / Department / Menu / Permission，
Sys 的 Config / Log），验证树形 / 只读 / 外键 / 分页 / 排序 / 搜索等全部契约修正点。

## 目录
```
references/scaffold/
  src/
    layouts/BasicLayout.vue   侧边栏（MenuSidebar）+ 顶栏（租户切换 / 用户菜单 / 搜索）+ 内容区
    pages/
      EntityPage.vue          泛型实体页：从路由 area/controller 驱动 ListPage
      LoginView.vue           登录门禁（左品牌区渐变 + 右表单区，含用户名/密码/租户选择）
    router/index.ts           登录门禁（beforeEach 未登录跳 /login）+ 内置模块显式注册 + :area/:controller 兜底
    main.ts                   引入 tokens.css 主题
  vite.config.ts              代理 /api（接口）+ /cube（附件/图片资源）；登录/菜单在真实后端同位于 /api 下，切勿代理 /Admin 等 SPA 路由
  backend/server.mjs         注册表驱动 Mock 后端（零依赖）
```

## 注册表驱动 Mock 后端要点
`backend/server.mjs` 用一个 `registries` 对象描述每个实体（字段、分页默认、是否树形、是否只读、外键关联），
通用 handler 依据注册表返回 `GetPage` / `Index` / `Detail` / `Insert` / `Update` / `Delete`，
无需为每个实体写重复路由。新增演示实体 ≈ 往 `registries` 加一条。

## 使用方式
- **新建工程**：以本目录 `src/**` 与 `vite.config.ts` 为骨架，技能 `assets/*`（api / auth / permissions /
  useEntityResource / useLookups / fieldRender / ListPage / FormDialog / DetailDrawer / MenuSidebar）与
  `assets/tokens.*`、TDesign 依赖就位后，`npm install && npm run dev:all` 即可。
- **并入现有工程**：对照把 `BasicLayout` / `EntityPage` / `LoginView` / `router` / `main.ts` 的编排逻辑
  迁移到你的工程，技能 `assets/*` 与 `tokens.*` 直接复用，不重复造轮子。

> 资产文件对 `src/api/*` 的引用使用 `../../api/...`（基类组件落在 `src/components/cube/`），复制时注意目录层次。

## 标准新工程初始化（tdesign-starter-cli，2026-09 起默认）

真实 NewLife.Cube 后端项目一律先用官方 CLI 搭骨架，再拷入 `assets/` 模板：

```bash
npm i tdesign-starter-cli@latest -g
td-starter init <项目名> -type vue3 -bt vite -temp lite   # 必须显式 -type vue3（默认 vue2）
cd <项目名> && npm install && npm run dev
```

随后按 SKILL.md §11.2 的「assets/ → 目标路径映射表」拷入模板，并接入魔方内置 9 系统模块
（/Admin/User、/Admin/Role、/Admin/Menu、/Admin/Department、/Admin/Parameter、/Admin/Log、
/Admin/OAuthConfig、/Admin/Tenant、/Cube/App，路由 `/entity/:area/:controller` 零新增页面代码）
+ `DashboardView.vue` 仪表盘首页。注意：真实后端实体 API 在根路径 `/{Area}/{Controller}`（无 /api 前缀），
vite 须代理 `/Admin`、`/cube` 与业务 Area——这与本目录 mock 场景（/api 前缀、勿代理 /Admin）不同。
完整流程与验收清单见 SKILL.md §11。

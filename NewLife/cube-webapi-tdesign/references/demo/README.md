# cube-webapi-tdesign 最小可运行 Demo

零依赖验证脚手架：Mock 后端（Node 内置 http）实现 NewLife.Cube 魔方 WebApi 官方契约，
前端直接复用技能全部资产（`src/api/*` + `src/components/cube/*`）。

## 运行

```bash
npm install
npm run mock   # 终端1：Mock 后端 :3001（无需额外安装）
npm run dev    # 终端2：Vite :5173，dev proxy 把 /api、/Auth、/Mfa、/cube 转发到 mock
```

浏览器打开 http://localhost:5173（若 5173 被占用 Vite 自动顺延到 5174，以终端输出为准）。**登录页即演示《认证接口设计.md》完整契约**：密码/短信/邮箱 Tab（由 `LoginConfig.login` 开关驱动）、OAuth 按钮、忘记密码 / 注册入口、用户名含 `mfa` 触发 MFA 二步验证；登录（任意账号 + 任意密码）后点左侧菜单切换实体页。

- **设备列表（IoTHub/Device）**：树形表（含 `ParentID`）、`StatusID` 显「在线/离线/故障」、
  `CategoryID` 经 `lookups` 显分类名、底部 `stat` 统计行；新增/编辑弹窗中 `ParentID` 为树形下拉、
  `StatusID`/`CategoryID` 为映射源下拉；详情抽屉回显名称。
- **设备分类（IoTHub/Category）**：完整 CRUD 演示实体，表单含 `Type` 枚举下拉（map）、
  `ParentID` 自引用树形下拉（tree-select）、`Enable` 开关、`Sort` 数字输入；
  列表支持按 `Type`/`Enable` 搜索与按 `Sort` 排序。

## 以真实魔方后端替换 Mock

本 demo 的 Mock 只是契约替身。对接真实后端时**前端资产无需改动**，唯一必改项是把
Vite dev 代理（或 `api.ts` 的 `baseURL`）指向真实后端域名——代理配 **`/api`（实体/菜单接口）+ `/Auth`、`/Mfa`（认证接口）+ `/cube`（附件/图片资源）**，
**切勿**代理 `/Admin` 等前端 SPA 路由。完整对接说明见技能文档 `SKILL.md` 的 **§十**。

要点速记：
- 令牌头 **`Authentication` + `Authorization` 双头**（值同为 token，兼容官方文档与实测后端——部分后端只认 `Authorization`）；登录 `POST /Auth/Login`（返回 `accessToken`/`refreshToken`/`expireIn`，按文档契约）；菜单 `GET /api/Admin/Index/GetMenuTree`。
- 实体页零代码：菜单每多一个 `{area}/{ctrl}`，前端只加一行 `<ListPage :area :controller />`。
- 外键 `xxxID` 自动按「同名同 area 关联控制器 Index」拉取；不同名用 `:lookup-overrides` 覆盖。

## 导入路径约定

基类组件落在 `src/components/cube/`，对 `src/api/*` 的引用必须用 `../../api/...`（上溯两层）。

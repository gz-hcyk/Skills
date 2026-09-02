---
name: cube-webapi-tdesign
agent_created: true
description: "为 NewLife.Cube 魔方 WebApi 后端生成 TDesign Vue Next 前端。基于 GetFields/GetPage 字段元数据驱动，列表/表单/详情页近零代码生成。核心两条规则：(1) 字段映射——列表页 xxxID 显示映射后的名称（不显示原始ID），表单页同字段渲染为映射源下拉（map/dataSource/关联实体）；(2) 组件选型——按后端字段自动选组件，如 ParentID 自动用树形表格+树形下拉。另含 X-Tenant-Id 多租户、GetPage.setting 按钮权限显隐、GetMenuTree 菜单树与 search 搜索栏。触发词：搭魔方 WebApi 前端、生成实体管理页面、对接 GetFields/GetPage、树形表格、字段映射、多租户前端。"
---

# cube-webapi-tdesign —— 魔方 WebApi 的 TDesign Vue Next 前端

## 一、这个技能做什么 / 何时用

从零创建基于 **TDesign Vue Next + TDesign Starter（tdesign-starter-cli）** 的前端工程，对接
`cube-webapi-backend` 描述的魔方 WebApi 后端。它把魔方 MVC 前端"**页面继承**"的先进理念平移到
Vue：用**元数据驱动 + 配置式基类组件**，让每个实体的列表/表单/详情页"继承"同一套骨架，而非逐个手写。

触发场景：
- 用 `td-starter init` 新建魔方 WebApi 前端工程；
- 根据后端控制器/字段（如含 `ParentID` 自动用 treeTable、枚举字段自动映射下拉）生成管理页面；
- 接入多租户、自定义权限位、字段映射等魔方先进特性。

后端契约（路由、响应信封、字段描述符）的权威定义在 `cube-webapi-backend` 技能第四节/第五节；
本技能聚焦**前端消费方式**，重复内容以引用为主。

> 凡涉及后端控制器选型、权限位/数据范围、JWT 配置，优先参考 `cube-webapi-backend`。

## 二、核心哲学：继承式（配置式）页面 —— 沿用魔方 MVC 前端

### 2.1 魔方 MVC 前端如何实现"页面继承"（源码实证）

研读 `NewLife.Cube` 的 `NewLife.Cube.ElementUI` 前端实现，可归纳出三层继承：

1. **共享骨架模板**：`Views/ElementUI/List.cshtml` 是通用列表页；它只负责布局，真正的列渲染交给
   `_List_Data.cshtml` 分部视图，由 `ViewBag.Fields`（字段集合）循环驱动：
   ```csharp
   var fields = ViewBag.Fields as FieldCollection;
   @foreach (var item in fields) { /* 按 item.Type / item.Map 选择渲染 */ }
   ```
2. **按字段类型选分部视图**：每种控件是一个独立分部视图，由字段类型/映射决定选用哪个——
   `_Form_String.cshtml`、`_Form_Boolean.cshtml`、`_Form_DropDownList.cshtml`（后者按
   `Model.Value` 是 `SelectListItem` / `IEntity` 字典 / `IDictionary` / `IEnumerable` 动态渲染下拉，
   选项来自 `[Map]` 特性的 `MapAttribute.GetDataSource()`）。
3. **树形只是局部特化**：`ListTree.cshtml` 与 `List.cshtml` 同构，仅把 `_List_Data` 换成
   `_ListTree_Data` 分部视图。即"同一套页面骨架，树形仅局部特化"。

### 2.2 翻译到 Vue：基类组件 + 元数据驱动 + 实体页"继承"

| MVC 理念 | Vue 实现 |
|----------|----------|
| 共享 `List.cshtml` 骨架 | **`ListPage.vue`** 基类组件（含工具栏/分页/表格） |
| `_List_Data` 按字段循环 | `buildColumns(fields)` 由 `GetPage.list` 动态生成列 |
| `_Form_*` 按类型选分部视图 | `controlOf(field)` 决定 `t-input/t-select/t-switch/...` |
| `ListTree.cshtml` 树形特化 | `ListPage` 内 `isTreeSchema(全部字段组聚合)` 为真时切换 `<t-enhanced-table>` |
| 实体页（`Student/Index.cshtml`）极薄 | 实体页只传 `area`+`controller`，**复用基类**（"继承"） |

> **关键收益**：新增一个实体 API，前端几乎零代码——复制一个薄页面传参即可。字段增删、类型变更、
> 是否树形，全部由后端元数据决定，前后端不重复定义。

## 三、前置条件

- Node ≥ 18，包管理 `pnpm`/`npm`；
- 后端已用 `cube-webapi-backend` 暴露标准实体 API（`EntityController`/`ReadOnlyEntityController`）；
- 设计令牌/主题：本技能内置 `assets/tokens.css`（TDesign 变量覆盖 + `--cube-*` 业务扩展令牌）与 `assets/tokens.ts`（TS 源），落地方式见 §4.14；可视化验证见 `assets/ThemeShowcase.vue`（设计基础与扩展路径见 `references/design-tokens.md`）。

## 四、标准工作流（从零搭建）

### 4.1 脚手架：TDesign Starter

```bash
npm i tdesign-starter-cli@latest -g     # 安装脚手架
td-starter init                          # 交互式创建（选 Vue3 + TS + Pinia）
cd <project> && npm install
npm run dev                              # 启动
```

工程结构（`src/` 为核心）：`api/`（请求层）、`store/`（状态）、`pages/`（业务页）、`layouts/`、`router/`。

### 4.2 落地 API 请求层

把 `assets/api.ts` 落地为 `src/api/index.ts`。它提供：
- `axios` 实例 + **请求拦截**注入 **`Authentication` + `Authorization` 双头**（魔方官方文档写 `Authentication`，**实测部分后端只认 `Authorization`**——单发一个头会导致列表/详情 401 → 数据为空、树构建失败）与 `X-Tenant`（租户编码，主）+ `X-Tenant-Id`（兼容兜底，legacy）；登录后从响应头 `X-Tenant` 捕获租户编码存入 localStorage；
- 另提供 `rawHttp` / `getRaw` / `postRaw` 供**不带 `/api` 前缀**的接口（如 `AuthController` 的 `/Auth/Login`、`/Auth/LoginConfig`、`/Auth/Challenge`、`/Auth/Refresh`、`/Mfa/Verify`、菜单树）使用；
- **响应拦截**统一处理 `code`（0 成功 / 401 未登录跳转 / 403 无权限提示）；
- 便捷方法 `getApi/postApi/putApi/deleteApi` 返回 `ApiEnvelope<T>`（见 `references/metadata-contract.md`）。

### 4.3 落地鉴权与权限

- `assets/permissions.ts` → `src/api/permissions.ts`：`PermissionFlags`（1 查看 / 2 新增 / 4 修改 / 8 删除 /
  16、32 自定义位）作为后端位语义参考（真实前端按钮显隐以 `GetPage.setting` 为准，见 §4.10）；
- `assets/auth.ts` → `src/store/auth.ts`：Pinia store，封装**当前版本 SPA 登录接口**（严格对齐《Doc/Api/认证接口设计.md》）：
  - `POST /Auth/Login`（**不带** `/api` 前缀，当前版本；`/Admin/User/Login` 仅保留给 MVC 皮肤与 SSO 回调）；
  - 请求体 `{ username, password(密文), category, challengeId, captchaId, captchaCode }`（`username` 非 `userName`）；
  - **Challenge-Response**：登录前 `GET /Auth/Challenge` 取 `challengeId`+`publicKey`（PKCS#8 SPKI），用 **RSA-OAEP/SHA-256**（Web Crypto `crypto.subtle`）加密密码，密文 Base64 提交；加密失败降级明文（需后端 `AllowPlainPassword=true`）；
  - 响应令牌字段名不统一（snake/camel/Pascal 都可能）：真实运行后端 `/Auth/Login` 返回 `data.{ access_token, refresh_token, expire_in }`（snake_case）；`auth.ts` 的 `normToken` 三向兜底（`accessToken ?? AccessToken ?? access_token` 等），前端一律读归一化后的 camelCase `accessToken`/`refreshToken`/`expireIn`；
  - `getLoginConfig()` 拉 `GET /Auth/LoginConfig`（登录页动态组装依据），返回结构含：`name`(系统名)、`code`(枚举/状态位)、`logo`/`loginLogo`(Logo，优先 `loginLogo` 再 `logo`)、`loginBackground`(登录背景图)、`loginTip`(登录提示)、`copyright`(含 HTML 链接的版权，登录页用 `v-html` 渲染)、`registration`(备案号)、`login{password,sms,mail,captcha,sendCode}`(登录方式开关)、`register{enabled,password,sms,mail,captcha,requireMailVerify,requireMobileVerify}`(注册开关)、`oauth[]`（**键名大小写两版本并存：实测真实运行后端返回 `oAuth`（大写 A），《认证接口设计.md》写全小写 `oauth`**——**只按文档读 `config.oauth` 会导致第三方登录按钮完全不渲染**（实测高频坑）。必须双向兼容：`getLoginConfig()` 内归一到 `oAuth`（`if (!cfg.oAuth && d.oauth) cfg.oAuth = d.oauth`），页面统一读 **`config.oAuth`**；每项 `name`/`logo`/`nickName`/`url`）、`security{challengeRequired,mfaAvailable,passwordComplexity,passwordStrength}`(密码策略)。登录页按开关渲染密码/短信/邮箱 Tab、忘记密码、OAuth 按钮、注册入口、版权；`security.passwordComplexity=true` 时展示 `passwordStrength` 强度规则。前端 `getLoginConfig` 须把小写 `oauth` 归一到 **`oAuth`**（以实测真实后端为准，兼容文档写法），登录页统一读 `config.oAuth`；并据 `loginLogo`→`logo`→首字母方块 回退渲染 Logo；见 §七「登录页必须按 LoginConfig 全字段动态组装」。
  - `loginWithCode()` 验证码登录走 `category: AuthCategory.Mobile|AuthCategory.Mail`（**枚举整数，非字符串**）；`sendCode()` 走 `POST /Auth/SendCode`（channel 区分大小写 `Sms`/`Mail`）；
  - MFA：`code=0 & data=null & message 以 mfa_required: 开头` → 进入 `/Mfa/Verify` 二步验证；`refresh()` 走 `POST /Auth/Refresh` 令牌轮换；
  - `resetPassword()` / `registerUser()` 对接 `/Auth/ResetPassword` / `/Auth/Register`；
  - `loadMenu()` 拉 `/Admin/Index/GetMenuTree`、`setTenant` 多租户；`GET /api/Auth/Info` 返回当前用户与权限位（登录后/刷新时拉取）；
  前端权限主通道仍是 `GetPage.setting` 与菜单树。

### 4.4 落地实体资源与渲染器

- `assets/useEntityResource.ts` → `src/api/useEntityResource.ts`：封装某 `area/controller` 的
  `GetPage`（schema）、`Index`（数据）、`Insert/Update/Delete`，并暴露 `isTree` 计算属性；
- `assets/fieldRender.ts` → `src/api/fieldRender.ts`：`controlOf`（类型→控件）、`toOptions`/`labelOf`
  （枚举/字典→下拉与回显）、`isTreeSchema`、`buildTree`（扁平→树）、`buildColumns`/`buildFormItems`。
- `assets/useLookups.ts` → `src/api/useLookups.ts`：约定式外键关联源字典加载器。扫描实体字段中的
  `xxxID`（无 `map`/`dataSource`）字段，按「基名→同 area 同名控制器 Index 列表」自动拉取 `{id:名称}` 字典，
  写入 `lookups`；支持 `overrides[基名]` 覆盖 `area`/`controller`/`idField`/`nameField`。
  这样纯外键字段也能在列表/详情回显名称、在表单渲染下拉，无需宿主手工拼装 `lookups`。

### 4.5 落地基类页面组件（"继承"的载体）

**列表页按魔方 MVC 的 `List.cshtml` 分部视图拆成四段**（`ListPage` 只是组合根，各段独立成组件、互不耦合）：

| 组件 | 对应 MVC 分部视图 | 职责 | 开关 |
|------|------------------|------|------|
| `ListNavbar.vue` | `_List_Navbar.cshtml` | 标题 + 实体路径（area/controller） | `setting.enableNavbar` |
| `ListSearchBar.vue` | `_List_Search.cshtml` | `GetPage.search` 驱动的条件控件 + **查询参数拼装**（Q 分流/字段参数/searchParamMap），只 `emit('search', params)` | `search` 字段非空 |
| `ListToolbar.vue` | `_List_Toolbar.cshtml` | 新增 / 批量删除（选中数量），`emit('add')`/`emit('batch-delete')` | `setting.enableToolbar` + `enableSelect` |
| `ListFooter.vue` | `_List_Footer.cshtml` | 统计行（`Index.stat`）+「共 N 条」摘要 | `setting.enableFooter` |
| `ListPage.vue` | `List.cshtml` | **组合根**：编排四段 + 表格（普通 `t-table` / 树形 `t-enhanced-table`）+ FormDialog/DetailDrawer，持有全部业务状态 | — |

拆分原则：子组件**不持有业务状态**（搜索模型在 `ListSearchBar` 内部、参数产出即 emit；选中行/分页/数据在 `ListPage`），便于单测与复用；`ListPage` 只保留编排逻辑（加载、CRUD、树形判定、字典）。

把以下基类组件落到 `src/components/cube/`：
- `assets/ListPage.vue` → `src/components/cube/ListPage.vue`：泛型列表页**组合根**，树形感知 + 权限感知
  （按 `GetPage.setting.enableAdd`/`isReadOnly` 控制新增/编辑/删除按钮显隐）+ 分页 + 操作列，四段结构见上表；
- `assets/ListNavbar.vue`、`assets/ListSearchBar.vue`、`assets/ListToolbar.vue`、`assets/ListFooter.vue` → 同名落地；
- `assets/FormDialog.vue` → `src/components/cube/FormDialog.vue`：泛型新增/编辑弹窗，由
  `addForm`/`editForm` 字段驱动，支持 `map`/`dataSource` 下拉、`EnableFieldValidation` 的 `fieldErrors` 回显；
- `assets/DetailDrawer.vue` → `src/components/cube/DetailDrawer.vue`：泛型详情抽屉，由 `detail` 字段驱动；遍历原始 `DataField[]`，`map`/`dataSource`/`xxxID`（含 `ParentID`）字段一律经 `labelOf(f, value, lookups)` 回显映射名称，不显示原始 ID；通过 `lookups` prop 接入外键关联源字典。

> 这三个组件即"页面继承"的基类。绝大多数实体页不需要改写它们，只需在业务页传参复用。

### 4.6 实体页"继承"基类（薄封装示例）

普通实体（如设备 `Device`，area=`IoTHub`）：

```vue
<!-- src/pages/iot/DevicePage.vue -->
<script setup lang="ts">
import ListPage from '@/components/cube/ListPage.vue';
</script>
<template>
  <ListPage area="IoTHub" controller="Device" title="设备管理" />
</template>
```

树形实体（如 `DeviceGroup` 含 `ParentID`，后端用 `EntityTreeApiController`）：**前端无需特判代码**，
`ListPage` 内部对**全部字段组聚合**（list+addForm+editForm+detail+search）做树形判定——命中「字段名=ParentID」或「`mapField=ParentID` 的映射字段（如 `ParentName`）」即自动切换 `<t-enhanced-table>`（**不能只看 list 组**：ParentID 常不在列表列、仅以 ParentName 映射列展示，只查 list 会漏判成平铺表，见 §七）；
`FormDialog` 将 `ParentID`/`ParentName` 渲染为树形下拉（`t-tree-select`，选项来自同实体 `Index` 列表自身除外）。

```vue
<!-- src/pages/iot/DeviceGroupPage.vue -->
<template>
  <ListPage area="IoTHub" controller="DeviceGroup" title="设备分组" />
</template>
```

> 实体页的"继承"在此体现：业务差异（标题、area、controller、局部插槽）通过 props/插槽表达，
> 列表/表单/详情的通用逻辑全部在基类。新增第 N 个实体页 ≈ 复制 5 行。

### 4.7 树形表格自动判定（treeTable）

规则（详见 `references/field-renderers.md` §4、§7）：**全部字段组聚合**（list+addForm+editForm+detail+search）中存在 `ParentID`（不区分大小写）**或** `mapField=ParentID` 的映射字段（如 `ParentName`）→ 树形。
这是**“按后端字段做组件选型”**最典型的例子（更通用的选型策略见 §4.11）。

- 列表数据为扁平数组（每行含 `id` + `parentID`），前端 `buildTree(rows)` 组装为带 `children` 的树；
- 切换通过 `ListPage` 的 `isTree = selectListComponent(全部字段组聚合) === 'tree'` → `v-if="!isTree"` 用 **`<t-table>`**、`v-else` 用 **`<t-enhanced-table>`** 实现，与 MVC 的
  `List.cshtml`/`ListTree.cshtml` 同构。⚠️ **树形必须用 `t-enhanced-table`**（`t-table` 是 PrimaryTable，不支持树形，见 §七「树形表格必须用 t-enhanced-table」）。
- **坑（高频）**：不能只查 `schema.list`——NewLife.Cube 常把 `ParentID` 从列表列隐藏、仅以 `ParentName`（mapField=ParentID）映射列展示，只查 list 会漏判成平铺表（实测 `Admin/Department`，见 §七「树形判定必须聚合全部字段组」）。

### 4.8 字段映射（xxxID 双模式：列表显名 / 表单下拉）

魔方的"字段映射"统一按 **映射字段** 处理：**凡字段名以 `ID`/`Id` 结尾（且非主键，如 `StatusID`、`CategoryID`、`CreateUserID`、`ParentID`）即为映射字段**。两条硬性规则（详见 `references/field-renderers.md` §3）：

- **列表页**：`xxxID` 列**显示映射后的名称**（如 `StatusID=1` → “启用”），**绝不显示原始 ID 数值**；
  由 `buildColumns(list, lookups)` 经 `labelOf(field, value, lookups)` 回显。
- **表单页**：`xxID` 字段渲染为**映射源下拉**，选项来自映射源解析（见下）；由 `buildFormItems(form, lookups)`
  经 `resolveOptions(field, lookups)` 生成 `<t-select :options>`。
- **提交/回填键名（关键契约）**：**映射字段（`mapField` 非空）的表单键必须用原始字段名**（`RoleName(mapField=RoleID)` → `roleID`、`DepartmentName(mapField=DepartmentID)` → `departmentID`、`ParentName` → `parentID`、`AreaName` → `areaId`）——后端 POST/详情**只认真实列**，映射字段是虚拟属性，按自身名提交（`roleName: 2`）会被后端**静默忽略 → 保存后外键为空**（实测 User 新增后角色/部门列空白）。`fieldRender.formItemName(f)` 是统一键名函数（`mapField` 非空用 `camel(mapField)`，否则 `camel(f.name)`），`buildFormItems` 的 `item.name` 与 `FormDialog.rules` 校验键**必须共用它**（防键漂移导致校验失效）；编辑回填 `Object.assign(formData, row)` 依赖同一键与 `normalizeRows` 后的 camelCase 行数据匹配（顺带修正 `ParentName` 树形下拉回填——此前用显示名当 value 匹配不上）。

**映射源解析顺序**（列表显名、表单下拉共用同一套，⚠️ 以 `mapField` 双语义为准，见下）：
1. **`mapField` 字典源（`[Map("k=v,...")]` 序列化而来）** —— 凡 `mapField` 在字段集里**命中不到同名字段**，
   即判定为 `[Map]` 字典源（如 `PersonType.mapField="1=学生,2=教职工,3=校外人员"`、`ValueMode.mapField="1=原始值,2=外键解析名称,3=枚举转文本"`），
   既是显示名表也是 `<t-select>` 选项；**这是 6.13 实测下枚举/字典字段的权威源**；
2. `field.dataSource`（`{text,value}[]` 选项源，少数变体）；
3. `lookups[lookupBaseName(field)]` —— 前端异步拉取关联实体 `Index` 组装的 `id→名` 字典
   （键为去 `ID/Id` 后缀的基名，如 `CategoryID → Category`）。三者皆空则该列按页面策略隐藏。

> **⚠️ 关键修正（Cube 6.13 实测，2026-09）**：旧文档称 `[Map]` 字典源经 `field.map` 序列化，
> **但 6.13 的 `DataField` 根本没有 `map` 字段**——`[Map]` 的源串被原样塞进了 `mapField`。
> 代码若去读 `field.map`（不存在）就会拿不到字典，枚举字段被渲染成**原始 Int32**（如 `PersonType` 显示 `1`/`2`/`3`），
> 这正是 Cube 通用列表页的历史坑。正确做法：解析 `mapField` 的字典串（见 §4.8.1）。
> `fieldRender.ts` 里 `mapField` 双语义的 `mapFieldKind`/`parseMapSource`/`mapDictOf` 即为此而写；
> `f.map` 仅作为**兼容兜底**（当前后端恒为 null，属死代码）。

```typescript
// fieldRender.ts —— 列表回显（显示名称）与表单下拉（映射源）共用同一解析
// 顺序：mapField 字典源 → dataSource → lookups（外键 id→名）
export function labelOf(f, value, lookups?, fields?) { /* mapDictOf(f) → dataSource → lookups */ }
export function resolveOptions(f, lookups?, fields?) { /* mapDictOf(f) → dataSource → lookups（兜底空） */ }
```

> 外键兜底：当后端仅返回原始 `xxxID` 且 `mapField` 是真实字段名（映射字段，见 §4.8.1）时，
> 用 `lookupBaseName` 得到关联实体名，调其 `Index` 拉全量记录组装 `{ [id]: name }` 写入 `lookups`，
> 列表/表单自动复用。魔方多数枚举场景已通过 `[Map]` 写入 `mapField` 字典，lookup 仅为外键高级兜底。

**`lookups` 自动加载（`useLookups.ts`）**：`ListPage` 在 `init()` 拉完 `GetPage` 后会自动调用
`useLookups(area, overrides).load(list Fields)`，约定式地把每个 `xxxID` 外键解析为同 `area` 下同名控制器的
`Index` 列表，组装 `lookups[基名] = { id: 名称 }`。宿主可：①直接给 `ListPage` 传 `:lookups`（最高优先级，覆盖自动结果）；
②传 `:lookup-overrides="{ Category: { area:'Common', nameField:'Title' } }` 修正关联控制器/名称字段。
若关联实体不可达，该字段自动退化为原始 ID，不阻断主列表。

> **⚠️ 关联源跨 area 兜底（高频坑：lookup 404）**：NewLife.Cube 标准布局中**框架系统实体（Area/Dictionary 等）挂在 `Cube` area**，业务/账号实体（User/Role/Department）才在 `Admin` area——「同 area 同名控制器」约定对系统实体关联会 404（实测 `/api/Admin/Area` 404、`/api/Cube/Area` 200）。`useLookups.load` 已实现 **area 候选兜底**：当前 area 优先，404 时自动尝试 `Cube`（`overrides.area` 显式指定则只试指定值）；仅 404 触发兜底，401/500/网络错误直接跳过该关联源。**注意**：Area 等系统实体页面自身的路由也应在 `Cube` area（`/api/Cube/Area/GetPage` 200 而 `/api/Admin/Area/GetPage` 404）——菜单/页面配置用 `Cube/{Controller}`，勿配 `Admin/{Controller}`。

> **⚠️ 审计字段必须排除（高频坑：列表页多出 `/api/{area}/CreateUser`、`/api/{area}/UpdateUser?pageSize=1000` 无效请求）**：
> `detail` 组含 `CreateUserID`/`UpdateUserID`（以 `ID` 结尾）会被 `xxxID` 约定误判为外键，拉出**不存在的控制器**请求
> （真实控制器是 `User`，没有 `CreateUser`/`UpdateUser`）。审计字段非业务外键：列表列显示后端已映射的名称字符串、
> 表单只读，无需 id→name 字典。`useLookups.load` 在筛选开头排除 `createUserID`/`updateUserID`（及复数变体、
> 含 `mapField` 引用它们的映射字段如 `UpdateUserName`）。

### 4.8.1 `mapField` 双语义判别法（6.13 实测核心契约）

`GetPage` 把 `FieldItem.Map` 的「源串」原样序列化进 **`mapField`** 这一个键，于是同一个 `mapField` 承载两种语义，**判别只看它的值**：

| `mapField` 值形态 | 语义 | 判定 | 例子 |
|---|---|---|---|
| 能在**字段集**里命中同名字段 | **虚拟映射字段**（显示名→真实列） | `field` | `ClassName.mapField="ClassID"`、`ParentName.mapField="ParentID"` |
| 含 `=`,`，非标识符 | **`[Map]` 枚举字典源** | `dict` | `PersonType.mapField="1=学生,2=教职工,3=校外人员"` |
| 无字段集可对照时：纯标识符且不含 `=` | 退化为 `field`；否则 `dict` | 形状判别 | —— |

判别函数（已落地于 `fieldRender.ts`）：

```typescript
export function mapFieldKind(f: DataField, fields?: DataField[]): 'none' | 'field' | 'dict' {
  const mf = (f.mapField ?? '').trim()
  if (!mf) return 'none'
  // 关键：必须在字段集里找同名字段，命中才是映射字段，否则是字典源
  if (fields && fields.length)
    return fields.some((x) => x.name && x.name.toLowerCase() === mf.toLowerCase()) ? 'field' : 'dict'
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(mf) ? 'field' : 'dict'
}
export function mapDictOf(f: DataField, fields?: DataField[]): Record<string, string> | null {
  if (f.map && Object.keys(f.map).length) return f.map          // 兼容兜底（6.13 恒 null）
  if (mapFieldKind(f, fields) !== 'dict') return null
  return parseMapSource((f.mapField ?? '').trim())              // "1=男,2=女" → { '1':'男','2':'女' }
}
/** 控件选型：映射字段/枚举字典源 → select；{Boolean}→switch；Int→number；… */
export function controlOf(f: DataField, fields?: DataField[]): string {
  if (isMappedField(f, fields)) { /* multi → multi-select；ParentID → tree-select；否则 select */ }
  if (mapDictOf(f, fields)) return 'select'
  // … typeName/itemType 细分
}
```

**对表单键名的硬约束（易错）**：
- `mapField` 是**字典源**（`dict`）→ 该字段本身是真实列，提交键用 `f.name`（如 `personType`），options 来自 `parseMapSource(mapField)`；
- `mapField` 是**真实字段名**（`field`）→ 该字段是虚拟显示列，**提交键必须用 `mapField`**（如 `ClassName→classID`），否则按自身名提交被后端静默忽略、外键存不进。

> **实测验收坑（高频）**：TDesign `<t-select>` 渲染为自定义 `<div class="t-select">`，**不是原生 `<select>`**，
> 故 `document.querySelectorAll('select')` 永远为 0——验收下拉是否存在要用 `.t-select` 类，或判定 `:placeholder` 是否等于 `请选择{label}`。
> 浏览器内 `fetch('/{area}/{ctrl}/GetPage')` 转储 `addForm` 可确认 `mapField` 在响应中确实存在（camelize 对 `mapField` 幂等，不剥离）。

### 4.9 多租户

- 开启后端 `EnableTenant` 时，所有请求经 `api.ts` 拦截器注入 **`X-Tenant`（租户编码 Code，主）+ `X-Tenant-Id`（兼容兜底，legacy 双发）**；据源码 `DataScopeMiddleware`/`ManagerProviderHelper`，两者都接受、新后端优先按 `X-Tenant`（Code）经 `Tenant.FindByCode` 解析。`X-Tenant` 编码由登录响应头 `X-Tenant`（SsoController 登录成功后写入）经 `api.ts` 响应拦截器捕获并存入 `localStorage`（`cube_tenant_code`），切换租户时 `auth.setTenant(id)` 仍可只存 `cube_tenant`（id 兼容）；
- 提供租户切换器（如顶栏下拉），切换即 `auth.setTenant(id)` + 刷新当前页数据；
- 未带有效租户头，后端 fail-closed 返回 403（前端提示无权限）。

### 4.10 权限与按钮显隐（以 GetPage.setting / 菜单树为准）

权限暴露方式是（据源码 `AuthController.Info` 与 `GetPage` 核实）：

- **`GetPage.setting`** 里的开关：`enableAdd`（是否允许新增）、`isReadOnly`（只读控制器，如 `ReadOnlyEntityController`）、`doubleDelete` 等。`ListPage` 据此显隐新增/编辑/删除按钮（`canAdd/canEdit/canDelete`）。
- **`/Admin/Index/GetMenuTree`**：只返回当前用户有权限的菜单（含可用动作），用于渲染侧边栏与路由（见 §4.12）。
- **`GET /api/Auth/Info`**（`AuthController.Info`）：返回当前用户与权限位，可用于登录后/刷新时拉取用户与角色（前端 UX 可按位隐藏业务按钮）。
- 自定义业务权限位（16=下发指令、32=远程配置，配 `[DisplayName]`）仍由后端 `[EntityAuthorize]` 在动作级拦截；若需在前端按位隐藏某业务按钮，可保留 `permissions.ts` 的 `PermissionFlags` 位语义，权限位数据可由 `/Auth/Info` 或 `GetPage` 扩展字段下发。
- **前端显隐仅为 UX**；真实鉴权永远在后端（`[EntityAuthorize]` + 403）。

### 4.11 组件 / 页面选型策略（按后端字段元数据）

**核心思想**：列表页用哪种表格、表单字段用哪种控件，**全部由后端 `GetPage` 的字段集合决定**，而非前端硬编码。
这让“新增一个实体页 ≈ 复制 5 行”成为现实——选型逻辑全在基类组件与 `fieldRender.ts`，业务页只传 `area`+`controller`。

**GetPage 字段属性全量应用清单（实测 User 实体验证）**：

| 属性 | 含义 | 前端落点 |
|------|------|----------|
| `setting.enableAdd/isReadOnly` | 允许新增/只读控制器 | `ListPage` canAdd/canEdit/canDelete（✅） |
| `setting.enableSelect` | 显示选择列（复选框+批量删除） | `ListPage` `:selected-keys`+`onSelectChange`+`onBatchDelete`（✅） |
| `setting.enableTableDoubleClick` | 双击行打开详情 | `t-table @row-dblclick` → onDetail（✅） |
| `setting.enableKey` | **关键字（Q）搜索框**是否启用——魔方 MVC 语义是「启用关键字搜索」，**默认自带**（curl 实测 `?Q=admin` 命中、`?Q=zzz` 0 行）；与主键列显隐无关 | `ListSearchBar` 的 `enableKey` prop（✅） |
| 主键列（编号）显隐 | 独立 prop `ListPage.showIdColumn`（默认 true），不由 `enableKey` 控制（避免与魔方关键字搜索语义混淆） | ✅ |
| `setting.enableFooter` | 显示表格底部（统计行 + 记录数） | `ListFooter` 组件（内部 `enableFooter !== false`）（✅） |
| `setting.orderByKey` | 默认按主键排序 | `init` 首次 `loadData({sort:'ID', desc:false})`（✅） |
| `setting.doubleDelete` | 删除二次确认 | `onDelete/onBatchDelete` confirm（✅） |
| `lovCode` | 显式关联源编码（如 RoleID.lovCode="Role"） | `useLookups` 基名优先级：**lovCode > mapField 去 ID 后缀 > 自身名去 ID 后缀**（✅） |
| `url`+`title`（typeName 空） | 行级链接操作列（`{ID}`=主键占位，如 Link/Token/Log/OAuthLog） | `buildColumns` `isLink` cell：`t-link` + `window.open` 替换 `{ID}`，title 作 tooltip（✅） |
| `textAlign`（0/1/2） | 列对齐 左/中/右 | `buildColumns` col.align（✅） |
| `maxWidth` / `length`（列表场景） | 列宽最大值（`maxWidth` 优先，0 时兜底 `length`——**list 组 length 语义是列宽最大值**，区别于表单组 length=输入 maxlength） | `buildColumns` col.maxWidth（✅） |
| `mapField`/`itemType`/`typeName`/`category`/`length`/`nullable`/`required`/`readOnly`/`primaryKey` | 见 §4.8/§4.13/§七 | 均已应用 |
| `getExpand/retainExpand/expand`（表单组） | 表单字段展开控制 | 语义模糊未应用（低价值，待后端明确语义） |
| `visible` | 可见性 | 实测恒 false 不可用（已记录） |

两个选型函数（`fieldRender.ts`）：

- `selectListComponent(fields)` → `'flat' | 'tree'`：依据**全部字段组聚合**（list+addForm+editForm+detail+search）中是否命中「字段名=ParentID」或「mapField=ParentID（ParentName）」决定用普通表还是树形表。
- `selectFormControl(field)` → `FieldControl`：依据单个字段选 `tree-select` / `select` / `switch` / `datetime` / `number` / `textarea` / `input`。

**决策表（即 `selectFormControl` 行为）**：

| 字段特征 | 列表组件 | 表单控件 | 选项 / 数据来源 |
|----------|----------|----------|----------------|
| 字段名 `ParentID` 或 `mapField=ParentID`（ParentName） | `t-enhanced-table` | `t-tree-select` | 树形表；扁平数据经 `buildTree`；判定用全字段组聚合 |
| 有 `map` / `dataSource` | 列回显 label | `t-select` | 映射源（§4.8） |
| `itemType=image` | `t-image` 缩略图（48px，点击新窗开大图） | `t-upload` theme=image（单图，上传回写 URL） | 上传端点默认 `/{area}/{controller}/UploadFile`（官方契约，可经 `uploadUrl` prop / `VITE_UPLOAD_URL` 覆盖） |
| `itemType=mail` | 文本 | `t-input` type=email + `{ type:'email' }` 校验 | 非必填时空值自动跳过格式校验 |
| `itemType=mobile` | 文本 | `t-input` type=tel + TDesign 内置 `{ telnumber:true }` 校验 | 手机号 `^1[3-9]\d{9}$`（内置规则，见 form-model VALIDATE_MAP） |
| 以 `ID`/`Id` 结尾且非主键（`xxxID`） | 列回显映射名称 | `t-select` | 映射源（§4.8，lookups 兜底） |
| `Boolean` | ✓/✗ 标签 | `t-switch` | 是/否 |
| `DateTime` | 文本 | `t-date-picker`(带时间) | `YYYY-MM-DD HH:mm:ss` |
| 数字 | 文本 | `t-input-number`（Int64 字符串） | `:step`/`decimal-places` |
| `String`(len>200) | 文本 | `t-textarea` | `maxlength` |
| 其它 `String` | 文本 | `t-input` | `maxlength` |

**落地要点**：
- `ListPage.vue`：用 `selectListComponent` 切换普通表/树形表；`buildColumns(list, lookups)` 让 `xxxID` 列回显名称。
- `FormDialog.vue`：`item.control === 'tree-select'` 分支渲染 `<t-tree-select>`（选项由同实体 `Index` 经 `buildTree`+`toTreeSelectData` 生成、排除 `editId`）；
  `item.control === 'select'` 分支渲染 `<t-select :options="resolveOptions(f, lookups)">`。
- 实体页只需 `<ListPage area controller title />`（必要时 `:lookups="lookups"`），选型代码零重复。

### 4.12 菜单与导航（GetMenuTree）

真实后台前端需要侧边栏菜单与路由表，由 `MenuSidebar.vue` 消费官方菜单接口：

- `assets/MenuSidebar.vue` → `src/components/cube/MenuSidebar.vue`：挂载时调 `getRaw('/Admin/Index/GetMenuTree')`
  拉取菜单树（**只含当前用户有权限的节点**），渲染 TDesign `<t-menu>`；点击 `emit('navigate', url)`，由外层（router 或 iframe）决定如何跳转。
- 路由建议：把菜单 `url`（如 `/IoT/Device`）映射为前端路由，或用 `?area=&controller=` 驱动同一个 `ListPage` 渲染。

### 4.13 搜索栏与统计行

- **搜索栏**：`GetPage.search` 是一组查询字段，`ListPage` 据此渲染内联搜索表单（复用 `buildFormItems` 的控件选型），提交时把非空条件作为查询参数拼入 `Index` 请求；**Search 参数契约（curl 实测）**：数值/枚举/布尔/日期字段走**字段参数**（`?parentID=1` / `?enable=true` / `?type=0` 生效，大小写不敏感）；**字符串字段精确字段参数不生效**（`?code=011`、`?name=行政部` 返回全量），必须并入 **`Q` 关键词**模糊搜索（`?Q=行政部` 生效）——`onSearch` 按 typeName 分流：`string/text/char*` → `Q`（多条件空格合并），数组（multi-select 多值外键）与其余类型 → 字段参数。**坑：虚拟映射字段后端不参与查询**——如 `User.RoleID`（列表 `RoleName.mapField=RoleID` 只是 Map 虚拟映射，非数据库真实列），`?roleID=999` 返回全量、`?roleIds=999` 才过滤（curl 决定性验证：全表仅 admin(roleID=1) 时 `?roleID=2` 仍返回 1 行 = 参数被忽略）。**适配**：`ListPage` 新增 `searchParamMap` prop（`{ searchModel键 : 后端真实参数名 }`），经 `EntityPage` 透传，宿主页面配置如 `:search-param-map="{ roleID: 'roleIds' }"`；若后端真实列也不存该值（如 admin.roleIds=null），需后端修复实体/数据，前端无法补救。全局 `Q` 关键词、`dtStart/dtEnd` 时间区间、`status=1,2,3` 多值均走同一参数通道。**控件覆盖必须完整**：`select`（枚举/外键）、`multi-select`（xxxIDs 复数外键，`t-select multiple`）、`switch`（`typeName=Boolean`，**搜索用 `t-switch` 开关**——`useVModel` 对 v-model 原样透传，初始 `undefined` 未操作时不发参数，点击开=true/关=false 才筛选，「重置」按钮 delete searchModel 恢复不筛选）、`tree-select`（ParentID）、`datetime/date`、`number`、其余（email/tel/html/textarea/image）文本输入兜底——**缺 `switch`/`multi-select` 分支会掉进 `t-input`，布尔/多值搜索控件与表格列语义不匹配**。**坑：`t-form` 的 `@submit` 勿加 `.prevent` 修饰符**——TDesign form 内部已 `e.preventDefault()`（`form.mjs` 的 `_onSubmit`），`onSubmit` 回调参数是 `{ validateResult, firstError, e }` **对象**（无 preventDefault 方法），加 `.prevent` 会让 Vue `withModifiers` 先调 `e.preventDefault()` → `TypeError: e.preventDefault is not a function`。正确写法 `@submit="onSearch"`（回调忽略参数，直接读表单 model）。
- **日期范围搜索（DateRange → dtStart/dtEnd）**：搜索栏里的 `DateTime`/`date` 字段（或 `itemType=daterange`/`datetimerange`）渲染为 `t-date-range-picker`（日期时间型带 `enable-time-picker`），提交时在 `buildParams` 映射为 **`dtStart`/`dtEnd` 两个独立参数**——日期型补 ` 00:00:00`/` 23:59:59` 成当天闭区间，日期时间型原样下发；对齐后端 `ReadOnlyEntityController2.Search(p)` 只读 `p["dtStart"]`/`p["dtEnd"]` 并按 `Factory.MasterTime.Between` 过滤（单日期字段后端无对应支持，故搜索栏日期一律按范围处理）。`buildFormItems` 第 4 参 `isSearch=true` 时把日期控件覆写为 `daterange`。
- **统计行**：`Index` 响应信封的 `stat` 字段为统计/合计行，`ListPage` 在表格下方展示。

### 4.14 设计令牌与主题落地（TDesign 变量覆盖，无侵入）

本技能内置一套与组件库共用变量的设计令牌，落地采用「官方 CSS 变量覆盖」方式（不引入 TDesign SCSS 源、零新增依赖）：

- `assets/tokens.css`：单一事实来源。以 `:root` 覆盖 TDesign 原生变量（`--td-brand-color*`、`--td-{success,warning,error,info}-*`、`--td-radius-*`、`--td-shadow-*`、`--td-font-family` 等），并新增业务扩展令牌 `--cube-*`（IoT 青 `#0090D4`、品牌渐变、间距/字号阶梯、设备状态映射、可见聚焦环）。
- `assets/tokens.ts`：同源 TS 导出（`brand/semantic/cyan/gray/radius/shadow/spacing/fontSize/gradient/status`），供图表配色等非 CSS 场景（如 ECharts 设备在线饼图）。
- 接入：把 `tokens.css` 落地为 `src/styles/tokens.css`，**并落地 `theme-dark.css`（`src/styles/theme-dark.css`）**；在 `src/main.ts` 中 **TDesign 样式之后** 依次 `import '@/styles/tokens.css'` → `import '@/styles/theme-dark.css'`。品牌主色由 `utils/color.ts` 的 `getBrandPalette` 运行时 inline 注入 `<html>`（§4.16），`--cube-brand-gradient-iot` 默认政务蓝系、登录左栏与布局 logo/头像共用体现统一品牌语言；暗色主题靠 `theme-dark.css` 的中性令牌覆盖 + `!important` chrome 覆盖层实现。
- 设计基础（色彩/字体/间距/圆角/阴影/动效）+ 扩展路径（暗色 `t-theme-dark`、多品牌动态引入、SCSS `modifyVars`）完整规范见 `references/design-tokens.md`。
- **可视化验证**：`assets/ThemeShowcase.vue`（→ `src/pages/ThemeShowcase.vue`，路由 `/Theme`）是「设计令牌板」，登录后访问即可见全部色板/圆角/阴影/间距/字号/组件示例，均由令牌驱动。

> 收益：改 `tokens.css` 任一变量即全站（含 TDesign 组件）生效，业务页零改动；新增实体页无需关心主题。

> **令牌源一致性（维护要求，政务蓝统一）**：`assets/tokens.ts`（TS 源，供图表/ECharts 配色）与 `assets/tokens.css`（CSS 源，组件变量覆盖）是同一套令牌的两种形态，**必须保持同源**——当前主色统一为**政务蓝 `#0f4c9e`**（梯度 `--cube-brand-gradient: linear-gradient(135deg,#3165ac 0%,#0f4c9e 100%)`，`gradient.iot` 政务蓝系）。改主色/渐变时**两处同步改**，否则令牌板（`ThemeShowcase` 读 TS 源）与组件 CSS 变量会出现色差。`SettingPanel` 的 `brandPresets` 仅作多主题切换选项（`#0f4c9e` 为默认且置首，`#0052d9` 等仅作可选预设之一），不影响默认契约；`DEFAULT_BRAND='#0f4c9e'`（`assets/setting.ts`）须与 `tokens.css` 兜底值一致，否则首屏闪色。

### 4.15 生产级编排层脚手架（references/scaffold/）

`references/demo/` 是最小端到端验证；`references/scaffold/` 在 demo 之上提供更贴近真实工程的**编排层模板**（已落地覆盖魔方 7 个内置模块：Admin 的 User/Role/Department/Menu/Permission 与 Sys 的 Config/Log）：

- `src/layouts/BasicLayout.vue`：侧边栏（`MenuSidebar`）+ 顶栏（租户切换下拉 `X-Tenant-Id`、用户菜单、全局搜索）+ 内容区；
- `src/pages/EntityPage.vue`：泛型实体页，从路由 `area`/`controller` 驱动 `ListPage`（菜单 `url` 或 `/:area/:controller` 兜底）；
- `src/pages/LoginView.vue`：登录门禁（左品牌区渐变 + 右表单区，含用户名/密码/租户选择）；
- `src/router/index.ts`：登录门禁（`beforeEach` 未登录跳 `/login`）+ 内置模块显式注册 + `:area/:controller` 泛型兜底；
- `src/main.ts`：引入 `tokens.css` 主题；
- `vite.config.ts`：代理 `/api`（实体+菜单接口）、`/Auth`（AuthController 认证接口）、`/Mfa`（MfaController 二步验证）、`/cube`（附件/图片资源，`filePath` 形如 `/cube/image?id=...`）、**`/Content`（页面静态资源目录：Logo/登录背景/OAuth 图标等，`LoginConfig` 返回的静态路径落在此，后端公开可访问、无需登录）** → 后端；**切勿**代理 `/Admin` 等前端 SPA 路由（硬刷新会 404，见 §七）。注意登录/刷新/MFA 走 `/Auth`/`/Mfa`（不带 `/api` 前缀，见 §4.3 与《认证接口设计.md》），必须经代理转发，否则登录 404；`LoginConfig` 返回的 `loginLogo`/`logo`/`loginBackground`/`oAuth[].logo` 一律 `/Content/*` 绝对路径，也须经代理转发（见 §七「登录页必须按 LoginConfig 全字段动态组装」）。
  - **⚠️ 坑（Windows 沙箱代理环境，实测 NV8021X）**：`localhost` 解析在该环境经系统代理时好时坏，且 dotnet/Kestrel 与 Vite 的监听协议栈可能不对称（实测后端 Kestrel 同时监听 `127.0.0.1:5070` + `[::1]:5070`，Vite 默认只监听 `[::1]:5173`）。解法：**vite 代理 target 写 `http://127.0.0.1:5070`（勿写 localhost，否则间歇 502 "os error 10061"）；测试前端入口用 `http://localhost:5173`（勿用 127.0.0.1:5173，IPv4 被拒）**——两个方向恰好相反，排查时先 `netstat -ano | findstr :端口` 确认监听协议栈再下结论。
- `backend/server.mjs`：**注册表驱动** Mock 后端（零依赖），按《认证接口设计.md》实现 `/Auth/*`（LoginConfig/Challenge/Captcha/Login/SendCode/ResetPassword/Register/Refresh）+ `/Mfa/Verify` + `/api/Admin/Index/GetMenuTree` + GetPage/CRUD/分页/排序/搜索/树形/只读/外键；实体接口受令牌保护（HTTP 401 触发前端自动刷新），可直接替换为真实后端或作演示。

使用：把 `references/scaffold/src/**` 与 `vite.config.ts` 对照复制到你的工程（技能 `assets/*` 与 `tokens.*` 已就位），或以其为骨架新建工程。

> **默认主色 = 政务蓝 `#0F4C9E`**：脚手架（`demo` / `scaffold`）落地即政务蓝，与 `assets/setting.ts` 的 `DEFAULT_BRAND = '#0f4c9e'` 及 `assets/tokens.css` 品牌块兜底值**完全一致**，首屏无闪色。用户可在 `SettingPanel` 切换预设或自定义主色，运行时由 `getBrandPalette(base)` 推导全套 `--td-brand-color*` 与 chrome 令牌并 inline 注入 `<html>` 覆盖（见 §4.16）；若你希望换默认主色，须同步改 **三处**：`DEFAULT_BRAND`、`assets/tokens.css` §1 品牌块、`assets/tokens.ts` 的 `brand`/`gradient`（保持同源，避免令牌板/组件色差，见 §4.14 维护要求）。切勿只改其一导致主题分裂。

### 4.16 品牌主色系统 + 暗色模式（应用外壳个性化）

除字段元数据驱动外，后台还需一套**可个性化**的应用外壳：用户切换「品牌主色」「亮/暗主题」「侧边/顶部布局」，三处 chrome（登录左栏 / 菜单栏 / 顶栏）即时跟随。本技能内置完整实现，落地即用。

**核心机制：品牌色由 JS 运行时推导并 inline 注入 `<html>`（优先级高于样式表）**
- `assets/color.ts` 的 `getBrandPalette(base)`：以用户所选主色为基准，向白/黑线性混合，推导出**全套** `--td-brand-color*`（hover/active/light/1-8 阶梯/focus）与**控制台 chrome 令牌**（`--cube-sidebar-bg` 渐变、`--cube-sidebar-active-bg`、`--cube-sidebar-active-bar`、`--cube-topbar-border`、品牌渐变 `--cube-brand-gradient-iot`），返回 `{CSS变量名: 值}` 字典。
- `assets/setting.ts`（`useSettingStore`，Pinia）：持有 `mode/brandColor/layout/collapsed/compact`，`apply()` 把 `getBrandPalette(brandColor)` 逐键 `documentElement.style.setProperty` 写入根元素，并切换 `t-theme-dark` / `cube-compact` 根类；偏好持久化 localStorage，`main.ts` 启动 `load()` 还原。`DEFAULT_BRAND = '#0f4c9e'`（政务蓝，与 tokens.css 兜底值一致，无首屏闪色；可改）。
- `assets/SettingPanel.vue`：悬浮齿轮 → 抽屉，含「主题模式 / 品牌主色（预设色板 + `t-color-picker` 自定义）/ 菜单布局 / 侧栏折叠 / 元素尺寸」，每个 `setting.set(...)` 即时 `apply()` 预览。

**样式表职责（仅兜底 + 暗色中性值，不写死品牌）**
- `assets/tokens.css`：
  - §1 **品牌块**：`--td-brand-color*` 以政务蓝 `#0f4c9e` 系预填，**仅作 JS 加载前首屏兜底**；运行时被 `getBrandPalette` 覆盖。改默认品牌只需同步改此块与 `DEFAULT_BRAND`。
  - §9 **chrome 块**：`--cube-sidebar-*` / `--cube-topbar-border` 以政务蓝预填兜底；**真实值由 `getBrandPalette` 按所选主色覆盖**，故切换品牌色时侧栏/顶栏实时联动。白字对比由侧栏底部向黑混合 20% 保证（WCAG AA）。
- `assets/theme-dark.css`（暗色覆盖层，tdesign-vue-next@1.20.7 未内置 dark css）：
  - `.t-theme-dark` 下提供中性语义令牌暗色取值（`--td-bg-color-page:#181818` 等）。
  - **chrome 三处暗化用 `!important`**：`.topbar/.side/.login-left/.login-right` 注入时机晚于本文件、同级特异性下会胜出，故必须 `!important` 强制暗底，确保切暗色稳定生效。
  - **暗色侧栏品牌色调（暗色 + 品牌感兼顾）**：`.t-theme-dark .side` 用 `color-mix(in srgb, var(--td-bg-color-container) 92%, var(--td-brand-color) 8%)` —— 中性暗底叠 **8% 品牌主色**，随品牌色实时变化；首行保留纯中性暗底作不支持 `color-mix` 浏览器兜底。

**落地步骤**
1. `main.ts` 顺序：先 `tdesign-vue-next/es/style/index.css` → `tokens.css` → `theme-dark.css`（暗色层须在 tokens 之后），启动时 `useSettingStore().load()`。
2. 复制 `assets/color.ts` → `src/utils/color.ts`、`assets/setting.ts` → `src/stores/setting.ts`（`@/` 别名解析）。
3. 复制 `assets/SettingPanel.vue` → `src/components/cube/`（或任意全局位置），在 `App.vue`/`BasicLayout` 挂一次。
4. chrome 组件（MenuSidebar / LoginView / BasicLayout）只用令牌变量（如 `var(--cube-sidebar-bg)`、`var(--cube-brand-gradient-iot)`），**不写死颜色**，即天然跟随品牌与暗色。

> **坑（特异性博弈）**：chrome 组件若用 scoped 样式写死 `background:#fff` / 品牌渐变，会晚于 `theme-dark.css` 注入、同级特异性胜出，导致切暗色时侧栏/顶栏不暗。正确做法：scoped 样式只写「浅色态」且用令牌变量；暗色统一交给 `theme-dark.css` 的 `!important` 覆盖层（见 `assets/MenuSidebar.vue` 的 `.cube-menu-head` 与 `assets/theme-dark.css`）。
> **坑（TDZ 前向引用）**：`buildColumns` 新增 `is*` 判定标志时，凡由 `lovTypeOf(f)` 等函数派生的标志（如 `isLovList`）**必须声明在引用它的 `isMapped` 复合行之前**——`const` 在声明前处于暂时性死区，提前访问会抛 `ReferenceError: can't access lexical declaration 'isLovList' before initialization`，错误发生在 `.map()` 回调内会让整张表列定义构建中断（列表只剩操作列）。见 §七。

### 4.17 特殊基础控制器 ConfigController<T>（无 GetPage，单列处理）

魔方有一类**基础控制器 `ConfigController<T>`**（如 `OrderSettingController : ConfigController<OrderSetting>`），用于暴露 `Config<T>` 配置类的查看/编辑接口（后端细则见 `cube-webapi-backend` §9）。它的接口形态与实体控制器**本质不同**：

- 只自动提供 **Get**（读取 `Config<T>.Current`，返回**单个配置对象**）与 **Update**（线程安全 `Copy + Save`，回存整个配置对象）；
- **不暴露 `GetPage` 列表字段元数据接口，也没有 `Index` 列表接口**；但**提供 `GetFields` 字段元数据接口**（`?kind=EditForm` 返回该配置类的 `DataField[]`），足以驱动单表单页。

**前端影响**：本技能其余所有页面都假设「后端有 `GetPage` → `buildColumns` 列表列定义」。`ConfigController<T>` 不满足该前提（`ListPage` 的 `loadSchema()` 调 `GetPage` 会 404/拿不到字段 → 与 TDZ 类似的「只剩操作列 / 空白表」），**绝不能把它塞进 `ListPage`**；但它**有 `GetFields`**，所以单表单页仍应走「元数据驱动」，而非硬编码字段。

**单列处理范式（系统设置单表单页，而非列表页）**：

1. **路由识别**：菜单树命中 ConfigController 路由时（见 §4.18「命名不可靠」结论——**不能靠命名启发式**，必须用 `EntityPage` 的 `SPECIAL_CONTROLLERS` 注册表显式声明），**不走 `ListPage`，路由到专用 `ConfigView`**（见 `assets/ConfigView.vue` 与 `references/config-controller.md`）。
2. **数据获取**：`GET /api/{area}/{controller}/GetFields?kind=EditForm` 取 `DataField[]`（元数据），再由 `GET /api/{area}/{controller}` 拿回**单个配置对象**（属性即设置项，不是 `rows` 数组——注意**不**走 `extractListPayload`，无 `rows`/`page` 包裹）。
3. **渲染（元数据驱动，标准落地）**：复用 `buildFormItems` / `buildFormRules`（与实体表单同源、组件选型/校验一致），`GetFields` 不可用（老部署）时再退回静态 `fields` 声明或按返回对象 JS 类型动态推断兜底。这是「元数据驱动、不硬编码」总原则的**正常落地**（不再是需要硬编码的例外）。
   - **按 `category` 分 tab 组织**：`GetFields` 返回的每个 `DataField` 携带 `category`（分组名，可能为空串/null）。`ConfigView` 按 `category` 把字段分组（复用 `fieldRender.groupFormItemsByCategory`），用 `t-tabs`（`theme="card"` + 类 `cube-category-tabs`）分 tab 展示；`category` 为空/缺省（或只有 1 个分组）时退化为扁平表单、不显示 tab 头。默认分组名为「基础设置」（`DEFAULT_CATEGORY`，可经 `defaultCategory` prop 覆盖为业务自定义名），始终排在最前，其余分组按 `category` 首次出现顺序排列；`v-model` 的 `activeTab` 在 `load()` 完成后对齐到首个真实分组名。`t-tabs` 默认 `destroyOnHide=false`，隐藏 tab 的 `t-form-item` 仍挂载、整表校验覆盖全部分组。完整规则见 §4.19（R3）。
4. **保存**：`POST /api/{area}/{controller}`（`Update`）回存整对象；成功提示后重新 `GET` 刷新。

**防坑**：
- 不要把 ConfigController 路由配成 `ListPage`：否则 `buildColumns` 拿空 schema，表格只剩操作列或空白（现象同 `§七` TDZ，但根因是「无 GetPage」而非「前向引用」）。
- `ConfigView` **优先用 `GetFields` 元数据驱动**（配置类增删字段只需后端改、前端自动适配）；`GetFields` 不可用时才退回静态 `fields` 声明 / JS 动态推断兜底（此时配置类增删字段需前后端同步改）。这是 `ConfigController<T>` 的固有限制边界，不是 bug。
- `Config<T>.Current` 是进程级单例缓存，`Copy + Save` 后下次 `Get` 即见新值（后端线程安全）。

> 本项目（IoTHub 等）凡 `XxxSetting`/`XxxConfig` 类控制器都属此列，前端统一用 `ConfigView` 单列处理；具体单表单实现见 `references/config-controller.md`，可复用脚手架见 `assets/ConfigView.vue`。

### 4.18 非实体 ControllerBaseX 控制器（无 GetPage，自定义端点，单列专属页）

魔方另一类「非实体」基础控制器是**直接继承 `ControllerBaseX`**（而非 `EntityController<T>`/`ReadOnlyEntityController<T>`）的自定义控制器，例如 **`DbController`（数据库管理，`/Admin/Db`）**。它与 `ConfigController<T>` 的本质区别：既**不是单对象配置**、也**不是标准 CRUD 列表**，而是暴露一组**自定义端点**：

- `DbController : ControllerBaseX`（`NewLife.Cube.Areas.Admin.Controllers.DbController`）：
  - `GET /api/Admin/Db`（Index）→ `Json(0, null, list)`，`data` **直接是 `DbItem[]` 数组**（无 `rows`/`page` 包裹，**也没有 `GetPage`**）；
  - `POST /api/Admin/Db/Backup`（body `{ name }`）、`POST /api/Admin/Db/BackupAndCompress`；
  - `GET /api/Admin/Db/Download?name=`（返回数据库架构 XML **文件流**）。
  - `DbItem` 字段：`Name`(连接名) / `ConnStr`(连接串，**敏感不展示**) / `Type`(DbType) / `Version`(服务端版本) / `Backups`(备份文件数)。
- 同类还可能包括其它业务「工具型」控制器（无 GetPage、端点自定义）。

**前端影响**：与 `ConfigController<T>` 同源——**没有 `GetPage`**，绝不能进 `ListPage`（`loadSchema` 拉 GetPage 失败 → 空白/损坏）；但也不能用 `ConfigView`（那是单对象表单）。必须为它写**专属页**（如 `assets/DbView.vue` 数据库管理：列表 + 备份 + 下载架构）。

**统一单列处理机制（EntityPage + 区域作用域注册表）**：把注册表抽成独立模块 `src/specialControllers.ts`（`kind + view + 端点可覆盖`），`EntityPage.vue` 仅做分发——`SPECIAL_CONTROLLERS['{area}/{controller}']` 命中即 `<Component :is>` 渲染专属组件、否则走标准 `ListPage`：

```ts
// src/specialControllers.ts（声明式分发依据）
import ConfigView from '@/components/cube/ConfigView.vue';
import DbView from '@/components/cube/DbView.vue';
export const SPECIAL_CONTROLLERS: Record<string, { kind: 'config' | 'db' | 'custom'; view: Component }> = {
  'Admin/Cube':  { kind: 'config', view: ConfigView },  // ConfigController<T> → 单表单页
  'Admin/Sys':   { kind: 'config', view: ConfigView },
  'Admin/XCode': { kind: 'config', view: ConfigView },
  'Admin/Core':  { kind: 'config', view: ConfigView },
  'Admin/Db':    { kind: 'db', view: DbView },          // ControllerBaseX → 列表+备份+下载
};
// EntityPage.vue
const special = computed(() => SPECIAL_CONTROLLERS[`${area.value}/${controller.value}`] ?? null);
```

> **关键结论（来自源码逐一核对 Admin 区 25 个控制器）：【命名不可靠】**——`*Config`/`Parameter` 之类名字像配置，但 `MailConfig`/`OAuthConfig`/`SmsConfig`/`Parameter` 实际都是 `EntityController<T>`（有 `GetPage`，能正常走 `ListPage`）；而真正的 `ConfigController<T>` 反而**不带 Config 名**（`Cube`/`Sys`/`XCode`/`Core`）。故注册表必须**显式策划**，绝不能靠「名字含 Config 就当配置页」的启发式自动判定，否则 `MailConfig` 会被误判成配置页而崩溃。

> **安全兜底（防误路由崩溃）**：`ListPage`/`EntityPage` 的 `loadSchema` 应对 `GetPage` 加探针——404 / 无 `list` 字段时渲染「该控制器需自定义界面」友好占位，**绝不空白或只剩操作列**（杜绝 TDZ / 无 GetPage 类误路由）。这层兜底与注册表互补：注册表是「已知特殊控制器的精确路由」，兜底是「未知非实体控制器的优雅降级」。

新增此类控制器**只需在 `specialControllers.ts` 追加一条**（无需新增路由）——泛型路由 `/:area/:controller` 兜底即驱动。`<Component :is="special.view">` 渲染命中组件（统一传 `area`/`controller`/`title`/端点可覆盖参数）。可复用脚手架：`assets/ConfigView.vue`（GetFields 元数据驱动）、`assets/DbView.vue`、`assets/specialControllers.ts`（注册表模板）。

**防坑**：
- 与 `ConfigController<T>` 同源「无 GetPage」，但数据形态是**列表数组（`data` 直接数组）**而非单对象——`DbView` 取 `r.data` 数组即可，**别走 `extractListPayload`**（无 `rows`/`page` 包裹，会误判为空）。
- 文件下载端点（`Download`）用 `http` 实例（自带 token 拦截器）取 `responseType:'blob'`，再 `URL.createObjectURL` + `<a download>` 触发，令牌才带得上；**不要用裸 `<a href>`**（无 token → 401）。
- 敏感字段（如 `ConnStr`）前端**不要渲染**，避免泄露连接字符串。
- 端点路径**不带 `/api` 前缀**（`getApi`/`postApi`/`http` 的 `baseURL` 已含）；写成 `/api/...` 会双前缀 404/405（见 §七「双 `/api` 前缀」）。
- **字段名必须 camelCase 归一（致命坑）**：NewLife.Cube WebApi 实际以 **camelCase** 输出 JSON（同控制器 `GetPageDataContextAsync` 即用 `name`/`type`/`version`/`backups` 小写键），而 `DbItem` 的 C# 属性是 PascalCase（`Name`/`Type`/`Version`/`Backups`）。`DbView` 必须复用 `normalizeRows`/`camel` 把行数据归一到 camelCase，**且列 `colKey` 一律写 camelCase（`name`/`type`/`version`/`backups`），`row-key` 用 `name`**；否则列键与数据键对不上 → 后端有数据但单元格全空白。切勿写死 PascalCase 列键。

> 本项目 `DbController` 已用 `DbView` 单列处理；可复用脚手架见 `assets/DbView.vue`。

### 4.19 强制规则：表单 / 详情按 category 分 tab 组织字段（R3）

**GetPage / GetFields 返回的字段元数据 `DataField.category` 用于分组展示，是项目强制规则（不可违反）：**

- 凡某实体 / 配置类的字段元数据里**定义了 `category`**（即至少存在一个非空的 `category` 值），**表单页（FormDialog 新增/编辑）与详情页（DetailDrawer）一律按 `category` 分 `t-tabs` 展示字段**；
- `category` 为 **null / 空串 / 空白** 的字段归入**默认分组**（默认名 `基础设置`，`ConfigView` 可经 `defaultCategory` prop 覆盖为业务自定义名，如「常规」），默认分组始终排在最前，其余分组按 `category` 首次出现顺序排列；
- 仅 1 个分组（即没有任何有效 `category`）时退化为**扁平表单 / 扁平描述列表**，**不显示 tab 头**（避免单 tab 无意义）；
- **校验覆盖**：`t-tabs` 默认 `destroyOnHide=false`，隐藏 tab 内的 `t-form-item` 仍挂载，整表 `rules` 校验覆盖全部分组，提交仍发送完整 `model`。

**统一实现（单一真相源，禁止各页面重复手写分组逻辑）：**

- `src/api/fieldRender.ts`：
  - `DEFAULT_CATEGORY = '基础设置'` —— 默认分组名常量；
  - `groupFormItemsByCategory(items, defaultCategory?)` —— 表单项（buildFormItems 输出，含 `.category`）分组，返回 `{ category, items }[]`；
  - `groupDataFieldsByCategory(fields, defaultCategory?)` —— `DataField[]`（详情页 / ConfigView）分组，同上签名。
  - 二者均委托通用 `groupByCategory<T>(items, defaultCategory)`，规则一致：空 category → defaultCategory，defaultCategory 置顶，其余按出现顺序。
- `ConfigView.vue`：复用 `groupFormItemsByCategory(renderFields, props.defaultCategory)`，并暴露 `defaultCategory` prop（category 为 null 时所用）。
- `FormDialog.vue` / `DetailDrawer.vue`：分别用 `groupFormItemsByCategory` / `groupDataFieldsByCategory`（默认 `DEFAULT_CATEGORY`），`useTabs = groups.length > 1` 决定是否显示 tab 头。
- **详情字段渲染抽到 `DetailContent.vue`**（图像/颜色/文件/图标/多值标签/映射名称/布尔/普通值），供 tab 与扁平两种形态共用，避免重复。
- **tab 美化统一令牌类**：三个组件的 `t-tabs` 套 `.cube-category-tabs` 类（`src/styles/tokens.css` 全局定义，基于 `--td-brand-color*` + 圆角/间距令牌，激活态=品牌浅底+品牌字色、去默认下划线、≥32px 触摸区；暗色模式 `color-mix` 品牌浅底）。新增任何分类 tab 必须复用此类，禁止页面内联重写 tab 皮肤。

**防坑**：
- 不要在页面里再硬编码 `'基础设置'` / `'默认'` 分组名或重写分组算法——统一走 `fieldRender` 的两个 `group*Category` 与 `DEFAULT_CATEGORY`，否则命名/顺序会与其它页面不一致。
- `t-tab-panel` 的 `:value` 必须等于分组 `category` 字符串，且 `v-model` 的 `activeTab` 在 `load`/分组就绪后要对其对齐到首个真实分组（否则 TDesign active-bar 收集 null 节点会在切换 tab 时 `TypeError: can't access property "parentNode", node is null`）。

### 4.20 LovController 值集对接（枚举下拉 + 列表型弹窗，权威源）

**背景**：前端「字段映射双模式」（§4.8）此前靠 `useLookups` 的**约定式兜底**（去字段名 ID 后缀猜控制器 + 猜 ID/Name 列）取外键 id→名 字典，且**完全无法覆盖枚举型值集**。魔方自带的 `LovController`（`Admin/Lov`）是枚举型与列表型值集的**权威管理系统**，其 `Meta` 接口一次性给出下拉选项与列表弹窗所需的全部配置。本技能据此落地 `src/api/useLov.ts` 并把值集接入字段映射链路。

**值集两种类型（`lovCode` 前缀区分）**：
- **枚举型** `lovCode = Enum.{命名空间}.{枚举名}`（如 `Enum.CubeDemo.Areas.Test.测试枚举`）：静态键值字典，表单渲染为下拉/多选下拉，列表回显名称。
- **列表型** `lovCode = List.{area}.{controller}`（如 `List.CubeDemo.Role`）：动态数据，表单渲染为**LOV 弹窗表格**（单选/多选），点选行回填外键值。

**`LovController.Meta` 接口契约（权威源）**：
- `GET /api/Admin/Lov/Meta?lovCode=Code1,Code2`（**逗号分隔多 code 一次拉取**）→ 信封 `data` 为 `Meta[]`（或直接数组）；
- `Meta`（ENUM 型）字段：`LovCode`、`Type:'ENUM'`、`Options:[{Value,Label,Extra}]`；
- `Meta`（LIST 型）字段：`Type:'LIST'` + `ListConfig{ RequestUrl, Method, Pageable, PageNumField, PageSizeField, DataPath, TotalPath, FixedParams, ProxyRequest }` + `SearchFields[]` + `TableColumns[]`；
- 信封还可能带 `InlineEnums`（对象：`lovCode → 选项数组`），作为内联枚举补充；
- 另有 `POST /api/Admin/Lov/BatchLabel`（批量翻译原始值→名称）、`POST /api/Admin/Lov/ListData`（代理拉取列表数据，返回 `{Data,Total}`）。

**前端落地（单一真相源，文件见 `assets/`）**：
- **值集三通道优先级（resolveOptions/labelOf 选项解析与回显顺序）**：
  1. **通道1（官方 `/Cube/Lookup`，枚举字典权威源）**：未配 `lovCode` 的纯枚举字段（无实体表，如 sex/role/enable）→ `useLookups.load` 收集其 `typeName`（枚举类型名）批量 `GET /Cube/Lookup?codes=...`，结果以 `typeName` 为键存入 `lookups`；`resolveOptions`/`labelOf` 在 LovController 之后、约定式之前按 `lookups[f.typeName]` 回显。
  2. **通道2（LovController `Meta`，lovCode 显式声明的枚举/列表型值集）**：`lovCode=Enum.*` → `lovOptions[lovCode]`；`lovCode=List.*` → `lovListConfig[lovCode]` 弹窗表格。
  3. **通道3（约定式 `useLookups` 去 ID 后缀猜控制器）**：仅兜底外键 id→名 字典（TenantId/RoleIds/ParentID 等），对无实体表的纯枚举天然失效（故才需要通道1）。
- **`src/api/useLov.ts`（新建，并扩展 `/Cube/Lookup` 通道）**：`useLov()` 组合式——
  - 收集 schema 字段的 `lovCode`（枚举/列表都收集，去重）；
  - `load(fields)` 批量 `GET /api/Admin/Lov/Meta?lovCode=...`，把 `Meta[]` 归一到 `lovOptions`（枚举：`lovCode→LovOption[]`）与 `lovListConfig`（列表型：`lovCode→LovListMeta`，含 `valueField`/`labelField`/`listConfig`/`searchFields`/`tableColumns`）；
  - **退化容错**：`LovController` 不可达（404 / 老版本无此控制器 / 未授权）→ `catch` 静默跳过，完全退化为既有约定式 `useLookups`，**不阻断主页面**；
  - **大小写归一**：后端 PascalCase（`Value/Label/Options/ListConfig`）统一归一到 camelCase（`value/label/...`），与前端 camelCase 键约定一致。
- **`src/api/useLookups.ts`（扩展，接入通道1）**：`load(fields)` 现额外收集**未配 `lovCode` 且无 `map`/`dataSource`/非映射字段的枚举型字段**（`isEnumType(f)` 为真），批量 `GET /Cube/Lookup?codes=<枚举类型名>`；`CubeController` 为非 Area 控制器、属性路由根路径 `/Cube/Lookup`（无 `/api` 前缀），故先探 `/api/Cube/Lookup`（带 api 前缀部署）404 再回退 `/Cube/Lookup`（根路径），两者均不可达→静默退化。`/Cube/Lookup` 响应 `data` 为 `{ <类型名>: [{Label,Value}] }`，归一成 `lookups[typeName] = { 值: 名称 }`。
- **`src/api/fieldRender.ts`（扩展，向后兼容，可选参）**：
  - `resolveOptions(f, lookups?, lovOptions?)`：选项解析顺序 `mapField` 字典源（`mapDictOf`）→ `field.dataSource` → **`lovOptions[lovCode]`（LovController 枚举值集，优先于约定式 lookups）** → `lookups[基名]`；（注：6.13 `DataField` 无 `field.map`，`[Map]` 字典源在 `mapField`，见 §4.8.1）
  - `labelOf(f, value, lookups?, lovOptions?)`：回显顺序同上，含多值（逗号分隔）逐项映射拼接；
  - `buildColumns(..., getLovOptions?)`：第 4 参 getter，单元格 `labelOf` 在第 3 优先级回显枚举名称；
  - `buildFormItems(fields, lookups?, lovOptions?)`：第 3 参，下拉 `options` 注入 `lovOptions`。
- **`src/components/cube/ListPage.vue`**：`init()` 中 `await loadLookups(allFields)` 后 `await loadLov(allFields)`；`buildColumns(..., () => columnLookups.value, showKey, () => lovOptions.value)`；向 `FormDialog`/`DetailDrawer` 下发 `:lov-options` / `:lov-list-config`。
- **`src/components/cube/FormDialog.vue`**：LOV 弹窗升级——
  - 新增 `lovOptions` / `lovListConfig` 两个 prop；`buildFormItems` 传 `props.lovOptions`；
  - `openLov(item)` 优先读 `props.lovListConfig?.[code]`（**权威路径/列/值字段**）走 `fetchLovRows(cfg)`；无配置时退化 `parseLovListCode` 猜 `/api/{area}/{controller}` + 猜 ID/Name 列的旧逻辑；
  - `fetchLovRows`：`ProxyRequest=true` 走 `POST /api/Admin/Lov/ListData`；否则 `getApi(requestUrl)`，按 `dataPath`（默认 `data`）/`totalPath`（默认 `total`）取数；`lovColumns` 按 `TableColumns` 权威渲染，否则 ID/名称兜底；`lovRowKey` 取 `valueField` camel 键；helper `extractPath`/`rowLabelOf`。
- **`src/components/cube/DetailContent.vue` / `DetailDrawer.vue`**：新增 `lovOptions` prop，模板 `labelOf(props.f, v, props.lookups, props.lovOptions)` 透传，详情多值标签同理。

**防坑**：
- **LovController 不可达必须静默退化**：生产环境可能跑老版本后端（无 `Admin/Lov`）。`useLov.load` 的 `catch` 吞掉异常、**绝不** `throw` 或 `console.error` 阻断主流程；退化后枚举下拉/列表回显退回 `useLookups` 约定式兜底（枚举型若无 `map` 则退化为普通输入，属可接受的降级，不是 bug）。
- **大小写**：`Meta` 的 `Options/Value/Label/ListConfig/RequestUrl` 等都是 PascalCase；`useLov.normalizeMeta` 已统一归一到 camelCase（`value/label/requestUrl/...`）。`FormDialog` 读 `lovListConfig` 时务必用**已归一化的 camelCase 键**（如 `cfg.requestUrl`），勿直接读 `cfg.RequestUrl`（拿到 undefined → 弹窗拉不到数据）。
- **枚举值集优先级高于约定式 lookups**：同一字段若既有 `lovCode=Enum.*` 又有外键 ID 后缀，`resolveOptions`/`labelOf` 第 3 优先级走 `lovOptions`（LovController 权威），不会误用 `useLookups` 猜出的字典。两者不冲突——枚举型本就非外键实体。
- **`mapField` 双模式不受影响**：映射字段（如 `TenantName` 指向 `TenantId`）仍走 §4.8 的 `lookups`（外键 id→名）；`LovController` 只接管 `lovCode` 显式声明的枚举/列表型值集，不动外键映射链路。
- **批量拉取用逗号分隔**：`load` 把全部 `lovCode` 拼成 `Code1,Code2` 一次请求，避免 N+1；`Meta` 返回的数组顺序不保证与请求顺序一致，按 `LovCode` 归位，前端按 `lovCode` 取用即可。

## 五、字段类型 → 组件映射速查

完整规则表、控件判定优先级与组件选型策略见 `references/field-renderers.md` 与 §4.11。要点：

| DataField 特征 | 列表回显 | 表单控件 | 备注 |
|----------------|----------|----------|------|
| 字段名 `ParentID` | 树形表节点 | `t-tree-select` | 自引用树：选项来自同实体 `Index`，排除自身 |
| `mapField` 字典源（`[Map]` 枚举/字典串，如 `1=学生,2=教职工`） | 映射名称 | `t-select` | **6.13 权威源在 `mapField`，不在 `field.map`**（§4.8.1）；无字段集命中同名字段即字典源 |
| `mapField`=真实字段名（虚拟映射列，如 `ClassName→ClassID`） | 映射名称 | `t-select`/`t-tree-select` | 提交键用 `mapField`（§4.8.1 硬约束） |
| 以 `ID`/`Id` 结尾且非主键、无 `mapField` 字典（`xxxID`） | 映射名称 | `t-select` | 外键，走 `lookups` 兜底（§4.8） |
| `Boolean` | ✓/✗ 标签 | `t-switch` | |
| `DateTime` | `YYYY-MM-DD HH:mm` | `t-date-picker`(含时间) | 值式 `YYYY-MM-DD HH:mm:ss` |
| `Int32/64/Double/...` | 数字 | `t-input-number` | **Int64 以字符串** |
| `String`(len>200) | 文本(截断) | `t-textarea` | |
| 其它 `String` | 文本 | `t-input` | `maxlength` |

> **字段元数据真实 DTO 边界（已据 NewLife.Cube 源码核实）**：`GetPage` 在 `NewLife.Cube` 变体返回 `DataField`（`NewLife.Cube/ViewModels/DataField.cs`），仅含 `Name/DisplayName/Description/Category/TypeName/ItemType/Length/Precision/Scale/Nullable/PrimaryKey/ReadOnly/Visible/Required/Authority/Extended1-3/MapField/LovCode/Properties`。官方文档 §6.2/§6.3 描述的 `Width/Align/Format/Placeholder/Min/Max/Rows/DefaultValue/HelpText` **并未作为可序列化字段实现**（NC 变体的 `ListField` 也只有 `TextAlign` 枚举 + `MaxWidth`）。因此前端**不要**去读这些字段——它们是文档超前描述；列宽/对齐由前端按 `TypeName`/`ItemType` 自行决策，或经 `GetPage` 扩展字段（Properties 字典）下发时再消费。

## 六、与 cube-webapi-backend 的分工

| 关注点 | 技能 |
|--------|------|
| 后端控制器选型、CRUD、响应信封、字段元数据契约、权限位/数据范围、JWT 配置 | `cube-webapi-backend` |
| 前端脚手架、基类组件、字段→控件映射、treeTable、字段映射、多租户/权限前端消费 | `cube-webapi-tdesign`（本技能） |

两技能成对使用：后端用 `cube-webapi-backend` 暴露标准 API，前端用本技能消费。

## 七、常见陷阱

- **树形用错基类**：后端若实体继承 `EntityTree<TEntity>`，必须用 `EntityTreeApiController`
  （返回 JSON），而非 `EntityTreeController`（MVC 版 `Up/Down` 返回 302 重定向）。前端只要检测到
  `ParentID` 即走 tree 模式，与后端基类正确与否无关，但后端错了列表数据会是重定向而非 JSON。
- **Int64 精度**：主键/大整数以**字符串**传输与回填，表单 `t-input-number` 注意类型，避免 JS 精度丢失。
- **GetPage 不含行数据**：`GetPage` 只给 schema，行数据要再调 `Index()`；别把 `GetPage.data` 当列表。
- **前端权限≠后端鉴权**：按钮隐藏只是体验，后端 `[EntityAuthorize]` 才是真正闸门；别因"按钮藏了"就省略后端权限。
- **只读控制器**：`ReadOnlyEntityController` 无写接口，`setting.isReadOnly=true`，前端应隐藏新增/编辑/删除按钮（`ListPage` 已按 `setting` 处理）。
- **自定义权限位**：后端用 `(PermissionFlags)16/32` + `[DisplayName]` 在动作级 `[EntityAuthorize]` 拦截；前端若按位隐藏业务按钮，权限位数据可由 `GET /api/Auth/Info`（AuthController.Info，返回用户+权限位）或 `GetPage`/`菜单树` 下发。
- **多租户漏带头**：切换租户后必须刷新数据，否则看到的是旧租户数据或 403。
- **构建清空 dist 触发 safe-delete 报错 / dist 被进程锁定（环境 artifact + 正确处置）**：在 WorkBuddy 沙箱中 `vite build` 清空旧 `dist` 时，底层把 `fs.rmSync` 包装成 trash 操作，可能在 Windows 上抛 `safe-delete` 错误（**与代码无关，模块编译均通过**，不是编译失败）。此外若有 node 进程（静态服务 / vite 监视器）持有 `dist` 内文件句柄，`dist` 会**创建/改名均 `Permission denied`**。**正确处置（按序）**：① 先构建到**临时目录**验证编译与产物：`npm run build -- --outDir dist-check`，再 `grep` 该目录产物确认新逻辑存在；② **不要**对 `dist` 做 `mv`/`rm -rf` 后再 `mv` 新目录回去——沙箱 shim 会异步清掉临时目录，实测出现「`dist` 和 `dist-check` 同时消失、产物丢失」；③ 若 `dist` 被锁（服务正持有其句柄），直接 `cp -r dist-check/. dist/` **覆盖内容**（服务持有的目录句柄不变，硬刷新即生效），并核验 `index.html` 引用的 hash 与新产物一致（`grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' dist/index.html`，再确认该文件存在）；④ 治本：停掉占用 `dist` 的服务进程（Windows：`Get-CimInstance Win32_Process -Filter "Name='node.exe'"` 找 PID → `Stop-Process -Id <pid> -Force`）后再 `npm run build`。
- **代理 `/api` + `/cube`，切勿代理前端 SPA 路由 → GET 404**：Vite `server.proxy` 配 **`/api`（后端接口）+ `/cube`（附件/图片资源）** 两条。真实后端所有接口（实体 + 登录 + 菜单）统一在 `/api` 下；上传接口返回的附件路径形如 `/cube/image?id=xxx.png`（`filePath`）是**后端资源前缀**，若不代理，浏览器会把 `/cube/image` 当 SPA 路由返回 index.html → 图片 404。前端菜单导航（如 `/Admin/User`、`/Sys/Config`）由 **Vue Router 在浏览器内**处理，是 SPA 路由，**不是 API 调用**——一旦为 `/Admin` 等前缀配了代理，浏览器硬刷新 `/Admin/User` 时该 GET 会被转发到后端，后端无此资源 → **404**（请求路径形如 `GET http://localhost:5173/Admin/User [404]`）。这是「登录能通、点菜单/硬刷新 404」的典型根因。正确做法：代理仅 `/api` + `/cube`；若需要 SPA 兜底在某深链硬刷新时不 404，确保 Vite `appType:'spa'`（默认）已开启，且这些路径未被任何 proxy 规则命中。默认 `secure:false` 已兼容本地自签证书。
- **代理目标错配 → 登录/菜单 500**：代理 `/api` 的目标必须指向**实际运行**的后端。Mock 演示默认 `http://localhost:3001`；对接真实后端设 `VITE_API_TARGET`。若目标写错端口（如后端未起、或 https 握手失败），前端会收到 **Vite 返回的 500**（不是 404），且耗时接近连接超时（数秒）。先确认后端在跑、端口正确，再改代理目标。
- **登录端点契约有两套形态并存（高频坑：端点 + 字段名完全不同，禁混用）**：落地前**必须用 `curl` 探真实后端**确定形态，文档与旧契约都不可盲信。
  - **形态 A（当前版本 AuthController，SPA 推荐，本项目实测）**：`POST /Auth/Login` + `GET /Auth/LoginConfig` + `GET /Auth/Challenge` + `POST /Auth/Refresh` + `/Mfa/*`（**均不带 `/api` 前缀**）；请求体 `{ username, password, category(枚举整数), remember, challengeId, captchaId, captchaCode }`；响应信封 `code/message/data`，`data` 令牌键名实测 **snake_case**（`access_token`/`refresh_token`/`expire_in`，另有 `token_type`/`scope`）——走 `normToken` 三向兜底。
  - **形态 B（老版 MVC 皮肤 / SSO 回调）**：`POST /api/Admin/User/Login`，入参 `{ userName, password }`，返回 OAuth 风格信封 `data.access_token`（含 `token_type/expire_in/refresh_token/scope`）。
  - **差异清单（切换形态时三处要同步改，缺一即静默失败）**：端点前缀（`/Auth/*` ↔ `/api/Admin/*`）、用户名字段（`username` ↔ `userName`）、是否带 `category` 枚举整数、响应令牌键名（snake/camel/Pascal 三向归一）。菜单树同样两套：`GET /api/Admin/Index/GetMenuTree` 与 `getRaw('/Admin/Index/GetMenuTree')` 都见过，curl 探测为准。Mock 后端已兼容两种前缀（/api 为主、/Admin 为别名）与 `access_token` 信封。
- **登录/注册的 `category` 必须是枚举整数，不能是字符串（高频坑，实测 `code:-2`）**：`/Auth/Login` 的 `LoginModel.Category`、`/Auth/Register` 的 `AuthRegisterModel.Category` 都是枚举 `NewLife.Cube.Enums.AuthCategory`（`Password=0 / Mobile=1 / Mail=2 / OAuth=3`）。**魔方后端未注册 `JsonStringEnumConverter`，System.Text.Json 只接受整数**：传 `''`（空串）或 `'Password'`（枚举名）均被拒，返回 `{"code":-2,"fieldErrors":[{"field":"$.category","error":"The JSON value could not be converted to NewLife.Cube.Enums.AuthCategory..."}]}`。前端必须定义 `export enum AuthCategory { Password=0, Mobile=1, Mail=2, OAuth=3 }`，登录传 `category: AuthCategory.Password`、验证码登录传 `AuthCategory.Mobile`/`AuthCategory.Mail`、注册 `category: payload.category ?? AuthCategory.Password`（**禁止裸字符串 `'mobile'`/`'mail'` 或魔法数字，统一走枚举**）。`assets/auth.ts`（`AuthCategory` 枚举 + `loginWithPassword`/`loginWithCode`/`registerUser`）已按此修正。
- **登录返回令牌字段是 snake_case，前端读 camelCase 会拿不到 token 误判「登录失败」（高频坑）**：魔方后端字段命名不统一——错误信封与 `LoginConfig` 是 camelCase（`code`/`message`/`data`），但登录成功的 `data` 令牌对象实际是 **snake_case**：`access_token`/`refresh_token`/`expire_in`（实测真实后端 `/Auth/Login` 返回即如此）。前端若只读 `d.accessToken`，`d.accessToken` 为 `undefined` → `loginWithPassword` 走 `throw new Error(r.message || '登录失败')` → 后端明明成功却提示失败且不跳转。必须在 auth store 边界用 `normEnv`/`normToken` 三向归一化（兼容 snake/camel/Pascal 任意形态）：`accessToken = o.accessToken ?? o.AccessToken ?? o.access_token ?? ''`、`refreshToken = o.refreshToken ?? o.RefreshToken ?? o.refresh_token ?? ''`、`expireIn = o.expireIn ?? o.ExpireIn ?? o.Expire ?? o.expire_in ?? 0`；信封 `code` 兼容 `r.code ?? r.Code`、`message` 兼容 `r.message ?? r.Message`、`data` 兼容 `r.data ?? r.Data`。`assets/auth.ts` 与 `references/demo/src/api/auth.ts` 的 `loginWithPassword`/`loginWithCode`/`verifyMfa`/`refresh` 已统一 `normEnv`+`normToken`（三向）。**注意**：不要盲信某版文档写的 `data.accessToken`(驼峰) 或 `AccessToken`(Pascal)——不同后端版本形态不一致，靠归一化兜底，不靠单一字段名。
- **菜单 submenu value 必须稳定唯一，否则"点一个全展开"**：`t-submenu` 的 `:value` 切勿用会冲突的 `node.text||node.title`——当真实后端菜单字段名不是 `text/title`（NewLife 常用 `Name`/`Url`/`Childs`/`Icon`，且常 PascalCase）时，这些取值全部为空/`undefined` → 多个 submenu 同 value → 点击任意一个，所有同值菜单同步展开（表现为"点一个全展开"）。必须按 `优先 url → 每行 id → 层级路径(m-i/m-i-j)` 生成唯一 value；并设 `t-menu accordion` 手风琴（一次仅展开一个）+ 受控 `expanded` 与 `@expand` 同步。字段读取需大小写兜底（`text/Text/name/Name`、`children/Children/Childs`、`url/Url`…）。`assets/MenuSidebar.vue` 已落地该健壮实现（含图标 + 设计系统激活态）。
- **⚠️ `MenuSidebar` 必须显式传 `orientation`，否则侧栏变横向菜单多出 "..." 项（高频坑）**：组件内部是 `v-if="orientation === 'vertical'"` → `t-menu`（垂直）/ `v-else` → `t-head-menu`（横向弹层）。宿主 BasicLayout 若不传 `orientation="vertical"`，侧栏里会渲染成**横向 t-head-menu**——菜单项总宽超过 232px 窄容器时 TDesign 自动把溢出项折叠进一个 **"..."（more）菜单**，表现为"菜单莫名多出一层 ..."。正确装配：侧边布局 `<MenuSidebar orientation="vertical" :theme="setting.mode" :collapsed="setting.collapsed">` 放 t-aside；顶部布局（layout='top'）另放一份 `orientation="horizontal"` 于 t-header 并隐藏 t-aside；`theme/collapsed` 从 `useSettingStore()` 读取（`stores/setting.ts`，main.ts 已 `load()`）。
- **⚠️ 侧栏是「品牌色皮肤」，底色与文字令牌必须成对（两个方向都踩过坑，勿拆）**：设计体系=「品牌深底 + 白字」。`.side` 底色用 `var(--cube-sidebar-bg)`（tokens.css 政务蓝渐变兜底，运行时 `utils/color.ts` `getBrandPalette(主色)` inline 注入 `--cube-sidebar-bg/-bg-solid/-active-bg/-active-bar/-topbar-border`，随 SettingPanel 所选主色实时联动），菜单文字/激活/悬停用 `--cube-sidebar-text/-text-strong/-text-weak/-hover-bg`（白系）。坑①：把 `.side` 写成 `var(--td-bg-color-container)`（白底）→ 切主色侧栏无感知，用户投诉"没有应用主色调"；坑②：为迁就白底把文字改成 `--td-text-color-primary` → 恢复品牌深底后深底深字不可见。**铁律：成对改**——恢复品牌皮肤时 `.side`→`--cube-sidebar-bg` 且菜单文字→`--cube-sidebar-text` 系同时落地。暗色模式由 `theme-dark.css` `.t-theme-dark .side{background:color-mix(...)!important}` 接管为品牌暗调底，白字令牌在其上仍可读。顶栏可保留白底，但 `border-bottom:1px solid var(--cube-topbar-border)` 与主色联动作呼应。
- **⚠️ 列表页 `table-layout:auto` + `fixed:'right'` 操作列 = 双坑（页面撑出屏幕 + 固定列失效，实测 NV8021X）**：TDesign 固定列**只在 `table-layout:fixed`（默认值）下可靠生效**——fixed 布局渲染 `<colgroup>`，`width` 来自列定义（无 width 的列 overflow 时被压成 100px，故**每列必须显式 width**）；列宽合计 > 容器时 `.t-table__content` 自身出横向滚动条，sticky 操作列钉住可视区右缘。写成 `table-layout="auto"` 后：① 内部 `<table>` 宽由内容决定（`width:100%` 在 auto 下是"下限"而非"上限"），超宽表把**整个页面撑出屏幕宽度**；② 表格外层容器被撑宽后 scrollWidth==clientWidth，TDesign 的 `isWidthOverflow` 永远 false → **操作列 `fixed:'right'` 完全不生效**（用户投诉"操作栏没钉在右侧"）。**修法**：`t-table`/`t-enhanced-table` 一律不写 `table-layout`（吃默认 fixed）；`buildColumns` 按元数据推导显式 width（bool 80/图片图标颜色 90/数值 100/日期时间 170/日期 120/文本按 length×13px 钳制 [120,260]/兜底 150，长内容走 `ellipsis` 截断）；操作列 width 含宿主 `row-actions` 插槽宽度（≥180）。外层另保留 `min-width:0`（.content/.cube-list-page）防 flex 撑爆。assets/ListPage.vue 与 fieldRender.ts 已按此落地。
- **左侧菜单须按设计系统落地，勿用裸 `t-menu`**：设计系统（见 `design-proposal.md` 与 `prototype.html` 侧边栏规范）要求每个菜单带图标、激活态为「品牌色浅底 `#f2f7ff` + 品牌色文字 + 字重 500 + 左侧 3px 品牌色强调条」、悬停态浅灰底、菜单项圆角 40px 高（子级 13px），且一级分组名视为分组标题视觉。裸 `t-menu` 仅用默认激活色、无图标、无强调条，即“未落地设计系统”。参考 `assets/MenuSidebar.vue` 的 `:deep(.t-menu__item.t-is-active)` 等样式直接复用。

- **实体接口双 `/api` 前缀 → Index/详情 404（高频坑）**：`http` 实例的 `baseURL` 已固定为 `/api`，所有经 `getApi/postApi/putApi/deleteApi`（即走 `http`）的实体调用**路径里不要再写 `/api`**。一旦写成 `/api/${area}/${controller}`，axios 拼出 `/api/api/${area}/${controller}`，后端无此路由 → **404**。典型表现：**`GetPage` 能通（200）但 `Index`/详情 404**——因列表接口多了一层前缀。正确做法：`useEntityResource` 的 `base` 用 `/${area}/${controller}`（无前缀）；`DetailDrawer`/`FormDialog` 的 `base` 同理不带 `/api`；`useLookups` 拉外键字典写 `/${a}/${ctrl}`。`assets/useEntityResource.ts`、`assets/useLookups.ts`、`assets/DetailDrawer.vue`、`assets/FormDialog.vue` 已按此修正。**落地后务必全量 `grep` `src` 中 `getApi(`/`postApi(`/`putApi(`/`deleteApi(` 的调用，确认无残留 `/api/` 硬编码**（登录/菜单走 `rawHttp` 带 `/api` 是正确用法，勿误删）。
- **编辑保存/删除 405 = 把主键放进了 URL path（高频坑，实测 405 Method Not Allowed）**：NewLife.Cube 官方契约（NewLife.CubeVue 前端 + ObjectController 源码证实）是 **修改 `PUT /{Area}/{Controller}`（主键在 body，不在 URL）**、**删除 `DELETE /{Area}/{Controller}?id=xxx`（id 在 query，不在 URL path）**——`add: post(url) / update: put(url, data) / remove: delete(url, params:{id})` 全部打**主路由**。若前端写成 `PUT /{base}/{id}`、`DELETE /{base}/{id}`（id 在 URL path），后端无此路由 → **405 Method Not Allowed**（AxiosError status 405，栈落在 `putApi`/`deleteApi`）。**正确做法**：`useEntityResource.update(id, row)` 发 `putApi(base, body)`（body 合并主键兜底：`if (body.id==null && body.Id==null) body.id = id`）；`remove(id)` 发 `deleteApi(\`${base}?id=${encodeURIComponent(String(id))}\`)`。`assets/useEntityResource.ts` 已按此修正。**注意**：这是「第三代 WebApi 主路由风格」；老版 EntityController（Insert/Update/Delete Action 命名）另当别论，落地前 curl 探后端 swagger 确认。
- **加载失败要显式暴露，勿静默空白**：`useEntityResource.loadSchema/loadData` 必须 `try/catch` 并把错误写入 `error` ref，列表页顶部用 `t-alert` 红色错误条展示「`/api/{area}/{controller}` + 失败原因」。否则「真实后端 `GetPage` 返回扁平 `fields` 而非五段数组」或「`schema.list` 为 `undefined` 致 `buildColumns` 抛错」时，页面会**静默空白**，用户只看到“右侧没数据”而无法定位。兼容策略见 §4.15 与 `assets/useEntityResource.ts` 的 `normalizeSchema`/`extractListPayload`（覆盖「五段数组」「扁平 fields + 视图标志位」「兜底空 schema」「`data` 直接数组/`{rows,page}`/`{list,page}`/`{page.rows}` 多种包裹」）。

- **⚠️ `mapField` 双语义：`[Map]` 枚举字典源在 `mapField`，不在 `field.map`（Cube 通用列表页历史坑，2026-09 复现并修复）**：6.13 的 `DataField` **没有 `map` 字段**，`FieldItem.Map` 的 `k=v` 串被原样序列化进 `mapField`。枚举字段（如 `PersonType`/`ValueMode`/`Gender`/`WeComStatus`）若代码去读 `field.map`（不存在）→ 列表渲染成**原始 Int32**（`1`/`2`/`3`）、表单变纯 `t-input`。正确做法：用 `mapFieldKind`/`mapDictOf` 解析 `mapField` 字典串——列表 `labelOf` 显名、表单 `controlOf` 出 `t-select`（`options` 来自 `parseMapSource`）。**判别法**：`mapField` 能在字段集命中同名字段 → 映射字段（`field`，提交键用 `mapField`）；否则 → 字典源（`dict`，提交键用 `f.name`）。后端 `[Map("0=未知,1=男,2=女")]` 需加在**生成实体**上（`FieldItem.Map` 只读，手写实体加 `[Map]` 特性）。详见 §4.8.1。
- **⚠️ TDesign `<t-select>` 渲染为 `<div class="t-select">`，不是原生 `<select>`（验收高频误判）**：判定"下拉是否渲染"**切勿** `querySelector('select')`（恒为 0），应查 `.t-select` 类或 `:placeholder` 是否 `请选择{label}`；表单项选择器是 `.t-dialog .t-form__item`（`t-form-item__{name}` 是派生 class，非 `.t-form-item`）。浏览器内 `fetch('/{area}/{ctrl}/GetPage')` 转储 `addForm` 可确认 `mapField` 在响应中完好（camelize 对 `mapField` 幂等、不剥离）。
- **⚠️ `GetPage` 五段式契约（`list`/`addForm`/`editForm`/`detail`/`search`）**：各段**已按场景裁剪**——`addForm` 不含主键/只读/审计字段、`detail` 由后端剔除主键与审计、`search` 段给出的就是**后端真实查询参数名**（如 `Student` 的 `ClassID`，而 list 只暴露虚拟列 `ClassName`），正好替代手工 `searchParamMap`；表单新增走 `addForm`、编辑走 `editForm`。`useEntityResource.loadSchema` 将五段存入 `schema`，`ListPage` 分别消费。`camelize` 响应拦截器对所有键首字母小写（PascalCase→camelCase，对已是小写的 `mapField`/`name` 幂等），前端提交时 `toPascal` 把 camel 载荷还原为后端期望的 PascalCase 字段名（映射字段还原为 `mapField` 真实列名）。

- **详情/编辑必须「接口优先」取单条（数据一致性），列表 row 仅作即时展示/兜底**：**单条接口是 `GET /api/{area}/{ctrl}/Detail?id={id}`（id 在 query，不是 path）——curl 实测 200，返回信封 `data` 为实体对象**。此前误判「无单条接口」是因为只试了**路径形式** `/{id}`、`/Detail/{id}`、`/Get/{id}`（三者确实 404）。**为什么要接口优先**：列表行是进入页面那一刻的快照，可能已被他人修改，直接用它回填并保存会**覆盖他人改动**。**正确做法**（`getById` 候选链，首个成功即返回、404 继续下一个）：① `/Detail?id=`（主路径，对象）② `/Get?id=` ③ `?id=`（**列表接口+主键过滤**，返回数组取首行，兜底可靠）④ `/{id}`（REST 风格部署兼容）。组件侧：`DetailDrawer`/`FormDialog` 先用 `props.row` 即时渲染（不空白），随后 `await res.getById(id)` 用接口最新值**覆盖**；接口失败/返回空则保留 row 兜底。另：`onEdit/onDetail` 取主键必须用 `getRowKey(row)`（遍历行键、小写精确匹配 `id`，兼容 `id/ID/Id`），**勿写死 `row.id`**（NewLife 主键常大写 `ID`，小写取不到 → 传 undefined → 请求 `/.../undefined`）。`assets/ListPage.vue`、`assets/DetailDrawer.vue`、`assets/FormDialog.vue`、`assets/useEntityResource.ts`（含 `getRowKey`/`getById`）已落地。
- **编辑表单下拉显示数字 ID 而非名称 = 值类型不匹配（高频坑）**：TDesign `t-select` 用**严格相等 `===`** 匹配 value。而 `useLookups` 建字典用 `dict[String(idv)] = name` → **`resolveOptions` 生成的 options.value 全是字符串**；接口/列表行返回的外键 ID 却常是**数字**（JSON number）→ 类型不同匹配失败 → 下拉显示不出 label、回退显示原始数字 ID。**修复（`FormDialog` 两处，缺一不可）**：① **回填时类型对齐**——在 `options` 中按「值相同」找命中项，用它的 value（保持原类型）写回 `formData`（多值字段逐项对齐）；② **提交时还原数字**——单选 select 字段若值是纯数字字符串则 `Number(v)`（后端 Int32/Int64 严格反序列化，字符串可能绑定失败；仅对 `it.control === 'select'` 生效，避免误转普通文本数字字段如 `Code="123"`）。多值外键走 `serializeMultiValue`（逗号串，String 字段）不受影响。`assets/FormDialog.vue` 已落地。
- **列表「列宽不断刷新」的根因是 `columns` 引用被反复重建，而非「没写死 width」（高频坑，实测）**：典型现象——打开列表页列宽不停抖动。**`fieldRender.buildColumns` 生成的列定义数组「引用」必须稳定**：TDesign 表格每次拿到新 `columns` 数组就重建列头、重算列宽。给每列写死 `width` 只是「用固定宽度掩盖反复重建」，代价是牺牲「自适应列宽」需求——**不是根因修复**。**根因**：`columns` 若依赖 `columnLookups`（外键/枚举字典），而字典在初始化期 `schema → lookups → data` 分批到达（映射列还会从「原始 ID」变成「名称」），每次字典到达就生成新 `columns` 数组 → 列宽被反复重分布 → 即「列宽不断刷新」。**正确修复（同时满足「自适应列宽」+「操作列固定右侧」两项原始需求）**：① `buildColumns(fields, getLookups?)` 只由 `fields`（schema.list）生成列定义，**不接收也不依赖字典**；字典通过 `getLookups()` 在 `cell` 渲染时**按需读取**（如 `() => columnLookups.value`，响应式），字典到达后表格自动重渲对应单元格、只更新内容不重建列；② 数据列**不写死 `width`**，列宽交由 TDesign 表格 `table-layout:auto` 下按内容自适应（窗口/容器变化列宽随之调整），长文本列配 `ellipsis` 截断；③ 操作列 `fixed:'right'` + `width:120`（fixed 列需明确 `width` 才能正确 sticky 钉右）；④ 两张 `<t-table>` 加 `table-layout="auto"`（默认 `fixed` 会把无 width 列均分容器、且固定列在均分下无横向滚动、钉右效果弱；`auto` 下内容撑宽、列多时横向滚动、操作列 sticky 钉右）。`assets/fieldRender.ts`（`buildColumns` 稳定引用 + `getLookups` 闭包）、`assets/ListPage.vue`（操作列 `fixed:'right'`+`width:120` + 两表 `table-layout="auto"`）已落地，`references/demo/src/api/fieldRender.ts` 同步。**自适应屏幕宽 + 操作列钉右缘 + 不撑破页面（三项须同时满足）**：`table-layout:auto` 下**内部 `<table>` 元素宽度由内容决定**——`.t-table`（外层 div）虽 `width:100%`，但内容窄时表格不满容器、右侧留白；内容超宽时又会**把外层 flex 容器顶宽、页面超出屏幕出现浏览器横向滚动条**。三处修复缺一不可：① CSS 强制内部 table 铺满：`.cube-list-page :deep(.t-table > table), .cube-list-page :deep(.t-table .t-table__content table) { width: 100%; }`（内容超宽时 CSS 表不能窄于 min-content，仍会撑开 → `.t-table__content` 的 `scrollWidth > clientWidth` → TDesign `isWidthOverflow`（useFixed.mjs）检测到溢出并启用自身横向滚动，操作列 `fixed:'right'` sticky 钉右缘）；② **flex 子项 `.content` 必须 `min-width: 0`**（核心）——flex 子项默认 `min-width:auto` 会被超宽表格撑大，导致 TDesign 测得的容器宽 = 撑开宽、`isWidthOverflow` 永远 false、表格自身横向滚动失效、页面整体溢出；③ 页面容器 `.cube-list-page { width:100%; min-width:0 }`。`assets/BasicLayout.vue`（`.content{min-width:0}`）、`assets/ListPage.vue`（容器约束 + 内部 table 铺满）已落地。
- **`required` / `nullable` / `readOnly` 语义各自独立，勿混用（高频坑）**：字段元数据属性都是**辅助前端展示**的，但含义不同：`required`=**界面是否必填**（UI 语义）、`nullable`=**数据库是否允许为空**（NOT NULL 约束）、`readOnly`=**是否只读**（控件禁用）、`visible`=是否可见（**实测后端恒为 `false`，绝不可用于判断隐藏列**）、`primaryKey`=主键（表单/列表排除）。**典型 bug**：把 `nullable===false` 直接当必填，导致 `ID`、`CreateTime`、`CreateUserID`、`Ex1/Ex2` 等 77 个字段全被标红星要求用户填写（实测 137 个表单字段中 77 个是 NOT NULL）。正确做法：① `required===true` → 必填；② 其余情况用 `nullable===false` **兜底推断**，但排除主键/自增/`readOnly`/审计字段（`CreateTime`/`UpdateTime`/`CreateUserID`/`UpdateUserID`/`CreateIP`/`UpdateIP`）；③ 实测本后端对所有字段下发 `required:false`（0 个 true），**故 `required` 仅在为 `true` 时生效，不能把 `false` 当「明确不必填」**，否则连 `Name` 都不校验。统一走 `fieldRender.resolveFieldBehavior()`（返回 `{required, readOnly, nullable, primaryKey}`），表单校验与 `buildFormItems` 都用它，勿各处散写 `f.nullable===false`。
- **`mapField` 非空 ⇒ 映射字段 ⇒ 用下拉展示，该值就是原始字段名（核心契约）**：`DataField.mapField` 非空即表示该字段是「映射/显示名」字段（如 `TenantName`），**必须用下拉列表**渲染；`mapField` 的值即真实存储字段（如 `TenantId`）。前端据此三件事：① `isMappedField(f)` 判定，**不要额外要求 `mapField` 以 ID 结尾**（契约是「非空即映射」）；② `mappedFieldName(f)` 取原始字段名；③ `lookupBaseName(f)` 对映射字段**一律以 `mapField` 值为准**去 ID/IDs 后缀（`TenantId→Tenant`、`RoleIds→Role`），于是 `RoleName`(RoleID) 与 `RoleNames`(RoleIds) 共用同一个 `Role` 字典，不重复拉取。控件按原始字段名细分：`xxxIDs/xxxIds`→`multi-select`（`RoleNames`）、`ParentID`→`tree-select`（`ParentName`）、其余→`select`。多值判定统一走 `isMultiValue(f)`，供 `labelOf` 的「、」拼接、`t-select multiple`、详情标签组共用。详见 `references/field-renderers.md` §3.6。
- **字段选型要按真实 `typeName`/`itemType`/`mapField` 判定，勿只看字段名（高频坑）**：真实 NewLife.Cube 的 `GetPage` 字段描述符是 **camelCase + 丰富属性**，远不止 `name/displayName/type`：`typeName`（基础类型 `Int32/String/Boolean/Double/DateTime/Int64`，**也可能是枚举类型名**如 `DepartmentTypes/SexKinds/MenuTypes/DataScopes/RoleTypes`）、`itemType`（特化编辑器 `html/mail/mobile/TimeSpan`）、`mapField`（外键关联真实字段，`TenantName→TenantId`、`RoleNames→RoleIds`）、`lovCode`（关联源编码，如 `Role`）、`category`（分组，camelCase，可能为空串或 `null`）。**典型误判**：以为 `Sex` 是 Boolean（实际 `typeName=SexKinds` 枚举→应下拉）；以为 `RoleIds` 是普通 String（实际是复数外键→应多选下拉）；忽略 `itemType=html` 的 `Remark`（应富文本）。落地前务必 `curl` 真实 `GetPage` 统计一遍 `typeName` 全量取值再写规则。判定优先级见 `references/field-renderers.md` §1（itemType → Boolean → xxxIDs → 枚举 → xxxID → map → 基础类型兜底）。
- **TDesign `t-table` 的 `col.cell` 回调签名是 `(h, params)`，不是 `({ row })`（高频坑，实测崩溃）**：`fieldRender.buildColumns` 生成列表列时若给列传了 `cell` 渲染函数，**必须写成 `(_h, params) => ...` 并取 `params.row`**，绝不能写成 `({ row }) => ...`。原因：TDesign 1.20.x 内部实现 `col.cell(h, params)`（`tr.mjs` 的 `renderCell`），**第 1 个参数是渲染函数 `h`，第 2 个才是 `{ row, rowIndex, col, colIndex }`**。若写成 `({ row })`，实际是在解构 `h`（一个函数），`row` 恒为 `undefined`，一旦访问 `row[xxx]` 就抛 `TypeError: can't access property "xxx", row is undefined`（报错栈 `cell fieldRender.ts` + `renderCell tr.tsx`）。**典型现象**：任何含映射/布尔列（`Sex`/`Enable` 等）的列表页整页崩溃白屏。**务必** `cell: (h, params) => labelOf(f, params?.row?.[key], lookups)` 并用 `?.` 防御 `params.row` 为 `undefined`。`assets/fieldRender.ts`（`buildColumns`）已按此修正。
- **TDesign `t-tabs` 在「activeTab 与任何 panel 都不匹配」的空/未就绪状态渲染，会在切换 tab 时崩溃（高频坑，实测 TypeError: can't access property "parentNode", node is null）**：`t-tabs` 的导航栏（`t-tab-nav`）把「nav 项数组」作为**片段（array 子节点）**渲染，active-bar（`t-tabs__bar`）是这个片段里的「锚点兄弟」。当 `panels` 从 **0 个 → N 个**（典型：schema 异步加载，首帧 `groups` 为空、`t-tabs` 已以 `activeTab='默认'` 渲染，随后 schema 到达 `groups` 变非空）时，Vue 在 `patchKeyedChildren` 里要把新建的 nav 项插入到 bar **之前**，而 bar 此刻 `el` 尚为 `null` → `hostInsert(child, container, anchor=null)` → `hostParentNode(null)` → 抛 `parentNode` 空引用（栈：`onTabChange2 tabs.tsx` → `useVModel` → `set value` → `componentUpdateFn` → `patchKeyedChildren`）。**修复**：① 用 `v-if="groups.length"` 包裹 `t-tabs`，**只在分组就绪（至少 1 个 tab）时才渲染**，绝不让 `t-tabs` 在空/未匹配状态存在；② `activeTab` 初值由 `watch(groups, immediate)` 设为首个分组 `category`，保证始终匹配某个 panel；③ panel 内容不要再用 `<template v-for>` 片段（改为 `v-for` 直接挂在真实 `t-form-item` 元素上），减少 tab 重渲染时的 keyed 片段 patch。`assets/FormDialog.vue` 已按此修正（`t-tabs` 加 `v-if="groups.length"` + 内容改为 `v-for` on `t-form-item`）。
- **表单字段按 `category` 分 tab + 横向网格布局**：新增/编辑表单字段多时，用 `fieldRender.groupFormItemsByCategory(items)` 把字段按 `category`（后端常为 PascalCase `Category`，读取时兼容 `category ?? Category`）分组成 tab；`category` 为空/空白 → 归入「默认」组且排在最前。每个 tab 内用 **2 列 CSS 网格**（`display:grid; grid-template-columns: repeat(2,1fr); column-gap:24px`）横向组织字段，宽字段（长文本 `textarea`、树形下拉 `tree-select`、日期时间 `datetime`）加 `grid-full`（`grid-column:1/-1`）占满整行。`t-form` 设 `label-align="top"` 适配网格。TDesign `t-tabs` 默认（`lazy=false`）**保留所有 tab 面板挂载**（仅切换 `display`），跨 tab 的 `t-form-item` 仍全部注册，校验 `formRef.validate()` 覆盖隐藏 tab 的必填项，无需特殊处理。`assets/fieldRender.ts`（`buildFormItems` 已输出 `category`/`full`、`groupFormItemsByCategory`）、`assets/FormDialog.vue`（tabs+grid 实现）已落地。
- **后端字段命名是 PascalCase，不是 camelCase（高频坑，曾致树状显示失效）**：`metadata-contract.md` 旧版称「ApiFilter 统一 CamelCase 序列化」，**与真实 NewLife.Cube WebApi 不符**——实测真实后端返回 **PascalCase**（`ID`/`ParentID`/`Name`/`CreateTime`），只有 Mock 演示是 camelCase。朴素「仅小写首字母」会把 `ID`→`iD`、`URL`→`uRL`、`ParentID`→`parentID` 的 `ID` 部分错成 `iD`，污染 `t-table row-key="id"`、列 `colKey`、外键回显与 `buildTree` 父子链接，表现为「表没树状显示 / 外键列显示原始 ID / 主键取不到」。**正确做法**：① `camel(name)` 用正则 `/^([A-Z]+)([a-z].*)?$/` 处理纯大写缩写（`ID/URL/IP`→`id/url/ip`，无后缀直接小写；有后缀 `ParentID`→`parentID`）；② `useEntityResource.normalizeRows(rows)` 在 `loadData/loadAll/getById` 处把**行 key 统一归一为 camelCase**（仅当检测到含大写开头 key 才真正拷贝，camelCase 数据原样返回）；列定义、`row-key`、`buildTree`、`FormDialog` 回填全部据此一致。`assets/useEntityResource.ts`（`camel`/`normalizeRows`）、`assets/fieldRender.ts`（`buildTree` 内 `camel(k)` 归一）已落地。
- **`extractListPayload` 绝不读 `list` 键，`loadSchema` 绝不取内联数据（固定契约：GetPage 只返回元数据，数据行在其他接口）**：契约固定——**GetPage 返回的只有字段描述符（元数据），不含数据行**；数据行一律由列表接口（裸 GET / Search / GetList / Index）返回，载体只可能是 `rows` / `page.rows` / `Page.Rows` / `data`。因此：① `extractListPayload` **只从四个数据载体取行、不读 `list` 键**，无数据载体一律返回空数组（否则当某端点只返回 `{ list:[字段] }` 时，字段描述符被当行数据，`t-table` 的 `name` 列渲染出 `row.name`=字段名如 `ClassName`/`parentID`，即“表格行显示字段 name”）；② `loadSchema` **不要尝试从 GetPage 提取内联首页数据**（`embeddedRows` 兜底是错误假设，已删除），schema 就只解析字段元数据。`assets/useEntityResource.ts`（`extractListPayload` 已删 `list` 兜底、`loadSchema` 已删内联提取）已落地。
- **多选 `t-select multiple` 的 `value` 必须为数组（高频坑：`can't access property Symbol.iterator, r is null`）**：TDesign 内部 `getMultipleContent` 用 `for...of` 遍历 `props.value`，收到 `null`/`undefined`/空串直接抛错。触发场景：新增记录（多值字段键缺失→`undefined`）、编辑记录（库中多值外键为 `null`，如 `RoleIds=null`）。**正确做法**：`deserializeMultiValue` 保证**永远返回数组**（`null`/`undefined`/空串→`[]`、已是数组→原样、逗号串→拆分去空项、单值 `'3'`→`['3']`）；`FormDialog` 的 `editId` watch 在清空表单后、回填前，先对所有 `it.multiple` 字段置 `[]`，避免首帧绑定 null。`assets/fieldRender.ts`（`deserializeMultiValue`）、`assets/FormDialog.vue`（防御初始化）已落地。
- **`<script setup>` 新增响应式 API 调用务必同步 import（高频坑：`ReferenceError: watch is not defined`）**：esbuild 打包**不校验未定义全局变量**，所以漏 import 的 `watch`/`computed`/`watchEffect`/`nextTick` 会**构建通过、运行期才崩溃**。典型现象：新增 `watch(() => res.rows.value, ...)` 后忘记在 `import { ... } from 'vue'` 补 `watch`，页面 setup 时抛 `ReferenceError: watch is not defined`。**正确做法**：每次在 `<script setup>` 里新用任一 Vue 响应式 API，立刻核对顶部 import 是否包含它。`assets/ListPage.vue` 已补 `watch`。
- **树形列表必须基于「完整数据集」构建（loadAll），不能用当前页（高频坑：树断链塌成平铺）**：分页只返回当前页，跨页的父子关系会让子节点找不到父节点 → 树断链、子节点丢失或整树塌平。实测部门等有层级实体尤甚。**正确做法**：新增 `useEntityResource.loadAll(params?)`（超大 `pageSize:10000` 一次性取全量，忽略前端分页 UI），`ListPage` 的 `init`/`onSearch`/`onSortChange`/`onSaved`/`onDelete` 树形一律走 `loadAll`、非树走 `loadData`；树形 `ParentID` 列经自构建 `selfLookups['Parent']`（id→name）回显父级名称（而非原始 ID）。`FormDialog` 的 `ParentID` 树形下拉同样取全量（排除自身）。`assets/useEntityResource.ts`（`loadAll`）、`assets/ListPage.vue`（树形重载统一 `reloadAfterMutation`）、`assets/FormDialog.vue` 已落地。
- **树形判定必须聚合全部字段组 + 认 `mapField=ParentID`（高频坑：元数据有 ParentID 却不走 treeTable）**：`isTreeSchema`/`selectListComponent` 若只查 `schema.list` 里是否有名为 `ParentID` 的字段会**漏判**——NewLife.Cube 常把 `ParentID` 从列表列隐藏、仅以 `ParentName`（`mapField=ParentID`）映射列展示（实测 `Admin/Department` 的 list 组只有 `ParentName`，`ParentID` 仅在 search 组）。漏判 → 选成 flat 平铺表，用户看到「有 ParentID 却不树状」。**正确做法**：① `isTreeSchema` 判定条件扩展为「字段名=ParentID（不区分大小写）**或** `mapField=ParentID` 的映射字段（如 ParentName）」；② 判定输入用**全部字段组聚合**（list + addForm + editForm + detail + search），`ListPage` 的 `listComponent` 与 `useEntityResource.isTree` 都传聚合数组。`assets/fieldRender.ts`（`isTreeSchema`）、`assets/ListPage.vue`、`assets/useEntityResource.ts` 已落地。附验证：Department 全组聚合判定 True、真实 7 行数据 buildTree 得 2 根 + 5 子链。
- **树形表格必须用 `t-enhanced-table`，且 `:tree` 只传对象、勿写静态布尔（高频坑：Table 系不支持树形）**：**TDesign 文档明确「树形结构的表格请使用 EnhancedTable，Table/PrimaryTable/BaseTable 等不支持树形结构」**（官方示例代码注释即「!!! 树形结构 EnhancedTable 才支持，普通 Table 不支持 !!!」）。源码实证（tdesign-vue-next 1.20.7）：`table/index.mjs` 的 `Table = withInstall(cloneDeep(_PrimaryTable), "TTable")`（`t-table` 实为 PrimaryTable）；`tree` prop 只存在于 `enhanced-table-props.mjs`；`useTreeData` hooks 仅被 `enhanced-table.mjs` 引用。**用 `t-table` 渲染树形时 `tree` prop 被静默忽略 → 子节点不显示/只平铺根节点**。**正确做法**：① 树形分支用 **`<t-enhanced-table>`**（列/分页/事件与 `t-table` 一致）；② **`:tree` 只传对象**（如 `:tree="{ childrenKey: 'children', defaultExpandAll: true, treeNodeColumnIndex: 0 }"`）——EnhancedTable 以 `props.tree` 为**非空对象**判定树形（`enhanced-table.mjs`：`isTreeData = !props.tree || !Object.keys(props.tree).length`），**不要同时写静态 `tree` 布尔**（prop 合并歧义）；③ `defaultExpandAll: true` 让子节点开箱即见（否则默认收起）；`childrenKey` 与 `buildTree` 产出的 `children` 键一致（官方默认 `children`，可用 `tree.childrenKey` 定义别名如 `list`）；`treeNodeColumnIndex` 指定第几列作树形操作列（默认 0=首列，展开图标落在该列）；`tree.indent` 设置缩进。`assets/ListPage.vue`（树形分支 `t-enhanced-table` + `:tree` 对象）已落地。
- **`itemType=image` 字段三端统一用图像组件，表单支持上传（功能规范）**：字段元数据 `itemType === 'image'` 时：① **列表** `buildColumns` 对该列 cell 渲染 `t-image` 缩略图（`fit:cover` 48×48、圆角、cursor:pointer），点击 `window.open` 开大图，值空显示 `-`；② **详情** `DetailDrawer` 对 `isImage(f)` 用 `t-image`（`fit:contain` max 200×160、zoom-in 光标）点击开大图；③ **表单** `selectFormControl` 返回 `'image'`，`FormDialog` 渲染 `t-upload theme="image" accept="image/*" :max="1"`，**`requestMethod` 自定义上传**（`postApi` + `FormData('file', file.raw)`，绕开响应拦截器信封校验），兼容后端返回 `data` 为 URL 字符串或 `{url}` 对象，成功回写 `formData[字段]=url`（提交时随实体一起保存）；编辑时把已有 URL 回显为 `{name,url,status:'success'}` 文件列表。**上传端点（官方契约，高频坑）**：NewLife.Cube 官方前端（NewLife.CubeVue）的上传接口是 **`POST /{Area}/{Controller}/UploadFile(IFormFile file, String id, String title)`**（form-data 字段名 `file`；`id`=实体主键，编辑场景传主键关联已有实体、新增场景省略走临时实体路径；`title`=附件标题，传字段 displayName、为空后端回退 `entity.ToString()`；返回信封 `data.url` 或 `data={id,url}` 附件结构），**不是** `/api/Admin/Index/Upload` 这类全局端点。`uploadUrl` 默认值 = `/${area}/${controller}/UploadFile`（**不带 `/api` 前缀**，由 `postApi` 的 http 实例 baseURL 承载），经 `uploadUrl` prop → `VITE_UPLOAD_URL` 覆盖。**坑（实测 405）**：uploadUrl 若写成带 `/api` 前缀（如 `/api/Admin/Index/Upload`），`postApi` 会拼出 `/api/api/...` **双前缀**，后端路由错位 → 405 Method Not Allowed。**返回解析（实测真实结构）**：上传成功返回 `{code:0, message:null, data:{attId:"...", filePath:"/cube/image?id=xxx.png", contentType:"image/png"}}`——`code=0` 成功；`attId` 附件 id；**`filePath` 是附件经后端访问的相对路径（存表单字段、展示图片都用它）**；`contentType` 文件类型。兼容解析：`data` 直接是 URL 字符串 / `{url}` / `{id,url}` / `{attId,filePath,contentType}` / `{path}` 等（`url ?? Url ?? path ?? Path ?? filePath ?? FileName`）。**坑**：`filePath` 是 `/cube/...` 前缀（非 `/api`），必须给 Vite 代理加 `/cube`，否则浏览器把它当 SPA 路由返回 index.html → 图片 404（见 §七「代理 /api + /cube」）。**坑**：① 不要用 `t-upload` 的 `action` 原生上传（走不到项目 axios 拦截器，且 token 头/信封解析都要手工配）——统一用 `requestMethod`；② `requestMethod` 只收 file 拿不到字段名 → 模板用闭包 `:request-method="(f) => uploadRequest(item, f)"` 传入 item，才能拼 `title` 参数；③ 表单 `imageFiles`（t-upload v-model）与 `formData[字段]`（URL 字符串）是两套值，editId watch 清空/回填时**同步初始化**，`on-success` 写回 URL、`on-remove` 清空，勿只更新其一导致提交丢值或回显失效；④ 图像字段在 2 列网格里占整行（`full:true`）。`assets/fieldRender.ts`（`'image'` 控件 + 列缩略图 cell + full）、`assets/FormDialog.vue`（`t-upload` + `uploadRequest(item,file)` 拼 id/title + `onUploadSuccess`/`onUploadRemove` + 回填）、`assets/DetailDrawer.vue`（`isImage`/`openImage`）、`assets/ListPage.vue`（透传 `uploadUrl`）已落地。
- **`itemType=mail` 表单页必须加 email 格式校验（功能规范，遵循铁律 R2 优先用内置规则）**：`selectFormControl` 对 `itemType==='mail'` 已返回 `'email'`（渲染 `t-input type="email"`），但**仅 `type="email"` 不触发校验**——必须同时在 `FormDialog` 的 `rules` 里为该字段追加 `{ type:'email', message:'xx格式不正确' }`（async-validator 内置邮箱类型）。**要点**：① 与必填规则**叠加**（先 `required` 后 `type:'email'`，两者可并存于同一字段的规则数组）；② 对**非必填**字段的空值（`undefined`/`''`）自动跳过 `type:'email'` 校验，因此「可选邮箱留空」不会误报格式错误，无需自己判空；③ **铁律 R2**：TDesign/async-validator 内置的校验类型（`type:'email'`、`required`、`len/min/max/pattern`、TDesign 扩展 `telnumber`/`idcard` 等，见 `form-model.mjs` 的 `VALIDATE_MAP`）**必须优先使用**，不得手写正则/自定义 validator 重复实现；内置无法满足业务语义时才自定义并注明原因；④ 只对 `itemType==='mail'` 追加，普通 String 字段不做邮箱校验。`assets/FormDialog.vue`（`rules` computed 按 itemType 追加 email 规则）已落地。
- **`itemType=mobile` 表单页必须加手机号校验——用 TDesign 内置 `telnumber` 规则（功能规范，遵循铁律 R2）**：`selectFormControl` 对 `itemType==='mobile'` 已返回 `'tel'`（渲染 `t-input type="tel"`），但**仅 `type="tel"` 不触发校验**——必须同时在 `FormDialog` 的 `rules` 里追加 `{ telnumber: true, message:'xx格式不正确' }`。**要点**：① **TDesign 内置了 `telnumber` 校验**（`/^1[3-9]\d{9}$/`，中国手机号），见 `tdesign-vue-next/es/form/utils/form-model.mjs` 的 `VALIDATE_MAP`——按铁律 R2 **必须用内置规则**，勿手写正则/自定义 validator；② 内置的 `telnumber`/`idcard` 等非标准 async-validator 类型在 `VALIDATE_MAP` 里，同样可用；③ 与必填规则**叠加**（`required` + `telnumber` 并存）；④ 非必填字段空值自动跳过格式校验，可选手机号留空不误报。`assets/FormDialog.vue`（`rules` computed 按 itemType 追加 email/telnumber 规则）已落地。
- **外键/ParentID 字典查找大小写不敏感（兼容 PascalCase 后端）**：`useLookups` 写字典键、后端返回键可能 PascalCase（`Parent`/`Role`），而 `lookupBaseName` 产出 camelCase（`parent`/`role`），直接 `lookups[lookupBaseName(f)]` 会大小写失配、外键列回显不出名称。**正确做法**：`fieldRender.lookupDict(lookups, base)` 按 `base.toLowerCase()` 在 `lookups` 键里模糊匹配命中（`Parent`/`parent` 通吃），`labelOf`/`resolveOptions` 统一走它。`assets/fieldRender.ts` 已落地。
- **进入列表页后「页面多次自动刷新」（高频坑，四层根因 + 多层防御）**：典型现象——点菜单进入列表页，Network 里连发多个 GET、表格反复重渲染/抖动。先排除 TDesign 分页器：读 `tdesign-vue-next/es/table/hooks/usePagination.mjs` 与 `pagination/pagination.mjs` 可知，`page-change`/`onChange` **只在用户点击翻页/改每页条数时**由 `toPage` 发出，`toPage` 有 `if (toPageCurrent === innerCurrent.value) return;` 守卫，本地分页只更新内部 `dataSource` 不回发。**故 TDesign 不会因 pagination 对象身份变化而自动回发 page-change**，真正诱因是以下四个、需逐个加防御：① **候选列表端点回退探测连发多 GET**：`loadData` 依次试 `''`/`/Search`/`/GetList`/`/Index`，裸 GET 404 时会连发 2~4 个 GET，视觉上就是「多次刷新」。正确做法：`useEntityResource` 内用模块级 `let discoveredListEndpoint` 缓存首次命中的端点，命中后把它放候选数组最前（`[discoveredListEndpoint, '', '/Search', '/GetList', '/Index']`），后续直连不再逐个回退。② **路由视图 `:key="route.fullPath"` 致组件重挂载**：query/hash 任何变化（含重复导航）都会改变 `fullPath` → `<component :key>` 变 → 整页销毁重建 → `onMounted(init)` 再跑一遍 → 再发请求。正确做法：把 key 改为 `route.path`（同实体页仅依赖 path，query/hash 抖动不重挂）。③ **`onNavigate` 重复 `router.push`**：菜单 `url` 归一化后与当前 `route.path` 相同仍执行 `push`，触发 ② 的重挂链。正确做法：`onNavigate` 归一化菜单 url 为 `/Area/Controller`（取前两段，兼容 `/Admin/User`、`/api/Admin/User`、`Admin/User/Index`），`if (clean === route.path) return;` 去重。④ **`pagination` 用「每次返回新对象的 computed」引发对象身份抖动**：`t-table` 每次重渲染都收到新 pagination 引用，可能触发分页器反复重渲染/抖动。正确做法：`pagination` 改为**稳定 `reactive` 对象**，再用 `watch(() => res.pagination.value, ...)` **原地赋值**（`pagination.current = pg.current`…），引用永远不变；`onPageChange` 加 no-op 守卫（`if (page.current === res.pagination.value.current && page.pageSize === res.pagination.value.pageSize) return;`），页码/每页条数未变则忽略，杜绝程序化重复触发。`init` 再加幂等守卫（`let initialized = false; if (initialized) return; initialized = true;`），保证同一挂载实例只加载一次。`assets/ListPage.vue`、`assets/useEntityResource.ts`、`references/scaffold/src/layouts/BasicLayout.vue` 均已落地上述修复。
- **`buildColumns` 内 `const` 前向引用致列表列全丢（TDZ，高频坑）**：`fieldRender.buildColumns` 的 `.map()` 回调里，若在 `isMapped` 复合行**提前引用**某个尚未声明的 `const` 标志（如 `isLovList` 由 `lovTypeOf(f) === 'list'` 派生，却声明在 `isMapped` 之后），触发 `ReferenceError: can't access lexical declaration 'isLovList' before initialization`（暂时性死区）。错误发生在 `.map()` 内会让整个列数组构建中断——只有 `ListPage` 单独追加的**操作列残留**、其余数据列全部消失，且接口明明有返回数据。正确做法：凡由 `lovTypeOf(f)` / 函数派生的 `is*` 标志，**必须声明在 `isMapped` 复合行之前**；`lovTypeOf` 等顶层函数声明可提升、无此问题。`assets/fieldRender.ts`（与 `references/demo/src/api/fieldRender.ts`）已修正 `isLovList` 上移。
- **`FormDialog` 日期范围控件（daterange/datetimerange）落到实体单列，存「开始,结束」逗号串（与搜索栏 dtStart/dtEnd 语义不同，务必分清）**：`selectFormControl` 对 `itemType==='daterange'`/`'datetimerange'` 返回 `'daterange'`/`'datetimerange'`，`FormDialog` 用 `<t-date-range-picker>` 渲染（datetimerange 加 `enable-time-picker`，`value-type` 分别为 `YYYY-MM-DD` / `YYYY-MM-DD HH:mm:ss`），**控件值恒为 `[start, end]` 数组**。**关键坑（与搜索栏差异）**：① 表单页实体只有一列，不能像搜索栏那样拆成 `dtStart`/`dtEnd` 两个查询参数（后端会忽略非列参数）——提交前由 `serializeRangeValue` 把 `[start,end]` 数组转成 `"start,end"` 逗号分隔字符串存实体单列；② 回填时 `deserializeRangeValue` 把字符串/数组还原为数组（空值→`[]`、单值→`[v,v]`），`FormDialog` 首帧把 range 字段初始化为 `[]`，避免 `t-date-range-picker` 绑定 `null`/`''`/`undefined` 时内部 `value[0]`/`value[1]` 访问崩溃（与多选控件同理）；③ `buildFormItems` 对 range 控件**不写 `maxlength`**（range 值非字符串）；④ range 与 multi/lov-table 并列归入 `full`（占整行栅格）。`assets/fieldRender.ts`（`isRangeControl`/`serializeRangeValue`/`deserializeRangeValue`）、`assets/FormDialog.vue`（两个 `t-date-range-picker` 分支 + 首帧 `[]` 初始化 + 回填 `deserializeRangeValue` + 提交 `serializeRangeValue`）已落地。`ListSearchBar` 的 daterange 仍按 `dtStart`/`dtEnd` 两查询参数映射（见 §4.13），两者契约**不可混用**。
- **⚠️ TDesign 表格没有 `<t-column>` 组件——columns 配置式 API，Element Plus 风格子组件写法被静默忽略（高频坑，实测「列表页无数据」）**：**tdesign-vue-next 的 `t-table` 是 `columns` 配置式 API**（实证：`node_modules/tdesign-vue-next/es/table/` 目录下**无任何 column 子组件**，列只存在于 `columns` prop / `PrimaryTableCol` 定义里）。若照 Element Plus 习惯在模板里写 `<t-column title=".." col-key=".."><template #cell>`，Vue 会把它当**未知元素静默忽略**（运行时不报错、控制台不警告）→ 表格没有任何列 → **表体空白**；而**分页器独立于列渲染**，仍正常显示「共 N 条」——「分页器有数、表体空白」就是**列未被注册**的典型特征（接口数据其实已进入 state，只是没有列可渲染）。**正确做法**：① 列全部改为 `:columns="columns"` 配置数组（`{ title, colKey, width, cell? }`）；② 自定义单元格用 `cell` 渲染函数 `(_h, params) => h(Tag, {...}, () => ...)`（**签名 `(h, params)`**，见下方 cell 回调坑），需要的组件直接 `import { Tag, Link, Space } from 'tdesign-vue-next'` 用 `h()` 挂载；③ 排查方法：先查 `node_modules/tdesign-vue-next/es/<组件目录>/` 有无对应子组件文件，不存在即说明该组件只支持配置式/事件式用法。本项目 ArticleList/CategoryList/TagList 三个列表页均踩此坑，已改为 columns 配置修复（commit 2e48095）。
- **⚠️ `@wangeditor/editor-for-vue` 禁止把钩子放进 `defaultConfig`（高频坑，粘贴即抛错）**：包装层在运行时检测 `props.defaultConfig.customPaste` 等钩子，一旦存在即抛 `Error: 请使用 '@customPaste' 事件，不要放在 props 中 / Please use '@customPaste' event instead of props`（源码 `genErrorInfo()` 写死文案；**触发时机是用户粘贴时**，创建编辑器不报错，故容易漏测）。受影响钩子全集：`customPaste`/`onCreated`/`onChange`/`onDestroyed`/`onMaxLength`/`onFocus`/`onBlur`/`customAlert`。**铁律：钩子一律走模板事件**（`@on-created` / `@on-change` / `@custom-paste` / `@custom-alert`），`defaultConfig` 只放纯配置（`placeholder`/`MENU_CONF`/`readOnly` 等）。`customPaste` 事件签名 `(editor, event, callback)`：处理完自定义逻辑后 `event.preventDefault()` + `callback(false)` 阻止默认粘贴、`callback(true)` 放行（返回值 false 亦可阻止）。典型用途——粘贴 Markdown 自动转富文本：检测剪贴板 `text/plain` 像 Markdown 且无 `text/html` → `editor.dangerouslyInsertHtml(markdownIt.render(text))` + `callback(false)`。本项目 RichEditor.vue 曾把 `editorConfig.customPaste = ...` 写进 defaultConfig 导致生产站每次粘贴抛错且功能失效，已改为 `@custom-paste` 事件修复（commit 3406d4c）。
- **⚠️ TDesign `<t-form>` 的 `@submit.prevent` 会抛 `e.preventDefault is not a function`（高频坑，实测崩溃）**：`<t-form>` **不是原生 `<form>` 元素**，它**不发射原生 DOM submit 事件**，而是发射 TDesign 自定义 `submit` 事件，回调参数为 `{ validateResult, firstError, e }`（`e` 才是原生 event）。Vue 模板里写 `@submit.prevent="onSubmit"` 时，`.prevent` 修饰符会让 Vue 把**整个自定义对象**当原生 event 去调 `.prevent()` → 该对象无 `preventDefault` 方法 → 抛 `TypeError: e.preventDefault is not a function`（栈：`prevent runtime-dom.esm-bundler.js` → `onSubmit form.tsx`）。**修复（二选一）**：① **最简**：改 `@submit="onSubmit"`（**去掉 `.prevent`**）——TDesign `t-form` 内部已阻止原生表单提交与页面刷新，`onSubmit` 不需要、也不应使用原生 event；② 若确需原生 `preventDefault`，回调解构出 `e`：`onSubmit({ e }: any){ e?.preventDefault() }`，不要直接对首个参数调 `.prevent()`。**注意**：`onSubmit` 自身若不使用 event（绝大多数登录/提交场景），直接 `@submit="onSubmit"` 最干净。其它用 `type="submit"` 按钮 + 自定义 `@click` 提交（不经 `@submit`）的表单不受影响。本项错误写法曾出现在个人博客 Login.vue，已修正为 `@submit="onSubmit"`。

- **📦 前端工程实践聚合（Vite / npm / 构建 / 脚手架 / 请求层，实测于 NewLife.Cube WebApi + Vue3 + TDesign 个人博客项目）**：以下前端专属落地细节统一归口本 skill（与 `cube-webapi-backend` 第十四节后端契约互补，避免前后端知识错置）：
  - **Vite 代理 target 必须 `127.0.0.1` 而非 `localhost`**：Windows 沙箱下 `localhost` 间歇 502（DNS 解析问题）。代理 `/api /Auth /Mfa /cube /Content` → `http://127.0.0.1:<后端端口>`（注：本 skill 319 行搜索栏段亦提及同坑，两个方向恰好相反——代理 target 用 127.0.0.1、浏览器入口用 localhost，排查先 `netstat` 确认监听协议栈）。
  - **npm registry 卡死**：默认 registry 在沙箱/国内环境会**长时间无进展**（实测 21 分钟 0 输出）。改用 `npm install --registry=https://registry.npmmirror.com`（2 分钟装完）。`rm -rf node_modules` 触发沙箱批量删除拦截，**不要强删**，直接重试 install 增量对齐。
  - **TDesign 全量引入 chunk 过大**：`npm run build` 报 chunk >500KB。Vite `build.rollupOptions.output.manualChunks` 拆 `vue`/`tdesign`/`markdown`/`axios` 独立 vendor，消除告警并改善缓存。
  - **生产 base 路径**：部署到子路径（如 `/blog/`）时 `vite.config.ts` 设 `base: '/blog/'`，`createWebHistory('/blog/')` 同步，Nginx 按子路径反向代理（前端 `/blog` + 后端 `/blog/api`）。
  - **删除确认用 `DialogPlugin.confirm`** 而非 `window.confirm`（TDesign 规范、可定制文案、可防误删）。
  - **SQLite 并发死锁 → 首页加载转圈**：后端 SQLite 同页 3+ 并发查询会死锁（busy timeout 不够），前端表现为列表永远 loading。**前端规避**：串行发请求（先 `loadMeta()` await 完再 `loadArticles()`），勿 `Promise.all` 并发打同库多接口；治本可在后端连接串加 `Busy Timeout=15000`（见 `cube-webapi-backend` 第十二节）。
  - **富文本编辑器选 `@wangeditor/editor-for-vue@5` + Markdown 粘贴兼容**：博客/内容站需要在「富文本可视化编辑」与「Markdown 源码粘贴」之间兼容。做法：① 安装 `@wangeditor/editor@^5.1.23` 与 `@wangeditor/editor-for-vue@^5.1.12`；② 封装 `RichEditor.vue`，`v-model` 接收/输出 HTML 字符串；③ 编辑器图片上传用 `editor.getConfig().MENU_CONF['uploadImage'].customUpload`，内部调项目封装的 `postApi('/{Area}/{Controller}/UploadFile', formData)`（字段名 `file`），成功后 `insertFn(filePath)`；④ Markdown 粘贴转富文本：**用 `@custom-paste` 事件绑定**（切勿写进 `defaultConfig.customPaste`，包装层会在粘贴时抛错，见 §七专条）——事件回调 `(editor, event, callback)` 里检测剪贴板 `text/plain` 像 Markdown 且无 `text/html` → `editor.dangerouslyInsertHtml(markdownIt.render(text))` + `callback(false)`；⑤ 详情渲染组件做 HTML 直通：检测到内容以 `<` 开头即 `v-html`，否则走 `markdown-it` 渲染旧数据，保证历史 Markdown 文章不破。
  - **wangEditor v5 内容注入契约（无源码模式，实测）**：① v5 **没有「源码模式」**，把 HTML 写入编辑器只有两条路——真实 Ctrl+V 粘贴富文本（`text/html` 剪贴板数据），或代码 `editor.setHtml(htmlString)`；② **合成 `ClipboardEvent('paste')` 派发不生效**（wangEditor 内部粘贴处理不响应合成事件），端到端验证必须真实键盘粘贴；③ 粘贴会**过滤 `<video>`**（`<img>` 正常）——视频需在编辑器工具栏放开 `group-video` 菜单 + 配置 `MENU_CONF['uploadVideo']` 走 UploadFile 上传后插入，或 `setHtml` 注入；④ 外部文章转 wangEditor 发布时，div 卡片/网格/flex 布局会被拍平成段落，须重构为编辑器原生元素（h1-h5/p/blockquote/table/ol/ul/img + span 内联 style），CSS `<style>` 块会被丢弃须全内联（完整转换流程已沉淀在 `inline-html-for-wangeditor` 技能）。
  - **请求层三件套（可直接拷贝，Vue3 + TS + axios + TDesign）**：构成「请求 + 鉴权 + 大小写归一」最小闭环。
    - `src/utils/camel.ts` —— PascalCase→camelCase 递归归一（缩写白名单 `ID/URL/API/HTTP/IP`，连续大写段除末位转小写兜底）：
      ```ts
      const ABBR: Record<string, string> = { ID: 'ID', URL: 'url', API: 'api', HTTP: 'http', IP: 'ip' }
      function camelKey(key: string): string {
        let s = key.charAt(0).toLowerCase() + key.slice(1)
        for (const [up, low] of Object.entries(ABBR)) s = s.replace(new RegExp(up, 'g'), low)
        s = s.replace(/([A-Z]{2,})(?=[A-Z]|$)/g, (m) => m.slice(0, -1).toLowerCase() + m.slice(-1))
        return s
      }
      export function camelize(value: any): any {
        if (Array.isArray(value)) return value.map(camelize)
        if (value && typeof value === 'object') {
          const out: any = {}
          for (const k of Object.keys(value)) out[camelKey(k)] = camelize(value[k])
          return out
        }
        return value
      }
      ```
    - `src/api/token.ts` —— JWT 存取 + 解析用户名（`localStorage` 键如 `blog_token`；JWT payload base64url 解析 `sub`）：
      ```ts
      const KEY = 'blog_token'
      export const getToken = () => localStorage.getItem(KEY) || ''
      export const setToken = (t: string) => localStorage.setItem(KEY, t)
      export const clearToken = () => localStorage.removeItem(KEY)
      export const isAuthed = () => !!getToken()
      export function getUsernameFromToken(): string {
        const t = getToken(); if (!t) return ''
        try {
          const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
          const json = JSON.parse(decodeURIComponent(escape(atob(p)))
          return json.sub || json.name || ''
        } catch { return '' }
      }
      ```
    - `src/api/http.ts` —— axios 实例 + 拦截器（注入 `Authorization: Bearer`、响应 `camelize`、401 清 token 跳登录；信封 `code!==0` 抛错）：
      ```ts
      import axios, { AxiosInstance } from 'axios'
      import { getToken, clearToken } from './token'
      import { camelize } from '@/utils/camel'
      const http: AxiosInstance = axios.create({ baseURL: '/', timeout: 15000 })
      http.interceptors.request.use((cfg) => {
        const t = getToken(); if (t) cfg.headers.Authorization = `Bearer ${t}`; return cfg
      })
      http.interceptors.response.use((resp) => {
        const body = resp.data
        if (body && typeof body.code === 'number' && body.code !== 0)
          return Promise.reject(new Error(body.message || `错误码 ${body.code}`))
        resp.data = camelize(body); return resp
      }, (err) => {
        if (err.response?.status === 401) { clearToken(); if (location.pathname !== '/login') location.href = '/login' }
        return Promise.reject(err)
      })
      export const getApi = (u: string, p?: any) => http.get(u, { params: p }).then((r) => r.data)
      export const postApi = (u: string, d?: any) => http.post(u, d).then((r) => r.data)
      export const putApi = (u: string, d?: any) => http.put(u, d).then((r) => r.data)
      export const deleteApi = (u: string, p?: any) => http.delete(u, { params: p }).then((r) => r.data)
      ```
    > 注意：本三件套只处理**信封与字段名**；分页/门户两种 `data` 形状差异（实体列表 `data` 数组 + 独立 `page`、门户列表 `data` 为 `{items,...}`）仍在业务层分支处理。后端契约（登录 `access_token` snake、响应 PascalCase、路由 `Detail?id=`）见 `cube-webapi-backend` 第十四节。

- **登录契约以《Doc/Api/认证接口设计.md》为权威，SPA 用 `/Auth/Login`（非 `/Admin/User/Login`）（高频坑：端点偏差会静默登录失败）**：该文档明确——**当前版本 SPA 登录接口是 `POST /Auth/Login`**（不带 `/api`，由 `AuthController` 提供）；`/Admin/User/Login` 仅**保留**给 MVC 皮肤与 SSO 回调，**不是** TDesign SPA 的登录端点。请求体字段名是 **`username`**（不是 `userName`）；**响应令牌字段名不统一（snake/camel/Pascal 都可能）**：真实运行的后端 `/Auth/Login` 返回 **`data.access_token` / `data.refresh_token` / `data.expire_in`**（snake_case），而文档/旧版契约可能写 `accessToken`/`AccessToken`（驼峰/Pascal）。**不要硬编码单一字段名**，统一在 `normToken` 三向兜底（`o.accessToken ?? o.AccessToken ?? o.access_token`）。密码登录是否走 Challenge-Response 严格以 `LoginConfig.security.challengeRequired` 为准（`true`=加密/`false`=明文），不要环境假设。登录页 `onMounted` 须拉 `GET /Auth/LoginConfig` 取 `name`/`copyright`/`login`(开关)/`oauth`/`security`，按开关渲染密码/短信/邮箱 Tab、忘记密码、OAuth、注册、版权。MFA：`code=0 & 无 accessToken & message 以 mfa_required: 开头` → 进 `/Mfa/Verify` 二步验证。**正确做法**：`assets/auth.ts` + `references/demo/src/pages/LoginView.vue`（登录页模板实际位于 demo 工程，`assets/` 下无此文件） 已按此契约落地（`normToken` 三向归一）；改登录相关代码时**勿回退**到旧 `/Admin/User/Login`+`userName` 写法（那是已被取代的旧约定）。若你的真实后端确为老式 `Admin/User/Login`+`access_token`，则**以后端为准**，但需显式标注、不要混用两套字段名。

- **登录页必须按 `LoginConfig` 全字段动态组装，静态资源走 `/Content`（高频坑）**：登录页左栏系统名、`loginLogo`/`logo`、登录背景 `loginBackground`、登录方式开关（`login.password/sms/mail/captcha`）、注册入口（`register.enabled`）、第三方登录（**实测真实后端键名为 `oAuth`（大写 A），文档写全小写 `oauth`**——只按文档读 `config.oauth` 会导致按钮不渲染；统一读 `config.oAuth`，`getLoginConfig` 内已双向归一）、版权（`copyright` 含 HTML 链接，用 `v-html` 渲染）、备案号（`registration`）全部由 `GET /Auth/LoginConfig` 返回驱动，**前端不得硬编码**文案/Logo。后端返回的静态资源路径（Logo/背景/OAuth 图标）一律落在 **`/Content` 目录下**（如 `/Content/images/logo/NewLife.png`），**无需登录即可公开访问**；前端 `vite.config.ts` 须把 `/Content` 也加入 dev 代理（与 `/api`/`/Auth`/`/Mfa`/`/cube` 并列）转发到后端，否则浏览器把 `/Content/...` 当 SPA 路由返回 `index.html` → 图片 404。**切忌**给这些路径加 `/api` 前缀或当 SPA 路由。`security.passwordComplexity=true` 时表单下展示密码强度规则（`security.passwordStrength` 正则）；`register.requireMailVerify`/`requireMobileVerify` 控制注册校验。`references/demo/src/pages/LoginView.vue`（登录页模板实际位于 demo 工程，`assets/` 下无此文件） 已按此动态组装落地（Logo 回退：有 `loginLogo`/`logo` 走 `<img>`，否则系统名首字母方块；OAuth logo `onerror` 降级为文字）。

- **`security.challengeRequired` 严格以 LoginConfig 返回值为准：`true` 才走 Challenge-Response，`false`/缺省明文（高频坑：多余的挑战请求）**：登录是否加密由 `LoginConfig.security.challengeRequired` 决定，**不是**无条件请求。`/Auth/Challenge` 是取 RSA 公钥的公开端点；`challengeRequired===true` 时才请求 `/Auth/Challenge` 并用 RSA-OAEP/SHA-256 加密密码提交；`challengeRequired===false` 或该字段缺失时密码以明文提交（`challengeId` 留空），**不得再请求 `/Auth/Challenge`**（否则多发一次后端未启用的挑战请求、与配置自相矛盾，实测：config 返回 `challengeRequired:false` 登录仍请求 `/Auth/Challenge`）。正确做法：`loginWithPassword` 增加 `challengeRequired` 入参（**默认 `false`、`严格以 LoginConfig 为准`**），调用方传 `config.security?.challengeRequired === true`（而非 `!== false`），仅该值为 `true` 时加密；`false`/缺省**跳过**，直接明文。登录页说明文案同样按 `=== true` 切换「加密传输 / 明文提交」，措辞须写「根据 LoginConfig（challengeRequired=…）」，不可写成「本环境未启用」之类环境相关描述。`assets/auth.ts`（`loginWithPassword` 的 `challengeRequired` 参数门控，默认 `false`）+`references/demo/src/pages/LoginView.vue`（登录页模板实际位于 demo 工程，`assets/` 下无此文件）（`loginNote` 文案 + 调用传 `=== true`）已落地。

- **`security.mfaAvailable` / `passwordComplexity` 等同理严格以 LoginConfig 返回值为准（高频坑：页面/校验与后端开关脱节）**：`LoginConfig.security` 下的每个布尔开关都必须**直接驱动**页面与登录逻辑，禁止硬编码默认开启或「缺省即开」。① `mfaAvailable===true` 才允许进入二步验证步骤（即便后端误返回 `mfa_required` 也按失败提示，不进 MFA）；`false`/缺省不渲染 MFA。② `passwordComplexity===true` 且后端给出 `passwordStrength` 正则时，注册/重置密码**才**套该正则（TDesign 内置 `pattern`，R2 优先内置），同时仅在二者皆有时才显示复杂度提示文案（避免 config 缺 `passwordStrength` 时显示不匹配的提示）；`false`/缺省不强制复杂度（仅非空）。③ 登录方式/找回密码渠道同样严格：`login.sendCode===true` 或 `login.sms/mail===true` 才显示「忘记密码」入口与对应渠道（单选 radio 按 `channels` 动态生成，无可用渠道则禁用并回登录）；`login.captcha===true` 才渲染图形验证码；`register.enabled!==true` 直接回登录、不渲染注册表单；`register.requireMailVerify/requireMobileVerify===true` 才出现邮箱/手机字段。`references/demo/src/pages/LoginView.vue`（登录页模板实际位于 demo 工程，`assets/` 下无此文件）、`assets/RegisterView.vue`、`assets/ForgotPasswordView.vue` 均已按上述开关驱动。

- **`MenuSidebar` 菜单请求必须 `try/catch`，401 不可抛到外层（高频坑，Uncaught AxiosError）**：侧边栏 `onMounted` 调 `getRaw('/Admin/Index/GetMenuTree')` 拉菜单，**必须包 `try/catch`**——该请求 401（未登录/令牌失效）时，Axios 拒绝若无接收方会冒泡成 `Uncaught (in promise) AxiosError: Request failed with status code 401`（控制台红错，且渲染链被打断）。`api.ts` 拦截器本就会处理 401（清 token + 跳 `/login`），故菜单加载器只需 **`catch` 中静默忽略 401、其余异常仅 `console.warn`**，绝不 `throw`。同因：任何 `onMounted`/`watch` 内的 `getRaw`/`getApi` 在未登录即可触发的请求都需 `try/catch`，否则一个未捕获 401 就崩整页。`assets/MenuSidebar.vue` 已落地（`catch` 静默 401）。

- **401 自动刷新令牌须排除认证端点 + 单飞守卫（高频坑：刷新死循环 / 并发重复刷新）**：`accessToken` 过期后前端应自动用 `refreshToken` 调 `POST /Auth/Refresh` 续期并重放原请求（`assets/api.ts` 响应拦截器已落地，对齐文档 §6 刷新令牌轮换）。三处必避雷：① **`/Auth/Refresh` 本身及全部认证端点（`/Auth/Login`、`/Auth/LoginConfig`、`/Auth/Challenge`、`/Mfa/*`）必须排除在刷新逻辑外**（`isAuthEndpoint` 判定）——否则刷新请求自己 401 又触发刷新，形成死循环；② **并发单飞守卫**（`refreshInFlight` 模块级 Promise）：多个受保护接口同时 401 时只真正刷新一次，其余复用同一结果，避免并发打爆 `/Auth/Refresh`；③ **刷新失败即跳登录**（`handleUnauthorized` 清令牌 + `location.href='/login'`，非 `router.push`、加 `pathname!=='/login'` 防循环），不再无限重试。登录/刷新/MFA 走 `rawHttp`（无 `/api` 前缀），这些端点自动绕开刷新分支。

- **`rawHttp` 端点（`/Auth/*`、`/Mfa/*`）不带 `/api` 前缀，dev 代理须显式转发，否则登录 404（高频坑）**：`auth.ts` 的 `rawHttp`（菜单 `/Admin/Index/GetMenuTree`、`/Auth/LoginConfig`/`Challenge`/`Login`/`Refresh`、`/Mfa/Verify`）与 `api.ts` 的实体 `http`（`/api` 前缀）是**两个独立 Axios 实例**。若 `vite.config.ts` 只配 `/api` 转发，`rawHttp` 请求被 Vite 当 SPA 路由 → 返回 `index.html` 或 404，表现为「登录页拉不到 `LoginConfig`、登录直接失败」。正确做法：代理同时含 `/api`、`/Auth`、`/Mfa`、`/cube`、`/Content`（目标统一指后端/Mock）；见 §4.3 与 §4.15。

- **改 Mock 后端 `backend/server.mjs` 后必须重启 Node 进程（高频坑：命中旧契约）**：Node 运行 `server.mjs` **不热更新**——改文件不杀旧进程，新请求仍由旧代码处理（典型：把 `oAuth` 改 `oauth` 后 curl 仍返旧键名，误以为前端没生效）。正确做法：改完先 `pkill -f "node backend/server.mjs"`（Windows `Stop-Process -Id <pid>`）杀旧 PID，再 `npm run mock` 重启；验证用 `curl :3001/Auth/LoginConfig` 直连确认契约已更新。同理 Vite `npm run dev` 端口（如 5173）被占时会顺延到 **5174**（以终端输出为准）——`curl` 验证须认准实际端口，否则命中旧 dev（其代理指向旧 Mock）造成「改了没生效」假象。

- **「源码明明改对了，错误却一模一样复现」→ 先怀疑 stale（陈旧）构建产物，而非继续改源码（高频坑第一名，实测反复发生）**：典型序列——修好 `src/api/auth.ts` 的 `category`、编译 0 错误，但页面报错照旧。**此时第一动作是核验「实际在被服务的那份产物」，不是继续读源码**：`grep -roE 'category:"[^"]*"|access_token|AccessToken' dist/assets/index-*.js`。实测真实案例：源码已是 `category: AuthCategory.Password`（=整数 0），`dist/assets/index-*.js` 里却仍 grep 到 `category:""`（旧 bug）——用户一直在跑修复前构建的 `dist`，于是 `$.category` 转换失败无限复现，**源码对了也白搭**。
  **验证闭环（改完登录/契约类代码必做四步，缺一即「改了没生效」）**：① `npm run build` 退出码 0；② **grep 产物**确认新逻辑关键字**存在**、旧 bug 关键字**不存在**（新包应有 `category:0`、`access_token`，且**无** `category:""`）；③ 浏览器**硬刷新**（Ctrl+Shift+R）；④ dev 模式则**重启 dev server 会话**（旧会话可能未热更）。
  **最快判定手段：用 node 直接跑归一化函数验证真实 payload**——把后端返回的真实 JSON 喂给 `normToken`，看输出 `accessToken` 是否非空，可立刻区分「前端解析 bug」「产物陈旧」「后端问题」三类根因：
  ```bash
  node -e 'const real={code:0,data:{access_token:"JWT.xxx",refresh_token:"REF.xxx",expire_in:0}};
  const normToken=d=>{const o=d??{};return{accessToken:o.accessToken??o.AccessToken??o.access_token??"",refreshToken:o.refreshToken??o.RefreshToken??o.refresh_token??"",expireIn:o.expireIn??o.ExpireIn??o.Expire??o.expire_in??0}};
  console.log(JSON.stringify(normToken(real.data)));'
  ```
  **契约铁律**：字段名以后端**真实 HTTP 响应**为唯一权威（本次实测令牌为 snake_case），靠 `normToken` 三向兜底，不硬编码单一命名——文档、dll 反射、旧契约都可能与运行中的后端不一致。

- **后端契约不要猜：从 NuGet 包 dll 反射导出枚举值与模型字段（权威实证方法，可复用工作流）**：魔方后端契约的三处关键事实（`AuthCategory` 只收整数、`LoginModel` 精确属性集、令牌实体字段命名）都是靠此法一次性确定的，比反复试错接口快一个数量级。当后端源码不可得、只有 NuGet 包时，用 **`System.Reflection.Metadata`（`PEReader` + `MetadataReader`）直接读 dll 元数据**——**切勿**用 `Assembly.LoadFrom`（目标框架/依赖不匹配会直接抛异常）：
  ```bash
  mkdir -p /tmp/enumdump && cd /tmp/enumdump
  cat > enumdump.csproj <<'EOF'
  <Project Sdk="Microsoft.NET.Sdk">
    <PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework></PropertyGroup>
  </Project>
  EOF
  # Program.cs 要点：
  #   var md = new PEReader(File.OpenRead(dll)).GetMetadataReader();
  #   枚举：遍历 TypeDefinitions，字段含 "value__" 即为枚举；跳过 value__，
  #         用 fd.GetDefaultValue() + md.GetConstant() 读常量（Int32 用 BlobReader.ReadInt32）
  #         → 得 AuthCategory: Password=0, Mobile=1, Mail=2, OAuth=3
  #   模型：打印 td.GetProperties() 的属性名
  #         → 得 LoginModel: Category/Username/Password/Remember/ChallengeId/Pkey/CaptchaId/CaptchaCode
  dotnet run
  ```
  dll 路径：`~/.nuget/packages/newlife.cube.core/<版本>/lib/<tfm>/NewLife.Cube.dll`。
  **关键推论（决定前端怎么写）**：若 dll 中**未注册 `JsonStringEnumConverter`**（魔方默认即如此），`System.Text.Json` 对枚举**只接受整数**——传 `"Password"` 或 `""` 一律 `code:-2` + `The JSON value could not be converted to ...`；前端**必须**定义 `export enum AuthCategory { Password=0, Mobile=1, Mail=2, OAuth=3 }` 并传整数。
  **注意**：dll 反射给出的是**程序内的 C# 属性名**（PascalCase），**不等于** HTTP 上的 JSON 键名——本项目实测 C# 是 `AccessToken`，实际 HTTP 却是 `access_token`。故 dll 反射用于确定**枚举值、字段有无、请求模型结构**（高可信），而**响应 JSON 键名必须抓真实 HTTP 响应确认**（见上一条 stale/normToken 陷阱）。两者互补，不可互替。

- **登录相关页调用 `auth` store helper，勿在组件内动态 `import('@/api/api')`（高频坑：构建告警 + 循环依赖）**：`ForgotPasswordView`/`RegisterView` 需 `resetPassword`/`registerUser` 时，应直接调用已注入的 `auth` store 方法，而非在组件内 `import('@/api/api')` 动态引入——后者触发 Vite 动态导入告警且易与 api 实例形成循环依赖。`assets/auth.ts` 已导出 `resetPassword`/`registerUser`/`sendCode`/`verifyMfa`，登录三页统一经 store 调用。

- **`Message.success/error` 报 `is not a function`（高频坑，会导致"登录成功不跳首页"）**：TDesign Vue Next 中 `Message` 是**组件**，`MessagePlugin` 才是**函数式调用对象**。`import { Message } from 'tdesign-vue-next'` 后调 `Message.success(...)` 会抛 `TypeError: Message.success is not a function`；若该调用处在 `try` 内、其后还有 `router.replace(...)` 等跳转逻辑，异常会中断 `onSubmit`，表现为"后端已返回登录成功、token 已写入 localStorage，但页面不跳首页、必须刷新才进"——刷新后应用重启读到 localStorage 的 token 直接进首页，极具迷惑性。**统一写法**：`import { MessagePlugin } from 'tdesign-vue-next'` 并 `MessagePlugin.success/error/warning/info(...)`。`app.use(TDesign)` 全量引入已自动注册 `MessagePlugin`，无需额外 `app.use`。本项目 `LoginView/SyncCenter/ListPage/FormDialog` 已全部修正为 `MessagePlugin`。

- **前端必须完整覆盖 NewLife.Cube 框架自带系统管理模块（避免"前端只做业务页、漏掉框架自带后台"）**：Cube 6.x 经 `AddCube()` 自动注册一组标准后台模块（Area=`/Admin` 与 `/Cube`），后端已就绪但前端常漏接。经实测可达的实体模块共 **9 个**（均为 `EntityController<T>`、返回完整 GetPage 五段式、可直接复用通用 `EntityPage` 零新增代码）：`/Admin/User`(用户)、`/Admin/Role`(角色)、`/Admin/Menu`(菜单)、`/Admin/Department`(部门)、`/Admin/Parameter`(参数/字典)、`/Admin/Log`(审计日志)、`/Admin/OAuthConfig`(OAuth 配置)、`/Admin/Tenant`(租户)、`/Cube/App`(应用)。Cube 6.x 已精简：**日志统一为 `Log`、字典/配置统一为 `Parameter`**，`Dic`/`Config`/`UserLog`/`VisitLog`/`TaskLog`/`RoleMenu`/`ModelNote`/`File`/`Stat`/`Index` 等返回 404（无需接入）。**接入方式**：只在 `BasicLayout` 菜单加"系统管理"组挂这 9 个链接（Area 大小写敏感：`/entity/Admin/User` 非 `/entity/admin/User`），通用 `EntityPage`（`/entity/:area/:controller`，props:true）直接消费 GetPage。**登录后首页应是系统仪表盘**（统计概览：并发 `GET /{area}/{controller}?pageSize=1` 取 `env.page.totalCount`），而非停在业务页。**Swagger 路径**：NewLife.Cube 的 Swagger UI 默认 `/Swagger`，但若后端 `Program.cs` 仅 `AddCube()` 未显式 `UseSwagger()`/`UseSwaggerUI()`，则 `/Swagger` 返回 404——需后端补 `app.UseSwagger(); app.UseSwaggerUI(c=>c.RoutePrefix="Swagger")` 并重启才可达；"通用挂载"可用接口探测等价确认，不依赖 Swagger。

## 八、推荐检查项

- [ ] 已用 `td-starter init` 创建工程并 `npm install`；
- [ ] `src/api/index.ts`（api.ts）、`permissions.ts`、`auth.ts`、`useEntityResource.ts`、`fieldRender.ts` 已落地；
- [ ] 三个基类组件（ListPage/FormDialog/DetailDrawer）已落地 `src/components/cube/`；
- [ ] 实体页仅传 `area`+`controller` 复用基类，未重复手写表格/表单；
- [ ] 含 `ParentID` 的实体页面自动走 treeTable（无需额外代码），且表单 `ParentID` 自动用树形下拉；
- [ ] **列表页 `xxxID` 字段显示映射后的名称**（map/dataSource/lookups），绝不显示原始 ID 数值；
- [ ] **表单页 `xxID` 字段渲染为映射源下拉**（map/dataSource/lookups 解析顺序一致）；
- [ ] **详情抽屉 `DetailDrawer` 同样经 `labelOf` 回显 `xxxID`/`ParentID` 映射名称**（非原始 ID），且遍历原始 `DataField[]` 而非 `buildFormItems` 输出；
- [ ] 组件/页面选型由后端字段元数据驱动（`selectListComponent`/`selectFormControl`），实体页未硬编码表格/控件类型；
- [ ] 新增/编辑/删除按钮按 `GetPage.setting`（enableAdd/isReadOnly）与菜单树显隐；
- [ ] 多租户请求头 `X-Tenant`（Code，主）+ `X-Tenant-Id`（兼容）已注入，切换器可用；`
- [ ] 令牌头 `Authentication` + `Authorization` 双头（值同为 token，兼容官方文档与实测后端）；**登录接口为 `POST /Auth/Login`（当前版本，见《认证接口设计》），请求体字段 `username`、响应令牌经 `normToken` 三向归一（`access_token`/`accessToken`/`AccessToken` 通吃，统一读 camelCase `accessToken`）；`/Admin/User/Login` 仅保留给 MVC 皮肤与 SSO 回调**；
- [ ] **登录页按 `LoginConfig` 动态组装**：系统名/`loginLogo`/`logo`/背景/`login` 开关/注册/**`oAuth`（实测真实后端大写 A；文档写小写 `oauth`，前端统一读 `config.oAuth` 且 `getLoginConfig` 双向归一）**/版权/备案号全部由 `GET /Auth/LoginConfig` 驱动，不硬编码；静态资源走 `/Content`（公开目录，已加 dev 代理），不得加 `/api` 前缀或当 SPA 路由（见 §七）；
- [ ] **`MenuSidebar` 菜单请求 `try/catch`**：`onMounted` 的 `getRaw('/Admin/Index/GetMenuTree')` 已包 `try/catch`，401 静默忽略（不抛 `Uncaught AxiosError`），见 §七；
- [ ] 纯 `xxxID` 外键（无 `map`/`dataSource`）经 `useLookups` 自动拉取关联实体 `Index` 组装 `lookups`，列表/表单/详情均能显示名称或下拉；关联不可达时退化为原始 ID 不阻断；
- [ ] 侧边栏菜单由 `MenuSidebar.vue` + `/api/Admin/Index/GetMenuTree` 渲染，且按设计系统落地（图标 + 激活态品牌色浅底/左 3px 强调条 + 手风琴），submenu `:value` 用唯一 path（url→id→层级路径）避免“点一个全展开”；
- [ ] 列表搜索栏由 `GetPage.search` 驱动，条件正确拼入 `Index` 请求；日期范围字段渲染为范围选择器并映射 `dtStart/dtEnd`；
- [ ] `Index` 响应的 `stat` 统计行已展示；
- [ ] 未把 `GetPage` 的 schema 误当行数据。
- [ ] **ConfigController<T> 单列处理**：`XxxSetting`/`XxxConfig` 类路由不走 `ListPage`（无 `GetPage` 但有 `GetFields`），改用专用 `ConfigView` 单表单页（`GetFields` 元数据驱动 + 静态/动态兜底），GET 单对象 / POST 回存，见 §4.17。
- [ ] **ControllerBaseX 非实体控制器单列处理**：`Db` 等继承 `ControllerBaseX`、无 `GetPage`、端点自定义的控制器，经 `EntityPage.vue` 的 `SPECIAL_CONTROLLERS` 注册表命中后渲染专属页（如 `DbView` 列表+备份+下载架构），不进 `ListPage`；数据取 `r.data` 数组（非 `extractListPayload` 包裹），见 §4.17 / §4.18。
- [ ] 设计令牌已落地：`src/styles/tokens.css` 在 `main.ts` 的 TDesign 样式之后引入，改色即全站（含组件）生效；
- [ ] 登录页左栏 / 布局 logo 使用 `--cube-brand-gradient-iot` 体现 IoT 主题；
- [ ] 编排层就位：BasicLayout（侧边栏 + 顶栏租户切换 + 用户菜单）、EntityPage 泛型页、LoginView 门禁、router 登录拦截 + 内置模块显式注册 + `:area/:controller` 兜底；
- [ ] Mock / 真实后端覆盖登录（`/Auth/Login` + `/Auth/LoginConfig`/`/Auth/Challenge` 等）、`/Mfa/Verify`、`/api/Admin/Index/GetMenuTree`、GetPage/Index/CRUD，契约与《认证接口设计.md》一致。
- [ ] **后端字段大小写**：`useEntityResource.camel`/`normalizeRows` 已就位，真实后端 PascalCase（`ID`/`ParentID`）被归一到 camelCase，`t-table row-key`、列回显、`buildTree`、`FormDialog` 回填一致（见 §七「后端字段命名是 PascalCase」）。
- [ ] **表格行不显示字段名 / GetPage 只取元数据**：`extractListPayload` 只从 `rows`/`page.rows`/`Page.Rows`/`data` 取行、不读 `list` 键；`loadSchema` 不提取 GetPage 内联数据（GetPage 只返回字段描述符，数据行在其他接口）；空数据时表格为 0 行而非字段描述符（见 §七）。
- [ ] **多选控件 value 恒为数组**：`deserializeMultiValue` 永远返回数组，`FormDialog` 首帧把多值字段初始化为 `[]`，无 `Symbol.iterator` 崩溃（见 §七）。
- [ ] **表单页 daterange/datetimerange 落到实体单列（逗号串）**：`FormDialog` 渲染 `t-date-range-picker`（值恒为 `[start,end]` 数组），首帧初始化 `[]`；提交前 `serializeRangeValue` 转 `"start,end"` 逗号串、回填 `deserializeRangeValue` 还原数组；**不与搜索栏 `dtStart/dtEnd` 两参数契约混用**（见 §七）。
- [ ] **树形走 `loadAll`**：含 `ParentID` 的实体列表在 `init`/搜索/排序/增删后基于完整数据集重建树，非树走 `loadData`（见 §七）。
- [ ] **`<script setup>` 响应式 API 调用均已 import**：`watch`/`computed` 等引入无遗漏，无运行期 `ReferenceError`（见 §七）。
- [ ] **列表页进入后不多次自动刷新**：路由视图 `:key="route.path"`（非 `fullPath`）、`onNavigate` 已去重、`pagination` 为稳定 `reactive` 引用（`watch` 原地赋值、非每次新对象）、`onPageChange` 有 no-op 守卫、`init` 幂等，`useEntityResource` 已缓存命中端点（`discoveredListEndpoint`）（见 §七）。
- [ ] **`itemType=image` 三端图像化**：列表列 `t-image` 缩略图、详情 `t-image` 大图、表单 `t-upload`（`requestMethod` 自定义上传回写 URL、编辑回显、删除清值），上传端点默认 `/{area}/{controller}/UploadFile` 且**不带 /api 前缀**（避免双前缀 405），经 `uploadUrl`/`VITE_UPLOAD_URL` 可配（见 §七）。
- [ ] **`itemType=mail` 有 email 格式校验**：FormDialog `rules` 对该字段追加 `{ type:'email' }`（非必填空值自动跳过），与 required 可叠加（见 §七）。
- [ ] **`itemType=mobile` 有手机号校验**：FormDialog `rules` 对该字段追加 TDesign 内置 `{ telnumber:true }`（`^1[3-9]\d{9}$`，见 form-model VALIDATE_MAP，遵循铁律 R2 不手写正则）（见 §七）。
- [ ] **编辑保存/删除无 405**：`useEntityResource.update` 走 `PUT /{base}`（主键在 body）、`remove` 走 `DELETE /{base}?id=xxx`（id 在 query），**主键不放 URL path**（见 §七）。
- [ ] **树形判定聚合全字段组 + 认 mapField=ParentID**：`isTreeSchema`/`selectListComponent`/`useEntityResource.isTree` 判定输入为 list+addForm+editForm+detail+search 聚合，且命中「字段名=ParentID」或「mapField=ParentID（ParentName）」即树形（见 §七）。
- [ ] **401 自动跳登录**：`api.ts` 拦截器同时处理 **HTTP 状态 401**（错误分支 `error.response.status===401`）与**信封 code=401**（成功分支 code 判断）；`window.location.href='/login'`（非 router.push）+ `pathname!=='/login'` 防循环（登录失败也是 401，由 LoginView 提示不跳转）（见 §10.2）。
- [ ] **401 自动刷新令牌就位（防死循环）**：`api.ts` 响应拦截器在受保护接口 401 时用 `refreshToken` 调 `POST /Auth/Refresh` 续期并重放一次；`isAuthEndpoint` 已排除 `/Auth/Refresh`/`/Auth/Login`/`/Auth/LoginConfig`/`/Auth/Challenge`/`/Mfa/*` 避免刷新死循环；`refreshInFlight` 单飞守卫防并发重复刷新；刷新失败 `handleUnauthorized` 跳登录（见 §七）。
- [ ] **审计字段不拉字典**：`useLookups.load` 排除 `CreateUserID`/`UpdateUserID`（含 mapField 引用），无 `/api/{area}/CreateUser`、`/UpdateUser?pageSize=1000` 无效请求（见 §4.8）。
- [ ] **LovController 值集接入（§4.20）**：`src/api/useLov.ts` 已落地，`ListPage` 在 `init()` 调 `loadLov(allFields)`；枚举型（`lovCode=Enum.*`）下拉选项经 `resolveOptions`/`labelOf` 第 3 优先级注入、列表回显名称；列表型（`lovCode=List.*`）经 `FormDialog` 的 `lovListConfig` 权威路径拉弹窗表格（退化走 `parseLovListCode` 猜控制器）；`LovController` 不可达时静默退化、不阻断主页面。
- [ ] **搜索参数契约**：字符串字段并入 `Q` 关键词、数值/枚举/布尔/日期走字段参数（`onSearch` 按 typeName 分流）；搜索控件覆盖 `switch`（t-switch）/`multi-select`；`@submit` 无 `.prevent`；虚拟映射字段（如 User.RoleID）经 `searchParamMap` 映射到真实字段（见 §4.13）。
- [ ] **品牌主色系统就位（§4.16）**：`utils/color.ts`(`getBrandPalette`) + `stores/setting.ts`(`useSettingStore`+`DEFAULT_BRAND`) + `SettingPanel.vue` 已落地；`main.ts` 启动 `useSettingStore().load()` 还原偏好并 `apply()` 注入 CSS 变量；切换品牌色时侧栏/顶栏/登录左栏三处 chrome 实时联动（无刷新）。
- [ ] **暗色模式就位**：`theme-dark.css` 在 `main.ts` 的 tokens.css 之后引入；切暗色时 `.topbar/.side/.login-left/.login-right` 稳定变暗（`!important` 覆盖层胜过 scoped 样式）；暗色侧栏为中性暗底叠极淡品牌色（`color-mix` 8%），非纯灰。
- [ ] **chrome 组件只引用令牌变量**：`MenuSidebar`/`LoginView`/`BasicLayout` 的 scoped 样式不写死颜色，统一用 `var(--cube-sidebar-bg)` / `var(--cube-brand-gradient-iot)` 等，跟随品牌与暗色（见 §4.16「特异性博弈」坑）。
- [ ] **`buildColumns` 无 TDZ 前向引用**：`isLovList` 等 `const` 标志声明在 `isMapped` 复合行之前，列表数据列不丢（见 §七）。
- [ ] **改完契约/登录类代码已做产物核验闭环（防 stale dist）**：`npm run build` 退出码 0 后，**grep `dist/assets/index-*.js`** 确认新逻辑关键字存在、旧 bug 关键字消失（如应有 `category:0`/`access_token` 且**无** `category:""`），再硬刷新浏览器 / 重启 dev server；不核验产物 = 可能一直在跑旧包（见 §七「stale 构建产物」）。
- [ ] **契约来自实证而非文档猜测**：枚举值/请求模型结构经 **dll 反射**确认（枚举一律传整数，魔方未注册 `JsonStringEnumConverter`）；**响应 JSON 键名抓真实 HTTP 响应确认**（如令牌为 snake_case `access_token`/`refresh_token`/`expire_in`），并在 `normToken` 三向兜底，不硬编码单一命名（见 §七）。
- [ ] **`oAuth` 键名双向归一**：`getLoginConfig()` 把小写 `oauth` 归一到 `oAuth`，登录页统一读 `config.oAuth`（实测真实后端大写 A，文档写小写；只读小写会导致第三方按钮不渲染）（见 §4.3 / §七）。

## 九、最小可运行 Demo（端到端验证脚手架）

为在不依赖真实魔方后端的情况下验证整条链路，技能内置一个零依赖 demo（`references/demo/`）：

- `backend/server.mjs`：纯 Node（无需 npm 安装）实现《认证接口设计.md》官方契约的 Mock 后端——`/Auth/LoginConfig`、`/Auth/Challenge`（真实 RSA-OAEP/SHA-256 公钥，登录时解密校验）、`/Auth/Captcha`、`/Auth/Login`（返回 `accessToken`/`refreshToken`/`expireIn`，`category` 区分密码/手机/邮箱，MFA 返 `mfa_required:`）、`/Auth/SendCode`、`/Auth/ResetPassword`、`/Auth/Register`、`/Auth/Refresh`（令牌轮换）、`/Mfa/Verify`；实体与菜单接口落在 `/api/{area}/{ctrl}`（含 `page`+`stat`）、`/api/Admin/Index/GetMenuTree`，详情/新增/修改/删除齐全；实体接口受令牌保护（无/失效令牌返 HTTP 401）。旧 `/Admin/User/Login`（返回 `{token}` 旧信封）作为 MVC/SSO 保留端点仍可用。
- `src/`：直接复用本技能全部资产（`src/api/*` + `src/components/cube/*`），外加登录页与路由——`router/index.ts`（`/login`、`/forgot-password`、`/register` 匿名，`/` 为 `MainView` 受保护主框架，路由守卫做登录门禁）、`pages/LoginView.vue`（按 `LoginConfig` 动态组装：密码/短信/邮箱 Tab、OAuth、MFA、忘记密码、注册、版权）、`pages/ForgotPasswordView.vue`、`pages/RegisterView.vue`、`pages/MainView.vue`（侧栏菜单 + 实体列表）、`App.vue`（仅 `<router-view/>` 壳）、`main.ts`（挂载 router + 引入 `tokens.css`）、Vite 配置（代理 `/api`+`/Auth`+`/Mfa`+`/cube`）。

**运行**（两个终端）：

```bash
cd references/demo
npm install
npm run mock   # 终端1：Mock 后端 :3001
npm run dev    # 终端2：Vite :5173，dev proxy 把 /api、/Auth、/Mfa 转发到 mock
```

打开 http://localhost:5173（若 5173 被占用 Vite 会自动顺延到 5174，以终端输出为准）→ **先看登录页**：它即演示《认证接口设计.md》完整契约——密码/短信/邮箱 Tab（由 `LoginConfig.login` 开关驱动）、OAuth 按钮（`oauth` 列表）、忘记密码 / 注册入口、用户名含 `mfa` 触发 MFA 二步验证；登录（任意账号 + 任意密码）→ 点菜单「设备列表」：
列表为**树形表**（含 `ParentID`）、`StatusID` 列显示「在线/离线/故障」、`CategoryID` 列经 `lookups` 显示分类名、底部有 `stat` 统计行；
「新增/编辑」弹窗中 `ParentID` 为**树形下拉**、`StatusID`/`CategoryID` 为映射源下拉；「详情」抽屉回显名称。
该 demo 覆盖了本技能两条核心规则（字段映射双模式 + 元数据驱动选型）与全部契约修正点。

> **导入路径约定（重要）**：基类组件按本技能约定落在 `src/components/cube/`，因此它们对 `src/api/*` 的引用必须用 `../../api/...`（上溯两层），而非 `../api/`。资产文件已按此修正。

> **设计令牌板**：技能资产自带 `assets/ThemeShowcase.vue`，落地为 `src/pages/ThemeShowcase.vue` 并在路由注册 `/Theme`，登录后访问即可全量预览设计令牌（色板/圆角/阴影/间距/字号/组件示例），验证主题是否生效。

## 十、以真实魔方后端替换 Mock（对接说明）

`references/demo` 的 Mock 后端只是契约替身。把它换成真实 NewLife.Cube WebApi 后端时，**前端资产无需改动**——它们从一开始就按官方契约实现（`/api/{area}/{ctrl}`、`/Auth/Login`（及 `/Auth/LoginConfig`/`/Auth/Challenge`/`/Auth/Refresh`/`/Mfa/Verify` 等）、`/api/Admin/Index/GetMenuTree`、`Authentication`+`Authorization` 双头、`code/message/data/page/stat` 信封）。只需做以下配置：

### 10.1 改代理 / BaseURL（唯一必改项）
把 Vite dev 代理的 target 从 Mock 指向真实后端：

```ts
// vite.config.ts
server: {
  proxy: {
    '/api':  { target: 'https://你的魔方域名', changeOrigin: true, secure: false },
    '/cube': { target: 'https://你的魔方域名', changeOrigin: true, secure: false }, // 附件/图片资源（filePath 形如 /cube/image?id=...）
    '/Content': { target: 'https://你的魔方域名', changeOrigin: true, secure: false }, // 页面静态资源（Logo/登录背景/OAuth 图标等）：LoginConfig 返回的静态路径落在此，后端公开可访问、无需登录
  },
}
```

> 若生产环境前端与后端同源，或后端已配 CORS，可直接删掉 dev proxy，并在 `src/api/api.ts` 的 `baseURL` 设为后端基地址（或读 `import.meta.env.VITE_API_BASE`）。
> **关键**：登录（`POST /api/Admin/User/Login`）、菜单（`GET /api/Admin/Index/GetMenuTree`）与实体接口在真实后端**统一位于 `/api` 下**——代理只需 `/api` + `/cube`；**切勿**为 `/Admin` 等前端 SPA 路由配代理（硬刷新会 404，见 §七「代理 /api + /cube」）。

### 10.2 鉴权（无需改代码）
真实后端在 `/Admin/User/Login` 返回 JWT，`api.ts` 已把 token 同时写入 `Authentication` + `Authorization` 双头并随后续请求发出。确认两点：
- 官方文档说魔方默认令牌头是 `Authentication`，**但实测部分后端只认 `Authorization`**（单发 `Authentication` → 列表/详情一律 401）。前端双头都带、值同为 token，两端通吃；若你的部署两都不认（如 `X-Token`），改 `api.ts` 拦截器一处即可。
- 401 时 `api.ts` 拦截器自动清 token 并整页跳转 `/login`。**两种 401 形态都要处理**：① **HTTP 状态 401**（axios 走错误分支 `error.response.status === 401`）；② **信封 `code:401`**（部分后端以 200 承载 401 语义，走成功分支的 code 判断）。实现要点：跳转用 `window.location.href = '/login'`（**不用 `router.push`**——api 层引用 router 会循环依赖，且整页刷新后路由守卫 `!auth.token → /login` 自然生效）；跳转前判断 `window.location.pathname !== '/login'` 防循环——**登录接口密码错误同样返回 401**，此时 Promise.reject 由 LoginView 捕获提示「用户名或密码错误」，若无条件跳转会造成刷新循环。

### 10.3 菜单与权限（无需改代码）
`MenuSidebar` 直接消费真实 `/Admin/Index/GetMenuTree`（只返回当前用户有权限的菜单）。给角色配好权限后，菜单自动出现。按钮显隐由 `GetPage.setting`（enableAdd/isReadOnly）驱动，无需任何自定义权限接口。

### 10.4 实体页：零代码生成
菜单每多一个 `{area}/{ctrl}`，前端**只加一行** `<ListPage>` 即可，无需任何 per-entity 代码：

```vue
<ListPage area="IoTHub" controller="Device" />
<ListPage area="IoTHub" controller="Category" />
```

### 10.5 字段映射与关联下拉
- **枚举/字典**：后端字段加 `[Map]` → 前端 `map` 自动出下拉 + 列表显名（无需额外配置）。
- **外键 `xxxID`**：
  - 若后端也加了 `[Map]`（值→名称），自动按映射源出下拉、列表显名；
  - 否则靠 `useLookups` 约定式自动拉取：**同名同 area 的关联控制器 `Index`**。例如 `CategoryID` → 自动请求 `/api/IoTHub/Category?pageSize=1000`。
  - 若关联实体**不同名/不同 area**，用覆盖机制：
    ```vue
    <ListPage area="IoTHub" controller="Device"
      :lookup-overrides="{ Category: { area: 'Common', controller: 'CategoryDict' } }" />
    ```

### 10.6 多租户
需要切换租户时调用 `auth.setTenant('租户号')`，`api.ts` 会自动在请求头注入 `X-Tenant-Id`（兼容）；`X-Tenant`（Code）由登录响应头 `X-Tenant` 经 `api.ts` 响应拦截器自动捕获存入 `localStorage`，无需手动设置。

### 10.7 上线构建
```bash
npm run build   # 产物在 dist/，交 Nginx / Cube 静态托管 / CDN
```
生产环境建议把 `api.ts` 的 `baseURL` 指向真实后端域名（或开启 CORS），去掉 dev proxy。

### 10.8 上线前必核对的契约差异清单
| 检查点 | 真实后端默认 | 处理位置 |
|--------|-------------|----------|
| 令牌头 | `Authentication` + `Authorization`（双头，值同为 token） | `api.ts` |
| 分页参数 | `pageIndex`/`pageSize`，响应 `page.totalCount` | `useEntityResource.ts` |
| 排序参数 | `?sort=字段&desc=true` | `ListPage.vue` |
| 响应信封 | `code/message/data/page/stat` | `api.ts` 拦截器 |
| 日期格式 | `YYYY-MM-DD HH:mm:ss` | `fieldRender.ts` |
| Int64 | 字符串传输 | `camel()` 已处理 |
| 权限门禁 | `GetPage.setting` + 菜单树（**无** `/Auth/Info`） | `ListPage.vue` / `MenuSidebar.vue` |
| 修改/删除路由 | `PUT /api/{a}/{c}`（主键在 body）/ `DELETE /api/{a}/{c}?id=xxx`（id 在 query） | `useEntityResource.ts` |

> 若你的魔方版本在以上任一点与默认不同（例如令牌头改名、分页键不同），只改 `src/api/*.ts` 中对应一处即可，基类组件与实体页都不受影响。

### 10.9 自定义（非实体）控制器 / ConfigController<T> / DbController
魔方有两类**非实体**基础控制器，都**没有 `GetPage`**，`ListPage` 的 `loadSchema()` 调 `GetPage` 会 404/无字段 → 与 TDZ 类似的「只剩操作列 / 空白表」，**绝不能塞进 `ListPage`**：

1. **`ConfigController<T>`**（如 `OrderSettingController`）：只自动提供 Get（读 `Config<T>.Current` 单对象）+ Update（Copy+Save），无 `GetPage`/列表接口，但**有 `GetFields`** 可驱动单表单页。按 §4.17 单列处理（专用 `ConfigView` 走 `GetFields` 元数据驱动）。
2. **`ControllerBaseX` 派生的自定义控制器**（如 `DbController` 数据库管理）：暴露一组自定义端点（列表数组 / 文件下载 / 动作），既非单对象也非标准 CRUD 列表。按 §4.18 单列处理（专属页，如 `DbView` 列表+备份+下载架构）。

**统一机制**：`EntityPage.vue` 用 `SPECIAL_CONTROLLERS` 注册表按 `area/controller`（区域作用域键）分发（`Admin/Cube` 等→`ConfigView`，`Admin/Db`→`DbView`），命中即渲染专属组件、否则走标准 `ListPage`；新增非实体控制器只在 `src/specialControllers.ts` 追加一条映射即可，无需新增路由。注册表必须显式策划（命名不可靠，见 §4.18）。或让后端也暴露 `GetPage` 形式的字段元数据以复用基类。

## 十一、新工程初始化与内置模块页面模板复用（tdesign-starter-cli）

**默认规则**：凡新建「魔方 WebApi + TDesign 前端」项目，前端骨架**一律用 tdesign-starter-cli** 初始化，再把本技能 `assets/` 模板与魔方内置模块页面（§11.3）拷入，禁止从零手搭。

### 11.1 标准初始化（实测命令，Node ≥ 16）
```bash
npm i tdesign-starter-cli@latest -g
td-starter init <项目名> -type vue3 -bt vite -temp lite   # Vue3 + Vite 精简模板
cd <项目名> && npm install && npm run dev
```
选项：`-type` vue2|vue3|react|miniProgram|mobileVue（默认 vue2，**必须显式 `-type vue3`**）；`-bt` vite|webpack；`-temp` lite|all。

### 11.2 拷入技能模板（assets/ → 目标路径映射）
| assets/ 模板 | 目标路径 | 作用 |
|---|---|---|
| `fieldRender.ts` | `src/api/` | 元数据驱动渲染（mapField 双语义判别，§4.8.1） |
| `useEntityResource.ts` | `src/api/` | 实体 CRUD 资源（base 必须 computed，防控制器切换不刷新） |
| `useLookups.ts` / `useLov.ts` | `src/api/` | 外键/枚举值集字典 |
| `http.ts`（+ `camel.ts` 放 `src/utils/`） | `src/api/` | 请求封装（双令牌头、camelize 响应、信封解包） |
| `auth.ts` | `src/stores/` | 登录态/令牌 |
| `ListPage.vue` / `FormDialog.vue` / `DetailDrawer.vue` | `src/components/cube/` | 通用列表/表单/详情基类组件 |
| `EntityPage.vue` | `src/pages/` | 路由参数驱动的通用实体页 |
| `DashboardView.vue` | `src/pages/` | 系统仪表盘首页（统计卡 + 近期日志，§11.3） |
| `BasicLayout.vue` | `src/layouts/` | 侧边导航（含「系统管理」组） |

> 拷贝后按项目 tsconfig/别名（`@/`）核对 import；`Message` 必须用 **`MessagePlugin`**（§七陷阱）；组件对 api 的引用用 `../../api/...`（§九导入路径约定）。

### 11.3 魔方框架内置功能页面（NewLife.Cube 自带 9 模块）
后端 `AddCube()` 即内置标准后台，前端**必须完整接入**（通用 EntityPage 零新增页面代码，路由 `/entity/:area/:controller`）：

| 模块 | 路由 | 模块 | 路由 |
|---|---|---|---|
| 用户 | `/Admin/User` | 审计日志 | `/Admin/Log` |
| 角色 | `/Admin/Role` | OAuth 配置 | `/Admin/OAuthConfig` |
| 菜单 | `/Admin/Menu` | 租户 | `/Admin/Tenant` |
| 部门 | `/Admin/Department` | 应用 | `/Cube/App` |
| 参数/字典 | `/Admin/Parameter` | | |

- Cube 6.x 已精简：`Dic`/`Config`/`UserLog`/`VisitLog`/`TaskLog`/`RoleMenu`/`File`/`Stat` 等 404，勿接入（日志统一 `Log`、字典/配置统一 `Parameter`）。
- 导航加「概览（仪表盘）+ 系统管理（9 模块）」组，见 `assets/BasicLayout.vue`；`DashboardView.vue` 统计卡用并发 `GET /{area}/{ctrl}?pageSize=1` 取 `env.page.totalCount`。
- **vite 代理**：真实魔方后端实体 API 在根路径 `/{Area}/{Controller}`（无 `/api` 前缀），dev 必须代理 `/Admin`、`/cube` 与业务 Area（hash 路由不受影响）；`references/scaffold` 的 mock 场景（/api 前缀）例外。
- 后端启用 Swagger 供核对自带接口（**仅开发环境**）：服务注册与中间件都要包 `if (IsDevelopment())`，`AddEndpointsApiExplorer()` + `AddSwaggerGen()` + `UseSwagger()` + `UseSwaggerUI(c => c.RoutePrefix = "Swagger")`，需 `dotnet add package Swashbuckle.AspNetCore` + `using Microsoft.Extensions.Hosting;`；开发期 `ASPNETCORE_ENVIRONMENT=Development dotnet run` 后访问 `http://<host>:<port>/Swagger`。完整细节见 `cube-webapi-backend` skill §1.1。

### 11.4 初始化完成验收清单
1. `vue-tsc --noEmit` 0 错误（编译清零铁律）；
2. 登录 → 跳转 `/dashboard` 仪表盘（不停在登录页/业务页；检查 `MessagePlugin` 误用，§七）；
3. 系统管理 9 模块列表/新增可开，枚举列显名非 Int32（mapField 消费）；
4. 表单枚举字段为 `t-select` 下拉（注意：TDesign `t-select` 渲染为 `<div>`，验收勿用 `querySelector('select')` 计数，转储 innerHTML 判定）；
5. CDP 直驱 Chrome 截图闭环（登录跳转 + 仪表盘统计 + 各模块列表行数/列数）。

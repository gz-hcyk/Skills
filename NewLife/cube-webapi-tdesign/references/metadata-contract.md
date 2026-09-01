# 魔方 WebApi 元数据契约（前端视角）

> 本文件是 `cube-webapi-tdesign` 的权威契约参考。后端实现细节见 `cube-webapi-backend` 技能（第四节、第五节）。
> 所有响应经 `ApiFilter` 统一序列化：**Int64 以字符串传输**（避免 JS 精度丢失）。
>
> ⚠️ **字段命名大小写（易错，务必注意）**：本技能早期版本曾称「统一 CamelCase 命名」，**与真实 NewLife.Cube WebApi 不符**——实测真实后端字段名是 **PascalCase**（`ID`/`ParentID`/`Name`/`CreateTime`/`CreateUserID`），仅 `references/demo` 的 Mock 后端为 camelCase 演示方便。前端**必须**在取数处用 `useEntityResource.normalizeRows` 把行 key 归一到 camelCase（`camel('ID')→id`、`camel('ParentID')→parentID`，纯大写缩写 `ID/URL/IP` 整词小写），否则 `row-key`、列回显、`buildTree` 父子链接、外键字典全部错位（详见 SKILL.md §七「后端字段命名是 PascalCase」陷阱）。渲染器对大小写做兜底，但**不要假设后端一定 camelCase**。

## 1. 统一响应信封

```typescript
interface ApiEnvelope<T> {
  code: number;          // 0 = 成功；401 = 未登录；403 = 无权限；其它 = 业务错误
  message: string;       // 成功/失败提示
  data: T;               // 业务数据
  traceId?: string;
  fieldErrors?: { field: string; message: string }[]; // 字段级校验错误（开启 EnableFieldValidation 时）
}

interface ApiListEnvelope<T> extends ApiEnvelope<T[]> {
  page: { pageIndex: number; pageSize: number; totalCount: number; sort?: string };
  stat?: T;              // 统计行（p.State 聚合）
}
```

## 2. 实体标准接口路由（REST）

| 动作 | 路由 | 动词 | 权限位 | 返回 |
|------|------|------|--------|------|
| 列表 | `/api/{area}/{controller}` | GET | Detail(1) | `ApiListEnvelope<TEntity>` |
| 详情 | `/api/{area}/{controller}/{id}` | GET | Detail(1) | `ApiEnvelope<TEntity>` |
| 新增 | `/api/{area}/{controller}` | POST | Insert(2) | `ApiEnvelope` |
| 修改 | `/api/{area}/{controller}` | PUT | Update(4) | `ApiEnvelope`（**主键在 body，不在 URL**） |
| 删除 | `/api/{area}/{controller}?id=xxx` | DELETE | Delete(8) | `ApiEnvelope`（**id 在 query，不在 URL path**） |
| 元数据(单类) | `/api/{area}/{controller}/GetFields?kind=1` | GET | 匿名 | `ApiEnvelope<DataField[]>` |
| 页面(全量) | `/api/{area}/{controller}/GetPage` | GET | 匿名 | `ApiEnvelope<PageSchema>` |
| 上传 | `/api/{area}/{controller}/UploadFile` | POST | — | `ApiEnvelope<{attId,filePath,contentType}>`（form-data 字段 `file`，参数 `id`/`title`） |
| 图表 | `/api/{area}/{controller}/GetChartData` | GET | Detail(1) | `ApiEnvelope<Object[]>` |
| 导出 | `/api/{area}/{controller}/ExportFile?format=csv` | GET | Detail(1) | 文件流 |

> ⚠️ **修改/删除契约（高频坑，实测 405）**：第三代 WebApi 的修改/删除打**主路由**——`PUT /{area}/{controller}`（主键在 body）、`DELETE /{area}/{controller}?id=xxx`（id 在 query）。写成 `PUT|DELETE /{a}/{c}/{id}`（id 在 URL path）后端无此路由 → 405（详见 SKILL.md §七「编辑保存/删除 405」）。

> `Auth`、`Cube`、`Sso` 等服务控制器**不带** `/api` 前缀（如登录 `/Admin/User/Login`、菜单 `/Admin/Index/GetMenuTree`）——但实测真实部署下这两个也在 `/api` 下（`POST /api/Admin/User/Login`、`GET /api/Admin/Index/GetMenuTree`），落地时用 curl 探一遍。

## 3. GetPage —— 前端引导页的核心（一次性取齐 schema）

`GET /api/{area}/{controller}/GetPage` 返回：

```jsonc
{
  "code": 0,
  "data": {
    "setting": {                 // PageSetting（camelCase）
      "navView": 0,
      "enableNavbar": true,
      "enableToolbar": true,
      "enableAdd": true,         // 后端是否允许“新增”
      "enableKey": false,
      "enableSelect": true,
      "enableFooter": true,
      "isReadOnly": false,       // 只读控制器（ReadOnlyEntityController）为 true
      "enableTableDoubleClick": true,
      "orderByKey": true,
      "doubleDelete": false
    },
    "list":    [ /* DataField[] 列表列 */ ],
    "addForm": [ /* DataField[] 新增表单 */ ],
    "editForm":[ /* DataField[] 编辑表单 */ ],
    "detail":  [ /* DataField[] 详情 */ ],
    "search":  [ /* DataField[] 搜索条件 */ ]
  }
}
```

> **关键**：`GetPage` 只返回 **schema（字段定义）**，不含行数据。行数据由 `Index()`（`GET /api/{area}/{controller}`）单独拉取。
> 前端推荐：进入页面先 `GetPage` 取 schema（可缓存到路由级），再 `Index` 取数据。

## 4. DataField —— 字段描述符（驱动动态表格/表单）

`GetFields` / `GetPage` 中的每一项都是一个字段描述符，序列化后（camelCase）典型结构：

**实测真实结构**（`GET /api/Admin/{Entity}/GetPage`，以 `User.DepartmentName` 为例）：

```jsonc
{
  "name": "DepartmentName", "displayName": "部门", "description": "部门。组织机构",
  "category": "登录信息", "typeName": "String", "itemType": null,
  "length": 0, "precision": 0, "scale": 0,
  "nullable": false, "primaryKey": false, "readOnly": false,
  "visible": false, "required": false, "authority": null,
  "extended1": null, "extended2": null, "extended3": null,
  "mapField": "DepartmentID", "lovCode": null,
  "getExpand": null, "retainExpand": false, "expand": null
}
```

| 属性 | 类型 | 含义 | 前端用途 |
|------|------|------|----------|
| `name` | string | 字段名（真实后端为 PascalCase，如 `Name`、`ParentID`；Mock 为 camelCase） | 后端原始命名经 `camel()` 归一为 camelCase 后作行 key / 表单字段名（`id`/`parentID`）；`xxxID/xxxIDs` 后缀参与控件选型 |
| `displayName` | string | 显示名（中文标签） | 列标题 / 表单 label |
| `description` | string? | 字段说明 | placeholder / tooltip |
| `category` | string? | 分组（camelCase，可为空串或 `null`） | 表单按此分 tab，空 → 「默认」组 |
| `typeName` | string? | 类型名：基础类型（`String`/`Boolean`/`Int32`/`Int64`/`Double`/`DateTime`）**或枚举类型名**（`SexKinds`/`MenuTypes`…） | 控件选型核心依据（见 field-renderers.md §1） |
| `itemType` | string? | 特化编辑器：`html`/`mail`/`mobile`/`TimeSpan` | 富文本 / 邮箱 / 手机号输入 |
| `length` | number? | 字符串长度上限 | `maxlength`；>200 视为长文本→textarea |
| `required` | boolean? | **界面是否必填**（UI 语义） | `true` ⇒ 必填校验 + 红星 |
| `nullable` | boolean? | **数据库是否允许为空**（NOT NULL 约束） | 仅作必填的兜底推断，**不直接等于界面必填** |
| `primaryKey` | boolean? | 主键 | 列表/表单排除，不要求用户填写 |
| `isIdentity` | boolean? | 自增标识 | 新增表单隐藏、禁用 |
| `readOnly` | boolean? | **是否只读** | 表单控件 `disabled`，值只展示 |
| `visible` | boolean? | 是否可见 | ⚠️ 实测恒为 `false`，**不可用于判断隐藏列** |
| `sortable` | boolean? | 可排序 | 列表列 `sortable` |
| `mapField` | string? | **映射字段指向的原始字段名**；非空 ⇒ 该字段是映射字段 ⇒ 下拉 | 控件选型 + lookups 基名（见 field-renderers.md §3.6） |
| `lovCode` | string? | 关联源编码（如 `Role`） | 异步下拉字典的关联源标识 |
| `authority` | string? | 字段级权限 | 预留（实测为 `null`） |
| `extended1~3` | any? | 扩展属性 | 预留（实测为 `null`） |
| `map` | `Record<string,string>`? | 枚举/字典映射（值→显示） | 下拉选项 + 列表回显 label |
| `dataSource` | `{text,value}[]`? | 外键/数据字典选项源 | 下拉选项（优先级低于 `map`） |

> **必填判定（易错，务必按此实现）**：`required` 是 UI 语义、`nullable` 是数据库约束，二者**不可互相推导**。
> - `required === true` → 必填；
> - 其余情况（`false`/未下发/`null`）→ 用 `nullable === false` **兜底推断**，但排除主键/自增/`readOnly`/
>   审计字段（`CreateTime`/`UpdateTime`/`CreateUserID`/`UpdateUserID`/`CreateIP`/`UpdateIP`…）。
> - ⚠️ 本后端实测对所有字段下发 `required:false`（0 个 `true`），若把 `required===false` 当「明确不必填」，
>   连 `Name` 这类业务必填项都不会校验。**故 `required` 仅在为 `true` 时生效**。
> - ⚠️ 反例：直接用 `nullable===false` 当必填，会把 `ID`/`CreateTime`/`CreateUserID` 也标红星要求用户填。
> 统一实现见 `fieldRender.resolveFieldBehavior()`。

> 不同后端版本个别属性名可能微调（如 `type` vs `typeName`）。以 `cube-webapi-backend` 与运行时实际 JSON 为准；渲染器对缺失字段做容错。

## 5. kind 取值（GetFields?kind=）

| kind | 含义 | 适用 |
|------|------|------|
| 1 | List 列表列 | 表格列 |
| 2 | Detail 详情 | 详情抽屉 |
| 3 | AddForm 新增表单 | 新增弹窗 |
| 4 | EditForm 编辑表单 | 编辑弹窗 |
| 5 | Search 搜索条件 | 搜索栏 |

> **Search 参数契约（curl 实测真实后端）**：列表接口对查询参数的识别——**数值/枚举/布尔/日期字段**走**字段参数**（`?parentID=1` / `?enable=true` / `?type=0` 均生效，大小写不敏感）；**字符串字段精确字段参数不生效**（`?code=011`、`?name=行政部` 返回全量），必须走 **`Q` 关键词**模糊搜索（`?Q=行政部` 生效）。**虚拟映射字段（非数据库真实列，如 User.RoleID——列表 RoleName.mapField=RoleID 仅 Map 虚拟映射）不参与查询**（`?roleID=999` 返回全量，`?roleIds=999` 才过滤）。前端 `ListPage.onSearch` 按 typeName 分流（string→Q、其余→字段参数），并经 `searchParamMap` prop 适配虚拟字段→真实字段（见 SKILL.md §4.13）。

## 6. 鉴权接口

```http
POST /api/Admin/User/Login     body: { userName, password }   → { code:0, data:{ access_token:"jwt", token_type, expire_in, refresh_token, scope } }
GET  /api/Admin/Index/GetMenuTree   → { code:0, data:[ 菜单树，仅含当前用户有权限的节点 ] }
```

> **与旧版文档的重要更正**：官方魔方 WebApi **没有** `/Auth/Login`、也没有 `/Auth/Info` 这种“返回权限位”的接口。
> 登录路径为 `/Admin/User/Login`；权限位不通过独立接口下发，而是体现在 `GetPage.setting`（enableAdd/isReadOnly…）与菜单树中。
> 登录/菜单的 `/api` 前缀：官方文档写不带 `/api`，**但实测真实部署（如 localhost:7116）在 `/api` 下**（`POST /api/Admin/User/Login` 返回 `data.access_token`）——前端 auth.ts 已按 `/api` 前缀 + `access_token` 对齐，落地时用 curl 探一遍。

**令牌传递方式（实测需 `Authentication` + `Authorization` 双头，高频坑）**：
`Authentication: <jwt>`（官方文档推荐）/ **`Authorization: <jwt>`（实测部分后端只认这个，单发 `Authentication` → 401）** / `Cookie`（后端 Set-Cookie）/ Query `?token=xxx`。
前端 `api.ts` 请求拦截**同时注入 `Authentication` + `Authorization` 两个头（值同为 token）**与 `X-Tenant-Id` 头，两端通吃；`/Admin/...` 这类非 `/api` 接口走 `rawHttp`（`getRaw`/`postRaw`）。

**前端权限判定（以 GetPage.setting 为准，而非独立权限位接口）**：
- `setting.enableAdd !== false && !setting.isReadOnly` ⇒ 显示“新增”；
- `!setting.isReadOnly` ⇒ 显示“编辑/删除”；
- 自定义业务权限位（16/32…）由后端 `[EntityAuthorize]` 在动作级拦截，前端如需按位隐藏某按钮，权限位数据须由后端在 `GetPage` 扩展字段或菜单树动作中下发。
`PermissionFlags` 位语义（仅供后端对照）：1=查看(Detail) / 2=新增(Insert) / 4=修改(Update) / 8=删除(Delete) / 16、32…=自定义业务权限 / `All`=0xFFFFFFFF。详见 `permissions.ts`。

## 7. 多租户

开启 `CubeSetting.EnableTenant` 时，请求需携带租户上下文，常见做法：
- 请求头 `X-Tenant-Id: <tenantId>`（推荐，前端在 axios 拦截器统一注入）；
- 或用户当前租户由登录态决定，前端提供租户切换器，切换后更新该请求头并刷新数据。
未处于有效租户上下文的请求，后端 fail-closed 返回 403。

## 8. 数据范围（行级权限）

列表/详情数据已由后端按角色 `DataScope`（本部门/本人等）或控制器 `[DataPermission]` 表达式**自动过滤**，
前端无需、也不能自行过滤数据；只需正确传递令牌与租户头即可。前端仅负责“能否看到某按钮”（UI 层权限），真实鉴权永远在后端。

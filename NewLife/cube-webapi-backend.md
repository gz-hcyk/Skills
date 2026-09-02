---
name: cube-webapi-backend
description: 使用 NewLife.Cube（魔方）第三代 WebApi 快速开放框架开发前后端分离的后台 REST API 时使用。适用场景：基于 EntityController/ReadOnlyEntityController/EntityTreeApiController/ControllerBaseX 暴露 /api 标准 CRUD 接口；用 GetFields/GetPage 字段元数据驱动动态列表/表单；配置 AddCube/UseCube 启动、登录与 JWT（Auth/Login、Bearer/X-Token）；设计自定义权限体系（PermissionFlags 权限位、Menu 菜单、EntityAuthorize 鉴权、401/403）；实现数据范围权限（Role.DataScopes、IDataScope/DataScopeInterceptor、DataPermission 表达式、IFieldScope 脱敏）；多租户隔离、自定义业务权限（审批/下发指令等）、导出。触发词：魔方 WebApi、NewLife.Cube、Cube API、EntityController、GetFields、元数据驱动接口、权限位、数据权限、前后端分离后台。不适用于 MVC 服务器渲染后台（用 cube-mvc-backend）与前端页面生成（用 cube-webapi-tdesign）。
agent_created: true
argument-hint: 说明要做什么：新建 Area 并生成实体 CRUD API、控制器基类选型（CRUD/只读/树形/自定义）、定制字段元数据（GetFields/GetPage）、添加鉴权 Action 与自定义权限位、接入登录与 JWT、配置多租户与数据范围权限，还是排查 401/403/FieldErrors/路由 404 问题。
---

# Cube WebApi 快速开放框架（前后端分离 API）

> 字段定制（ListFields / AddFormFields / EditFormFields / SearchFields / DetailFields）的**完整方法速查**
> 与 ListField 扩展属性，与 MVC 版本完全一致，参见 `cube-mvc-backend` skill。本 skill 专注 WebApi 差异点：
> 路由约定、标准响应模型、字段元数据接口、鉴权与 JWT、只读/配置控制器、多租户数据权限。

第三代魔方（NewLife.Cube）的后台/实体控制器统一以 `/api` 为前缀暴露标准 REST 接口，
前端通过 **字段元数据接口（GetFields / GetPage）** 驱动动态界面，无需硬编码表单与表格。

---

## 〇、标准开发路线（元流程，先于一切编码）

基于魔方 WebApi 的完整项目按以下路线推进，每一步有明确产出与检查点，**编译错误必须清零后才能进入下一步**：

```
① 搭建项目框架          → 使用 project-architecture 技能（分层选型、目录结构、.sln/.csproj 落地）
② 生成 XML 数据模型     → 使用 xcode-data-modeling 技能，根据需求文档/设计文档编写 Model.xml（表、字段、索引、外键 Map）
③ 代码生成              → 使用 xcodetool（xcode 命令 / Build.tt）从 Model.xml 生成实体类 + WebApi 控制器
④ 编译检查              → dotnet build，错误清零
⑤ 补充业务代码          → 在实体类（业务方法/Search/枚举访问）与控制器（字段定制/自定义 Action/权限位）中补充，生成代码不手改
⑥ 编译检查              → dotnet build，错误清零
⑦ 创建前端项目          → 使用 cube-webapi-tdesign 技能（TDesign Vue Next，GetFields/GetPage 元数据驱动）
⑧ 前端编译、测试        → npm run build + npm run dev 自测（列表/表单/详情/空状态/错误状态）
⑨ 前后端联调测试        → 登录鉴权、CRUD、字段元数据映射（PascalCase→camelCase）、权限显隐、导出、分页排序筛选
```

要点：
- **模型先行**：所有实体/控制器由 Model.xml 驱动生成，需求变更先改 XML 再重新生成，禁止手改生成器产物（会被覆盖）；字段/表结构调整一律走「改 Model.xml → xcodetool 重新生成 → 编译检查」。
- **两次编译检查是硬闸门**：③ 生成后、⑤ 业务补充后各一次，任何修复后编译错误数必须为 0。
- **技能衔接**：① 依赖 `project-architecture` 技能确定分层（两层起步、按需渐进）；② 依赖 `xcode-data-modeling` 技能（Model.xml 完整属性体系、主键设计、Map 外键、ShowIn、分表字段）；⑦ 依赖 `cube-webapi-tdesign` 技能，其零代码列表/表单正是本 skill 第五节元数据接口的消费端。
- **联调常见坑**：前端字段名映射（后端 FastJson CamelCase 输出、Int64 字符串化）、`GetFields` 匿名可取但数据接口需登录、区域路由 `[XxxArea]` 缺失导致 404。

---

## 一、启动配置（Program.cs）

```csharp
var builder = WebApplication.CreateBuilder(args);

// ★ 必须：UseCube 内部 MapControllerRoute 依赖 MVC 控制器服务，缺失启动即抛异常。
//   注意：AddControllers 只注册 REST Controller 基础设施（[ApiController]/[Route]/[HttpPost]），
//   不等于 Razor 服务器渲染 MVC，纯 WebApi 也必须调用。
builder.Services.AddControllers();

// 注册权限、菜单、实体控制器扫描、JWT 等
builder.Services.AddCube();

// ★ 必须在 AddCube 之后：AddCube 内部注册了返回 DefaultTracer.Instance(未初始化=null) 的
//   ITracer 工厂，MS DI 取“最后”一个描述符，之前注册会被覆盖；UseCube→UseStardust 依赖 ITracer/ILog。
DefaultTracer.Instance ??= new DefaultTracer();
builder.Services.AddSingleton<ITracer>(_ => DefaultTracer.Instance!);
builder.Services.AddSingleton<ILog>(XTrace.Log);

var app = builder.Build();

// ⚠️ 纯 WebApi（前后端分离）只需 AddControllers + AddCube + UseCube，【不要】调用任何主题/前端包：
//   - NewLife.Cube.AdminLTE（及其 Tabler / Metronic / TDesign / NaiveUI 主题包）是【魔方 MVC 版】的
//     服务器渲染前端，提供 Razor 视图，依赖 MVC 控制器（return View()、Up/Down 返回 RedirectToAction）。
//     与 WebApi 后端（控制器返回 JsonResult、Up/Down 返回 JSON）完全不兼容：引用后页面空白/500、路由冲突、徒增体积。
//   - WebApi 的“前端”是独立 SPA（如 cube-webapi-tdesign / TDesign Vue），通过 /api 消费 JSON，不在此托管。
//   两套技术栈二选一：要 REST API 选 NewLife.Cube + 独立前端；要服务器渲染后台选 AdminLTE + MVC 控制器。
app.UseCube(app.Environment);      // 注册路由表、静态资源与中间件（含 /api 路由）

app.Run();
```

> 需要 `using NewLife.Cube;`（AddCube/UseCube 扩展）、`using NewLife.Log;`（ITracer/ILog/DefaultTracer/XTrace）。
> 若启用 Swagger 还需 `using Microsoft.Extensions.Hosting;`（`IsDevelopment()` 扩展方法所在，缺失报 CS1061）。

### 1.1 Swagger（仅开发环境启用，实测结论）

Swagger UI 默认挂 `/Swagger`（NewLife.Cube 生态约定路径），用于**核对框架自带接口与数据格式**（实体 CRUD、Auth、GetFields/GetPage 等）。**只在开发环境启用**——生产环境不注册服务也不挂中间件，避免接口清单/模型结构对外暴露：

```csharp
// —— 服务注册（builder.Build() 之前）——
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen();
}

// —— 中间件（app.UseCube 之后）——
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.RoutePrefix = "Swagger";   // UI 挂 /Swagger（Cube 生态约定路径，非默认 /swagger）
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "NewLife.Cube API v1");
    });
}
```

要点（全部实测踩过）：
- **需安装包**：`dotnet add package Swashbuckle.AspNetCore`，否则 CS1061 三连（`AddSwaggerGen`/`UseSwagger`/`UseSwaggerUI` 均不存在）。
- **服务与中间件两处都要包 `IsDevelopment()`**：只包中间件不包服务，生产仍注册了 Swagger 服务（徒增暴露面）；只包服务不包中间件则开发期 UI 不可达。
- **环境判定**：`dotnet run` 无 `launchSettings.json` 或其未指定时默认 **Production**（实测启动日志 `Hosting environment: Production`）；开发期显式 `ASPNETCORE_ENVIRONMENT=Development dotnet run --urls http://127.0.0.1:5077`。
- **实测行为**：Production 下 `/Swagger` → 404 且业务接口（如 `POST /Auth/Login`）正常 200；Development 下 `/Swagger` → 301 → `/Swagger/index.html` 200，`/swagger/v1/swagger.json` 200（含全部实体 CRUD 路径）。
- **构建期文件锁**：旧进程未杀时 `dotnet build` 报 MSB3027/3021「文件被 WeComAddressBook.WebApi 锁定」——先 `taskkill /F /IM dotnet.exe` 再构建（代码本身 0 错误，勿误判为代码问题）。

`appsettings.json` 必需连接字符串（`Membership` 存储用户/角色/菜单/权限）。**纯 WebApi 不配 `Cube:Theme`**——`Theme`（Tabler/Metronic/AdminLTE）是 MVC 服务器渲染前端的开关，WebApi 后端用不到；配了也不会生效，反而误导成"MVC 项目"：

```json
{
  "ConnectionStrings": {
    "Membership": "DataSource=..\\Data\\Membership.db;Provider=sqlite",
    "Cube": "DataSource=..\\Data\\Cube.db;Provider=sqlite",
    "Log": "DataSource=..\\Data\\Log.db;Provider=sqlite"
  },
  "Cube": {
    "JwtSecret": "请替换为强密钥",
    "TokenExpire": 86400,
    "CorsOrigins": "https://app.example.com"
  }
}
```

> ⚠️ 连接串里的 `..\Data\` 相对路径基于**进程当前工作目录（CWD）**，不是 ContentRoot。`dotnet run`（CWD=工程目录）与直接运行 `bin/Debug/net8.0/*.dll`（CWD=输出目录）会解析到不同 Data 目录，导致"建了表却查不到""冒烟打到旧库"。调试时固定一种启动方式。
> 生产环境**必须**配置强 `JwtSecret`，否则令牌可伪造。

---

## 二、路由约定（必须理解）

基类 `ControllerBaseX` 默认路由：`[Route("api/[area]/[controller]/[action]")]`。
实体控制器通过显式路由覆盖为 **REST 风格**（不带 `/[action]`）：

| 操作 | Http 方法 + 路由 | 说明 |
|------|------------------|------|
| 列表 | `GET  /api/{area}/{controller}` | 分页/排序/条件动态参数 |
| 详情 | `GET  /api/{area}/{controller}/Detail?id={id}` | 单行数据 |
| 新增 | `POST /api/{area}/{controller}` | body 为 TModel |
| 修改 | `PUT  /api/{area}/{controller}` | body 为 TModel |
| 删除 | `DELETE /api/{area}/{controller}?id={id}` | 单条删除 |
| 字段 | `GET  /api/{area}/{controller}/GetFields?kind=1` | 字段元数据（见下） |
| 页面 | `GET  /api/{area}/{controller}/GetPage` | 页面+全部字段元数据 |
| 图表 | `GET  /api/{area}/{controller}/GetChartData` | 图表数据 |
| 导出 | `GET  /api/{area}/{controller}/ExportFile?format=excel` | excel/csv/json/xml |

> 认证类服务控制器（`Auth`/`Cube`/`Sso`）自带 `[Route]` **不带 `/api` 前缀**（如 `/Auth/Login`）。
> 自定义 Action 不要手动再加 `/api`，基类已统一处理。

---

## 三、公共控制器选型与用法（避免用错基类）

魔方控制器是一条**继承链**，能力从上往下递增。选错基类是最高频的误用：例如树形实体用了 `EntityController`/`EntityTreeController` 而非 `EntityTreeApiController`，或需要写操作却用了 `ReadOnlyEntityController`，或想拿字段级错误却没开 `EnableFieldValidation`。

### 3.1 继承关系

```
ControllerBaseX                                    根基类：路由前缀 / 令牌解析 / 租户校验 / JSON 序列化 / 审计日志
   └─ ReadOnlyEntityController<TEntity>            只读：列表/详情/元数据/图表/导出（无写接口，IsReadOnly=true）
        └─ EntityController<TEntity,TModel>        标准 CRUD：在只读之上增加 Insert/Update/Delete（IsReadOnly=false）
             └─ EntityTreeController<TEntity,TModel>         树形实体（MVC 版，Up/Down 返回 RedirectToAction）
                  └─ EntityTreeApiController<TEntity,TModel> 树形实体（WebApi 版，Up/Down 返回 JSON）★ WebApi 用它
```

便捷类：`EntityController<TEntity>` = `EntityController<TEntity, TEntity>`（无独立视图模型时，令 `TModel=TEntity`）；`ReadOnlyEntityController<TEntity>` 同理。

### 3.2 ControllerBaseX（根基类，自定义非实体 API）

- 不直接暴露实体 CRUD，提供所有控制器共有的基础设施：`[ApiController]` + `[Route("api/[area]/[controller]/[action]")]`、`CurrentUser` / `CurrentTenant` / `Menu` / `Token` 属性、请求前 `LoadToken()`（Bearer / X-Token / Cookie / Query 四种令牌）、`OnActionExecuting` 中多租户 `ValidateTenant` **fail-closed** 校验、统一 JSON 序列化（FastJson：CamelCase、Int64 作为字符串）、`Json(code,message,data)` 助手、`WriteLog` 审计。
- **适用场景**：纯自定义接口（看板聚合、RPC 风格动作、第三方回调等），不绑定单一实体、不需要 `GetFields` / 字段校验。
- **注意**：它不带 `SearchData` / `FindData` / `GetFields` / `Valid` 等实体辅助方法；若接口要复用魔方实体查询与数据权限，应继承 `ReadOnlyEntityController` 或更上层，而非 `ControllerBaseX`。权限仍需在 Action / Controller 上显式 `[EntityAuthorize]`。

### 3.3 ReadOnlyEntityController<TEntity>（只读 / 字典 / 统计）

- 仅暴露**读**与**导出**接口；构造时 `PageSetting.IsReadOnly = true`，**不生成 Insert / Update / Delete**。
- 内置 Action：`Index()`（GET，Detail 权限）、`Detail(id)`（GET，Detail）、`GetPage()`（匿名）、`GetFields(kind)`（匿名）、`GetChartData()`（Detail）、`ExportFile(format)`（Detail）。
- 继承的实体辅助方法：`Search(Pager)` / `SearchData(Pager)` / `FindData(key)` / `ExportData(max)` / `Valid(entity,type,post)` / `OnGetFields(kind,...)`。
- **适用场景**：
  - 字典表 / 配置类只读数据（如行政区划、枚举映射）；
  - 统计 / 报表视图（配合 `GetChartData` + `OnGetChartData` 返回 ECharts 配置）；
  - 任何“绝不允许通过 API 被增删改”的参考数据。
- **陷阱**：若业务某天需要写入，不要偷偷在子类手写 `Insert` Action 绕过只读——应直接改用 `EntityController`，让权限位（Insert / Update / Delete）与菜单权限项自动对齐。

### 3.4 EntityController<TEntity, TModel>（标准 CRUD）

- 在只读之上新增写操作，构造时 `PageSetting.IsReadOnly = false`。
- 内置写 Action（均带标准权限位与 `[DisplayName]`）：
  - `Insert(TModel)` — `POST /api/area/ctrl`，`Insert` 权限；
  - `Update(TModel)` — `PUT /api/area/ctrl`，`Update` 权限；
  - `Delete(id)` — `DELETE /api/area/ctrl`，`Delete` 权限；支持**假删除**（字段 `Deleted` / `IsDelete` / `IsDeleted` 为真删除标记）与二次删除 / 恢复。
- `EnableFieldValidation` 属性默认 `false`（源码实现 `=> false`；源码注释虽写“默认 true”但实际未开启），需在子类 `override` 返回 `true` 才会按 Model.xml 做必填 / 长度字段级校验并返回 `FieldErrors`。
- **适用场景**：绝大多数业务主数据（订单、学生、设备等）的标准增删改查 API。

```csharp
[SchoolArea]                                                   // 区域特性（等价于 [Area("School")]）
[DisplayName("学生")]
[Menu(0, true, Mode = MenuModes.Admin | MenuModes.Tenant)]    // 自动建菜单+权限项
public class StudentController : EntityController<Student, StudentModel>
{
    // 字段定制与 MVC 完全一致，必须在静态构造器中（全局一次性）
    static StudentController()
    {
        ListFields.RemoveField("CreateUserID,UpdateUserID");
    }

    // 可选重写：自定义查询
    protected override IEnumerable<Student> Search(Pager p) => base.Search(p);

    // 可选重写：自定义主键查找
    protected override Student Find(Object key) => base.Find(key);
}
```

- **TEntity**：XCode 实体类（由 Model.xml + Build.tt 生成）。
- **TModel**：视图模型（通常同名 `XxxModel`，由 Build.tt 生成；没有时可令 `TEntity` 即 `TModel`）。
- 不写任何 Action 即自动拥有上面“路由约定”表里的全部标准接口。

```csharp
// 只读示例：字典 / 统计报表，绝不允许写
[SchoolArea]
public class StudentStatController : ReadOnlyEntityController<Student> { }
```

### 3.5 EntityTreeController 与 EntityTreeApiController（树形实体）

- 要求 `TEntity : EntityTree<TEntity>`（实体具备 `Parent` / `Name` / `TreeNodeName` 等树字段与树缓存）。
- 静态构造器自动调整 `ListFields`：前置显示 `Key` 与 `TreeNodeName`，移除 `Name` / `Parent` 等。
- 重写 `Search(Pager)`：从**缓存**返回整棵树（`Root.AllChilds` 或按 `Parent` 过滤的 `FindAllChildsByParent`），`PageSize` 强制 10000（树形一次性拉全）。
- 提供 `Up(id)` / `Down(id)` 节点上移 / 下移。
- ⚠️ **两个变体，WebApi 必须用 `EntityTreeApiController`**：
  - `EntityTreeController<TEntity,TModel>`：`Up/Down` 是 **MVC 风格**，返回 `RedirectToAction("Index")`（HTTP 302 + 页面跳转），前端拿不到 JSON；**不在 WebApi 场景使用**。
  - `EntityTreeApiController<TEntity,TModel>`：继承前者并 `new` 覆写 `Up/Down` 为 `[HttpPost]` + `Json(0,"上移成功",menu)`，返回标准 JSON。**WebApi 树形接口请用此基类。**

```csharp
[SchoolArea]
[DisplayName("菜单")]
[Menu(0, true, Mode = MenuModes.Admin | MenuModes.Tenant)]
// WebApi 树形实体：用 EntityTreeApiController（不要直接用 EntityTreeController）
public class MenuController : EntityTreeApiController<Menu, MenuModel> { }
```

### 3.6 选型决策表

| 需求 | 选哪个基类 | 关键原因 |
|------|-----------|---------|
| 标准增删改查（订单 / 学生 / 设备） | `EntityController<TEntity,TModel>` | 自带 Insert/Update/Delete + 4 权限位 |
| 只读字典 / 统计报表 / 不可写参考数据 | `ReadOnlyEntityController<TEntity>` | IsReadOnly=true，无写接口，防止误写 |
| 树形结构（菜单 / 分类 / 组织机构） | `EntityTreeApiController<TEntity,TModel>` | 缓存整树 + Up/Down 返回 JSON |
| 纯自定义聚合 / RPC 接口（不绑实体） | `ControllerBaseX` | 仅基础设施，不引入实体查询 |
| 无独立视图模型 | 用单泛型 `EntityController<TEntity>` / `ReadOnlyEntityController<TEntity>`（`TModel=TEntity`） | 简化泛型参数 |

### 3.7 高频用错点

- **树形实体用错基类**：WebApi 写树形接口却继承 `EntityTreeController`，`Up/Down` 返回 302 跳转而非 JSON —— 一律用 `EntityTreeApiController`。
- **树形实体未继承 `EntityTree<TEntity>`**：`EntityTreeController` 要求 `TEntity : EntityTree<TEntity>`，普通实体既编不过也没有树缓存 / 上下移语义。
- **需要写操作却用 `ReadOnlyEntityController`**：它天生无 Insert/Update/Delete，别在子类手写写接口绕过——直接升级为 `EntityController`。
- **`EnableFieldValidation` 默认关闭**：想在 Insert/Update 拿到 `FieldErrors` 字段级错误，必须子类 `override EnableFieldValidation => true`（源码注释“默认 true”不实，实际 `=> false`）。
- **`ControllerBaseX` 缺实体辅助方法**：自定义接口若需 `SearchData` / `FindData` / `GetFields` / `Valid` 与数据权限，应继承 `ReadOnlyEntityController` 而非 `ControllerBaseX`。

---

## 四、标准响应模型（ApiResponse / ApiListResponse）

所有返回经 `ApiFilter` / `ControllerBaseX` 统一序列化为 `{ code, message, data, ... }`
（FastJson：**CamelCase**、**Int64 作为字符串**）。

```csharp
// 单对象/操作响应
public class ApiResponse<T>
{
    public Int32      Code        { get; set; }  // 0 = 成功，其它为错误码
    public String     Message     { get; set; }  // 成功/失败提示
    public T          Data        { get; set; }
    public String     TraceId     { get; set; }
    public List<FieldError> FieldErrors { get; set; } // 字段级校验错误
}

// 列表响应（Index 返回）
public class ApiListResponse<T> : ApiResponse<IList<T>>
{
    public PageModel Page { get; set; }  // 分页：PageIndex/PageSize/TotalCount/Sort
    public T         Stat { get; set; }  // 统计行（p.State）
}
```

### 便捷扩展方法（推荐用于自定义 Action）

```csharp
return data.ToOkApiResponse("操作成功");        // code=0
return data.ToFailApiResponse("参数错误");       // code≠0
return 0L.ToRemotingErrorApiResponse("发送失败"); // 远程/错误码
// 或直接返回 ActionResult：
return Json(0, "ok", data);                      // ControllerBaseX.Json 助手
```

> **字段级校验**：`EntityController` 的 `EnableFieldValidation` 默认 `false`（源码 `=> false`；源码注释“默认 true”不实），
> 必须在子类 `override` 返回 `true` 才启用。开启后 Insert/Update 依据 Model.xml 元数据做必填、长度校验，
> 失败时返回 `FieldErrors`（含 `Field`/`Message`），前端据此高亮对应表单字段。

---

## 五、字段元数据接口（前端动态界面核心）

前端无需硬编码表格/表单，调用以下接口按 `kind` 取字段定义：

| kind | 含义 |
|------|------|
| 1 | List（列表列） |
| 2 | Detail（详情） |
| 3 | AddForm（新增表单） |
| 4 | EditForm（编辑表单） |
| 5 | Search（搜索条件） |

```http
GET /api/School/Student/GetFields?kind=1
GET /api/School/Student/GetPage        // 一次性返回 setting+list+addForm+editForm+detail+search
```

- `GetFields` / `GetPage` 默认标注 `[AllowAnonymous]`，前端可在登录前拉取 schema；
  **真实数据接口（Index/Detail/Insert/...）仍需登录与对应权限**。
- 返回 `List<DataField>`，含 `Name`/`DisplayName`/`Type`/`Nullable`/`Length`/`DataSource` 等，
  前端配合 `@cube/field-mapping` 之类包映射为控件。

---

## 六、权限与鉴权（自定义权限体系）

> 魔方的权限是**“以菜单为资源 + 以权限位为操作”**的模型：每个控制器对应一个菜单节点，菜单节点挂一组
> 按 `PermissionFlags` 位拆分的权限项；权限项由框架**扫描 Action 上的 `[EntityAuthorize]` 自动生成**，
> 不需要手写注册。自定义权限 = 在标准 4 位之外使用更高权限位 + 用 `[DisplayName]` 命名。

### 6.1 权限位模型（PermissionFlags，XCode.Membership，UInt32 [Flags]）

| 值 | 枚举 | 描述（菜单权限项显示名） |
|----|------|--------------------------|
| 0 | `None` | 无权限（仅用于“已登录”语义） |
| 1 | `Detail` | 查看 |
| 2 | `Insert` | 添加 |
| 4 | `Update` | 修改 |
| 8 | `Delete` | 删除 |
| 0xFFFFFFFF | `All` | 所有 |

- 可 `|` 组合：`Insert | Update`、`Detail | Delete`。
- 每个 `IMenu` 持有 `Dictionary<Int32, String> Permissions`，**键 = 权限位整数值**，值 = 权限项显示名；角色管理界面按菜单列出这些项分配给角色。

### 6.2 权限项自动发现（核心机制）

框架在首次访问或扫描时（`MenuHelper.ScanActionMenu` / `EntityAuthorizeAttribute.CreateMenu`）遍历控制器 Action：

- 仅处理 `public`、非 `static`、未标 `[AllowAnonymous]` 的 Action；
- 若 Action 标了 `[EntityAuthorize(p)]` 且 `p > None`：
  - `p ≤ Delete` → 权限项名取 `[Description]`（查看/添加/修改/删除）；
  - `p > Delete` → 权限项名取 Action 的 `[DisplayName]`（缺省用方法名）；
  - 写入 `controller.Permissions[(Int32)p] = 权限名`；
- 若 Action 另标了 `[Menu]` → 生成**独立子菜单**并带对应权限项。
- 新增/变更后 `Role.CheckRole()` 自动对账角色与权限项。

> 结论：**不要手写权限记录**，只要在 Action 上标 `[EntityAuthorize(...)]` + 必要时 `[DisplayName]`，
> 权限项就会自动出现在角色管理里。修改了权限位/名称后，重启或触发扫描即可生效。

### 6.3 `[Menu]` 注册与可见性模式

```csharp
[SchoolArea]                                                  // 区域特性
[DisplayName("学生")]
[Menu(0, true, Mode = MenuModes.Admin | MenuModes.Tenant, Icon = "fa-graduation-cap")]
public class StudentController : EntityController<Student, StudentModel> { }
```

- `[Menu(order, visible, Mode, Icon, LastUpdate)]`：`order` 越大越靠前；`LastUpdate` 用于代码改了菜单参数后**强制覆盖**已有菜单设置。
- `MenuModes`（[Flags]）：`Admin = 1`（管理后台可见）、`Tenant = 2`（租户可见），可 `|` 组合。
- `MenuHelper.CheckVisible(type, isTenant)` 规则（用于租户隔离）：
  - 租户模式（`TenantId > 0`）：仅 `Mode.Has(Tenant)` 的控制器可见；
  - 管理后台：含 `Admin` **或** 未声明任何模式（默认仅后台）可见；
  - 反例：纯 `Admin` 菜单租户不可访问，纯 `Tenant` 菜单后台不可访问。

### 6.4 自定义权限位（CRUD 之外的业务权限）

`PermissionFlags` 是 UInt32 `[Flags]`，除标准 4 位外，可用更高位 `(PermissionFlags)16`、`(PermissionFlags)32` 等作为**自定义业务权限位**：

```csharp
[EntityAuthorize((PermissionFlags)16)]
[DisplayName("审批")]
public ApiResponse<String> Approve(Int32 id) => ...;          // 角色界面出现“审批”权限项

[EntityAuthorize((PermissionFlags)16 | PermissionFlags.Update)]
[DisplayName("撤回")]
public ApiResponse<String> Recall(Int32 id) => ...;
```

- 权限项名取 Action 的 `[DisplayName]`；角色管理里该菜单下会出现“审批 / 撤回”等自定义项；
- 也可用 `[Menu]` 把自定义权限做成独立子菜单项（同时带菜单与权限）。
- ⚠️ `EntityAuthorizeAttribute` 的带参构造在 `permission ≤ None` 时抛 `ArgumentNullException`，
  **必须显式传入权限位**。魔方区域内的“仅要求登录”由全局过滤器兜底（见 6.5），
  不要在 Action 上空写 `[EntityAuthorize()]` 来只校验登录——写上具体权限位才是本意。

### 6.5 鉴权流程（EntityAuthorizeAttribute，IAuthorizationFilter）

> ⚠️ **实际存在两层鉴权，先过第 0 层框架过滤器，再过本节 EntityAuthorize**：
>
> **第 0 层（`BaseController`/`ControllerBaseX` 内置，对全部魔方控制器生效）**：
> `OnActionExecuting` 检查
> `!ActionDescriptor.MethodInfo.IsDefined(typeof(AllowAnonymousAttribute)) && (token 为空 || OnAuthorize(token) 失败)`
> → 抛 `ApiException(403, "认证失败")`。
> **它只认 Action 方法上的 `[AllowAnonymous]`，控制器类上的 `[AllowAnonymous]` 完全无效**（`MethodInfo.IsDefined` 不会回溯类型特性）。
> 纯自定义匿名控制器（第三方回调、门户登录、开放 API 等继承 `ControllerBaseX` 的根控制器）
> **必须在每个 Action 方法上逐个标 `[AllowAnonymous]`**，只在类上标会被 403 拦截。
> 三层 403/401 响应体的区分：
> - `{"code":403,"message":"认证失败","data":"认证失败"}`（无 traceId/fieldErrors）→ 第 0 层框架过滤器，检查方法级 AllowAnonymous；
> - `{"code":401,"message":"没有登录或登录超时！"}` → EntityAuthorize 已注册但无有效令牌；
> - `{"code":403,"message":"{user}访问资源 [Ctrl/Action] 需要 {权限} 权限"}` → EntityAuthorize 已登录无权限。

1. Action/Controller 标 `[AllowAnonymous]` → **直接放行**（注意：第 0 层只认 Action 级）；
2. 控制器**非**魔方区域且未标 `[EntityAuthorize]` → 跳过全局校验；
3. 按 `FullName` 或 `Url` 定位菜单（WebApi 路由去 `/api` 前缀：`WebHelper.TrimApiPrefix`），
   必要时为带特性的非魔方控制器**自动建菜单**；
4. `DataScopeContext.Current?.SetMenu(menu)` 设置数据权限上下文（供 6.7 使用）；
5. `ManageProvider.Provider.Current`（内部 `ManagerProviderHelper.TryLogin`，支持 Bearer / X-Token / Cookie / Query 四种令牌）取当前用户；
6. `user.Has(menu, Permission)` 判定：
   - **未登录 → 401**：`{"code":401, "message":"没有登录或登录超时！"}`；
   - **已登录无权限 → 403**：`{"code":403, "message":"{user}访问资源 [Controller/Action] 需要 {权限描述} 权限"}`，并记“访问-拒绝”日志。

```csharp
// Action 或 Controller 级标注（Controller 级对本控制器全部 Action 生效）
[EntityAuthorize(PermissionFlags.Detail)]
[EntityAuthorize(PermissionFlags.Insert | PermissionFlags.Update)]
public ApiResponse<Student> Xxx() { ... }
```

### 6.6 代码内自定义权限判定

```csharp
var user  = ManageProvider.Provider.Current;        // IManageUser / IUser
var menu  = ManageProvider.Menu.FindByFullName(typeof(StudentController).FullName);
if (user.Has(menu, PermissionFlags.Detail)) { ... }   // 或关系可传多个位
// MVC 视图中：page.Has(menu, flags) / page.Has(flags)（纯 WebApi 前端改用 GET /Auth/Info 判断权限）
```

- `IUser.Has(IMenu, PermissionFlags)`：当前用户对该菜单是否拥有指定权限位（“或”关系，传多位是任意一个即可；要“与”关系请合并成单个多位的 `PermissionFlags` 值再传入）；
- `MembershipExtensions.Has(IRazorPage, ...)`：视图层便捷判定。

### 6.7 与数据权限协同

- `EntityAuthorize` 执行时已 `DataScopeContext.Current?.SetMenu(menu)`，同时供**两套**数据权限拿到菜单上下文：
  - 角色数据范围：`DataScopeContext` 据此解析 `menu.DataScope`（菜单级覆盖角色默认）；
  - 控制器表达式：`[DataPermission]` 的行级过滤（见第十节）。
- `[DataPermission("系统管理员,超级管理员", "CreateUserID={$user.Id} or linkId in {#SiteIds}")]`（详见第十节）；
- `DataPermissionAttribute.Valid(roles)`：当前用户属于 `SystemRoles` 时**跳过**表达式过滤（系统角色不受限）。

---

## 七、登录与 JWT（Auth/Login）

```http
POST /Auth/Login
Content-Type: application/json
{ "username": "admin", "password": "admin" }
```
返回：
```json
{ "code": 0, "data": { "accessToken": "xxx", "refreshToken": "yyy" }, "message": "登录成功" }
```

**令牌传递方式（任选其一）**：
- Header：`Authorization: Bearer <token>`
- Header：`X-Token: <token>`
- Cookie：`Token=<token>`
- Query：`?token=<token>`

其它认证接口：
- `GET  /Auth/Info` —— 当前用户（含角色与权限）
- `GET  /Auth/LoginConfig` —— OAuth 提供商、验证码配置（可匿名）
- `POST /Auth/Refresh` —— 用 RefreshToken 换新的 AccessToken
- `POST /Auth/Logout` —— 登出

> 首个进入系统的用户自动成为管理员，原 `admin` 被禁用。

---

## 八、自定义 API Action

```csharp
// 在 3.4 的 StudentController 基础上追加自定义 Action（partial 拆分）
[SchoolArea]
public partial class StudentController : EntityController<Student, StudentModel>
{
    [EntityAuthorize(PermissionFlags.Detail)]
    [HttpGet]                                   // 路由：GET /api/School/Student/Call
    public ApiResponse<String> Call(String teacher)
    {
        var p = new Pager(WebHelper.Params);    // 复用动态查询参数
        var list = SearchData(p);               // 走与 Index 一致的查询逻辑
        return new ApiResponse<String> { Code = 0, Data = $"已呼叫 {list.Count()} 名学生" };
    }
}
```

- 列表型自定义接口用 `SearchData(Pager)` / `ExportData()`（基类提供）。
- 需要直接返回 JSON 时用 `Json(code, message, data)` 助手（返回 `ActionResult`）。

---

## 九、配置控制器（ConfigController<T>）

与 MVC 一致，为 `Config<T>` 配置类暴露 Web 查看/编辑接口：

```csharp
[SchoolArea]
[DisplayName("订单设置")]
[Menu(0, false, Icon = "fa-cog")]
public class OrderSettingController : ConfigController<OrderSetting> { }
```

自动提供 Get（读取 `Config<T>.Current`）与 Update（线程安全 `Copy + Save`）。

---

## 十、数据范围权限（行级 / 数据权限）

> 魔方提供**两套互补**的数据权限机制：
> 1. **角色数据范围（DataScope）** —— 基于 `Role.DataScope` + 实体接口（`IDataScope` 等）的“本人 / 本部门 / 本部门及下级 / 自定义 / 全部”自动过滤，由 `DataScopeContext` + `DataScopeInterceptor` 在查询与增删改时统一施加；**这是“数据范围权限”的主体**。
> 2. **控制器表达式过滤（DataPermissionAttribute）** —— 在控制器上写一段 `WhereBuilder` 表达式（支持 `{$user.Id}` / `{#SiteIds}` / `{#TenantId}` 占位符），作为更灵活的补充过滤。
> 二者可叠加：`DataScopeContext` 负责按角色范围，`DataPermissionAttribute` 负责按业务规则。

### 10.1 角色数据范围枚举 DataScopes

`XCode.Membership.DataScopes`（定义在 `Role.DataScope` 字段，角色管理界面下拉）：

| 值 | 枚举 | 含义 | 生成的过滤 |
|----|------|------|-----------|
| 0 | `全部` | 不限（系统角色即此） | 不过滤 |
| 1 | `本部门及下级` | 本人部门 + 所有子部门 | `DepartmentId IN (本部门及下级ID)` |
| 2 | `本部门` | 仅本人部门 | `DepartmentId = 本部门ID` |
| 3 | `仅本人` | 仅自己创建的数据 | `UserId = 当前用户ID` |
| 4 | `自定义` | 角色指定的若干部门 | `DepartmentId IN (角色.DataDepartmentIds)` |

- **多角色时范围取最宽（数值最小者胜出）**：`ctx.DataScope = roles.Min(e => e.DataScope)`（`DataScopes` 枚举数值越小代表权限越大）。
- **系统角色（`Role.IsSystem`）自动 `DataScopes.全部` 且 `ViewSensitive = true`**，免过滤、可见敏感字段。
- 无角色用户默认 `仅本人`。

### 10.2 实体接入数据范围（接口）

让实体“可被数据范围过滤”，实现以下接口之一（XCode 自动识别）：

```csharp
// 完整：同时按 用户 + 部门 过滤（如订单、工单）
public class Order : Entity<Order>, IDataScope
{
    [DisplayName("创建人")] public Int32 UserId { get; set; }      // 默认字段名 UserId
    [DisplayName("部门")]   public Int32 DepartmentId { get; set; } // 默认字段名 DepartmentId
}

// 仅需按用户：IUserScope（个人笔记等）
// 仅需按部门：IDepartmentScope（部门公告等）
// 字段名不是默认 UserId/DepartmentId/TenantId 时，额外实现：
public class Order : Entity<Order>, IDataScope, IDataScopeFieldProvider
{
    public FieldItem GetUserField() => Meta.Table.FindByName("CreateUserID");       // 自定义用户字段
    public FieldItem GetDepartmentField() => Meta.Table.FindByName("DeptID");       // 自定义部门字段
    public FieldItem GetTenantField() => Meta.Table.FindByName("TenantID");
}
```

- 默认字段名：`UserId` / `DepartmentId` / `TenantId`；非默认请用 `IDataScopeFieldProvider` 指定。
- 实体需**注册拦截器**才会在增删改查自动施加范围（见 10.4），或在 `Search` 里手动 `ApplyScope`。

### 10.3 DataScopeContext：范围上下文

```csharp
// 框架在每个请求建立（EntityAuthorize 解析菜单后 SetMenu；DataScopeModule 按当前用户+菜单创建）
var ctx = DataScopeContext.Current;        // AsyncLocal，随请求流转
// ctx.DataScope / ctx.UserId / ctx.DepartmentId
// ctx.AccessibleDepartmentIds  // 可访问部门ID列表（null=不限制）
// ctx.IsSystem                 // == DataScope==全部
// ctx.ViewSensitive            // 是否可见敏感字段（任一角色开启即可）
// ctx.MenuId                   // 当前菜单，用于菜单级数据范围覆盖
```

- **菜单级覆盖优先**：当 `IMenu.DataScope >= 0` 时，该菜单下的数据范围以菜单设置为准，覆盖角色默认值（`DataScopeContext.SetMenu(menu)` 内部处理）。
- 创建：`DataScopeContext.Create(user, menu)`；也可在代码里手动构建并赋值给 `DataScopeContext.Current`。

### 10.4 在查询 / 操作中施加范围

**方式 A（推荐，自动）**：实体静态构造器注册拦截器，之后所有 `FindAll` / 校验自动带范围：

```csharp
public partial class Order
{
    static Order()
    {
        Meta.Interceptors.Add<DataScopeInterceptor>();   // 查询自动 AND 范围条件；增删改自动校验归属
    }
}
```

**方式 B（手动）**：在自定义 `Search` 中拼接：

```csharp
public static IList<Order> Search(Int32 status, Pager page)
{
    var exp = new WhereExpression();
    if (status >= 0) exp &= _.Status == status;
    exp = exp.ApplyScope<Order>();          // 同时应用租户 + 数据范围过滤
    return FindAll(exp, page);
}
```

**单条校验**：改/删前判断归属，越权抛 `InvalidOperationException`：

```csharp
var o = Order.FindByID(id);
if (!DataScopeHelper.CanAccess(o)) throw new InvalidOperationException("无权操作此数据");
```

- `DataScopeInterceptor` 行为：`OnQuery` 给查询 AND 范围条件；`OnCreate` 自动填 `UserId/DepartmentId`；`OnValid` 对 Insert/Update/Delete 做归属校验（非本人/非本部门抛异常）；`IsSystem` 或 `DataScope==全部` 时整体放行。

### 10.5 控制器级表达式过滤（DataPermissionAttribute，补充机制）

```csharp
// 控制器/Action 级：expression 经 WhereBuilder 编译为查询条件
// 占位符：{$user.Id}=当前用户ID、{#SiteIds}=可访问站点集合、{#TenantId}=当前租户
[DataPermission("系统管理员,超级管理员",
    "CreateUserID={$user.Id} or linkId in {#SiteIds}")]
public class OrderController : EntityController<Order, OrderModel> { }
```

- 框架在 `CreateWhere()` 中：当前用户**非系统角色且不在 `SystemRoles` 列表**时，把 `Expression` 编译为 `WhereBuilder` 并对列表查询与 `FindData`（单行访问）施加；属于 `SystemRoles` 则跳过该过滤。
- `DataPermissionAttribute.Valid(roles)`：判断当前用户是否属于不受限的系统角色。
- 多租户下 `EnableTenant` 时还会追加 `TenantId={#TenantId}`（或 `Id={#TenantId}` 对 Tenant 实体）。
- 实体控制器（`ReadOnlyEntityController2`）已内置该逻辑；自定义 Action 若要复用，调用基类 `SearchData(Pager)` 即可继承过滤。

### 10.6 敏感字段遮蔽（IFieldScope）

```csharp
public class UserProfile : Entity<UserProfile>, IFieldScope
{
    public String[] GetSensitiveFields() => new[] { "IDCard", "Salary" };
    public Boolean CanViewSensitiveFields(Int32 userId) => userId == UserId; // 仅本人可看
}
// 查询后遮蔽（无 ViewSensitive 权限且非本人时，敏感字段置 "***"）
list.MaskSensitiveFields(context: DataScopeContext.Current);
```

- 是否可见由 `DataScopeContext.ViewSensitive`（角色 `ViewSensitive`）或“是否为本人数据”决定。

### 10.7 数据范围权限常见陷阱

- **两套机制别混淆**：`DataScopes`（角色范围，按部门/用户自动过滤）≠ `DataPermissionAttribute`（控制器表达式）；前者靠实体接口 + 拦截器，后者靠控制器标注。
- **实体必须实现接口 + 注册拦截器**：只标 `IDataScope` 不注册 `DataScopeInterceptor`、也未 `ApplyScope`，范围不会生效。
- **自定义字段名**：字段不叫 `UserId/DepartmentId/TenantId` 时务必实现 `IDataScopeFieldProvider`，否则过滤条件字段错。
- **多角色范围取最宽**：给用户配多个角色时，数据范围会放大到最宽角色，注意最小权限原则。
- **菜单级覆盖**：`IMenu.DataScope` 一旦设置（≥0），会覆盖角色默认值，排查“范围不对”时先看菜单设置。
- **系统角色免过滤**：`IsSystem` 角色 `DataScope` 自动为 `全部` 且可见敏感字段；后台任务/报表若以系统角色执行将看到全量数据。
- **`DataScopeContext` 随请求**：它是 `AsyncLocal`，仅在请求上下文中有效；脱离请求（如独立线程/后台任务）需手动 `Create` 并赋值 `Current`，否则退化为“按当前用户重建”或“无上下文放行”。
- 原文档里 `DataScopeContext.Disable()` **不存在**（当前版本无此方法）；要绕过范围请让执行用户为系统角色，或临时置 `DataScopeContext.Current` 为 `全部` 上下文。

---

## 十一、导出

```http
GET /api/School/Student/ExportFile?format=excel   # WebApi 版“excel”实际输出 CSV（跨平台兼容）
GET /api/School/Student/ExportFile?format=csv
GET /api/School/Student/ExportFile?format=json
GET /api/School/Student/ExportFile?format=xml
```
返回 `FileStreamResult` / `FileContentResult`，文件名含 `DisplayName + 时间戳`。
子类可重写 `OnGetChartData` 提供 ECharts 配置（`GetChartData` 接口）。

---

## 十二、常见陷阱

- **静态构造器字段配置是全局一次性操作**，禁止在实例方法（`OnActionExecuting` 等）中修改 ListFields。
- **GetFields / GetPage 默认匿名可访问**，但数据接口须登录鉴权，别误以为元数据接口能拿到数据。
- **路由前缀**：实体/后台控制器走 `/api` 前缀；`Auth`/`Cube`/`Sso` 服务控制器**无** `/api` 前缀，自定义路由不要再手写 `/api`。
- **区域缺失**：`[area]` 路由 token 依赖 `[XxxArea]` 区域特性/注册，缺它会 404 或菜单解析错乱。
- **PermissionFlags 必须 > None**；`EntityAuthorize(权限位)` 带参构造禁止传 `None`/`0`（会抛 `ArgumentNullException`）。需“仅登录”依赖全局过滤器，别用空构造。
- **自定义权限位要用更高位**（如 `(PermissionFlags)16/32`），并给 Action 加 `[DisplayName]` 命名；标准 4 位（≤Delete）会自动取“查看/添加/修改/删除”描述。
- **权限项是扫描自动生成的**，不要手写菜单/权限记录；改了 `[EntityAuthorize]`/`[DisplayName]` 后需触发扫描（重启或首次访问）才在角色管理生效。
- **`[Menu]` 的 `Mode` 决定租户隔离**：纯 `Admin` 菜单租户不可见、纯 `Tenant` 菜单后台不可见；跨端可见需用 `Admin | Tenant`。
- **TModel 的来源**：Build.tt 从 Model.xml 生成 `*.Models`；未生成时令 `TModel = TEntity`。
- **生产必须配置强 JwtSecret**，否则令牌不安全。
- **EnableFieldValidation 默认关闭**：想拿到 `FieldErrors` 字段级错误须经子类 `override EnableFieldValidation => true`（源码注释“默认 true”不实，实际 `=> false`），开启后 Insert/Update 才做元数据必填/长度校验。
- **数据范围权限两套机制别混**：`Role.DataScope` + 实体接口（`IDataScope` 等）+ `DataScopeInterceptor` 是“按部门/本人自动过滤”；`DataPermissionAttribute` 是“控制器表达式过滤”。前者不注册拦截器/不 `ApplyScope` 不会生效，自定义字段名必须实现 `IDataScopeFieldProvider`。
- **树形实体用错基类**：WebApi 树形接口必须继承 `EntityTreeApiController<TEntity,TModel>`（Up/Down 返回 JSON）；误用 `EntityTreeController` 会让 `Up/Down` 返回 302 `RedirectToAction`，前端拿不到数据。普通实体不能当树用（`TEntity` 须 `: EntityTree<TEntity>`）。
- **需要写操作却用 `ReadOnlyEntityController`**：它天生无 Insert/Update/Delete，别在子类手写写接口绕过只读——直接改用 `EntityController`。
- **⚠️ 不要混用 `NewLife.Cube.AdminLTE`（魔方 MVC 版前端）**：它是服务器渲染的 Razor 管理前端，依赖 MVC 控制器（`return View()`、`Up/Down` 返回 `RedirectToAction` 等）。与 WebApi 后端（控制器返回 JSON、`EntityTreeApiController.Up/Down` 返回 JsonResult）**不兼容**。给 WebApi 项目加 `AdminLTE` 或 `UseTabler/UseMetronic/UseTDesign` 主题调用，会导致页面空白/500、路由冲突、体积膨胀。WebApi 后端只需 `AddCube + UseCube`，前端用独立 SPA（TDesign Vue / React / 小程序）消费 `/api` JSON。两者二选一，不可混搭。
- **⚠️ `AddControllers()` 是 `UseCube` 的硬依赖，纯 WebApi 也必须手动调用**：`UseCube` 内部 `MapControllerRoute(...)` 要求 DI 已注册 MVC 控制器服务，否则启动即抛 `Unable to find the required services. Please add all the required services by calling 'IServiceCollection.AddControllers'`。**注意：这不代表项目"引入了 MVC 服务器渲染"**——`Microsoft.AspNetCore.Mvc` 程序集提供的是 Controller 基础设施，`[ApiController]`/`[Route]`/`[HttpPost]` 等 REST 特性本就来自它，REST API 与服务器渲染共用同一套；真正的 MVC 标志是 Razor 视图（`.cshtml`）、`return View()`、主题包。纯 WebApi 引用 `AddControllers()` 完全正常，勿因此误判架构跑偏。
- **⚠️ `[AllowAnonymous]` 只对 Action 方法生效，标在类上无效**：魔方第 0 层鉴权 `ControllerBaseX.OnActionExecuting` 用 `MethodInfo.IsDefined(typeof(AllowAnonymousAttribute))` 判匿名，**不回溯类型特性**。纯自定义匿名控制器（RADIUS 回调 / 自助门户 / 开放 API）必须在**每个 Action 方法**上逐个标 `[AllowAnonymous]`，只在类上标会被 `403 "认证失败"` 全链路拦截。三层响应体可据此定位：`{code:403,message:"认证失败"}`（无 traceId/fieldErrors）= 第 0 层；`{code:401,message:"没有登录或登录超时！"}` = EntityAuthorize 未登录；`{code:403,message:"{user}访问资源...需要...权限"}` = EntityAuthorize 无权限。
- **⚠️ `AddCube()` 内部注册了返回 null 的 `ITracer` 工厂，会覆盖外部注册**：MS DI 取**最后**一个描述符。`AddCube` 注册 `ITracer => DefaultTracer.Instance`（未初始化时 null），若在 `AddCube` **之前**注册 `ITracer`/`ILog` 会被覆盖，`UseCube → UseStardust` 内部 `GetRequiredService<NewLife.Log.ITracer>()` 抛 `No service for type ITracer has been registered`。**正确顺序**（详见第一节 Program.cs）：`AddCube()` → `DefaultTracer.Instance ??= new DefaultTracer()` → `AddSingleton<ITracer>(...)` + `AddSingleton<ILog>(XTrace.Log)`。
- **SQLite 连接串相对路径基于进程 CWD 而非 ContentRoot**：`DataSource=..\Data\x.db`，`dotnet run`（CWD=工程目录）与直接跑 `bin/Debug/net8.0/*.dll`（CWD=输出目录）会解析到**不同** Data 目录，造成"建了表却查不到 / 冒烟打到旧库"。调试时固定一种启动方式并核对解析结果。
- **XCode `FindAll` 的 order 是裸 SQL 片段，用真实数据库列名**：SQLite 表若经 `BindColumn` 映射为 snake_case（FreeRADIUS 标准表 `acct_start_time`/`timestamp`），order 必须写 `"acct_start_time DESC"` 而非 C# 属性名 `"AcctStartTime DESC"`，否则 `no such column`。自有库列名即属性名（PascalCase），用驼峰。
- **XCode 实体字段默认值不要用 `[BindColumn(DefaultValue="...")]` 写 SQLite 非法语法**：如 `DefaultValue=":="` 会生成 `DEFAULT :=`（非法），`CreateTable` 静默失败（日志仅"修改表CreateTable失败！SQL logic error"），导致 `no such table`。改在字段初始化器赋值（`private String _Op = ":=";`），Model.xml 同步移除 `DefaultValue`。
- **⚠️ `ListFields`/`DetailFields.RemoveField("敏感列")` 只裁剪元数据(GetFields/表单/列表列定义)，绝不裁剪 JSON 响应体**：实测 `GET 列表` 与 `GET Detail` 仍把被移除列的**明文值序列化返回**（本项脱敏密钥泄露事故）。真正的数据脱敏必须在控制器层做：① `Search(p)` 返回 `FindAll(...).Select(投影新实体{Secret=Mask(...)})`；② 重写 `Detail`：`public override ApiResponse<TEntity> Detail(String id)`（注意基类签名是 **string id** 不是 int，用 `((IEntity)e).IsNullKey` 判空）返回投影脱敏；③ Insert/Update 回显前 `ret.Result.Data.Secret=Mask(...)`；④ 需看明文另开高权限 Action（如 `ShowSecret`，`[EntityAuthorize((PermissionFlags)16)]`+审计）。
- **⚠️ 投影脱敏切勿 `foreach(e in list) e.Secret=Mask(...)` 原地改 FindAll/FindByKey 返回的实体**：XCode 实体是缓存对象，赋未变值仍会标脏（HasDirty），并发/后续 `Save` 可能把掩码 `**` 误写回库覆盖真实密钥。必须 `new TEntity{ 逐字段复制, Secret=Mask }` 生成**游离实例**再返回。
- **⚠️ 新增控制器后 `Menu.Permission` 权限项回填失败 / 菜单行丢失（SQLite 启动并发写锁）**：Cube 启动异步初始化多线程并发写 `Membership.db`，SQLite 默认 busy timeout 常不够 → 日志 `code=Busy(5) database is locked`，`Menu.Save()` 的 INSERT/UPDATE **静默异常**。表现=新菜单行缺失或其 `Permission` 列为空，访问接口报 `{code:403,"...需要 查看 权限"}`（`设计错误！验证权限时无法找到[XxxController/Index]的菜单`）。修复：① 连接串加 `Busy Timeout=15000`（appsettings 各 sqlite 连接串，如 `DataSource=..\Data\Membership.db;Provider=sqlite;Busy Timeout=15000`）治本；② 已发生的补数据：手工 `INSERT Menu 行(Name,DisplayName,FullName,ParentID,Url,Permission='1#查看,2#添加,...')` + 把新菜单 ID 补进 `Role.Permission` 串（格式 `{menuId#位掩码}` 逗号分隔，`-1`=该菜单全部子权限，`19#1` 为系统管理特例）。生产首次部署建议串行初始化或预置 admin 全权。
- **⚠️ `ConfigController<T>.Update` 走 XCode `Copy(obj, ignoreNull=false)`，部分字段 PUT 会把缺省字符串属性清空为 null（数据丢失事故）**：反编译确认 `ConfigController.Value` setter = `current.Copy(value,false)`——第二参 false 即"不忽略 null"，前端只回传部分字段（或 JSON 里字段值为 null）时，未携带/为 null 的 String 列被直接写空，既有配置被毁（实测：冒烟部分 PUT 后 `schoolDomain`/`operatorName` 全变 null，下游渲染器 `Quote(null)` 抛 NullReference → Preview 接口 500）。三层防御：① 渲染/消费侧对 null 容忍（`Quote(String? v){ v ??= "" }` 而非表达式体直接 `v.Replace`）；② 控制器重写 `protected override T Value` 的 setter，把 String 类型 null 回落为类型默认值（`new T()` 的属性值）再 `base.Value=value`；③ 或重写 `[HttpGet] Index()` 读时自愈+Save。**根治**：前端配置表单必须"整对象回传"（GET 全量→改→PUT 全量），不能只 PUT 改动字段。
- **⚠️ 实体列名撞上 SQL 保留字（`Order`/`Group`/`User`/`Key`/`Desc` 等）会让 XCode 生成的 `ORDER BY col` 语法报错**：XCode 的 `FindAll(where, "ParentId ASC, Order ASC", ...)` 里 order 串**原样拼接**进 SQL，SQLite 报 `near "Order": syntax error`。修复：① order 串里给保留字列名加**双引号** `"\"Order\" ASC"`（SQLite 标识符引用符是双引号；MySQL 是反引号，故跨库项目应改列名）；② 更稳妥是 Model.xml 里就把该列命名为非保留字（`Sort` 优于 `Order`），改列名需 `xcode NvX.xml` 重新生成实体 + 迁移既有 DB 列。本项目 WecomDepartment.Order 走双引号转义（开发期 SQLite），若上生产 MySQL 需改列名。
- **⚠️ `EntityController` 的 Insert/Update 按整实体绑定，部分字段 PUT 会把未传字段重置为默认值（账号被禁用事故）**：实测 `PUT /api/Admin/User` 只传 `{id,name,displayName,sex,mail,mobile,remark}`，响应里 `enable:false, online:false` —— 布尔字段被置 false，**admin 账号当场被禁用**，后续登录报 `账号admin被禁用！`（用户只能靠改库 `UPDATE User SET Enable=1` 救回）。同时 `RoleID`/`DepartmentID` 为空还会报 `保存失败！角色不可以为空！`。**根因**：模型绑定后未携带字段取 CLR 默认值，落库即覆盖。**正确做法（前端）**：个人资料类表单先 `GET Detail` 拿全量，以全量对象为基底浅合并可编辑字段后再 `PUT`（`{...detail, displayName, sex, ...}`，并**剔除 `password`** 避免哈希被当新密码）；**后端**若需局部更新，应显式重写 Update 或用 `Copy(model, ignoreNull:true)` 语义，别指望"不传即不改"。
- **⚠️ 不要自定义 `UploadFile` 动作**：`EntityController<T>` 基类已内置附件上传（`POST /api/{area}/{ctrl}/UploadFile`，form-data 字段 `file`，返回 `{attId, filePath, contentType}`），子类再写同名动作会冲突。图片/头像/封面上传一律复用基类，见 14.3。

- **⚠️ XCode SQLite 连接串 `:memory:` 覆盖致命 bug（所有接口 500 / `no such table`）**：XCode 的 SQLite DAL 会对**用户自定义连接串**追加 `Data Source=:memory:`。若你的连接串写成 `DataSource=Data\X.db;Provider=sqlite`（**无空格**），XCode 把 `DataSource`（无空格）与 `Data Source`（有空格）解析为**同一键**，后者 `:memory:` 覆盖你的文件路径 → 实际连的是**内存库**。后果：建表在一个连接、建索引/查询在另一连接 → `no such table: UserOnline/Parameter/...`，**所有接口 500**。修复（三处必须同时满足）：① 连接串键名写**带空格**的 `Data Source=`（不要 `DataSource=`）；② 删掉 `Provider=sqlite`（XCode 按扩展名自动识别 SQLite，留着反而干扰）；③ 追加 `Busy Timeout=15000` 防启动并发写锁。正确写法：`"MyBlog": "Data Source=Data\\MyBlog.db;Busy Timeout=15000"`（路径相对进程 CWD，见下方 CWD 陷阱）。**不要手动加建表代码**——用户明确要求"建表是 XCode 内部处理的，只要后端能正常启动 XCode 就会自动建表"，改连接串格式即可，db 会在 `bin/Debug/net8.0/Data/*.db` 落盘。验证：启动日志无 `:memory:`、Portal 接口返回 `code:0`、`Data/*.db` 文件大小 > 0。
- **⚠️ Swagger 必须用 `IsDevelopment()` 双重包裹（服务注册 + 中间件各一处）**：只包中间件，生产仍注册 Swagger 服务（接口清单/模型结构暴露面徒增）；只包服务不挂中间件，开发期 UI 不可达。漏 `using Microsoft.Extensions.Hosting;` 时 `IsDevelopment()` 报 CS1061；漏 `Swashbuckle.AspNetCore` 包时 `AddSwaggerGen/UseSwagger/UseSwaggerUI` 三连 CS1061。生产验证标准：`/Swagger` → **404** 且业务接口（`POST /Auth/Login`）正常 200；开发环境验证：`/Swagger` → 301 → `/Swagger/index.html` 200。详见 §1.1。

## 十三、端到端示例：IoTHub 设备 / 协议 API（选型 + 自定义权限 + 数据范围 + 多租户）

把前面三块（公共控制器选型、自定义权限位、数据范围权限）串成一个可直接套用的范例。
场景：IoTHub 物联网平台需暴露 **设备（Device）**、**协议模板（Protocol，TCP/UDP/MQTT/Modbus 等 UI 驱动配置）**、
**协议实例（ProtocolInstance，同一协议可连多个平台实例）** 的标准 API，并给“下发指令 / 远程配置”这类**非 CRUD 业务操作**定义自定义权限位，
同时对设备数据按**多租户 + 部门/本人**施加数据范围隔离。

> 分层落点（与 IoTHub 四层架构对应）：实体（`Device`/`Protocol`…）放 **Core** 层由 Model.xml + Build.tt 生成；
> `XxxController` 放 **WebAPI** 层（本 skill 关注层）；多实例驱动连接管理在 **Server/Protocols** 层，不在 API 控制器里。

### 13.1 选型总览

| 资源 | 基类 | 原因 |
|------|------|------|
| 设备 `Device` | `EntityController<Device, DeviceModel>` | 标准 CRUD + 需自定义权限位（下发/配置 Action） |
| 协议模板 `Protocol` | `EntityController<Protocol, ProtocolModel>` | UI 驱动配置，需新增/修改；仅后台可见 `Admin` |
| 协议实例 `ProtocolInstance` | `EntityController<ProtocolInstance, ProtocolInstanceModel>` | 多实例，标准 CRUD |
| 设备分组 `DeviceGroup` | `EntityTreeApiController<DeviceGroup, DeviceGroupModel>` | 树形，WebApi 必须用 `EntityTreeApiController`（非 `EntityTreeController`） |

### 13.2 实体接入数据范围（多租户 + 部门/本人）

设备数据属敏感业务数据，按“本人/本部门/本部门及下级”隔离，且跨租户隔离。字段名非默认（`CreateUserID`/`DepartmentID`/`TenantID`），必须实现 `IDataScopeFieldProvider`：

```csharp
[Serializable]
public partial class Device : Entity<Device>, IDataScope, IDataScopeFieldProvider
{
    #region 属性（由 Model.xml + Build.tt 生成，此处仅示意）
    [DisplayName("编号")]     public Int32  ID                { get; set; }
    [DisplayName("设备名称")] public String Name              { get; set; }
    [DisplayName("协议实例")] public Int32  ProtocolInstanceID { get; set; }
    [DisplayName("创建人")]   public Int32  CreateUserID       { get; set; }  // 非默认 UserId
    [DisplayName("部门")]     public Int32  DepartmentID       { get; set; }  // 非默认 DepartmentId
    [DisplayName("租户")]     public Int32  TenantID           { get; set; }  // 非默认 TenantId
    #endregion

    // 非默认字段名必须显式映射，否则数据范围过滤字段写错
    public FieldItem GetUserField()       => Meta.Table.FindByName("CreateUserID");
    public FieldItem GetDepartmentField() => Meta.Table.FindByName("DepartmentID");
    public FieldItem GetTenantField()     => Meta.Table.FindByName("TenantID");

    static Device()
    {
        Meta.Interceptors.Add<DataScopeInterceptor>();  // 查询自动 AND 范围/租户条件；增删改自动校验归属
    }
}
```

> 角色管理里给相关角色设 `DataScope`（仅本人/本部门/本部门及下级/自定义/全部）；多角色取最宽。
> `EnableTenant` 开启时 `ApplyScope` 还会追加 `TenantID={#TenantId}` 实现跨租户隔离（见第十节）。

### 13.3 标准 CRUD 控制器

```csharp
[IoTHubArea]                                                   // 区域特性（[Area("IoTHub")]）
[DisplayName("设备")]
[Menu(10, true, Mode = MenuModes.Admin | MenuModes.Tenant, Icon = "fa-microchip")]
public class DeviceController : EntityController<Device, DeviceModel>
{
    static DeviceController()
    {
        // 字段定制只在静态构造器（全局一次性）
        ListFields.RemoveField("CreateUserID,DepartmentID,TenantID");   // 由数据范围自动约束，不暴露
        AddFormFields.RemoveField("CreateUserID,DepartmentID,TenantID");
        EditFormFields.RemoveField("CreateUserID,DepartmentID,TenantID");
    }

    // 开启字段级校验，Insert/Update 失败时返回 FieldErrors
    protected override Boolean EnableFieldValidation => true;
}

[IoTHubArea]
[DisplayName("协议")]
[Menu(5, true, Mode = MenuModes.Admin, Icon = "fa-network-wired")]  // 协议模板仅后台可见，租户不可见
public class ProtocolController : EntityController<Protocol, ProtocolModel> { }

[IoTHubArea]
[DisplayName("协议实例")]
[Menu(6, true, Mode = MenuModes.Admin | MenuModes.Tenant)]
public class ProtocolInstanceController : EntityController<ProtocolInstance, ProtocolInstanceModel> { }
```

### 13.4 自定义权限位：下发指令 / 远程配置

CRUD 之外的业务操作，用更高权限位 `(PermissionFlags)16` / `(PermissionFlags)32` + `[DisplayName]` 命名；
权限项由框架扫描 `[EntityAuthorize]` 自动出现在角色管理（见 6.2/6.4）。同时用 `DataScopeHelper.CanAccess` 做数据范围归属校验：

```csharp
[IoTHubArea]
[DisplayName("设备指令")]
[Menu(20, true, Mode = MenuModes.Admin | MenuModes.Tenant)]
public class DeviceCommandController : ControllerBaseX   // 非实体 CRUD，用根基类亦可；此处展示自定义 Action
{
    // 自定义权限位 16 = 下发指令
    [EntityAuthorize((PermissionFlags)16)]
    [DisplayName("下发指令")]
    [HttpPost]                                                     // 路由：POST /api/IoTHub/DeviceCommand/SendCommand
    public ApiResponse<String> SendCommand(Int32 deviceId, String payload)
    {
        var dev = Device.FindByID(deviceId);
        if (dev == null) return "设备不存在".ToFailApiResponse<String>();
        if (!DataScopeHelper.CanAccess(dev))                       // 越权（非本人/非本部门/非同租户）拦截
            return "无权操作该设备".ToFailApiResponse<String>();

        // 经 ProtocolInstance 找到对应平台连接，下发到 Server/Protocols 层
        var inst = ProtocolInstance.FindByID(dev.ProtocolInstanceID);
        // Server.Publish(inst, payload);
        return "指令已下发".ToOkApiResponse();
    }

    // 自定义权限位 32 = 远程配置
    [EntityAuthorize((PermissionFlags)32)]
    [DisplayName("远程配置")]
    [HttpPost]
    public ApiResponse<String> RemoteConfig(Int32 deviceId, String config)
    {
        var dev = Device.FindByID(deviceId);
        if (dev == null) return "设备不存在".ToFailApiResponse<String>();
        if (!DataScopeHelper.CanAccess(dev))
            return "无权操作该设备".ToFailApiResponse<String>();
        // ... 下发配置
        return "配置已下发".ToOkApiResponse();
    }
}
```

> 角色管理里 `设备指令` 菜单下会自动出现「下发指令 / 远程配置」两项自定义权限，按需分配给运维角色；
> 未授权用户调用 → **403**（见 6.5）。若把这两个 Action 直接放在 `DeviceController` 上，权限项会挂在 `设备` 菜单下，按需选择即可。

### 13.5 多租户与菜单可见性

- `[Menu(..., Mode = MenuModes.Admin | MenuModes.Tenant)]`：设备/协议实例对后台与租户**都可见**；协议模板用纯 `Admin`，**租户不可见**（避免租户自造协议）。
- `CubeSetting.Current.EnableTenant = true` 开启租户模式后，`ControllerBaseX` 的 `OnActionExecuting` 会对无有效租户上下文的请求 **fail-closed**（403），`Device` 的 `ApplyScope` 追加 `TenantID` 过滤。

### 13.6 端到端鉴权与数据范围流（一次下发指令请求）

1. 前端 `POST /api/IoTHub/DeviceCommand/SendCommand`，Header 带 `Authorization: Bearer <token>`；
2. `ControllerBaseX.LoadToken()` 解析令牌拿到当前用户；`ValidateTenant` 校验租户上下文；
3. `EntityAuthorize` 定位菜单 `设备指令`，`SetMenu(menu)` 写入 `DataScopeContext`（供数据范围解析）；
4. `user.Has(menu, (PermissionFlags)16)` 判定是否有“下发指令”权限 → 无则 **403**；
5. `Device.FindByID` 走 `DataScopeInterceptor`，查询已自动 AND 上「本人/本部门 + 当前租户」范围；
6. `DataScopeHelper.CanAccess(dev)` 二次校验单行归属 → 越权返回失败；
7. 通过后下发到 Server 层，返回 `{ code:0, data:"指令已下发" }`（CamelCase、Int64 字符串化）。

> 前端界面：用 `GET /api/IoTHub/Device/GetPage` 拿字段元数据驱动动态表格/表单（见第五节）；
> 权限控制按钮显隐：前端可据 `GET /Auth/Info` 返回的用户权限，或在有 `GetFields` 的界面结合菜单权限隐藏“下发/配置”按钮。

### 13.7 本示例要点回顾

- 选型：标准主数据 → `EntityController`；树形 → `EntityTreeApiController`；仅后台模板 → `Admin` 可见的 `EntityController`；
- 自定义权限：用 `(PermissionFlags)16/32` + `[DisplayName]`，靠扫描自动注册权限项；
- 数据范围：实体接 `IDataScope` + `IDataScopeFieldProvider`（非默认字段名）+ 注册 `DataScopeInterceptor`；
- 多租户：`EnableTenant` + `TenantID` 字段 + 菜单 `Admin|Tenant` 可见性；
- 校验：需 `FieldErrors` 时子类 `override EnableFieldValidation => true`。
## 十四、前端联调契约速查（WebApi + 独立 SPA 实测结论）

> 本节是「前端该按什么契约对接本后端」的**实测速查**，弥补第八/九节偏后端、缺前端落地细节的空白。
> 经验来自 NewLife.Cube WebApi v6.13 + XCode v12.1 + SQLite 个人博客项目（Vue3/TDesign）端到端联调。
> ⚠️ **不要靠反编译 dll 确认契约**——后端 JSON 行为随版本漂移，HTTP 实测（curl 探针）比读源码更准、更快。
> 📌 **归属说明**：本节只记录**后端契约事实**（登录/路由/响应大小写/门户格式）。**前端代码落地与工程坑**（camelize 实现、脚手架三件套、Vite 代理、npm registry、manualChunks、base 路径、DialogPlugin、SQLite 并发串行）**全部已迁入 `cube-webapi-tdesign` skill 第七节「常见陷阱」**，本后端 skill 不再重复代码，避免前后端知识错置。

### 14.1 登录契约（实测，与文档有出入）

| 项 | 实测结论 | 文档写法 | 注意 |
|----|---------|---------|------|
| 请求体 | `POST /Auth/Login`，`{"username","password","category":0}` | 同 | `category:0`=密码登录；明文密码，无 challenge |
| 令牌键名 | `data.access_token`（**snake_case**） | `data.accessToken`（camelCase） | **文档写错**，前端须做三向归一：`accessToken`/`AccessToken`/`access_token` |
| 刷新令牌 | `data.refresh_token`（snake_case） | `data.refreshToken` | 同上归一 |
| 鉴权头 | **只认 `Authorization: Bearer <token>`** | 文档还列 X-Token/Cookie/Query | `Authentication` 头返回 401；实测 Bearer 最稳 |
| 默认账号 | `admin` / `admin` | — | 首登用户自动升管理员（但 admin 仍可用） |
| 登录配置 | `GET /Auth/LoginConfig`（**匿名**），`oAuth` 键为**大写 A** | `oauth` | 前端做 `oAuth`/`oauth` 双写归一 |

### 14.2 响应 JSON 大小写（关键）

- **响应体：PascalCase**（`Id`/`Title`/`CreateUserID`/`PublishTime`），**非** CamelCase。skill 第八节说"FastJson CamelCase"——**实测当前版本输出 PascalCase**，前端**必须**在响应拦截器里 `camelize`（首字母小写 + 缩写保留：ID→id、URL→url、ParentID→parentID）归一，否则字段对不上。
- **请求体：大小写不敏感**。实测 PascalCase 与 camelCase body **都能绑定成功**（ASP.NET ModelBinder 不区分大小写）。为稳妥，前端**请求统一发 PascalCase** 原样字段（与后端实体属性名一致），别依赖 camelCase。
- **Int64 字符串化**：大整数 id 走字符串，前端按 string 处理避免精度丢失。

#### 14.2.1 PascalCase → camelCase 缩写映射表（camelize 必须保留的规则）

后端输出首字母转小写后，**内部连续大写缩写必须整体降首字母、保留尾大写**，否则字段错位。固化规则：

| 后端 PascalCase | 前端 camelCase | 说明 |
|----------------|---------------|------|
| `Id` | `id` | 最常见，几乎每个实体都有 |
| `CreateUserID` | `createUserID` | ID 整体保留，仅首字母 c 小写 |
| `UpdateUserID` | `updateUserID` | 同上 |
| `ParentID` | `parentID` | |
| `CategoryID` | `categoryID` | |
| `ArticleID` | `articleID` | |
| `RoleID` | `roleID` | |
| `TenantID` | `tenantID` | |
| `URL` | `url` | 全小写（无尾大写） |
| `API` | `api` | |
| `HTTP` | `http` | |
| `IP` | `ip` | |
| `CreateTime` | `createTime` | 普通词，全小写 |
| `PublishTime` | `publishTime` | |
| `AccessToken` | `accessToken` | 但响应里实际是 `access_token`（snake），见 14.1 |

**camelize 实现要点**（递归处理对象/数组/基本类型）：
- 键名转换：`str[0].toLowerCase()` + 其余字符，对**连续大写缩写**用一个正则整体处理：把 `ID`/`URL`/`API`/`HTTP`/`IP` 等已知缩写映射为 `id`/`url`/`api`/`http`/`ip`；对 `XxxID` 形态用「遇到大写字母且前一词是缩写则保留尾大写」的通用规则兜底。
- 实测可用的最小实现：先整体首字母小写，再对 `{2,}` 个连续大写字母段做「除最后一位外全小写」处理（如 `USERID`→`userId` 兜底为 `userID` 形态），并显式维护缩写白名单 `ID/URL/API/HTTP/IP` 直接转全小写。
- 请求时**反向**：前端用 camelCase 状态，发请求前把已知字段 `id`→`Id`、`createUserID`→`CreateUserID` 等转回 PascalCase；但因请求体大小写不敏感（14.2），也可**直接发 camelCase 让 ModelBinder 绑定**，实测可行——为绝对稳妥发 PascalCase。


#### 14.2.2 前端脚手架三件套（camel.ts / token.ts / http.ts）

> **已迁入 `cube-webapi-tdesign` skill 第七节「常见陷阱」**（前端工程实践聚合条目），含可直接拷贝的完整代码：camelize 递归归一（含 ID/URL/ParentID 缩写白名单）、JWT 存取与用户名解析、axios 实例 + Bearer 注入 + 响应 camelize + 401 跳登录拦截器。本后端 skill 不重复代码，避免前后端知识错置。后端契约层面只需记住：响应 PascalCase、请求体大小写不敏感、令牌键 `access_token`（snake_case 三向归一）。

### 14.3 标准 CRUD 路由（EntityController<T>）

| 操作 | 路由 | 注意 |
|------|------|------|
| 列表 | `GET /api/{area}/{ctrl}?pageIndex=1&pageSize=10` | 返回 `{code:0,data:[...],page:{totalCount,...}}`；**`data` 是数组、`page` 独立** |
| 详情 | `GET /api/{area}/{ctrl}/Detail?id={id}` | **id 是查询参数**，不是路径 `/Detail/{id}`（路径写法返回空） |
| 新增 | `POST /api/{area}/{ctrl}`，body=实体 | 成功 `code:0` |
| 修改 | `PUT /api/{area}/{ctrl}`，body 带 `id` | 改必须带 id |
| 删除 | `DELETE /api/{area}/{ctrl}?id={id}` | 单条 |
| 自定义动作 | `POST /api/{area}/{ctrl}/{Action}?id=` | 如 `Publish`/`Offline`/`ToggleTop`，返回 `ApiResponse<String>`（Code=0/500） |

**基类内置的额外动作（实测可用，勿重复造轮子）**：

| 动作 | 路由 | 请求 | 实测返回 |
|------|------|------|---------|
| 附件上传 | `POST /api/{area}/{ctrl}/UploadFile` | `multipart/form-data`，字段名 `file` | `{"code":0,"data":{"attId":"7500438413327732736","filePath":"/cube/image?id=7500438413327732736.png","contentType":"image/png"}}` |
| 修改密码 | `POST /api/{area}/User/ChangePassword` | `{id, oldPassword, newPassword, newPassword2}` | 成功 `code:0`；同旧密码报 `修改密码不能与原密码一致`；无权限 403/405 |

- **`UploadFile` 是 `EntityController<T>` 自带动作**，子类若再定义同名 `UploadFile` 会与基类冲突 —— 需要上传能力**直接复用基类**，前端按上表调 `{area}/{ctrl}/UploadFile` 即可。
- `filePath` 为**相对路径**（`/cube/image?id=xxx.png`），前端图片直接 `src=filePath`；Vite dev 需代理 `/cube` 到后端，否则 404。
- WebApi 模式下**没有**这些 MVC 专属接口：`MyProfile`（500，MVC 动作不兼容）、`SysSetting`/`CubeSetting`/`UserCenter/*`（404）。"魔方设置 / 系统设置"类页面在纯 WebApi 模式下**无法前端可视化维护**，需自行补配置读写控制器，或引导用户在 MVC 后台维护。
- **个人中心 / 基本设置 / 修改密码 的纯 WebApi 实现方案**：不要等 `MyProfile`/`UserCenter`（均不可用），**直接复用 Admin/User 的标准 CRUD**：① 按用户名调 `GET /api/Admin/User?key={name}` 定位当前用户，再 `GET /api/Admin/User/Detail?id={id}` 取完整资料；② 保存个人资料用 `PUT /api/Admin/User`（body 必须带回 `roleId`/`departmentId`/`enable`/`online` 等原值，否则魔方校验会失败或把账号改禁用）；③ 修改密码用 `POST /api/Admin/User/ChangePassword`（`{id, oldPassword, newPassword, newPassword2}`）。头像如需上传，同样走 `POST /api/Admin/User/UploadFile`，返回 `filePath` 后回填到 `avatar` 字段再 PUT 保存。

### 14.4 匿名门户（PortalController 模式）

博客/官网类项目常写 `PortalController : ControllerBaseX`（**不继承 EntityController**，规避鉴权），提供匿名读接口：
- `Articles(categoryId,tagId,key,pageIndex,pageSize)` → 返回 `{items,totalCount,pageIndex,pageSize,pageCount}`（**`data` 是对象不是数组**，与 EntityController 列表格式不同，前端要分支处理）
- `Detail?id=`、`Categories()`、`Tags()`、`About()`、`Archives()`
- 门户接口**全部 `[AllowAnonymous]`**，但 `[AllowAnonymous]` 必须标在 **Action 方法**上（见 6.5 第 0 层鉴权只认方法级）。

### 14.5 前端工程落地坑（跨端说明，详情见 tdesign skill）

> 以下前端工程坑的**完整代码与做法均已迁入 `cube-webapi-tdesign` skill 第七节「常见陷阱」**（前端工程实践聚合条目）。本后端 skill 仅保留**跨端事实**与指向，不重复前端代码：
> - Vite 代理 target 必须 `127.0.0.1` 而非 `localhost`（沙箱 502）→ 见 tdesign 第七节
> - npm registry 卡死改用 `registry.npmmirror.com`（沙箱 21 分钟 0 输出）→ 见 tdesign 第七节
> - TDesign 全量引入 chunk 过大 → `manualChunks` 拆 vendor → 见 tdesign 第七节
> - 生产 base 路径 `/blog/` + Nginx 子路径反向代理 → 见 tdesign 第七节
> - 删除确认用 `DialogPlugin.confirm` → 见 tdesign 第七节
> - TDesign `<t-form>` 的 `@submit.prevent` 崩溃 → 见 tdesign 第七节（已详述）

- **⚠️ SQLite 并发死锁（跨端事实，后端行为 + 前端修复）**：本后端 SQLite 在**同一页面 3+ 并发查询**时会死锁（busy timeout 不够），前端表现为列表永远 loading。这是后端 SQLite 并发限制，但**前端可规避**：串行发请求（先 `loadMeta()` await 完再 `loadArticles()`），不要 `Promise.all` 并发打同库多接口。治本可在后端连接串加 `Busy Timeout=15000`（见第十二节 `:memory:` 修复同源）。前端串行写法见 `cube-webapi-tdesign` 第七节。

### 14.6 联调验证清单（冒烟）

- [ ] `POST /Auth/Login` 返回 `data.access_token`（三向归一后取到）
- [ ] 带 `Authorization: Bearer` 访问 `GET /api/{area}/{ctrl}` → 200 + `data:[]`
- [ ] **不带 token** 访问同一接口 → 401（确认鉴权链路通）
- [ ] 列表 `data` 为数组 + 独立 `page`；门户列表 `data` 为 `{items,...}`（分支处理）
- [ ] 响应拦截器 `camelize` 后前端字段对齐（如 `createUserID`）
- [ ] 自定义动作 `POST /{Action}?id=` 返回 `code:0`
- [ ] 首页多接口**串行**加载，无永久 loading

### 14.7 标准冒烟探针脚本（curl，登录→token→401/200 验证）

> 复制到 bash 直接跑（Windows Git Bash / WSL 均可）。`BASE` 填后端地址；前端走代理时填前端地址（如 `http://127.0.0.1:5173`）亦可，代理会转发到后端。

```bash
BASE="http://127.0.0.1:5000"          # 或前端代理地址 http://127.0.0.1:5173
USER="admin"; PASS="admin"

echo "=== 1) 登录拿 token（实测键名 data.access_token，snake_case）==="
RESP=$(curl -s -m 8 -X POST "$BASE/Auth/Login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\",\"category\":0}")
echo "$RESP" | head -c 200; echo
TOKEN=$(echo "$RESP" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
echo "token_len=${#TOKEN}"
[ -z "$TOKEN" ] && { echo "❌ 登录失败，未拿到 token"; exit 1; }

echo "=== 2) 带 token 访问管理列表（应 200 + data）==="
curl -s -m 8 -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/Blog/Article?pageSize=10" | head -c 200; echo

echo "=== 3) 不带 token 访问（应 401，确认鉴权链路通）==="
curl -s -m 8 -o /dev/null -w "no-token HTTP %{http_code}\n" \
  "$BASE/api/Blog/Article?pageSize=10"

echo "=== 4) 匿名门户（应 200 + code:0，无需 token）==="
curl -s -m 8 "$BASE/api/Blog/Portal/Categories" | head -c 200; echo

echo "=== 5) 详情 id 走查询参数（应返回数据，非空）==="
curl -s -m 8 "$BASE/api/Blog/Portal/Detail?id=1" | head -c 200; echo
```

**判定标准**：
- 步骤 1 `token_len > 0` → 登录契约正确（若拿到的是 `accessToken` 说明版本差异，改 sed 正则即可）
- 步骤 2 返回 `code:0` + `data` 数组 → CRUD 列表通
- 步骤 3 `HTTP 401` → `[AllowAnonymous]` 缺失的接口被正确拦截，鉴权生效
- 步骤 4 `code:0` → 匿名门户通
- 步骤 5 返回 `Content` 等字段 → `Detail?id=` 查询参数写法正确（若用 `/Detail/1` 路径则返回空，印证 14.3 结论）

> Windows PowerShell 里 `sed` 不可用，改用：`($RESP | Select-String '"access_token":"([^"]*)"').Matches.Groups[1].Value` 取 token；或装 Git Bash。

---

## 推荐检查项

- [ ] `Program.cs` 已 `AddControllers()` + `AddCube()`，且 `ITracer`/`ILog` 注册在 `AddCube()` **之后**（防被 AddCube 内部 null 工厂覆盖）
- [ ] 纯自定义匿名控制器（回调/门户/开放 API）的 `[AllowAnonymous]` 标在**每个 Action 方法**上（类上标注对第 0 层鉴权无效）
- [ ] 实体控制器标注了区域特性（如 `[SchoolArea]`）、`[DisplayName]`、`[Menu]`
- [ ] 已按业务选对基类：标准 CRUD 用 `EntityController`；只读/字典/报表用 `ReadOnlyEntityController`；树形实体（WebApi）用 `EntityTreeApiController`（非 `EntityTreeController`）；纯自定义接口用 `ControllerBaseX`。需要字段级校验的已 `override EnableFieldValidation => true`
- [ ] 字段定制写在 `static XxxController(){}` 而非实例构造器
- [ ] 自定义 Action 已标注 `[EntityAuthorize]` 或 `[AllowAnonymous]`
- [ ] 需要非 CRUD 的业务权限时，已用更高权限位 `(PermissionFlags)16/32` + `[DisplayName]` 标注，且角色管理能正确显示该权限项
- [ ] 控制器已通过 `[Menu]` 声明可见性 `Mode`（`Admin`/`Tenant`/组合），避免租户/后台越权可见
- [ ] 前端调用 `GetFields`/`GetPage` 驱动动态界面，未硬编码字段
- [ ] 生产环境 `CubeSetting.JwtSecret` 为强密钥；`CorsOrigins` 已限制
- [ ] 多租户场景已正确配置 `DataPermission` 表达式与 `EnableTenant`
- [ ] 需要行级数据范围时，实体已实现 `IDataScope`/`IUserScope`/`IDepartmentScope` 并注册 `DataScopeInterceptor`（或在 `Search` 中 `ApplyScope`），角色 `DataScope` 已按“本人/本部门/本部门及下级/自定义/全部”配置，并注意多角色取最宽范围
- [ ] 敏感字段已用 `IFieldScope` + `MaskSensitiveFields` 处理脱敏
- [ ] 纯 WebApi 服务**未引用** `NewLife.Cube.AdminLTE` / 任何主题包（Razor 前端是 MVC 版，与 WebApi 不兼容）；`Program.cs` 仅 `AddCube()` + `UseCube()`
- [ ] Swagger（若启用）已用 `IsDevelopment()` 双重包裹服务注册与中间件（§1.1），且已装 `Swashbuckle.AspNetCore` 包、`using Microsoft.Extensions.Hosting;`；生产环境实测 `/Swagger` 404、业务接口正常

---


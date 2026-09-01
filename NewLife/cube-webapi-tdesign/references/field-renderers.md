# 字段渲染器：类型 → 组件映射 + 树形判定

> 配合 `fieldRender.ts` 资产使用。本文件给“怎么把后端 `DataField` 翻译成 TDesign 控件”的完整规则表。

## 1. 控件判定优先级（selectFormControl / controlOf）

按以下顺序短路判定，`DataField` 命中即返回对应控件（实现见 `fieldRender.ts` 的 `selectFormControl`）：

1. **`itemType` 特化编辑器**：`html` → `html`（富文本）；`mail` → `email`（+ `{type:'email'}` 校验）；`mobile` → `tel`（+ TDesign 内置 `{telnumber:true}` 校验）；`image` → `image`（三端图像化 + 表单上传，见 §8）
2. **`typeName === 'Boolean'`** → **`switch`**
3. **映射字段：`mapField` 非空 → 下拉**（★ 核心规则，见 §3.6）。按 `mapField` 值（原始字段名）细分：
   - 以 `IDs`/`Ids` 结尾 → **`multi-select`**（`RoleNames` → `RoleIds`）
   - 等于 `ParentID` → **`tree-select`**（`ParentName` → `ParentID`）
   - 其余 → **`select`**（`TenantName` → `TenantId`）
4. **字段名以 `IDs`/`Ids` 结尾**（复数外键，如 `RoleIds`、`DataDepartmentIds`）→ **`multi-select`**
5. **`typeName` 为枚举类型名**（非基础类型，见下）→ **`select`**
6. **字段名以 `ID`/`Id` 结尾且非主键**：`ParentID` → `tree-select`；其余 → **`select`**
7. `map` 或 `dataSource` 存在 → **`select`**
8. 基础类型兜底：`DateTime` → `datetime`；`Date` → `date`；整数/浮点 → `number`；
   `String` 且 `length > 200` → `textarea`；默认 → `input`

> **如何判定 `typeName` 是枚举类型名**：真实 NewLife.Cube 的 `typeName` 既返回基础类型
> （`Int32`/`String`/`Boolean`/`Double`/`DateTime`/`Int64`），也返回**枚举类型名**
> （实测：`DepartmentTypes`、`SexKinds`、`MenuTypes`、`DataScopes`、`RoleTypes`）。
> 判定方法：`typeName` 非空且不在基础类型集合内 → 枚举 → 单选下拉（见 `isEnumType`）。
> **注意**：`Sex` 字段的 `typeName` 是 `SexKinds`（枚举），不是 `Boolean`，勿按字段名臆断。

> **核心约束（与 §3 一致）**：凡是 `xxxID` 字段（命名约定），无论后端是否直接给出 `map`/`dataSource`：
> - **列表页**：该列回显**映射后的名称**，绝不显示原始 ID 数值；
> - **表单页**：该字段渲染为**映射源下拉**（选项解析顺序见 §3）。
> 外键关联字段（如 `CreateUserID`、`DeptID`、`CategoryID`）：若后端通过 `map`/`dataSource` 提供名称映射，直接 `select` + `labelOf`；
> 否则走 `lookups`（前端异步拉取关联实体 `Index` 组装 `id→名` 字典）兜底，或按页面策略隐藏该列。

## 2. 类型 → TDesign 组件速查表

| DataField.type（CLR） | 列表回显 | 表单控件 | 备注 |
|----------------------|----------|----------|------|
| `String` (len≤200) | 文本 | `t-input` | `maxlength=length`；`placeholder=description` |
| `String` (len>200) | 文本(截断) | `t-textarea` | 列表可加 `ellipsis` |
| `Boolean` | `t-tag`✓/✗ 或 `t-switch`(disabled) | `t-switch` | 映射 `true/false`→是/否 |
| `Int32`/`Int` | 数字 | `t-input-number` | `:step="1"` |
| `Int64`/`Long` | 字符串(原样) | `t-input-number` 或 `t-input` | **值用字符串**避免精度问题 |
| `Double`/`Decimal`/`Float` | 数字(2位) | `t-input-number` | `:decimal-places="2"` |
| `DateTime` | `YYYY-MM-DD HH:mm` | `t-date-picker` `enable-time-picker` | `value-type="YYYY-MM-DD HH:mm:ss"` |
| `Date` | `YYYY-MM-DD` | `t-date-picker` | |
| `Guid` | 文本(截断) | `t-input` | 通常只读/隐藏 |
| 枚举类型（有 `map`） | label | `t-select` options=`map` | 见 §3 |
| 字典/外键（有 `dataSource`） | label | `t-select` options=`dataSource` | 见 §3 |

## 3. 字段映射（xxxID 双模式：列表显名 / 表单下拉）

后端 `[Map]` 特性经 `MapAttribute.GetDataSource()` 序列化为 `DataField.map: Record<value, label>`；
外键/数据字典还可能给出 `dataSource: {text,value}[]`。**这两者既是“列表显示名”的来源，也是“表单下拉选项”的来源。**

### 3.1 命名约定：什么是“映射字段”

凡是字段名以 `ID`/`Id` 结尾（且非自身主键/自增，如 `StatusID`、`CategoryID`、`CreateUserID`、`ParentID`）
即为**映射字段（xxxID）**。即便后端没给 `map`，也按映射字段处理（走 lookup 兜底，见 §3.4）。

### 3.2 双模式规则（核心）

| 场景 | 行为 | 依据 |
|------|------|------|
| **列表页（list）** | `xxxID` 列**显示映射后的名称**（如 `StatusID=1` → “启用”），**绝不显示原始 ID 数值** | `labelOf(field, value, lookups)` |
| **表单页（form）** | `xxID` 字段渲染为**映射源下拉**（枚举选值 / 外键选记录），选项来自映射源 | `resolveOptions(field, lookups)` |

### 3.3 映射源解析顺序（两者共用）

1. `field.map`：`Record<value, label>`，既是显示名表，也可直接当选项；
2. `field.dataSource`：`{text, value}[]` 选项源；
3. `lookups[lookupBaseName(field)]`：前端异步拉取关联实体 `Index` 组装的 `id→名` 字典
   （键为去 `ID/Id` 后缀的基名，如 `CategoryID → Category`）。

```typescript
// fieldRender.ts
export function toOptions(f: DataField) {
  if (f.map) return Object.entries(f.map).map(([value, label]) => ({ value, label }));
  if (f.dataSource) return f.dataSource.map(d => ({ value: d.value, label: d.text }));
  return [];
}
// 大小写不敏感取字典：兼容 PascalCase(Parent) 与 camelCase(parent) 两种后端命名，
// 避免键大小写不匹配导致外键/ParentID 列回显不出名称（见 SKILL.md §七）。
function lookupDict(lookups: LookupMap | undefined, base: string): Record<string, string> | undefined {
  if (!lookups || !base) return undefined;
  const t = base.toLowerCase();
  const hit = Object.keys(lookups).find((k) => k.toLowerCase() === t);
  return hit ? lookups[hit] : undefined;
}
// 表单：下拉选项（映射源）
export function resolveOptions(f: DataField, lookups?) {
  const base = toOptions(f);
  if (base.length) return base;
  if (isIdField(f)) {
    const dict = lookupDict(lookups, lookupBaseName(f));
    if (dict) return Object.entries(dict).map(([value, label]) => ({ value, label }));
  }
  return [];
}
// 列表：回显映射名称
export function labelOf(f: DataField, value: unknown, lookups?) {
  if (value == null) return value;
  if (f.map) return f.map[String(value)] ?? value;
  if (f.dataSource) return f.dataSource.find(d => d.value === value)?.text ?? value;
  if (isIdField(f)) {
    const dict = lookupDict(lookups, lookupBaseName(f));
    if (dict) return dict[String(value)] ?? value;
  }
  return value; // 无法解析的外键 → 页面策略决定隐藏该列
}
```

### 3.4 外键 lookup 兜底（无 map/dataSource 时）

当 `xxxID` 后端仅返回原始 ID、未带 `map`/`dataSource`，前端需自行构造 `lookups`：

- 页面进入时，对每一个待解析的 `xxxID` 字段，用 `lookupBaseName` 得到关联实体名（如 `CategoryID → Category`），
  调用其 `GET /api/{area}/{Category}`（`Index`）拉全量（或分页）记录，组装 `{ [id]: name }` 写入 `lookups.Category`；
- 列表列 `buildColumns(list, lookups)` 经 `labelOf` 回显名称；
- 表单 `buildFormItems(form, lookups)` 经 `resolveOptions` 渲染下拉。
- 关联实体 area 不明时，可约定与当前实体同 area，或后端在 `DataField` 额外提供 `source`（关联控制器路径）供前端定位。

> 注意：魔方多数情况下已通过 `[Map]`/关系自动填充 `DataField.map`，lookup 仅为“后端未带映射”的高级兜底路径。

### 3.5 多值外键（xxxIDs / xxxIds）

**背景**：部分字段以逗号分隔字符串存储多个外键（`typeName` 为 `String`，但语义是多选）。
实测真实后端：`User.RoleIds`（`mapField` 关联显示字段 `RoleNames`）、`Menu.DataDepartmentIds`。

**识别**：字段名以 `IDs`/`Ids` 结尾（`isIdsField`），或映射显示字段的 `mapField` 以 `IDs`/`Ids` 结尾。

**渲染与数据流转**：

| 环节 | 处理 | 函数 |
|------|------|------|
| 表单控件 | `t-select multiple` | `selectFormControl → 'multi-select'` |
| 选项解析 | 同单选，键为 `lookupBaseName`（`RoleIds → Role`） | `resolveOptions` |
| 回填 | 逗号串 → 数组：`'1,3'` → `['1','3']` | `deserializeMultiValue` |
| 提交 | 数组 → 逗号串：`['1','3']` → `'1,3'` | `serializeMultiValue` |
| 列表回显 | 逐个映射后用「、」拼接：`1,3` → `管理员、运营` | `labelOf` |
| 详情回显 | 拆成多个 `t-tag` 标签 | `DetailDrawer.multiLabels` |

> **易错点**：`labelOf` 只在**含逗号**时才做多值拆分，避免把单值 `'1'` 误当数组处理；
> 且空串/空数组要正确回落到 `-`，不要在详情里渲染出空标签。
>
> **⚠️ 多选控件 value 必须为数组（高频坑，`Symbol.iterator` 崩溃）**：TDesign `t-select multiple`
> 内部用 `for...of` 遍历 `value`，收到 `null`/`undefined`/空串直接抛
> `can't access property Symbol.iterator, r is null`。`deserializeMultiValue` **必须永远返回数组**：
> `null`/`undefined`/空串 → `[]`、已是数组 → 原样、逗号串 → 拆分去空项、单值 `'3'` → `['3']`。
> 新增/编辑表单在 `editId` watch 里清空表单后、回填前，先对所有 `it.multiple` 字段置 `[]`，避免首帧绑定 null。

### 3.6 映射字段（`mapField` 非空 → 下拉）

**规则**：`DataField.mapField` **非空即代表该字段是映射字段，必须用下拉列表展示**；
`mapField` 的值就是**原始字段名称**（真实字段名，不一定以 ID 结尾，但实测均以 ID/IDs 结尾）。

映射字段是「显示名」字段（如 `TenantName`），其真实存储字段由 `mapField` 指出（`TenantId`）。
前端在表单里直接用显示名字段渲染下拉，**选项与回显都按原始字段名解析关联源**。

实测真实后端全部映射字段（9 个）：

| 映射字段 | `mapField`（原始字段） | 控件 | lookups 基名 |
|---------|----------------------|------|-------------|
| `TenantName` | `TenantId` | `select` | `Tenant` |
| `ParentName` | `ParentID` | `tree-select` | `Parent` |
| `ManagerName` | `ManagerId` | `select` | `Manager` |
| `AreaName` | `AreaId` | `select` | `Area` |
| `RoleName` | `RoleID` | `select` | `Role` |
| `DepartmentName` | `DepartmentID` | `select` | `Department` |
| `RoleNames` | `RoleIds`（复数） | `multi-select` | `Role` |
| `CreateUserName` | `CreateUserID` | `select` | `CreateUser` |

**落地要点**：
- 判定用 `isMappedField(f)`（`mapField` 非空且非空白），**不要**额外要求 `mapField` 以 ID 结尾；
- 取原始字段名用 `mappedFieldName(f)`；
- `lookupBaseName(f)` 对映射字段一律以 `mapField` 值为准去后缀（`TenantId→Tenant`、`RoleIds→Role`），
  这样 `RoleName` 与 `RoleNames` 共用同一个 `Role` 字典，不重复拉取；
- 多值判定统一用 `isMultiValue(f)`（自身 `xxxIDs`，或 `mapField` 为 `xxxIDs`），供
  `labelOf` 的「、」拼接、`t-select multiple`、`DetailDrawer` 的标签组共用。

## 4. 树形表格判定（treeTable）

**规则**：**全部字段组聚合**（list + addForm + editForm + detail + search）中存在名为 **`ParentID`**（不区分大小写）的字段，**或**存在 `mapField=ParentID` 的映射字段（如 `ParentName`）时，该实体为树形结构，前端改用树形表格。

> **⚠️ 高频坑（漏判成平铺表）**：**不能只查 `list` 组**——NewLife.Cube 常把 `ParentID` 从列表列隐藏、仅以 `ParentName`（`mapField=ParentID`）映射列展示（实测 `Admin/Department` 的 list 组只有 `ParentName`，`ParentID` 仅在 search 组）。`isTreeSchema`/`selectListComponent`/`useEntityResource.isTree` 的判定输入必须是**五字段组聚合**，判定条件为「字段名=ParentID 或 mapField=ParentID」。

- 列表数据通常是**扁平数组**（每行含 `id` 与 `parentId`/`ParentID`）。
- 前端 `buildTree(rows)` 将扁平数组按父子关系组装为带 `children` 的树，喂给 `<t-enhanced-table :data>`。
- 新增/编辑表单中 `ParentID` 渲染为 **树形下拉**（`t-tree-select`，选项来自同实体的 `Index` 列表：自身除外，避免选自己为父）。

```typescript
export function isTreeSchema(fields: DataField[]) {
  return fields.some(
    (f) =>
      f.name.toLowerCase() === 'parentid' ||
      String(f.mapField ?? '').toLowerCase() === 'parentid',
  );
}
export function buildTree(rows: any[], idKey = 'id', parentKey = 'parentID') {
  if (!rows.length) return [];
  // 归一行 key 为 camelCase：真实后端常返回 PascalCase(ID/ParentID/Name)，
  // 直接按 'parentID' 取父键会得到 undefined → 所有节点判为根 → 树塌成平铺。
  const nodes = rows.map((r) => {
    const o: Record<string, any> = {};
    for (const k of Object.keys(r)) o[camel(k)] = r[k];
    return o;
  });
  const map = new Map<any, any[]>();
  const roots: any[] = [];
  nodes.forEach(r => {
    const pid = r[parentKey];
    if (pid == null || pid === '' || pid === 0) roots.push(r);
    else { if (!map.has(pid)) map.set(pid, []); map.get(pid)!.push(r); }
  });
  const link = (node: any) => { const c = map.get(node[idKey]); if (c) { node.children = c; c.forEach(link); } };
  roots.forEach(link);
  return roots;
}
```

> 与魔方 MVC 前端的对应：`ListTree.cshtml` 仅替换 `_ListTree_Data` 分部视图（vs 普通 `List` 用 `_List_Data`），
> 即“同一套页面骨架，树形只是局部特化”。Vue 侧同样：`ListPage.vue` 一个组件，靠 `isTreeSchema` 切换 `tree` 模式。

> **⚠️ 树形必须基于完整数据集（高频坑：树断链塌平铺）**：分页只返回当前页，跨页父子会让子节点找不到父节点 → 树断链。
> 前端须用 `useEntityResource.loadAll(params?)`（超大 `pageSize` 取全量）构建树，`ListPage` 在
> `init`/搜索/排序/增删改后树形一律走 `loadAll`；`ParentID` 列经自构建 `selfLookups['Parent']`(id→name) 回显父级名称。
> 详见 SKILL.md §七。

> **⚠️ 树形表格必须用 `t-enhanced-table`（高频坑：Table 系不支持树形）**：TDesign 文档明确「树形结构的表格请使用 EnhancedTable，Table/PrimaryTable/BaseTable 等不支持树形结构」。源码实证：`t-table` 注册的是 `PrimaryTable`（`table/index.mjs`：`cloneDeep(_PrimaryTable)`），`tree` prop 与 `useTreeData` hooks 只在 `enhanced-table` 里存在——**用 `t-table` 渲染树形，`tree` prop 被静默忽略，子节点不显示/只平铺根节点**。树形分支必须用 **`<t-enhanced-table>`**（列定义/分页/事件与 `t-table` 一致）。
>
> **⚠️ 树形表格默认收起子节点（高频坑：只显示根节点）**：`<t-enhanced-table>` 子节点默认收起，
> 必须显式 `:tree="{ childrenKey: 'children', defaultExpandAll: true, treeNodeColumnIndex: 0 }"`
> 让子节点开箱即见（`defaultExpandAll: true`），否则用户看到「树形表只有根节点」误以为没生效。
> 展开图标默认在首列（`treeNodeColumnIndex: 0`）。

## 5. 可空 / 只读 / 主键 的控件处理

- `primaryKey || isIdentity`：新增表单（`addForm`）中隐藏该字段；编辑表单禁用。
- `readOnly`：表单 `disabled`。
- **必填判定（`required` 语义）**：`required`=界面是否必填（UI 语义），`nullable`=数据库是否允许为空（NOT NULL 约束），**二者不可互相推导**。统一走 `resolveFieldBehavior(f)`（返回 `{required, readOnly, nullable, primaryKey}`）：`required===true` → 必填；其余用 `nullable===false` **兜底推断**，但排除主键/自增/`readOnly`/审计字段（`CreateTime`/`UpdateTime`/`CreateUserID`/`UpdateUserID`/`CreateIP`/`UpdateIP`）。⚠️ 实测本后端对所有字段下发 `required:false`（0 个 true），故 `required` 仅在为 `true` 时生效，不能把 `false` 当「明确不必填」（否则连 `Name` 都不校验）；反例：直接 `!nullable` 当必填会把 `ID`/`CreateTime`/`CreateUserID` 也标红星。详见 SKILL.md §七与 `metadata-contract.md` §4。
- `sortable`：`t-table` 列设 `sortable: true`，排序事件回写 `page.sort` 重新拉取。

## 6. 搜索栏（kind=5）

`search` 字段集合渲染为筛选区：`input`/`select`/`date-range`/`switch`。
提交时将各字段值收集为查询参数，传给 `Index` 的 `params`（后端 `SearchData` 据此拼接 `Where`）。
日期类建议用 `t-date-range-picker`，提交时拆成 `Start__{field}` / `End__{field}`（按后端约定，必要时咨询 `cube-webapi-backend`）。

## 7. 组件 / 页面选型策略（元数据驱动）

**原则**：列表页用哪种表格、表单字段用哪种控件，**全部由后端 `GetPage` 的字段集合决定**，而非前端硬编码。
`ParentID → 树形表格 + 树形下拉` 只是最典型的例子；下表给出完整决策规则（即 `selectListComponent` / `selectFormControl` 的行为）。

### 7.1 列表页组件选型（selectListComponent）

| 全部字段组聚合特征 | 列表组件 | 说明 |
|------------------|----------|------|
| 含 `ParentID`（不区分大小写）**或** `mapField=ParentID`（如 `ParentName`） | `t-enhanced-table` | 树形表；扁平数据经 `buildTree` 组装，`row-key="id"` `parent-key="parentID"`；**判定输入为五字段组聚合**（ParentID 常不在 list 组，见 §4） |
| 其它 | 普通 `t-table` | 分页 + 操作列 |

### 7.2 表单字段控件选型（selectFormControl）

| 字段特征（按 §1 优先级） | 表单控件 | 选项/数据来源 |
|----------|----------|---------------|
| `itemType = html` | `t-textarea`（autosize） | 富文本内容，如 `Remark` |
| `itemType = mail` / `mobile` | `t-input` `type=email` / `type=tel` | 如 `Mail`、`Mobile`；校验见 §7.5 |
| `itemType = url` | `t-input` `type=url` | 如 `UrlVal`；校验追加 `{ type:'url' }`（R2 内置，见 §7.5） |
| `itemType = color` | `t-color-picker` | 值存色值字符串，如 `ColorVal` |
| `itemType = file` | `t-upload theme="file"` | 值存 URL 字符串，如 `FileUrl`；上传端点同 image（§8） |
| `itemType = json` | `CodeEditor`（`language="json"`，CodeMirror 6 语法高亮） | 如 `JsonVal`；值存 JSON 字符串 |
| `itemType = markdown` | `CodeEditor`（`language="markdown"`，CodeMirror 6 语法高亮） | 如 `MarkdownVal`；值存 Markdown 字符串 |
| `itemType = icon` | `IconPicker`（TDesign 图标选择器弹窗，枚举 `tdesign-icons-vue-next` 全部 SVG 组件） | 如 `IconVal`；值存 kebab 图标名字符串（如 `browse`） |
| `itemType = singleSelect`（lovCode=`Enum.*`） | `t-select` | 枚举字典下拉，如 `SingleVal`、`Kind` |
| `itemType = singleSelect`（lovCode=`List.*`） | LOV 弹窗表格单选（`lov-table`） | 如 `ListVal` |
| `itemType = multipleSelect`（lovCode=`Enum.*`） | `t-select multiple` | 枚举字典多选，如 `MultiVal` |
| `itemType = multipleSelect`（lovCode=`List.*`） | LOV 弹窗表格多选（`lov-table-multi`） | 如 `ListMVal` |
| `itemType = lovTable` | LOV 弹窗表格单选（`lov-table`） | 如 `ListVal` |
| `itemType = lovTableMulti` | LOV 弹窗表格多选（`lov-table-multi`） | 如 `ListMVal` |
| `typeName = Guid` | `t-input`（基础字符串类） | 如 `GuidVal`；描述“只读文本”只是约定，元数据未置 `readOnly` 时不强制只读 |
| `typeName = Boolean` | `t-switch` | 是/否（`Enable`、`Visible`…） |
| 字段名 `xxxIDs`/`xxxIds`（复数外键） | `t-select` **`multiple`** | 逗号分隔字符串 ⇄ 数组，见 §3.5 |
| `typeName` 为枚举类型名 | `t-select` | 枚举选项（lookups 兜底），如 `Type`、`Sex`、`DataScope` |
| 字段名 `ParentID` | `t-tree-select` | 同实体 `Index` 全部记录组装的树，且排除自身（避免选自己为父） |
| 字段名 `xxxID`/`xxxId` | `t-select` | 映射源（§3.3 顺序 3：lookups 兜底） |
| 映射显示字段（`mapField` 指向外键） | `t-select` / `t-select multiple` | 如 `TenantName`→单选、`RoleNames`→多选 |
| 有 `map` / `dataSource` | `t-select` | 映射源（§3.3 顺序 1、2） |
| `DateTime`（含时间） | `t-date-picker` `enable-time-picker` | `value-type="YYYY-MM-DD HH:mm:ss"` |
| `Date` | `t-date-picker` | `value-type="YYYY-MM-DD"` |
| 数字类型 | `t-input-number`（Int64 用字符串） | `:step`/`decimal-places` |
| `String` 长文本（len>200） | `t-textarea` | `maxlength` |
| 其它 `String` | `t-input` | `maxlength` |

### 7.3 选型函数伪代码（落地见 fieldRender.ts）

```typescript
// 列表组件：依据全部字段组聚合
function selectListComponent(fields: DataField[]): 'flat' | 'tree' {
  return isTreeSchema(fields) ? 'tree' : 'flat'; // 见 §4：ParentID 或 mapField=ParentID
}

// LOV 关联源类型：lovCode 前缀决定走枚举字典还是实体列表弹窗
function lovTypeOf(f: DataField): 'enum' | 'list' | null {
  const code = (f.lovCode ?? '').trim();
  if (!code) return null;
  if (code.toLowerCase().startsWith('list.')) return 'list';
  if (code.toLowerCase().startsWith('enum.')) return 'enum';
  return 'enum'; // 未知前缀默认枚举字典
}
// 解析 List.{area}.{controller} → 弹窗表格要拉取的实体
function parseLovListCode(code: string): { area: string; controller: string } | null { /* 见 fieldRender.ts */ }

// 表单控件：依据单个字段（按 §1 优先级短路）
function selectFormControl(f: DataField): FieldControl {
  // 1) itemType 特化编辑器（逐一命中即返回）
  const it = (f.itemType ?? '').toLowerCase();
  if (it === 'html') return 'html';
  if (it === 'mail') return 'email';
  if (it === 'mobile') return 'tel';
  if (it === 'image') return 'image';
  if (it === 'file') return 'file';
  if (it === 'color') return 'color';
  if (it === 'icon') return 'icon';
  if (it === 'url') return 'url';
  if (it === 'json') return 'json';
  if (it === 'markdown') return 'markdown';
  if (it === 'lovtable') return 'lov-table';
  if (it === 'lovtablemulti') return 'lov-table-multi';
  // singleSelect / multipleSelect：lovCode=List.* → LOV 弹窗表格；否则下拉
  if (it === 'singleselect' || it === 'multipleselect') {
    const lov = lovTypeOf(f);
    if (lov === 'list') return it === 'multipleselect' ? 'lov-table-multi' : 'lov-table';
    return it === 'multipleselect' ? 'multi-select' : 'select';
  }

  // 2) Boolean → 开关
  const t = ((f.typeName ?? f.type ?? '') as string).toLowerCase();
  if (t === 'boolean' || t === 'bool') return 'switch';

  // 3) 复数外键 xxxIDs/xxxIds → 多选下拉
  if (isIdsField(f)) return 'multi-select';
  if (f.mapField?.match(/(IDs|Ids)$/)) return 'multi-select'; // RoleNames→RoleIds

  // 4) 枚举类型名（非基础类型）→ 单选下拉
  if (isEnumType(f)) return 'select';

  // 5) 单值外键 xxxID/xxxId
  if (isIdField(f)) return f.name.toLowerCase() === 'parentid' ? 'tree-select' : 'select';
  if (f.mapField?.match(/(ID|Id)$/)) return f.mapField.toLowerCase() === 'parentid' ? 'tree-select' : 'select';

  // 6) 枚举/字典选项源
  if (f.map || f.dataSource) return 'select';

  // 7) 基础类型兜底
  if (t.includes('datetime')) return 'datetime';
  if (t === 'date') return 'date';
  if (NUMERIC.has(t)) return 'number';
  if (t === 'string' && (f.length||0) > 200) return 'textarea';
  return 'input'; // 含 Guid：typeName=guid 不在 NUMERIC/日期集合内 → 退化为文本输入
}
```

### 7.4 页面/组件选型落地清单

- `ListPage.vue`：`isTree = selectListComponent(list) === 'tree'` → 切换普通 `<t-table>` / `<t-enhanced-table>`；无需实体页写特判代码。
- `FormDialog.vue`：`item.control === 'tree-select'` 分支渲染 `<t-tree-select>`，选项由同实体 `Index` 经 `buildTree`+`toTreeSelectData`（排除 `editId`）生成；`item.control === 'select'` 分支渲染 `<t-select :options="resolveOptions(f, lookups)">`。
- 实体页只需 `<ListPage area controller title />`（必要时 `:lookups="lookups"`），选型逻辑全在基类。

### 7.5 表单校验规则（buildFormRules，元数据驱动单源）

`FormDialog.vue` 的 `:rules` 由 `buildFormRules(addForm/editForm)` 生成（**不要**在组件内手写规则）。
规则键与 `buildFormItems` 共用 `formItemName` 契约（映射字段用原始字段名，如 RoleName→roleID），
确保与 `t-form-item` 的 `name` 完全一致才生效：

| 字段特征 | 追加规则 | 依据（铁律 R2：内置优先） |
|----------|----------|---------------------------|
| `resolveFieldBehavior(f).required` 为真 | `{ required: true, message: '请填写{displayName}' }` | 必填红标 + 校验 |
| `itemType = mail` | `{ type:'email', message:'{displayName}格式不正确' }` | async-validator **内置** `type:'email'`，不手写正则 |
| `itemType = mobile` | `{ telnumber: true, message:'{displayName}格式不正确' }` | TDesign/async-validator **内置** `telnumber`，不手写正则 |
| `itemType = url` | `{ type:'url', message:'{displayName}格式不正确' }` | async-validator **内置** `type:'url'`，不手写正则（R2 优先内置） |
| 主键/自增字段 | 跳过（不生成规则） | 系统维护，无需界面校验 |

> 非必填空值由 async-validator 自动跳过格式校验（空串不触发 email/telnumber 报错），无需手工判空。
> 若其它 add/edit 表单组件也需校验，统一复用 `buildFormRules(fields)`，不要各写各的。

### 7.6 搜索栏校验（ListSearchBar，复用 buildFormRules）

搜索栏（GetPage.search 驱动）同样复用 `buildFormRules`，但传 `{ required: false }`：

- 搜索项**均为可选**，不加 `required` 规则（否则查个列表还得填满所有筛选项）；
- `itemType=mail`/`mobile` 的**格式规则仍追加**，输入非法格式时拦截查询；
- TDesign `t-form` 提交时自动按 `:rules` 校验，`@submit` 回调拿到 `{ validateResult, firstError }`，
  `firstError` 非空即不 `emit('search')`（见 `ListSearchBar.onSubmit`）；
- 搜索栏 mail/mobile 渲染为 `t-input type="email"/"tel"`（与表单一致，移动端唤起对应键盘）。

## 8. itemType=image 特化（三端图像化 + 表单上传）

字段元数据 `itemType === 'image'`（大小写不敏感）时，三端统一用图像组件：

| 视图 | 实现 | 说明 |
|------|------|------|
| 列表 | `buildColumns` 该列 cell 渲染 `t-image` 缩略图 | `fit:cover` 48×48、圆角、cursor:pointer，点击 `window.open` 开大图，空值显示 `-` |
| 详情 | `DetailDrawer` 对 `isImage(f)` 用 `t-image` | `fit:contain` max 200×160、zoom-in 光标，点击开大图 |
| 表单 | `selectFormControl` 返回 `'image'` → `t-upload theme="image"` | 单图上传（`accept="image/*" :max="1"`），成功回写 `formData[字段]=URL` |

**上传端点（官方契约，高频坑）**：`POST /{Area}/{Controller}/UploadFile(IFormFile file, String id, String title)`
（NewLife.CubeVue 官方前端证实）——form-data 字段名 `file`；`id`=实体主键（编辑场景传主键、新增省略走临时实体路径）；
`title`=附件标题（传字段 displayName，为空后端回退 `entity.ToString()`）；返回 `{code:0, data:{attId, filePath, contentType}}`。
- `uploadUrl` 默认 `/${area}/${controller}/UploadFile`，**不带 `/api` 前缀**（`postApi` 的 http 实例 baseURL 承载，双前缀 → 405）；
- 兼容返回解析：`data` 字符串 / `{url}` / `{id,url}` / `{attId,filePath,contentType}` / `{path}`（`url ?? Url ?? path ?? Path ?? filePath ?? FileName`）；
- **`filePath` 是 `/cube/...` 前缀**——Vite 代理必须加 `/cube`，否则图片 404（见 SKILL.md §七「代理 /api + /cube」）；
- 表单实现要点：`requestMethod` 自定义上传（`postApi` + FormData，走 axios 拦截器带令牌头），模板用闭包
  `:request-method="(f) => uploadRequest(item, f)"` 传入字段 item 才能拼 `title`；`imageFiles`（t-upload v-model）
  与 `formData[字段]`（URL 字符串）两套值，editId watch 清空/回填时同步初始化。

## 9. 值集 / 高阶编辑控件三端特化（color / file / json / markdown / icon / lovTable）

`selectFormControl` 把以下 itemType 归为「高阶编辑器」——它们不在 TDesign 基础控件内、需三端分别特化渲染。
其中 `json`/`markdown` 用 **CodeMirror 6** 编辑器（语法高亮，`CodeEditor.vue`），`icon` 用 **TDesign 图标选择器**
（`IconPicker.vue`，枚举 `tdesign-icons-vue-next` 全部 2300+ SVG 组件），均已实现，非退化渲染。

| itemType / 控件 | 列表（buildColumns） | 表单（FormDialog） | 详情（DetailDrawer） | 值形态 |
|----------------|--------------------|--------------------|--------------------|--------|
| `color`（`t-color-picker`） | 色块 14×14 + 色值灰字；空→`-` | `t-color-picker`（v-model 色值串） | 同列表：色块 + 色值 `span` | 色值字符串 |
| `file`（`t-upload theme="file"`） | `t-link`「下载/查看」开新窗口；空→`-` | `t-upload theme="file"` 单文件，`onSuccess` 回写 URL 串 | 同列表 `t-link` | URL 字符串（复用 §8 UploadFile 端点） |
| `json`（`CodeEditor`） | 文本（ellipsis 截断） | `CodeEditor language="json"`（CodeMirror 6 语法高亮，v-model 双向绑定） | 文本 | JSON 字符串 |
| `markdown`（`CodeEditor`） | 文本 | `CodeEditor language="markdown"`（CodeMirror 6 语法高亮） | 文本 | Markdown 字符串 |
| `icon`（`IconPicker`） | `<Icon name>` 字体图标回显；空→`-` | `IconPicker`（预览 + `选择图标` 按钮 → 可搜索图标网格弹窗，选中写回 kebab 名） | `<Icon name>` 回显 | 图标名字符串（kebab，如 `browse`） |
| `lov-table`（LOV 弹窗表格单选） | `labelOf` 按 `lookupBaseName=controller` 回显名称；空→`-` | 只读 `t-input` 显已选名 + `选择` 按钮，点开 `<t-dialog>` 拉 `List.{area}.{controller}` 的 `Index`，行点击单选，写回 `formData[字段]=id` | 回显名称 | 单值 ID（数字） |
| `lov-table-multi`（LOV 多选） | 同 lov-table，多值「、」拼接 | 同上但勾选多行，写回 `formData[字段]=逗号串` | 多值「、」拼接 | 逗号分隔 ID 串 |

### 9.1 LOV 弹窗表格实现要点（FormDialog）

- **`lovCode` 前缀统一约定**（见 §7.3 `lovTypeOf`）：`Enum.*`→下拉字典、`List.*`→弹窗表格。
  `singleSelect`/`multipleSelect`/`lovTable`/`lovTableMulti` 四种描述**共用这一约定**，不引入第二套机制。
- **弹窗表格拉取**：`parseLovListCode(lovCode)` → `{ area, controller }`，请求
  `GET /{area}/{controller}`（`Index`，`pageSize=10000`）拿全量；行 `id/name` 归一（camel）后喂 `<t-table :data>`。
- **选值写回**：单选行 `onClick` 记 `lovSelected=row.id`；多选 `<t-table :row-selection>` 勾选记 `string[]`。
  `confirmLov`：单选→`formData[item.name]=Number(lovSelected)`；多选→`formData[item.name]=lovSelected.join(',')`；
  并用 `lovLabels`（已选名）回填只读 `t-input`。
- **LOV 控件不设 maxlength**：`buildFormItems` 中 `isLovTable` 分支跳过 `maxlength`，避免截断长 ID 串。
- **列表/详情回显名称**：`buildColumns` 的 `isMapped` 已含 `isLovList`（`lovTypeOf(f)==='list'`），走
  `labelOf` → `lookups[lookupBaseName(f)]`（`List.CubeDemo.Role`→`Role`）；页面须把目标实体 `Index` 注入 `lookups.Role`。

### 9.2 编辑器实现（CodeMirror 6 + TDesign 图标选择器，已落地）

`json`/`markdown`/`icon` 已接真实编辑器，非退化渲染：

- **`json`/`markdown` → `CodeEditor.vue`**：封装 CodeMirror 6（`codemirror` 的 `basicSetup` + `@codemirror/lang-json` / `@codemirror/lang-markdown`）。
  props：`modelValue`（字符串）、`language: 'json'|'markdown'|'text'`、`readonly`、`height`。
  内部用 `EditorView.updateListener` 把文档变更 `emit('update:modelValue')`；外部值变化（切换编辑记录）经 `watch` 同步文档、保焦点；
  `language`/`readonly` 变化重建视图（CodeMirror 扩展创建时固定）。`FormDialog` 的 json/markdown 分支改为 `<CodeEditor>`。
- **`icon` → `IconPicker.vue`**：`import * as Icons from 'tdesign-icons-vue-next'`，枚举全部 `*Icon` SVG 组件（共 2300+），
  转 kebab 名（如 `BrowseIcon`→`browse`）作为存储值；弹窗内可搜索图标网格，选中回回写 `formData[字段]=kebab名`。
  列表/详情回显用 `<t-icon :name>`（字体图标，由 `tdesign-icons-vue-next` 随组件库加载，无需额外引 CSS）。
- **新增依赖**：`codemirror` + `@codemirror/{state,view,commands,lang-json,lang-markdown}`（编辑器）；
  `tdesign-icons-vue-next`（图标集，实为 `tdesign-vue-next` 传递依赖，已显式声明）。
- **图标存储约定**：统一存 kebab 图标名字符串（与 TDesign 字体图标 `t-icon-{name}` 契约一致），不存组件名/`Icon` 后缀。
- **校验**：json/markdown/icon 值由用户输入，无内置格式规则（R2 仅覆盖 email/telnumber/url）；JSON 合法性由业务层/后端校验。

### 9.3 file 控件与 image 控件上传端点一致

`itemType=file` 的 `t-upload theme="file"` **复用 §8 的 `POST /{Area}/{Controller}/UploadFile` 端点与 `filePath` 代理规则**
（`/cube` 前缀、`/api` 不重复加），仅 `accept`/主题不同（file 不限制图片类型）。
`onUploadRemove` 需兼容 image/file 两种（移除即把 `formData[字段]` 置空）；editId watch 清空/回填时
`fileFiles` 与 `formData[字段]`（URL 串）两套值同步初始化，与 image 一致。

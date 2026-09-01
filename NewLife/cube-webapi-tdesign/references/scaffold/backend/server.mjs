/**
 * 魔方 WebApi 内置模块 Mock 后端（零依赖，纯 Node http）
 * 端口：3001
 * 覆盖：登录 / 菜单树 / 实体 GetPage + CRUD + 分页 + 排序 + 搜索 + 树形 + 只读 + 外键 lookups
 *
 * 运行：node backend/server.mjs
 * 契约严格对齐 cube-webapi-tdesign/references/metadata-contract.md：
 *  - 统一信封 { code, message, data, page?, stat? }
 *  - 所有响应 CamelCase 命名
 *  - 实体接口 /api/{area}/{controller}；非实体 /Admin/User/Login、/Admin/Index/GetMenuTree
 *  - 令牌头 Authentication（非 Authorization）
 */
import http from 'node:http';
import { URL } from 'node:url';

const PORT = 3001;

/* ----------------------------- 工具 ----------------------------- */
function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  });
  res.end(json);
}
function ok(res, data, extra = {}) {
  send(res, 200, { code: 0, message: 'ok', data, ...extra });
}
function fail(res, code, message) {
  send(res, 200, { code, message, data: null });
}
function readBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => (buf += c));
    req.on('end', () => {
      if (!buf) return resolve({});
      try {
        resolve(JSON.parse(buf));
      } catch {
        resolve({});
      }
    });
  });
}

/* ----------------------------- 实体注册表 ----------------------------- */
// 每个字段：{ name(camel), displayName, type, length?, nullable?, primaryKey?, isIdentity?, sortable?, readOnly?, map? }
// list/addForm/editForm/detail/search 为字段 name 数组，决定该视图显示哪些字段
const REGISTRY = {
  Admin: {
    User: {
      setting: { enableAdd: true, isReadOnly: false, enableSelect: true, enableToolbar: true },
      fields: {
        id: { name: 'id', displayName: '编号', type: 'Int32', primaryKey: true, isIdentity: true },
        name: { name: 'name', displayName: '登录名', type: 'String', length: 50, nullable: false, sortable: true },
        displayName: { name: 'displayName', displayName: '显示名', type: 'String', length: 50, nullable: false },
        roleID: { name: 'roleID', displayName: '角色', type: 'Int32', nullable: false },
        departmentID: { name: 'departmentID', displayName: '部门', type: 'Int32', nullable: true },
        mail: { name: 'mail', displayName: '邮箱', type: 'String', length: 100, nullable: true },
        mobile: { name: 'mobile', displayName: '手机号', type: 'String', length: 20, nullable: true },
        enabled: { name: 'enabled', displayName: '启用', type: 'Boolean', nullable: false },
        createTime: { name: 'createTime', displayName: '创建时间', type: 'DateTime', nullable: true, readOnly: true },
      },
      list: ['name', 'displayName', 'roleID', 'departmentID', 'mail', 'enabled', 'createTime'],
      addForm: ['name', 'displayName', 'roleID', 'departmentID', 'mail', 'mobile', 'enabled'],
      editForm: ['name', 'displayName', 'roleID', 'departmentID', 'mail', 'mobile', 'enabled'],
      detail: ['id', 'name', 'displayName', 'roleID', 'departmentID', 'mail', 'mobile', 'enabled', 'createTime'],
      search: ['name', 'roleID', 'departmentID', 'enabled'],
      rows: [
        { id: 1, name: 'admin', displayName: '超级管理员', roleID: 1, departmentID: 1, mail: 'admin@cube.local', mobile: '13800000000', enabled: true, createTime: '2026-01-01 09:00:00' },
        { id: 2, name: 'zhangsan', displayName: '张三', roleID: 2, departmentID: 2, mail: 'zhang@cube.local', mobile: '13800000001', enabled: true, createTime: '2026-02-11 10:20:00' },
        { id: 3, name: 'lisi', displayName: '李四', roleID: 2, departmentID: 3, mail: 'li@cube.local', mobile: '13800000002', enabled: false, createTime: '2026-03-05 14:05:00' },
      ],
    },
    Role: {
      setting: { enableAdd: true, isReadOnly: false },
      fields: {
        id: { name: 'id', displayName: '编号', type: 'Int32', primaryKey: true, isIdentity: true },
        name: { name: 'name', displayName: '角色名', type: 'String', length: 50, nullable: false, sortable: true },
        remark: { name: 'remark', displayName: '备注', type: 'String', length: 200, nullable: true },
        sort: { name: 'sort', displayName: '排序', type: 'Int32', nullable: true },
        isSystem: { name: 'isSystem', displayName: '系统内置', type: 'Boolean', nullable: false },
      },
      list: ['name', 'remark', 'sort', 'isSystem'],
      addForm: ['name', 'remark', 'sort', 'isSystem'],
      editForm: ['name', 'remark', 'sort', 'isSystem'],
      detail: ['id', 'name', 'remark', 'sort', 'isSystem'],
      search: ['name'],
      rows: [
        { id: 1, name: '管理员', remark: '系统管理员组', sort: 0, isSystem: true },
        { id: 2, name: '普通用户', remark: '常规业务用户', sort: 1, isSystem: false },
        { id: 3, name: '审计员', remark: '只读审计权限', sort: 2, isSystem: false },
      ],
    },
    Department: {
      setting: { enableAdd: true, isReadOnly: false },
      // 含 parentID → 列表自动树形（t-enhanced-table），表单 ParentID 自动树形下拉
      fields: {
        id: { name: 'id', displayName: '编号', type: 'Int32', primaryKey: true, isIdentity: true },
        name: { name: 'name', displayName: '部门名称', type: 'String', length: 50, nullable: false, sortable: true },
        parentID: { name: 'parentID', displayName: '上级部门', type: 'Int32', nullable: true },
        code: { name: 'code', displayName: '部门编码', type: 'String', length: 30, nullable: true },
        managerName: { name: 'managerName', displayName: '负责人', type: 'String', length: 30, nullable: true },
        sort: { name: 'sort', displayName: '排序', type: 'Int32', nullable: true },
        enabled: { name: 'enabled', displayName: '启用', type: 'Boolean', nullable: false },
      },
      list: ['name', 'parentID', 'code', 'managerName', 'sort', 'enabled'],
      addForm: ['name', 'parentID', 'code', 'managerName', 'sort', 'enabled'],
      editForm: ['name', 'parentID', 'code', 'managerName', 'sort', 'enabled'],
      detail: ['id', 'name', 'parentID', 'code', 'managerName', 'sort', 'enabled'],
      search: ['name', 'enabled'],
      rows: [
        { id: 1, name: '总公司', parentID: 0, code: 'HQ', managerName: '王总', sort: 0, enabled: true },
        { id: 2, name: '技术研发部', parentID: 1, code: 'RD', managerName: '张三', sort: 1, enabled: true },
        { id: 3, name: '物联网组', parentID: 2, code: 'IOT', managerName: '李四', sort: 2, enabled: true },
        { id: 4, name: '市场部', parentID: 1, code: 'MKT', managerName: '赵六', sort: 3, enabled: true },
      ],
    },
    Menu: {
      setting: { enableAdd: true, isReadOnly: false },
      fields: {
        id: { name: 'id', displayName: '编号', type: 'Int32', primaryKey: true, isIdentity: true },
        name: { name: 'name', displayName: '菜单名称', type: 'String', length: 50, nullable: false, sortable: true },
        parentID: { name: 'parentID', displayName: '上级菜单', type: 'Int32', nullable: true },
        url: { name: 'url', displayName: '链接', type: 'String', length: 100, nullable: true },
        icon: { name: 'icon', displayName: '图标', type: 'String', length: 30, nullable: true },
        permission: { name: 'permission', displayName: '权限', type: 'String', length: 50, nullable: true },
        sort: { name: 'sort', displayName: '排序', type: 'Int32', nullable: true },
        visible: { name: 'visible', displayName: '显示', type: 'Boolean', nullable: false },
      },
      list: ['name', 'parentID', 'url', 'icon', 'permission', 'sort', 'visible'],
      addForm: ['name', 'parentID', 'url', 'icon', 'permission', 'sort', 'visible'],
      editForm: ['name', 'parentID', 'url', 'icon', 'permission', 'sort', 'visible'],
      detail: ['id', 'name', 'parentID', 'url', 'icon', 'permission', 'sort', 'visible'],
      search: ['name', 'visible'],
      rows: [
        { id: 1, name: '系统管理', parentID: 0, url: '', icon: 'setting', permission: '', sort: 0, visible: true },
        { id: 2, name: '用户管理', parentID: 1, url: 'Admin/User', icon: 'user', permission: '', sort: 1, visible: true },
        { id: 3, name: '角色管理', parentID: 1, url: 'Admin/Role', icon: 'usergroup', permission: '', sort: 2, visible: true },
        { id: 4, name: '监控运维', parentID: 0, url: '', icon: 'chart', permission: '', sort: 5, visible: true },
        { id: 5, name: '系统日志', parentID: 4, url: 'Sys/Log', icon: 'logs', permission: '', sort: 6, visible: true },
      ],
    },
    Permission: {
      setting: { enableAdd: true, isReadOnly: false },
      fields: {
        id: { name: 'id', displayName: '编号', type: 'Int32', primaryKey: true, isIdentity: true },
        name: { name: 'name', displayName: '权限名', type: 'String', length: 50, nullable: false, sortable: true },
        resource: { name: 'resource', displayName: '资源', type: 'String', length: 50, nullable: true },
        action: { name: 'action', displayName: '动作', type: 'String', length: 30, nullable: true },
        roleID: { name: 'roleID', displayName: '角色', type: 'Int32', nullable: true },
        remark: { name: 'remark', displayName: '备注', type: 'String', length: 200, nullable: true },
      },
      list: ['name', 'resource', 'action', 'roleID', 'remark'],
      addForm: ['name', 'resource', 'action', 'roleID', 'remark'],
      editForm: ['name', 'resource', 'action', 'roleID', 'remark'],
      detail: ['id', 'name', 'resource', 'action', 'roleID', 'remark'],
      search: ['name', 'roleID'],
      rows: [
        { id: 1, name: '用户查看', resource: 'Admin/User', action: 'Detail', roleID: 2, remark: '查看用户' },
        { id: 2, name: '用户管理', resource: 'Admin/User', action: 'Update', roleID: 1, remark: '编辑用户' },
        { id: 3, name: '日志审计', resource: 'Sys/Log', action: 'Detail', roleID: 3, remark: '查看日志' },
      ],
    },
  },
  Sys: {
    Config: {
      // 系统参数：不开放新增（enableAdd:false），但可编辑/删除
      setting: { enableAdd: false, isReadOnly: false },
      fields: {
        id: { name: 'id', displayName: '编号', type: 'Int32', primaryKey: true, isIdentity: true },
        name: { name: 'name', displayName: '参数名', type: 'String', length: 50, nullable: false, sortable: true },
        value: { name: 'value', displayName: '参数值', type: 'String', length: 200, nullable: false },
        category: { name: 'category', displayName: '分类', type: 'String', length: 50, nullable: true },
        remark: { name: 'remark', displayName: '说明', type: 'String', length: 200, nullable: true },
        updateTime: { name: 'updateTime', displayName: '更新时间', type: 'DateTime', nullable: true, readOnly: true },
      },
      list: ['name', 'value', 'category', 'remark', 'updateTime'],
      addForm: ['name', 'value', 'category', 'remark'],
      editForm: ['name', 'value', 'category', 'remark'],
      detail: ['id', 'name', 'value', 'category', 'remark', 'updateTime'],
      search: ['name', 'category'],
      rows: [
        { id: 1, name: 'SysName', value: '魔方控制台', category: '基础', remark: '系统显示名称', updateTime: '2026-01-01 00:00:00' },
        { id: 2, name: 'EnableTenant', value: 'true', category: '租户', remark: '是否启用多租户', updateTime: '2026-02-01 00:00:00' },
        { id: 3, name: 'PageSize', value: '20', category: '基础', remark: '默认分页大小', updateTime: '2026-03-01 00:00:00' },
      ],
    },
    Log: {
      // 系统日志：只读（isReadOnly:true）→ 无新增/编辑/删除按钮
      setting: { enableAdd: false, isReadOnly: true },
      fields: {
        id: { name: 'id', displayName: '编号', type: 'Int32', primaryKey: true, isIdentity: true },
        level: { name: 'level', displayName: '级别', type: 'Int32', nullable: false, sortable: true, map: { 1: '信息', 2: '警告', 3: '错误', 4: '严重' } },
        category: { name: 'category', displayName: '分类', type: 'String', length: 50, nullable: true },
        message: { name: 'message', displayName: '消息', type: 'String', length: 500, nullable: true },
        userName: { name: 'userName', displayName: '操作人', type: 'String', length: 50, nullable: true },
        createTime: { name: 'createTime', displayName: '时间', type: 'DateTime', nullable: true, readOnly: true },
      },
      list: ['level', 'category', 'message', 'userName', 'createTime'],
      addForm: [],
      editForm: [],
      detail: ['id', 'level', 'category', 'message', 'userName', 'createTime'],
      search: ['level', 'category', 'userName'],
      rows: [
        { id: 1, level: 3, category: '登录', message: '用户 admin 登录失败次数过多', userName: 'admin', createTime: '2026-08-28 08:12:00' },
        { id: 2, level: 1, category: '系统', message: '服务启动完成', userName: 'system', createTime: '2026-08-28 08:00:00' },
        { id: 3, level: 2, category: '设备', message: '设备 DEV-001 离线超过 5 分钟', userName: 'system', createTime: '2026-08-28 09:30:00' },
        { id: 4, level: 4, category: '异常', message: '数据库写入超时', userName: 'system', createTime: '2026-08-28 10:05:00' },
      ],
    },
  },
};

/* ----------------------------- 菜单树（仅含当前用户有权限的节点） ----------------------------- */
const MENU_TREE = [
  {
    text: '系统管理',
    children: [
      { text: '用户管理', url: 'Admin/User' },
      { text: '角色管理', url: 'Admin/Role' },
      { text: '部门管理', url: 'Admin/Department' },
      { text: '菜单管理', url: 'Admin/Menu' },
      { text: '权限管理', url: 'Admin/Permission' },
    ],
  },
  {
    text: '监控运维',
    children: [
      { text: '系统参数', url: 'Sys/Config' },
      { text: '系统日志', url: 'Sys/Log' },
    ],
  },
];

/* ----------------------------- 鉴权 ----------------------------- */
function authOk(req) {
  const h = req.headers['authentication'];
  return !!h && h !== '';
}

/* ----------------------------- 业务处理 ----------------------------- */
function handleGetPage(area, controller, res) {
  const ent = REGISTRY[area]?.[controller];
  if (!ent) return fail(res, 404, `未找到实体 ${area}/${controller}`);
  const pick = (names) => names.map((n) => ({ ...ent.fields[n] }));
  ok(res, {
    setting: ent.setting,
    list: pick(ent.list),
    addForm: pick(ent.addForm),
    editForm: pick(ent.editForm),
    detail: pick(ent.detail),
    search: pick(ent.search),
  });
}

function handleIndex(area, controller, url, res) {
  const ent = REGISTRY[area]?.[controller];
  if (!ent) return fail(res, 404, `未找到实体 ${area}/${controller}`);
  const q = Object.fromEntries(url.searchParams.entries());
  let rows = ent.rows.slice();
  // 搜索过滤（camelCase 字段名）
  for (const f of ent.search) {
    const key = ent.fields[f.name] ? ent.fields[f.name].name : f.name;
    const v = q[key];
    if (v === undefined || v === '' || v == null) continue;
    rows = rows.filter((r) => {
      const rv = r[key];
      if (typeof rv === 'string') return rv.includes(v);
      return String(rv) === String(v);
    });
  }
  // 排序
  const sort = q.sort;
  if (sort && ent.fields[sort]) {
    const desc = q.desc === 'true' || q.desc === '1';
    rows.sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
      return 0;
    });
  }
  const total = rows.length;
  const pageIndex = parseInt(q.pageIndex || '1', 10);
  const pageSize = parseInt(q.pageSize || '20', 10);
  const start = (pageIndex - 1) * pageSize;
  const paged = rows.slice(start, start + pageSize);
  ok(res, paged, {
    page: { pageIndex, pageSize, totalCount: total, pageCount: Math.ceil(total / pageSize) || 1 },
  });
}

function handleDetail(area, controller, id, res) {
  const ent = REGISTRY[area]?.[controller];
  if (!ent) return fail(res, 404, `未找到实体 ${area}/${controller}`);
  const row = ent.rows.find((r) => String(r.id) === String(id));
  if (!row) return fail(res, 404, '记录不存在');
  ok(res, row);
}

function handleInsert(area, controller, body, res) {
  const ent = REGISTRY[area]?.[controller];
  if (!ent) return fail(res, 404, `未找到实体 ${area}/${controller}`);
  const newId = ent.rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const row = { ...body, id: newId };
  if (ent.fields.createTime) row.createTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (ent.fields.updateTime) row.updateTime = row.createTime;
  ent.rows.push(row);
  ok(res, row);
}

function handleUpdate(area, controller, id, body, res) {
  const ent = REGISTRY[area]?.[controller];
  if (!ent) return fail(res, 404, `未找到实体 ${area}/${controller}`);
  const row = ent.rows.find((r) => String(r.id) === String(id));
  if (!row) return fail(res, 404, '记录不存在');
  Object.assign(row, body, { id: row.id });
  if (ent.fields.updateTime) row.updateTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
  ok(res, row);
}

function handleDelete(area, controller, id, res) {
  const ent = REGISTRY[area]?.[controller];
  if (!ent) return fail(res, 404, `未找到实体 ${area}/${controller}`);
  const idx = ent.rows.findIndex((r) => String(r.id) === String(id));
  if (idx < 0) return fail(res, 404, '记录不存在');
  ent.rows.splice(idx, 1);
  ok(res, null);
}

/* ----------------------------- 路由 ----------------------------- */
const server = http.createServer(async (req, res) => {
  // 预检
  if (req.method === 'OPTIONS') return send(res, 204, '');

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  // 登录（开放）
  if (method === 'POST' && path === '/Admin/User/Login') {
    const body = await readBody(req);
    if (body.userName && body.password) {
      return ok(res, { token: 'mock-jwt-' + Date.now(), user: { name: body.userName, isAdmin: true } });
    }
    return fail(res, 400, '用户名或密码错误');
  }

  // 菜单树（需登录）
  if (method === 'GET' && path === '/Admin/Index/GetMenuTree') {
    if (!authOk(req)) return fail(res, 401, '未登录');
    return ok(res, MENU_TREE);
  }

  // 实体路由 /api/{area}/{controller}[/{id}][/GetPage]
  const m = path.match(/^\/api\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
  if (m) {
    const area = m[1];
    const controller = m[2];
    const seg = m[3]; // 可能为 id 或 'GetPage'
    if (!authOk(req)) return fail(res, 401, '未登录');

    // 元数据页
    if (seg === 'GetPage' && method === 'GET') return handleGetPage(area, controller, res);
    const ent = REGISTRY[area]?.[controller];
    if (!ent) return fail(res, 404, `未找到实体 ${area}/${controller}`);

    // 详情
    if (seg && method === 'GET') return handleDetail(area, controller, seg, res);
    if (seg && method === 'PUT') {
      const body = await readBody(req);
      return handleUpdate(area, controller, seg, body, res);
    }
    if (seg && method === 'DELETE') return handleDelete(area, controller, seg, res);

    // 列表
    if (!seg && method === 'GET') return handleIndex(area, controller, url, res);
    // 新增
    if (!seg && method === 'POST') {
      const body = await readBody(req);
      return handleInsert(area, controller, body, res);
    }
    return fail(res, 405, '方法不允许');
  }

  // 健康检查
  if (path === '/') return ok(res, { service: 'cube-webapi-mock', port: PORT });
  return fail(res, 404, 'Not Found');
});

server.listen(PORT, () => {
  console.log(`[cube-mock] 魔方 WebApi Mock 后端已启动: http://localhost:${PORT}`);
  console.log('[cube-mock] 内置模块: Admin(User/Role/Department/Menu/Permission), Sys(Config/Log)');
});

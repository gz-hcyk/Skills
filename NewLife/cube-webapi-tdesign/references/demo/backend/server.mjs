/**
 * 魔方 WebApi 契约 Mock 后端（零依赖，仅用 Node 内置 http/crypto/url）
 * 用于本地验证 cube-webapi-tdesign skill 的前端资产整链路。
 *
 * 实现的契约（依据 Doc/Api/认证接口设计.md 当前版本）：
 *  - GET  /Auth/LoginConfig[?tenant=]   -> 版权/Logo/功能开关/OAuth 列表
 *  - GET  /Auth/Captcha                 -> { captchaId, image(svg) }
 *  - GET  /Auth/Challenge               -> { challengeId, publicKey(SPKI PEM) }（RSA-OAEP/SHA-256）
 *  - POST /Auth/Login                   -> { accessToken, refreshToken, expireIn }（category 区分密码/手机/邮箱；MFA 返 mfa_required:）
 *  - POST /Auth/SendCode                -> { data: 验证码数字 }（channel 区分大小写 Sms/Mail）
 *  - POST /Auth/ResetPassword           -> { data: true }
 *  - POST /Auth/Register                -> { data: true }
 *  - POST /Auth/Refresh                 -> 令牌轮换（旧 refreshToken 用后即失效）
 *  - POST /Mfa/Verify                   -> { accessToken, refreshToken, expireIn }
 *  - GET  /api/{area}/{ctrl}/GetMenuTree -> 菜单树（受令牌保护）
 *  - GET  /api/{area}/{ctrl}/GetPage     -> 字段元数据
 *  - GET  /api/{area}/{ctrl}             -> 列表（分页/排序/搜索）
 *  - GET  /api/{area}/{ctrl}/{id}        -> 详情
 *  - POST /api/{area}/{ctrl}             -> 新增
 *  - PUT  /api/{area}/{ctrl}/{id}        -> 修改
 *  - DELETE /api/{area}/{ctrl}/{id}      -> 删除
 *  - POST /Admin/User/Login              -> 旧 MVC/SSO 端点（保留，返回 { token } 旧信封）
 * 令牌头：Authentication（官方文档）或 Authorization（实测兼容），二者任一有效；
 * 受保护 /api 路由缺失/失效令牌返回 HTTP 401（触发前端自动刷新）。
 */
import http from 'node:http';
import fs from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { randomUUID, generateKeyPairSync, privateDecrypt, constants } from 'node:crypto';

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
// 页面静态资源根目录：对应真实后端 /Content（Logo / 登录背景 / OAuth 图标等，公开可访问、无需登录）
const CONTENT_DIR = nodePath.join(__dirname, 'content');

const PORT = Number(process.env.PORT) || 3001;

/* ----------------------------- 内存数据 ----------------------------- */
/** 设备表：含 ParentID 自引用树、StatusID(枚举map)、CategoryID(外键lookups) */
const devices = [
  { id: 1, name: '网关A', parentID: 0, statusID: 1, categoryID: 1, enable: true, createTime: '2026-01-01 10:00:00', remark: '根网关' },
  { id: 2, name: '传感器A1', parentID: 1, statusID: 2, categoryID: 2, enable: true, createTime: '2026-01-02 10:00:00', remark: '' },
  { id: 3, name: '传感器A2', parentID: 1, statusID: 3, categoryID: 2, enable: false, createTime: '2026-01-03 10:00:00', remark: '需维修' },
  { id: 4, name: '网关B', parentID: 0, statusID: 1, categoryID: 1, enable: true, createTime: '2026-02-01 10:00:00', remark: '根网关' },
  { id: 5, name: '传感器B1', parentID: 4, statusID: 2, categoryID: 2, enable: true, createTime: '2026-02-02 10:00:00', remark: '' },
];
/**
 * 分类表：既是 Device.CategoryID 的 lookups 数据源，本身也是一个完整 CRUD 实体。
 * 含 ParentID 自引用树、Type(枚举map)、Enable(布尔)、Sort(数字)，用于演示表单的多控件类型。
 */
const categories = [
  { id: 1, name: '采集类', parentID: 0, type: 2, enable: true, sort: 10, remark: '数据采集类设备' },
  { id: 2, name: '控制类', parentID: 0, type: 3, enable: true, sort: 20, remark: '下发控制类设备' },
  { id: 3, name: '温度采集', parentID: 1, type: 2, enable: true, sort: 11, remark: '采集类子项' },
  { id: 4, name: '网关', parentID: 0, type: 1, enable: true, sort: 5, remark: '网关设备' },
];

let seq = 100; // 自增主键发生器

/* ----------------------------- 令牌存储 ----------------------------- */
const ACCESS_TTL = 7200;            // accessToken 有效期（秒），对齐文档默认 expireIn
const REFRESH_TTL = 30 * 86400;     // refreshToken 有效期（秒）
const accessTokens = new Map();     // accessToken  -> { user, exp }
const refreshTokens = new Map();    // refreshToken  -> { user, exp }
const challenges = new Map();       // challengeId   -> { publicKey, privateKey, exp }
const captchas = new Map();         // captchaId     -> { code, exp }
const sendCodes = new Map();        // `${channel}:${username}:${action}` -> { code, exp }

/* ----------------------------- RSA 密钥（启动生成一对，Challenge 复用） ----------------------------- */
const RSA_KEYPAIR = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

/* ----------------------------- 工具 ----------------------------- */
function send(res, body, status = 200, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    ...extraHeaders,
  });
  res.end(payload);
}
function ok(data, extra = {}) {
  return { code: 0, message: 'ok', data, ...extra };
}
function readBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => (buf += c));
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch { resolve({}); }
    });
  });
}
function randInt(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/* ----------------------------- 令牌签发 / 校验 / 轮换 ----------------------------- */
function issueTokens(user) {
  const accessToken = 'demo-at-' + randomUUID();
  const refreshToken = 'demo-rt-' + randomUUID();
  const now = Date.now();
  accessTokens.set(accessToken, { user, exp: now + ACCESS_TTL * 1000 });
  refreshTokens.set(refreshToken, { user, exp: now + REFRESH_TTL * 1000 });
  return { accessToken, refreshToken, expireIn: ACCESS_TTL };
}
/** 刷新令牌轮换：校验旧 refreshToken 后作废它并签发新对（旧 refresh 用后即失效） */
function rotateTokens(oldRefresh) {
  const rec = refreshTokens.get(oldRefresh);
  if (!rec) return null;
  refreshTokens.delete(oldRefresh); // 旧 refreshToken 立即失效
  return issueTokens(rec.user);
}
/** 从请求头取令牌（Authentication 或 Authorization 任一），校验有效性 */
function authUserOf(req) {
  const h = req.headers['authorization'] || req.headers['authentication'];
  if (!h) return null;
  const t = String(h).trim();
  const rec = accessTokens.get(t);
  if (!rec) return null;
  if (rec.exp < Date.now()) { accessTokens.delete(t); return null; }
  return rec.user;
}
/** 解密 Challenge 密文（RSA-OAEP/SHA-256）；失败则当作明文返回 */
function decryptPassword(cipherBase64, challengeId) {
  const ch = challengeId ? challenges.get(challengeId) : null;
  if (!ch) return cipherBase64; // 无挑战上下文：视为明文（AllowPlainPassword=true）
  try {
    const plain = privateDecrypt(
      { key: ch.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(String(cipherBase64), 'base64'),
    );
    return plain.toString('utf8');
  } catch {
    return cipherBase64; // 解密失败降级明文
  }
}

/* ----------------------------- Schema 生成 ----------------------------- */
function deviceSchema() {
  const setting = { enableNavbar: true, enableToolbar: true, enableAdd: true, enableSelect: true, enableFooter: true, isReadOnly: false, enableTableDoubleClick: true, doubleDelete: false };
  const list = [
    { name: 'ID', displayName: '编号', type: 'Int32', primaryKey: true, isIdentity: true },
    { name: 'Name', displayName: '设备名称', type: 'String', length: 100, nullable: false, sortable: true },
    { name: 'ParentID', displayName: '上级设备', type: 'Int32', nullable: true, sortable: true },
    { name: 'StatusID', displayName: '状态', type: 'Int32', map: { '1': '在线', '2': '离线', '3': '故障' }, sortable: true },
    { name: 'CategoryID', displayName: '分类', type: 'Int32', nullable: true },
    { name: 'Enable', displayName: '启用', type: 'Boolean' },
    { name: 'CreateTime', displayName: '创建时间', type: 'DateTime' },
  ];
  const addForm = [
    { name: 'Name', displayName: '设备名称', type: 'String', length: 100, nullable: false },
    { name: 'ParentID', displayName: '上级设备', type: 'Int32', nullable: true },
    { name: 'StatusID', displayName: '状态', type: 'Int32', map: { '1': '在线', '2': '离线', '3': '故障' }, nullable: false },
    { name: 'CategoryID', displayName: '分类', type: 'Int32', nullable: true },
    { name: 'Enable', displayName: '启用', type: 'Boolean' },
    { name: 'CreateTime', displayName: '创建时间', type: 'DateTime' },
    { name: 'Remark', displayName: '备注', type: 'String', length: 500 },
  ];
  const editForm = [
    { name: 'Name', displayName: '设备名称', type: 'String', length: 100, nullable: false },
    { name: 'ParentID', displayName: '上级设备', type: 'Int32', nullable: true },
    { name: 'StatusID', displayName: '状态', type: 'Int32', map: { '1': '在线', '2': '离线', '3': '故障' }, nullable: false },
    { name: 'CategoryID', displayName: '分类', type: 'Int32', nullable: true },
    { name: 'Enable', displayName: '启用', type: 'Boolean' },
    { name: 'CreateTime', displayName: '创建时间', type: 'DateTime' },
    { name: 'Remark', displayName: '备注', type: 'String', length: 500 },
  ];
  const detail = [
    { name: 'ID', displayName: '编号', type: 'Int32' },
    { name: 'Name', displayName: '设备名称', type: 'String' },
    { name: 'ParentID', displayName: '上级设备', type: 'Int32' },
    { name: 'StatusID', displayName: '状态', type: 'Int32', map: { '1': '在线', '2': '离线', '3': '故障' } },
    { name: 'CategoryID', displayName: '分类', type: 'Int32' },
    { name: 'Enable', displayName: '启用', type: 'Boolean' },
    { name: 'CreateTime', displayName: '创建时间', type: 'DateTime' },
    { name: 'Remark', displayName: '备注', type: 'String' },
  ];
  const search = [
    { name: 'Name', displayName: '设备名称', type: 'String', length: 100 },
    { name: 'StatusID', displayName: '状态', type: 'Int32', map: { '1': '在线', '2': '离线', '3': '故障' } },
    { name: 'CategoryID', displayName: '分类', type: 'Int32' },
    { name: 'Enable', displayName: '启用', type: 'Boolean' },
  ];
  return { setting, list, addForm, editForm, detail, search };
}

function categorySchema() {
  const setting = { enableNavbar: true, enableToolbar: true, enableAdd: true, enableSelect: true, enableFooter: true, isReadOnly: false, enableTableDoubleClick: true };
  const typeMap = { '1': '网关', '2': '传感器', '3': '执行器' };
  const list = [
    { name: 'ID', displayName: '编号', type: 'Int32', primaryKey: true, isIdentity: true },
    { name: 'Name', displayName: '分类名称', type: 'String', length: 100, nullable: false, sortable: true },
    { name: 'Type', displayName: '类型', type: 'Int32', map: typeMap, sortable: true },
    { name: 'Enable', displayName: '启用', type: 'Boolean' },
    { name: 'Sort', displayName: '排序', type: 'Int32', sortable: true },
    { name: 'Remark', displayName: '备注', type: 'String', length: 500 },
  ];
  // 表单含 ParentID 自引用树形下拉（演示 tree-select）+ Type 枚举下拉（演示 map）
  const form = [
    { name: 'Name', displayName: '分类名称', type: 'String', length: 100, nullable: false },
    { name: 'ParentID', displayName: '上级分类', type: 'Int32', nullable: true },
    { name: 'Type', displayName: '类型', type: 'Int32', map: typeMap, nullable: false },
    { name: 'Enable', displayName: '启用', type: 'Boolean' },
    { name: 'Sort', displayName: '排序', type: 'Int32' },
    { name: 'Remark', displayName: '备注', type: 'String', length: 500 },
  ];
  const detail = [
    { name: 'ID', displayName: '编号', type: 'Int32' },
    { name: 'Name', displayName: '分类名称', type: 'String' },
    { name: 'ParentID', displayName: '上级分类', type: 'Int32' },
    { name: 'Type', displayName: '类型', type: 'Int32', map: typeMap },
    { name: 'Enable', displayName: '启用', type: 'Boolean' },
    { name: 'Sort', displayName: '排序', type: 'Int32' },
    { name: 'Remark', displayName: '备注', type: 'String' },
  ];
  const search = [
    { name: 'Name', displayName: '分类名称', type: 'String', length: 100 },
    { name: 'Type', displayName: '类型', type: 'Int32', map: typeMap },
    { name: 'Enable', displayName: '启用', type: 'Boolean' },
  ];
  return { setting, list, addForm: form, editForm: form, detail, search };
}

/* ----------------------------- 列表/分页/排序/搜索 ----------------------------- */
// 字符串字段：模糊匹配；数值/布尔字段：精确匹配。覆盖 Device 与 Category 的全部搜索字段。
const STRING_FIELDS = ['name', 'remark'];
const EXACT_FIELDS = ['statusID', 'categoryID', 'type', 'parentID', 'enable'];
// 这些是控制参数（分页/排序/关键字），不是过滤字段，必须从过滤循环中跳过
const CONTROL_KEYS = ['pageindex', 'pagesize', 'sort', 'desc', 'q'];
function indexRows(table, query) {
  let list = [...table];
  // 搜索过滤
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === '') continue;
    const lk = k.toLowerCase();
    if (CONTROL_KEYS.includes(lk)) continue;
    const key = k.charAt(0).toLowerCase() + k.slice(1);
    if (STRING_FIELDS.includes(key)) {
      list = list.filter((r) => String(r[key] ?? '').includes(String(v)));
    } else if (EXACT_FIELDS.includes(key)) {
      if (key === 'enable') {
        list = list.filter((r) => r[key] === (v === 'true' || v === true));
      } else {
        list = list.filter((r) => String(r[key]) === String(v));
      }
    }
  }
  // 排序
  if (query.sort) {
    const field = query.sort.charAt(0).toLowerCase() + query.sort.slice(1);
    const desc = query.desc === 'true' || query.desc === true;
    list.sort((a, b) => {
      const av = a[field], bv = b[field];
      if (av == null) return 1; if (bv == null) return -1;
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
      return 0;
    });
  }
  return list;
}

/* ----------------------------- 认证类端点 ----------------------------- */
// GET /Auth/LoginConfig —— 登录页配置（版权/Logo/功能开关/OAuth）
function buildLoginConfig(tenant) {
  const data = {
    name: tenant ? `${tenant} · 魔方WebApi` : '魔方WebApi',
    copyright: '©2002-2026 NewLife Powered by .NET 9.0.0',
    registration: '粤ICP备16014330号-1',
    loginTip: '',
    logo: '',
    loginLogo: '',
    loginBackground: '',
    login: { password: true, sms: true, mail: true, captcha: false },
    register: { enabled: true, password: true, sms: false, mail: false, captcha: false },
    oauth: [{ name: 'NewLife', logo: '/Content/images/logo/NewLife.png', nickName: '新生命用户中心' }],
    security: { challengeRequired: true, mfaAvailable: true },
  };
  return data;
}
// GET /Auth/Captcha —— 图片验证码（SVG）
function buildCaptchaSvg(code) {
  const colors = ['#0052d9', '#0594fa', '#2ba471', '#e37318'];
  const spans = code.split('').map((c, i) => {
    const x = 24 + i * 28;
    const y = 38 + (i % 2 === 0 ? -4 : 6);
    const fill = colors[i % colors.length];
    const rot = (i % 2 === 0 ? -12 : 12);
    return `<text x="${x}" y="${y}" font-size="32" font-family="monospace" font-weight="bold" fill="${fill}" transform="rotate(${rot} ${x} ${y})">${c}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="56" viewBox="0 0 160 56"><rect width="160" height="56" fill="#f3f3f3"/>${spans}<path d="M10 40 Q 50 20 90 38 T 150 30" stroke="#bbb" fill="none" stroke-width="2"/></svg>`;
}

/* ----------------------------- 路由处理 ----------------------------- */
async function handle(req, res) {
  // 预检
  if (req.method === 'OPTIONS') return send(res, '', 204);

  const u = new URL(req.url, `http://localhost:${PORT}`);
  const path = u.pathname;
  const query = Object.fromEntries(u.searchParams.entries());
  const method = req.method || 'GET';

  // 页面静态资源目录 /Content（公开，无需登录）——Logo / 登录背景 / OAuth 图标等。
  // 与真实后端契约一致：任何子路径均可匿名访问，必须在鉴权拦截之前处理。
  if (method === 'GET' && path.startsWith('/Content/')) {
    const rel = decodeURIComponent(path.slice('/Content/'.length));
    const filePath = nodePath.normalize(nodePath.join(CONTENT_DIR, rel));
    if (filePath.startsWith(CONTENT_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = nodePath.extname(filePath).toLowerCase();
      const TYPES = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
        '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.css': 'text/css',
        '.js': 'application/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff',
      };
      res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    return send(res, fail(404, 'not found'));
  }

  try {
    /* ===== 认证类端点（公开，无需令牌） ===== */
    // 1) 登录配置
    if (method === 'GET' && path === '/Auth/LoginConfig') {
      return send(res, ok(buildLoginConfig(query.tenant)));
    }
    // 2) 图片验证码
    if (method === 'GET' && path === '/Auth/Captcha') {
      const code = randInt(4);
      const captchaId = randomUUID();
      captchas.set(captchaId, { code, exp: Date.now() + 300_000 });
      return send(res, ok({ captchaId, image: buildCaptchaSvg(code) }));
    }
    // 3) Challenge 公钥
    if (method === 'GET' && path === '/Auth/Challenge') {
      const challengeId = randomUUID();
      challenges.set(challengeId, { publicKey: RSA_KEYPAIR.publicKey, privateKey: RSA_KEYPAIR.privateKey, exp: Date.now() + 300_000 });
      return send(res, ok({ challengeId, publicKey: RSA_KEYPAIR.publicKey }));
    }
    // 4) 登录（密码 / 手机验证码 / 邮箱验证码 / MFA 触发）
    if (method === 'POST' && path === '/Auth/Login') {
      const b = await readBody(req);
      if (!b.username || !b.password) return send(res, { code: 400, message: '用户名或密码为空' }, 400);
      const category = b.category || '';
      // 密文解密（challengeId 存在时）
      const realPwd = b.challengeId ? decryptPassword(b.password, b.challengeId) : b.password;
      if (!realPwd) return send(res, { code: 400, message: '密码解密失败' }, 400);
      // MFA 演示：用户名包含 'mfa' 则触发二步验证
      if (String(b.username).toLowerCase().includes('mfa')) {
        const mfaToken = 'demo-mfa-' + randomUUID();
        return send(res, { code: 0, message: 'mfa_required:' + mfaToken, data: null });
      }
      const tokens = issueTokens({ name: b.username, category });
      return send(res, ok(tokens));
    }
    // 5) 发送验证码
    if (method === 'POST' && path === '/Auth/SendCode') {
      const b = await readBody(req);
      if (!b.channel || !b.username || !b.action) return send(res, { code: 400, message: 'channel/username/action 必填' }, 400);
      const code = randInt(6);
      sendCodes.set(`${b.channel}:${b.username}:${b.action}`, { code, exp: Date.now() + 300_000 });
      console.log(`[mock] SendCode channel=${b.channel} username=${b.username} action=${b.action} code=${code}`);
      return send(res, ok(Number(code)));
    }
    // 6) 重置密码
    if (method === 'POST' && path === '/Auth/ResetPassword') {
      const b = await readBody(req);
      if (!b.username || !b.code || !b.newPassword) return send(res, { code: 400, message: '参数不完整' }, 400);
      return send(res, { code: 0, message: '密码重置成功', data: true });
    }
    // 7) 注册
    if (method === 'POST' && path === '/Auth/Register') {
      const b = await readBody(req);
      if (!b.username || !b.password || !b.confirmPassword) return send(res, { code: 400, message: '参数不完整' }, 400);
      if (b.password !== b.confirmPassword) return send(res, { code: 400, message: '两次密码不一致' }, 400);
      return send(res, { code: 0, message: '注册成功', data: true });
    }
    // 8) 刷新令牌（轮换）
    if (method === 'POST' && path === '/Auth/Refresh') {
      const b = await readBody(req);
      if (!b.refreshToken) return send(res, { code: 401, message: 'refreshToken 缺失' }, 401);
      const tokens = rotateTokens(b.refreshToken);
      if (!tokens) return send(res, { code: 401, message: 'refreshToken 无效或已失效' }, 401);
      return send(res, ok(tokens));
    }
    // 9) MFA 二步验证
    if (method === 'POST' && path === '/Mfa/Verify') {
      const b = await readBody(req);
      if (!b.mfaToken || !b.code || String(b.code).length < 4) return send(res, { code: 400, message: 'mfaToken/code 必填' }, 400);
      const tokens = issueTokens({ name: 'mfa-user', mfa: true });
      return send(res, ok(tokens));
    }
    // 10) 旧 MVC/SSO 登录端点（保留，旧信封 { token }）
    if (method === 'POST' && path === '/Admin/User/Login') {
      const b = await readBody(req);
      if (!b.userName && !b.username) return send(res, { code: 400, message: '用户名或密码为空' }, 400);
      return send(res, ok({ token: 'demo-token-' + Date.now(), user: { name: b.userName || b.username, isAdmin: true } }));
    }

    /* ===== 实体接口（受令牌保护） ===== */
    const m = path.match(/^\/api\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
    if (m) {
      // 令牌校验：缺失/失效 -> HTTP 401（触发前端自动刷新）
      const user = authUserOf(req);
      if (!user) return send(res, { code: 401, message: '未授权或令牌已过期，请重新登录' }, 401);

      const area = m[1]; const ctrl = m[2]; const tail = m[3];

      // 菜单树（GetMenuTree 落在 /api 分支）
      if (tail === 'GetMenuTree' && method === 'GET') {
        return send(res, ok([
          { text: '物联设备', children: [{ text: '设备列表', url: 'IoTHub/Device' }] },
          { text: '基础数据', children: [{ text: '设备分类', url: 'IoTHub/Category' }] },
        ]));
      }
      // GetPage
      if (tail === 'GetPage' && method === 'GET') {
        const schema = ctrl === 'Category' ? categorySchema() : deviceSchema();
        return send(res, ok(schema));
      }
      // 详情 /api/{area}/{ctrl}/{id}
      if (tail && tail !== 'GetPage' && method === 'GET') {
        const id = Number(tail);
        const table = ctrl === 'Category' ? categories : devices;
        const row = table.find((r) => r.id === id);
        return row ? send(res, ok(row)) : send(res, { code: 404, message: '未找到' }, 404);
      }
      // Index
      if (!tail && method === 'GET') {
        const table = ctrl === 'Category' ? categories : devices;
        const list = indexRows(table, query);
        const totalCount = list.length;
        const pageIndex = Number(query.pageIndex) || 1;
        const pageSize = Number(query.pageSize) || 20;
        const pageData = pageSize >= 1000 ? list : list.slice((pageIndex - 1) * pageSize, (pageIndex - 1) * pageSize + pageSize);
        const extra = {};
        if (ctrl === 'Device') {
          extra.stat = {
            total: totalCount,
            online: table.filter((r) => r.statusID === 1).length,
            control: table.filter((r) => r.categoryID === 2).length,
          };
        }
        return send(res, ok(pageData, { page: { pageIndex, pageSize, totalCount, sort: query.sort, desc: query.desc === 'true' || query.desc === true }, ...extra }));
      }
      // 新增
      if (!tail && method === 'POST') {
        const body = await readBody(req);
        const table = ctrl === 'Category' ? categories : devices;
        const row = { id: ++seq, ...body };
        table.push(row);
        return send(res, ok(row));
      }
      // 修改
      if (tail && method === 'PUT') {
        const id = Number(tail);
        const body = await readBody(req);
        const table = ctrl === 'Category' ? categories : devices;
        const row = table.find((r) => r.id === id);
        if (!row) return send(res, { code: 404, message: '未找到' }, 404);
        Object.assign(row, body, { id }); // 主键不可变
        return send(res, ok(row));
      }
      // 删除
      if (tail && method === 'DELETE') {
        const id = Number(tail);
        const table = ctrl === 'Category' ? categories : devices;
        const idx = table.findIndex((r) => r.id === id);
        if (idx < 0) return send(res, { code: 404, message: '未找到' }, 404);
        table.splice(idx, 1);
        return send(res, ok({ id }));
      }
    }
    return send(res, { code: 404, message: 'Not Found: ' + path }, 404);
  } catch (e) {
    return send(res, { code: 500, message: String(e) }, 500);
  }
}

http.createServer(handle).listen(PORT, () => {
  console.log(`[mock] 魔方 WebApi 契约 Mock 已启动: http://localhost:${PORT}`);
  console.log(`[mock] 认证契约(/Auth/*、/Mfa/Verify) 已按《认证接口设计.md》实现；实体接口需令牌(Bearer)。`);
  console.log(`[mock] 演示账号：任意 username + 任意密码；用户名为含 'mfa' 触发 MFA 二步验证。`);
});

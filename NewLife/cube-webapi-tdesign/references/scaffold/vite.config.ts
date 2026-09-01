import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// 真实后端所有接口（实体 + 登录 + 菜单）统一在 /api 下（如 /api/Admin/User/Login、/api/Admin/Index/GetMenuTree）。
// 开发态通过 dev server 代理转发，避免跨域与令牌头问题。
//
// ⚠️ 默认代理目标指向真实后端 https://localhost:7116。若需切换到零依赖 Mock 后端（端口 3001）做演示，设置 VITE_API_TARGET：
//   set VITE_API_TARGET=http://localhost:3001        # Windows(cmd)
//   $env:VITE_API_TARGET="http://localhost:3001"     # PowerShell
//   VITE_API_TARGET=http://localhost:3001 npm run dev
// secure:false 兼容本地自签 https 证书（真实后端 localhost:7116 多为自签）；target 为 http 时同样无副作用。
//
// ⚠️ 代理 /api（后端接口）+ /cube（附件/图片资源）。真实后端所有接口（实体 + 登录 + 菜单）统一在 /api 下；
// 上传接口返回的附件路径形如 `/cube/image?id=xxx.png`（filePath），是后端资源前缀，同样需要代理，
// 否则浏览器会把 /cube/image 当 SPA 路由返回 index.html → 图片 404。
// 切勿为前端路由（如 /Admin/User、/Sys/Config）配置代理：它们由 Vue Router 在浏览器内处理，
// 若被转发到后端会返回 404（浏览器硬刷新 /Admin/User 时表现为 GET 404）。
const API_TARGET = process.env.VITE_API_TARGET || 'https://localhost:7116';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 真实后端所有接口（实体 + 登录 + 菜单）统一在 /api 下
      '/api': { target: API_TARGET, changeOrigin: true, secure: false },
      // 附件/图片资源（上传返回的 filePath 相对路径，如 /cube/image?id=...）
      '/cube': { target: API_TARGET, changeOrigin: true, secure: false },
    },
  },
});

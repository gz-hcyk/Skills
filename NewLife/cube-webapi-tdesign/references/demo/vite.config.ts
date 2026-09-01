import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 前端实体接口走 /api，认证接口走 /Auth 与 /Mfa（AuthController / MfaController，不带 /api 前缀），
// 菜单走 /api/Admin/Index/GetMenuTree，附件/图片资源走 /cube；均由本机 mock 后端（端口 3001）提供。
// 开发时通过 dev server 代理转发，避免跨域与令牌头问题。
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/Auth': { target: 'http://localhost:3001', changeOrigin: true },
      '/Mfa': { target: 'http://localhost:3001', changeOrigin: true },
      '/Admin': { target: 'http://localhost:3001', changeOrigin: true },
      // 附件/图片资源（上传返回的 filePath 相对路径，如 /cube/image?id=...）——真实后端必须代理，否则图片 404
      '/cube': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});

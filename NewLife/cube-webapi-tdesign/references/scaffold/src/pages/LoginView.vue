<template>
  <div class="login-wrap">
    <div class="login-left">
      <div class="ll-logo">
        <div class="lg">C</div>
        <div>
          <b>NewLife.Cube</b>
          <span>魔方 WebApi 开发框架</span>
        </div>
      </div>
      <h2>元数据驱动的后台<br />开发新范式</h2>
      <p>一个实体 API，前端「继承」同一套骨架。列表、表单、详情零代码生成，专注业务而非重复造轮子。</p>
      <div class="feat">
        <div><t-icon name="check" /> 字段映射双模式：列表显名 / 表单下拉自动解析</div>
        <div><t-icon name="check" /> 含 ParentID 自动树形表，无需额外代码</div>
        <div><t-icon name="check" /> 权限由 GetPage.setting 驱动，按钮自动显隐</div>
        <div><t-icon name="check" /> 多租户 X-Tenant-Id 内建，顶栏一键切换</div>
      </div>
    </div>

    <div class="login-right">
      <div class="login-card">
        <h3>欢迎登录</h3>
        <div class="sub">请输入账号密码进入管理控制台</div>
        <t-form :data="form" @submit="onLogin" label-width="0">
          <t-form-item name="userName">
            <t-input v-model="form.userName" placeholder="用户名 / 手机号" size="large" clearable>
              <template #prefix-icon><t-icon name="user" /></template>
            </t-input>
          </t-form-item>
          <t-form-item name="password">
            <t-input v-model="form.password" type="password" placeholder="请输入密码" size="large" clearable>
              <template #prefix-icon><t-icon name="lock-on" /></template>
            </t-input>
          </t-form-item>
          <t-form-item name="tenant">
            <t-select v-model="form.tenant" placeholder="选择租户（多租户）" size="large">
              <t-option value="" label="默认租户（总控）" />
              <t-option value="east" label="华东物联网公司" />
              <t-option value="south" label="华南智造工厂" />
            </t-select>
          </t-form-item>
          <div class="login-foot">
            <t-checkbox v-model="remember">记住我</t-checkbox>
            <t-link theme="primary" href="javascript:void(0)">忘记密码？</t-link>
          </div>
          <t-button theme="primary" type="submit" block size="large">登 录</t-button>
        </t-form>
        <p class="hint">令牌头 Authentication（非 Authorization），登录接口 /Admin/User/Login（不带 /api 前缀）。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { useAuthStore } from '@/api/auth';

const auth = useAuthStore();
const router = useRouter();
const remember = ref(true);
const form = reactive({ userName: 'admin', password: '123456', tenant: '' });

async function onLogin() {
  try {
    await auth.login(form.userName, form.password);
    if (form.tenant) auth.setTenant(form.tenant);
    MessagePlugin.success('登录成功');
    router.push('/');
  } catch (e: any) {
    MessagePlugin.error(e?.message || '登录失败');
  }
}
</script>

<style scoped>
.login-wrap { display: flex; min-height: 100vh; }
.login-left {
  flex: 1; background: var(--cube-brand-gradient-iot);
  color: #fff; display: flex; flex-direction: column; justify-content: center;
  padding: 64px; position: relative; overflow: hidden;
}
.login-left::after {
  content: ''; position: absolute; right: -120px; bottom: -120px; width: 380px; height: 380px;
  border-radius: 50%; background: radial-gradient(circle, rgba(74, 150, 235, 0.5), transparent 70%);
}
.ll-logo { display: flex; align-items: center; gap: 12px; position: relative; z-index: 2; }
.ll-logo .lg { width: 46px; height: 46px; border-radius: 12px; background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; }
.ll-logo b { font-size: 18px; display: block; }
.ll-logo span { font-size: 12px; color: rgba(255, 255, 255, 0.7); }
.login-left h2 { font-size: 30px; margin: 48px 0 14px; position: relative; z-index: 2; line-height: 1.3; }
.login-left p { color: rgba(255, 255, 255, 0.78); font-size: 15px; max-width: 420px; position: relative; z-index: 2; line-height: 1.7; }
.feat { margin-top: 36px; position: relative; z-index: 2; display: flex; flex-direction: column; gap: 14px; color: rgba(255, 255, 255, 0.9); font-size: 14px; }
.feat div { display: flex; align-items: center; gap: 10px; }
.feat :deep(.t-icon) { color: #7fb2ff; }
.login-right { flex: 1; display: flex; align-items: center; justify-content: center; background: #fff; }
.login-card { width: 380px; max-width: 90%; }
.login-card h3 { font-size: 24px; font-weight: 600; margin-bottom: 6px; }
.login-card .sub { color: var(--td-text-color-secondary); margin-bottom: 28px; font-size: 13.5px; }
.login-foot { display: flex; justify-content: space-between; align-items: center; margin: 8px 0 24px; font-size: 13px; }
.hint { margin-top: 16px; font-size: 12px; color: var(--td-text-color-placeholder); line-height: 1.6; }
</style>

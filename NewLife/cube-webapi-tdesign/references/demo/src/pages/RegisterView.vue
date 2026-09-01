<template>
  <div class="auth-page">
    <div class="auth-card">
      <h3>注册账号</h3>
      <div class="sub">创建您的管理后台账号</div>

      <t-form :data="form" @submit="onRegister" label-width="0">
        <t-form-item name="username">
          <t-input v-model="form.username" placeholder="用户名" size="large" clearable />
        </t-form-item>
        <t-form-item name="email">
          <t-input v-model="form.email" placeholder="邮箱" size="large" clearable />
        </t-form-item>
        <t-form-item name="password">
          <t-input v-model="form.password" type="password" placeholder="密码" size="large" clearable />
        </t-form-item>
        <t-form-item name="confirmPassword">
          <t-input v-model="form.confirmPassword" type="password" placeholder="确认密码" size="large" clearable />
        </t-form-item>
        <t-form-item name="tenant">
          <t-input v-model="form.tenant" placeholder="租户编码（可选，多租户）" size="large" clearable />
        </t-form-item>
        <t-button theme="primary" block size="large" :loading="loading" @click="onRegister">注 册</t-button>
      </t-form>

      <t-link theme="primary" class="back" @click="goLogin">已有账号？返回登录</t-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { useAuthStore } from '../api/auth';

const auth = useAuthStore();
const router = useRouter();
const loading = ref(false);
const form = reactive({ username: '', email: '', password: '', confirmPassword: '', tenant: '' });

async function onRegister() {
  if (form.password !== form.confirmPassword) return MessagePlugin.warning('两次密码不一致');
  if (form.tenant) {
    localStorage.setItem('cube_tenant_code', form.tenant);
    auth.setTenant(form.tenant);
  }
  loading.value = true;
  try {
    await auth.registerUser({
      username: form.username,
      email: form.email,
      password: form.password,
      confirmPassword: form.confirmPassword,
    });
    MessagePlugin.success('注册成功，请登录');
    router.push('/login');
  } catch (e: any) {
    MessagePlugin.error(e?.message || '注册失败');
  } finally {
    loading.value = false;
  }
}

function goLogin() {
  router.push('/login');
}
</script>

<style scoped>
.auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--cube-brand-gradient-iot); }
.auth-card { width: 360px; max-width: 90%; background: #fff; border-radius: 16px; padding: 36px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12); }
.auth-card h3 { font-size: 22px; font-weight: 600; }
.auth-card .sub { color: var(--td-text-color-secondary); margin: 6px 0 24px; font-size: 13.5px; }
.back { display: block; text-align: center; margin-top: 16px; }
</style>

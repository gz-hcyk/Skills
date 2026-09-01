<template>
  <div class="auth-page">
    <div class="auth-card">
      <h3>忘记密码</h3>
      <div class="sub">通过短信 / 邮箱验证码重置密码</div>

      <template v-if="step === 1">
        <t-form :data="form" @submit="onSend" label-width="0">
          <t-form-item name="channel">
            <t-radio-group v-model="form.channel" variant="default-filled">
              <t-radio-button value="Sms">手机</t-radio-button>
              <t-radio-button value="Mail">邮箱</t-radio-button>
            </t-radio-group>
          </t-form-item>
          <t-form-item name="username">
            <t-input v-model="form.username" :placeholder="form.channel === 'Sms' ? '手机号' : '邮箱'" size="large" clearable />
          </t-form-item>
          <t-button theme="primary" block size="large" :loading="loading" @click="onSend">发送验证码</t-button>
        </t-form>
      </template>

      <template v-else>
        <t-form :data="form" @submit="onReset" label-width="0">
          <t-form-item name="code">
            <t-input v-model="form.code" placeholder="验证码" size="large" clearable />
          </t-form-item>
          <t-form-item name="newPassword">
            <t-input v-model="form.newPassword" type="password" placeholder="新密码" size="large" clearable />
          </t-form-item>
          <t-form-item name="confirmPassword">
            <t-input v-model="form.confirmPassword" type="password" placeholder="确认新密码" size="large" clearable />
          </t-form-item>
          <t-button theme="primary" block size="large" :loading="loading" @click="onReset">重置密码</t-button>
        </t-form>
      </template>

      <t-link theme="primary" class="back" @click="goLogin">返回登录</t-link>
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
const step = ref(1);
const form = reactive({ channel: 'Sms' as 'Sms' | 'Mail', username: '', code: '', newPassword: '', confirmPassword: '' });

async function onSend() {
  if (!form.username) return MessagePlugin.warning('请输入账号');
  loading.value = true;
  try {
    await auth.sendCode(form.channel, form.username, 'ResetPassword');
    step.value = 2;
    MessagePlugin.success('验证码已发送');
  } catch (e: any) {
    MessagePlugin.error(e?.message || '发送失败');
  } finally {
    loading.value = false;
  }
}

async function onReset() {
  if (form.newPassword !== form.confirmPassword) return MessagePlugin.warning('两次密码不一致');
  loading.value = true;
  try {
    await auth.resetPassword(form.username, form.code, form.newPassword, form.confirmPassword);
    MessagePlugin.success('密码重置成功，请登录');
    router.push('/login');
  } catch (e: any) {
    MessagePlugin.error(e?.message || '重置失败');
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

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const username = ref('admin')
const password = ref('admin')
const loading = ref(false)

async function onSubmit() {
  if (!username.value || !password.value) {
    MessagePlugin.warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    await auth.login(username.value, password.value)
    MessagePlugin.success('登录成功')
    await router.replace('/')
  } catch (e: any) {
    MessagePlugin.error(e?.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-brand">企业微信通讯录管理系统</div>
      <div class="login-sub">WeCom Address Book</div>
      <form class="login-form" @submit.prevent="onSubmit">
        <t-input v-model="username" placeholder="账号" size="large" autofocus />
        <t-input v-model="password" type="password" placeholder="密码" size="large" @enter="onSubmit" />
        <t-button theme="primary" size="large" block :loading="loading" @click="onSubmit">登录</t-button>
      </form>
      <div class="login-tip">默认账号 admin / admin</div>
    </div>
  </div>
</template>

<style scoped>
.login-wrap {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cube-sidebar-bg);
}
.login-card {
  width: 360px;
  background: #fff;
  border-radius: 14px;
  padding: 32px 28px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}
.login-brand {
  font-size: 20px;
  font-weight: 700;
  text-align: center;
  color: #0f4c9e;
}
.login-sub {
  text-align: center;
  color: #9aa4b2;
  font-size: 12px;
  margin: 4px 0 24px;
  letter-spacing: 1px;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.login-tip {
  margin-top: 16px;
  text-align: center;
  font-size: 12px;
  color: #9aa4b2;
}
</style>

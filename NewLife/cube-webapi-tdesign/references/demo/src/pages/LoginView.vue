<template>
  <div class="login-wrap">
    <div class="login-left" :style="loginBgStyle">
      <div class="ll-logo">
        <div class="lg">
          <img v-if="brandLogo" :src="brandLogo" alt="logo" class="lg-img" @error="onLogoError" />
          <template v-else>{{ (config.name || 'C').charAt(0) }}</template>
        </div>
        <div>
          <b>{{ config.name || 'NewLife.Cube' }}</b>
          <span>魔方 WebApi 开发框架</span>
        </div>
      </div>
      <h2>元数据驱动的后台<br />开发新范式</h2>
      <p>一个实体 API，前端「继承」同一套骨架。列表、表单、详情零代码生成，专注业务而非重复造轮子。</p>
      <div class="feat">
        <div><t-icon name="check" /> 字段映射双模式：列表显名 / 表单下拉自动解析</div>
        <div><t-icon name="check" /> 含 ParentID 自动树形表，无需额外代码</div>
        <div><t-icon name="check" /> 权限由 GetPage.setting 驱动，按钮自动显隐</div>
        <div><t-icon name="check" /> 多租户 X-Tenant 内建，顶栏一键切换</div>
      </div>
    </div>

    <div class="login-right">
      <div class="login-card">
        <!-- MFA 二步验证步骤 -->
        <template v-if="mfa.mfaRequired">
          <h3>两步验证</h3>
          <div class="sub">请输入身份验证器中的 6 位动态码</div>
          <t-input v-model="mfa.code" placeholder="6 位动态码" size="large" maxlength="6" />
          <t-button theme="primary" block size="large" :loading="loading" @click="onVerifyMfa">验 证</t-button>
          <p v-if="mfa.err" class="err">{{ mfa.err }}</p>
          <t-link theme="primary" class="back" @click="resetMfa">返回登录</t-link>
        </template>

        <!-- 登录表单（按 LoginConfig 开关渲染 Tab） -->
        <template v-else>
          <h3>欢迎登录</h3>
          <div class="sub">{{ config.loginTip || '请输入账号密码进入管理控制台' }}</div>

          <t-tabs v-if="hasTabs" v-model="activeTab">
            <t-tab-panel v-if="sw.password" value="password" label="密码登录" />
            <t-tab-panel v-if="sw.sms" value="sms" label="手机验证码" />
            <t-tab-panel v-if="sw.mail" value="mail" label="邮箱验证码" />
          </t-tabs>

          <!-- 密码登录 -->
          <t-form v-if="activeTab === 'password'" :data="pw" @submit="onPasswordLogin" label-width="0">
            <t-form-item name="username">
              <t-input v-model="pw.username" placeholder="用户名 / 手机号" size="large" clearable>
                <template #prefix-icon><t-icon name="user" /></template>
              </t-input>
            </t-form-item>
            <t-form-item name="password">
              <t-input v-model="pw.password" type="password" placeholder="请输入密码" size="large" clearable>
                <template #prefix-icon><t-icon name="lock-on" /></template>
              </t-input>
            </t-form-item>
            <p v-if="pwdHint" class="pwd-hint"><t-icon name="info-circle" /> {{ pwdHint }}</p>
            <t-form-item v-if="sw.captcha" name="captchaCode">
              <div class="captcha-row">
                <t-input v-model="pw.captchaCode" placeholder="图片验证码" size="large" clearable />
                <img v-if="captcha.image" class="captcha-img" :src="captchaSrc" @click="loadCaptcha" alt="captcha" />
              </div>
            </t-form-item>
            <t-form-item name="tenant">
              <t-input v-model="pw.tenant" placeholder="租户编码（可选，多租户）" size="large" clearable>
                <template #prefix-icon><t-icon name="usergroup" /></template>
              </t-input>
            </t-form-item>
            <div class="login-foot">
              <t-checkbox v-model="remember">记住我</t-checkbox>
              <t-link v-if="allowForgot" theme="primary" @click="goForgot">忘记密码？</t-link>
            </div>
            <t-button theme="primary" type="submit" block size="large" :loading="loading">登 录</t-button>
          </t-form>

          <!-- 短信 / 邮箱验证码登录 -->
          <t-form v-else :data="codeForm" @submit="onCodeLogin" label-width="0">
            <t-form-item name="username">
              <t-input v-model="codeForm.username" :placeholder="activeTab === 'sms' ? '手机号' : '邮箱'" size="large" clearable>
                <template #prefix-icon><t-icon name="user" /></template>
              </t-input>
            </t-form-item>
            <t-form-item name="code">
              <div class="captcha-row">
                <t-input v-model="codeForm.code" placeholder="验证码" size="large" clearable />
                <t-button variant="outline" :disabled="countdown > 0" @click="onSendCode">
                  {{ countdown > 0 ? countdown + 's' : '发送验证码' }}
                </t-button>
              </div>
            </t-form-item>
            <t-button theme="primary" type="submit" block size="large" :loading="loading">登 录</t-button>
          </t-form>

          <!-- 第三方登录 -->
          <div v-if="oauth.length" class="oauth">
            <t-divider>第三方登录</t-divider>
            <div class="oauth-list">
              <a v-for="p in oauth" :key="p.name" href="javascript:void(0)" @click="onOauth(p)">
                <img v-if="p.logo" :src="p.logo" :alt="p.nickName || p.name" @error="($event.target as HTMLImageElement).style.display = 'none'" />
                <span>{{ p.nickName || p.name }}</span>
              </a>
            </div>
          </div>

          <t-link v-if="allowRegister" theme="primary" class="reg-link" @click="goRegister">还没有账号？立即注册</t-link>
        </template>

        <p class="hint">登录接口 POST /Auth/Login（当前版本），密码经 Challenge-Response（RSA-OAEP/SHA-256）加密传输。</p>
        <div v-if="config.copyright" class="copyright" v-html="config.copyright" />
        <a v-if="config.registration" class="beian" href="https://www.beianx.cn/" target="_blank" rel="noreferrer">{{ config.registration }}</a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { useAuthStore, AuthCategory, type LoginConfig, type OAuthProvider } from '../api/auth';

const auth = useAuthStore();
const router = useRouter();
const loading = ref(false);
const remember = ref(true);

const config = ref<LoginConfig>({});
const activeTab = ref<'password' | 'sms' | 'mail'>('password');

const sw = computed(() => ({
  password: config.value.login?.password !== false,
  sms: !!config.value.login?.sms,
  mail: !!config.value.login?.mail,
  captcha: !!config.value.login?.captcha,
  sendCode: !!config.value.login?.sendCode,
}));
const hasTabs = computed(() => sw.value.sms || sw.value.mail);
const allowForgot = computed(() => !!config.value.login?.sms || !!config.value.login?.mail);
const allowRegister = computed(() => !!config.value.register?.enabled);
// 实测真实后端返回 oAuth（大写 A），文档写小写 oauth —— 双向兼容；只读小写会导致第三方按钮不渲染
const oauth = computed<OAuthProvider[]>(() => config.value.oAuth || (config.value as any).oauth || []);

/* 左栏 Logo：优先 loginLogo，其次 logo；加载失败回退到系统名首字母方块 */
const logoBroken = ref(false);
function onLogoError() {
  logoBroken.value = true;
}
const brandLogo = computed<string>(() => {
  const u = config.value.loginLogo || config.value.logo || '';
  return !logoBroken.value && u ? u : '';
});
/* 登录页背景图（loginBackground 有值时叠加到渐变之上） */
const loginBgStyle = computed(() =>
  config.value.loginBackground
    ? { backgroundImage: `url("${config.value.loginBackground}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {},
);
/* 密码复杂度提示（security.passwordComplexity=true 时展示） */
const pwdHint = computed(() =>
  config.value.security?.passwordComplexity
    ? '密码需 8–32 位，含大写字母、小写字母、数字及特殊字符'
    : '',
);

const pw = reactive({ username: 'admin', password: '123456', tenant: '', captchaCode: '' });
const codeForm = reactive({ username: '', code: '' });

/* 图片验证码（login.captcha=true 时） */
const captcha = reactive<{ id: string; image: string }>({ id: '', image: '' });
const captchaSrc = computed(() => (captcha.image ? 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(captcha.image))) : ''));
async function loadCaptcha() {
  try {
    const c = await auth.getCaptcha();
    if (c) {
      captcha.id = c.captchaId;
      captcha.image = c.image;
    }
  } catch {}
}

/* 倒计时 */
const countdown = ref(0);
let timer: number | undefined;
function startCountdown() {
  countdown.value = 60;
  timer = window.setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0 && timer) window.clearInterval(timer);
  }, 1000);
}

/* MFA */
const mfa = reactive<{ mfaRequired: boolean; mfaToken: string; code: string; err: string }>({
  mfaRequired: false,
  mfaToken: '',
  code: '',
  err: '',
});
function resetMfa() {
  mfa.mfaRequired = false;
  mfa.mfaToken = '';
  mfa.code = '';
  mfa.err = '';
}

onMounted(async () => {
  try {
    config.value = await auth.getLoginConfig();
  } catch {
    config.value = { login: { password: true } };
  }
  if (sw.value.captcha) loadCaptcha();
});

async function onPasswordLogin() {
  loading.value = true;
  if (pw.tenant) {
    localStorage.setItem('cube_tenant_code', pw.tenant);
    auth.setTenant(pw.tenant);
  }
  try {
    const r = await auth.loginWithPassword(pw.username, pw.password, { captchaId: captcha.id, captchaCode: pw.captchaCode });
    if (r.mfaRequired && r.mfaToken) {
      mfa.mfaRequired = true;
      mfa.mfaToken = r.mfaToken;
      return;
    }
    MessagePlugin.success('登录成功');
    router.push('/');
  } catch (e: any) {
    MessagePlugin.error(e?.message || '登录失败');
  } finally {
    loading.value = false;
  }
}

async function onSendCode() {
  const channel = activeTab.value === 'sms' ? 'Sms' : 'Mail';
  try {
    await auth.sendCode(channel, codeForm.username, 'Login');
    startCountdown();
    MessagePlugin.success('验证码已发送');
  } catch (e: any) {
    MessagePlugin.error(e?.message || '发送失败');
  }
}

async function onCodeLogin() {
  loading.value = true;
  try {
    await auth.loginWithCode(codeForm.username, codeForm.code, activeTab.value === 'sms' ? AuthCategory.Mobile : AuthCategory.Mail);
    MessagePlugin.success('登录成功');
    router.push('/');
  } catch (e: any) {
    MessagePlugin.error(e?.message || '登录失败');
  } finally {
    loading.value = false;
  }
}

async function onVerifyMfa() {
  loading.value = true;
  try {
    await auth.verifyMfa(mfa.mfaToken, mfa.code);
    MessagePlugin.success('验证成功');
    router.push('/');
  } catch (e: any) {
    mfa.err = e?.message || '验证失败';
  } finally {
    loading.value = false;
  }
}

function onOauth(p: OAuthProvider) {
  const returnUrl = encodeURIComponent(window.location.origin + '/');
  window.location.href = '/Sso/Login/' + p.name + '?r=' + returnUrl;
}

function goForgot() {
  router.push('/forgot-password');
}
function goRegister() {
  router.push('/register');
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
  border: 1px solid rgba(255, 255, 255, 0.3); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; overflow: hidden; }
.ll-logo .lg-img { width: 100%; height: 100%; object-fit: contain; }
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
.login-card .sub { color: var(--td-text-color-secondary); margin-bottom: 20px; font-size: 13.5px; }
.login-foot { display: flex; justify-content: space-between; align-items: center; margin: 8px 0 24px; font-size: 13px; }
.pwd-hint { display: flex; align-items: center; gap: 6px; margin: -6px 0 14px; font-size: 12px; color: var(--td-text-color-placeholder); }
.pwd-hint :deep(.t-icon) { color: var(--td-brand-color); }
.captcha-row { display: flex; gap: 8px; width: 100%; }
.captcha-row .t-input { flex: 1; }
.captcha-img { height: 40px; border-radius: 6px; cursor: pointer; border: 1px solid var(--td-component-border); }
.oauth { margin-top: 20px; }
.oauth-list { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
.oauth-list a { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 12px; color: var(--td-text-color-secondary); }
.oauth-list img { width: 36px; height: 36px; border-radius: 8px; }
.reg-link { display: block; text-align: center; margin-top: 16px; }
.back { display: block; text-align: center; margin-top: 12px; }
.err { color: var(--td-error-color); font-size: 13px; margin: 8px 0; }
.hint { margin-top: 16px; font-size: 12px; color: var(--td-text-color-placeholder); line-height: 1.6; }
.copyright { margin-top: 12px; font-size: 12px; color: var(--td-text-color-secondary); text-align: center; }
.beian { display: block; text-align: center; margin-top: 4px; font-size: 12px; color: var(--td-text-color-placeholder); }
</style>

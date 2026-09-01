import { createApp } from 'vue';
import { createPinia } from 'pinia';
import TDesign from 'tdesign-vue-next';
import 'tdesign-vue-next/es/style/index.css';
import './styles/tokens.css'; // 设计令牌落地（覆盖 TDesign 主题变量，登录页渐变等依赖它）
import App from './App.vue';
import router from './router';

const app = createApp(App);
app.use(createPinia());
app.use(TDesign);
app.use(router);
app.mount('#app');

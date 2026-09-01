<template>
  <div class="db-view">
    <t-card :title="title" :bordered="false">
      <t-space style="margin-bottom: 16px">
        <t-button theme="primary" :loading="loading" @click="load">刷新</t-button>
      </t-space>
      <t-table
        row-key="name"
        :data="rows"
        :columns="columns"
        :loading="loading"
        size="medium"
        stripe
        :pagination="null"
      >
        <template #operation="{ row }">
          <t-space>
            <t-button theme="primary" variant="text" :loading="row.__backing" @click="backup(row)">备份</t-button>
            <t-button theme="default" variant="text" @click="download(row)">下载架构</t-button>
          </t-space>
        </template>
      </t-table>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import http, { getApi, postApi } from '@/api/api';
// 复用全局行数据归一化（后端 PascalCase → 前端 camelCase），与实体列表页保持一致
import { normalizeRows } from '@/api/useEntityResource';

/**
 * 数据库管理页（对应 NewLife.Cube 的 DbController : ControllerBaseX）。
 *
 * 与实体控制器不同：DbController 不继承 EntityController<T>，因此【没有 GetPage、也不是标准 CRUD 列表】。
 * 它只暴露自定义端点：
 *   GET    /api/Admin/Db          → Json(0, null, list)，data 直接是 DbItem[]（无 rows/page 包裹）
 *   POST   /api/Admin/Db/Backup   → { name } 触发备份
 *   GET    /api/Admin/Db/Download → ?name= 下载数据库架构 XML（文件流）
 * 故不能用 ListPage（拉 GetPage 会失败），须单列此专用页。
 *
 * DbItem 契约（来自 NewLife.Cube BuildDatabaseList，字段名经 camelCase 归一后）：
 *   name(string) 连接名 / connStr(string,敏感不展示) / type(DbType 数值或名) / version(string) / backups(int 备份文件数)
 */
export interface DbItem {
  name: string;
  connStr?: string;
  type?: number | string;
  version?: string;
  backups?: number;
  __backing?: boolean;
}

const props = defineProps<{
  area?: string;
  controller?: string;
  title?: string;
}>();

const area = props.area ?? 'Admin';
const controller = props.controller ?? 'Db';
const title = computed(() => props.title ?? `${area} / ${controller}`);

const rows = ref<DbItem[]>([]);
const loading = ref(false);

// 列键统一用 camelCase（与 normalizeRows 归一后的行数据一致）
const columns = [
  { colKey: 'name', title: '名称', width: 180 },
  { colKey: 'type', title: '类型', width: 130 },
  { colKey: 'version', title: '版本', minWidth: 160, ellipsis: true },
  { colKey: 'backups', title: '备份数', width: 100 },
  { colKey: 'operation', title: '操作', width: 160, fixed: 'right' as const },
];

async function load() {
  loading.value = true;
  try {
    // GET /api/Admin/Db 返回信封，data 直接是数组（非 rows 包裹）
    const r = await getApi<DbItem[]>(`/${area}/${controller}`);
    // 兼容两种后端形态：
    //  - 标准信封 { code, message, data: [...] }
    //  - 个别 Cube 版本直接返回裸数组（无信封）→ getApi 直接给数组
    const payload = Array.isArray(r)
      ? r
      : Array.isArray(r?.data)
        ? r.data
        : (r?.data?.rows ?? r?.data?.list ?? []);
    if (import.meta.env.DEV) console.debug('[DbView] raw Db payload keys:', payload?.[0] && Object.keys(payload[0]));
    // 归一化行数据键到 camelCase（后端 PascalCase → 前端 camelCase，与实体页同源）
    rows.value = normalizeRows(Array.isArray(payload) ? payload : []);
  } catch (e: any) {
    MessagePlugin.error(e?.message || '加载数据库列表失败');
  } finally {
    loading.value = false;
  }
}

async function backup(row: DbItem) {
  row.__backing = true;
  try {
    await postApi(`/${area}/${controller}/Backup`, { name: row.name });
    MessagePlugin.success(`已触发备份：${row.Name}`);
    await load();
  } catch (e: any) {
    MessagePlugin.error(e?.message || '备份失败');
  } finally {
    row.__backing = false;
  }
}

async function download(row: DbItem) {
  try {
    // 文件流下载：用 http 实例（自带令牌拦截器），responseType=blob
    const r = await http.get(`/${area}/${controller}/Download`, {
      params: { name: row.name },
      responseType: 'blob',
    });
    const blob = r.data as Blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${row.Name}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e: any) {
    MessagePlugin.error(e?.message || '下载失败');
  }
}

onMounted(load);
</script>

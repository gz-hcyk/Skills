<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getApi } from '@/api/http'

const router = useRouter()

interface StatDef { group: string; area: string; controller: string; title: string }
interface StatItem extends StatDef { count: number | null; loading: boolean }

const statDefs: StatDef[] = [
  { group: '系统', area: 'Admin', controller: 'User', title: '用户' },
  { group: '系统', area: 'Admin', controller: 'Role', title: '角色' },
  { group: '系统', area: 'Admin', controller: 'Menu', title: '菜单' },
  { group: '系统', area: 'Admin', controller: 'Department', title: '部门' },
  { group: '系统', area: 'Admin', controller: 'Parameter', title: '参数' },
  { group: '系统', area: 'Admin', controller: 'Tenant', title: '租户' },
  { group: '系统', area: 'Cube', controller: 'App', title: '应用' },
  { group: '系统', area: 'Admin', controller: 'OAuthConfig', title: 'OAuth 配置' },
  { group: '系统', area: 'Admin', controller: 'Log', title: '审计日志' },
  { group: '业务', area: 'WeCom', controller: 'Class', title: '班级' },
  { group: '业务', area: 'WeCom', controller: 'Employee', title: '教职工' },
  { group: '业务', area: 'WeCom', controller: 'ExternalPerson', title: '校外人员' },
  { group: '业务', area: 'WeCom', controller: 'ExtAttrMapping', title: '扩展属性映射' },
  { group: '业务', area: 'WeCom', controller: 'SyncLog', title: '同步日志' },
  { group: '业务', area: 'WeCom', controller: 'WeComDepartment', title: '企微部门' },
  { group: '业务', area: 'WeCom', controller: 'WeComMember', title: '企微成员' },
]

const stats = ref<StatItem[]>([])
const recentLogs = ref<any[]>([])
const logsLoading = ref(false)

const statsByGroup = computed(() => {
  const map: Record<string, StatItem[]> = {}
  for (const s of stats.value) (map[s.group] ||= []).push(s)
  return map
})

async function countOf(area: string, controller: string): Promise<number> {
  const env: any = await getApi(`/${area}/${controller}`, { pageIndex: 1, pageSize: 1 })
  return Number(env?.page?.totalCount || 0)
}

async function loadStats() {
  stats.value = statDefs.map((d) => ({ ...d, count: null, loading: true }))
  await Promise.all(
    stats.value.map(async (s) => {
      try {
        s.count = await countOf(s.area, s.controller)
      } catch {
        s.count = -1
      }
      s.loading = false
    }),
  )
}

async function loadLogs() {
  logsLoading.value = true
  try {
    const env: any = await getApi('/Admin/Log', { pageIndex: 1, pageSize: 10 })
    recentLogs.value = Array.isArray(env?.data) ? env.data : []
  } catch {
    recentLogs.value = []
  } finally {
    logsLoading.value = false
  }
}

function go(area: string, controller: string) {
  router.push(`/entity/${area}/${controller}`)
}

const logColumns = [
  { key: 'category', label: '类别' },
  { key: 'action', label: '操作' },
  { key: 'userName', label: '用户' },
  { key: 'createTime', label: '时间' },
]
function cellOf(row: any, key: string): string {
  const v = row?.[key] ?? row?.[key.toLowerCase()]
  return v == null ? '-' : String(v)
}

onMounted(() => {
  loadStats()
  loadLogs()
})
</script>

<template>
  <div class="dash">
    <div class="dash-head">
      <div>
        <h2 class="dash-title">系统仪表盘</h2>
        <p class="dash-sub">魔方框架自带系统管理模块与业务模块统一概览</p>
      </div>
    </div>

    <template v-for="(items, group) in statsByGroup" :key="group">
      <h3 class="dash-group">{{ group }}模块</h3>
      <div class="stat-grid">
        <div
          v-for="s in items"
          :key="`${s.area}/${s.controller}`"
          class="stat-card"
          @click="go(s.area, s.controller)"
        >
          <div class="stat-label">{{ s.title }}</div>
          <div class="stat-value">
            <t-loading v-if="s.loading" size="small" />
            <span v-else-if="s.count == null">—</span>
            <span v-else-if="s.count < 0" class="stat-err">N/A</span>
            <span v-else>{{ s.count }}</span>
          </div>
          <div class="stat-path">{{ s.area }}/{{ s.controller }}</div>
        </div>
      </div>
    </template>

    <h3 class="dash-group">近期审计日志</h3>
    <t-loading v-if="logsLoading" />
    <t-table v-else :data="recentLogs" :columns="logColumns.map((c) => ({ colKey: c.key, title: c.label }))" row-key="id" size="small">
      <template #category="{ row }"><span>{{ cellOf(row, 'category') }}</span></template>
      <template #action="{ row }"><span>{{ cellOf(row, 'action') }}</span></template>
      <template #userName="{ row }"><span>{{ cellOf(row, 'userName') }}</span></template>
      <template #createTime="{ row }"><span>{{ cellOf(row, 'createTime') }}</span></template>
      <template #empty>
        <span>暂无审计日志</span>
      </template>
    </t-table>
  </div>
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dash-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.dash-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}
.dash-sub {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 13px;
}
.dash-group {
  margin: 18px 0 10px;
  font-size: 15px;
  font-weight: 600;
  color: #374151;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.stat-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px 16px;
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s, border-color 0.15s;
}
.stat-card:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
  border-color: var(--cube-sidebar-active-bg, #2b6cff);
}
.stat-label {
  font-size: 13px;
  color: #6b7280;
}
.stat-value {
  font-size: 26px;
  font-weight: 700;
  margin: 6px 0 4px;
  color: #111827;
  min-height: 32px;
  display: flex;
  align-items: center;
}
.stat-err {
  font-size: 16px;
  color: #9ca3af;
}
.stat-path {
  font-size: 11px;
  color: #9ca3af;
  font-family: monospace;
}
</style>

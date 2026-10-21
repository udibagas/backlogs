<script setup lang="ts">
interface Report {
  backlogByStatus: { status: string; count: number }[];
  backlogByPriority: { priority: string; count: number }[];
  backlogByType: { type: string; count: number }[];
  activeSprint: null | {
    name: string;
    goal: string;
    totalItems: number;
    completedItems: number;
    plannedEstimate: number;
    completedEstimate: number;
  };
  taskCount: number;
  recentActivity: {
    id: string;
    action: string;
    createdAt: string;
    actor: { name: string } | null;
  }[];
}
const route = useRoute();
const { request } = useApi();
const projectId = computed(() => String(route.params.projectId));
const report = ref<Report | null>(null);
const errorMessage = ref("");
const loading = ref(true);
async function load() {
  loading.value = true;
  try {
    report.value = await request<Report>(`/projects/${projectId.value}/reports`);
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    loading.value = false;
  }
}
const total = computed(() =>
  (report.value?.backlogByStatus ?? []).reduce((sum, item) => sum + item.count, 0)
);
onMounted(load);
watch(projectId, load);
</script>

<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Project workspace</p>
        <h1 class="page-title">Reports</h1>
        <p class="muted mt-2 text-sm">
          A snapshot of current work, built from live project records.
        </p>
      </div>
    </header>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-5" />
    <el-skeleton v-if="loading" :rows="6" animated />
    <template v-else-if="report">
      <el-row :gutter="16" class="mb-3">
        <el-col :sm="8" :xs="24" class="mb-4">
          <el-card shadow="never">
            <template #header><span class="text-sm font-medium">Backlog items</span></template>
            <el-statistic :value="total" />
            <p class="muted mt-1 text-xs">Active items across all statuses</p>
          </el-card>
        </el-col>
        <el-col :sm="8" :xs="24" class="mb-4">
          <el-card shadow="never">
            <template #header><span class="text-sm font-medium">Tasks</span></template>
            <el-statistic :value="report.taskCount" />
            <p class="muted mt-1 text-xs">Implementation work items</p>
          </el-card>
        </el-col>
        <el-col :sm="8" :xs="24" class="mb-4">
          <el-card shadow="never">
            <template #header><span class="text-sm font-medium">Current Sprint</span></template>
            <el-statistic
              ><template #formatter
                ><span class="text-xl">{{
                  report.activeSprint?.name ?? "None active"
                }}</span></template
              ></el-statistic
            >
            <p class="muted mt-1 text-xs">
              {{ report.activeSprint?.goal ?? "No Sprint is currently active" }}
            </p>
          </el-card>
        </el-col>
      </el-row>
      <div class="grid gap-5 lg:grid-cols-2">
        <el-card shadow="never">
          <template #header><h2 class="section-title">Items by status</h2></template>
          <div class="mt-5 space-y-4">
            <div v-for="entry in report.backlogByStatus" :key="entry.status">
              <div class="mb-1 flex justify-between text-sm">
                <span class="muted">{{ entry.status.replaceAll("_", " ").toLowerCase() }}</span>
                <span class="font-medium">{{ entry.count }}</span>
              </div>
              <el-progress
                :percentage="total ? (entry.count / total) * 100 : 0"
                :show-text="false"
              />
            </div>
            <el-empty v-if="!report.backlogByStatus.length" description="No backlog data yet." />
          </div>
        </el-card>
        <el-card shadow="never">
          <template #header><h2 class="section-title">Items by priority</h2></template>
          <el-table
            v-if="report.backlogByPriority.length"
            :data="report.backlogByPriority"
            class="mt-3"
          >
            <el-table-column label="Priority">
              <template #default="{ row }">{{ row.priority.toLowerCase() }}</template>
            </el-table-column>
            <el-table-column prop="count" label="Items" align="right" width="100" />
          </el-table>
          <el-empty v-else description="No priority data yet." />
        </el-card>
        <el-card shadow="never">
          <template #header><h2 class="section-title">Items by type</h2></template>
          <el-table v-if="report.backlogByType.length" :data="report.backlogByType" class="mt-3">
            <el-table-column label="Type">
              <template #default="{ row }">{{
                row.type.replaceAll("_", " ").toLowerCase()
              }}</template>
            </el-table-column>
            <el-table-column prop="count" label="Items" align="right" width="100" />
          </el-table>
          <el-empty v-else description="No backlog data yet." />
        </el-card>
        <el-card shadow="never">
          <template #header><h2 class="section-title">Sprint progress</h2></template>
          <template v-if="report.activeSprint">
            <p class="muted mt-2 text-sm">{{ report.activeSprint.goal }}</p>
            <el-progress
              class="mt-5"
              :percentage="
                report.activeSprint.totalItems
                  ? (report.activeSprint.completedItems / report.activeSprint.totalItems) * 100
                  : 0
              "
              :stroke-width="12"
              :show-text="false"
            />
            <p class="mt-2 text-sm">
              {{ report.activeSprint.completedItems }} of {{ report.activeSprint.totalItems }} items
              complete
            </p>
            <p class="muted mt-1 text-xs">
              {{ report.activeSprint.completedEstimate }} of
              {{ report.activeSprint.plannedEstimate }} estimate points completed
            </p>
          </template>
          <el-empty v-else description="No active Sprint to report on." />
          <el-divider />
          <p class="muted text-xs leading-relaxed">
            Sprint progress counts Product Backlog items in the DONE status; estimate totals include
            only items with estimates. These metrics are descriptive and are not team productivity
            comparisons.
          </p>
        </el-card>
      </div>
    </template>
  </div>
</template>

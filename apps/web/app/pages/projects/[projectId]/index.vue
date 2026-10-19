<script setup lang="ts">
interface Project {
  id: string;
  name: string;
  key: string;
  description: string;
  methodology: string;
  organization: { name: string };
}
interface Report {
  backlogByStatus: { status: string; count: number }[];
  activeSprint: null | {
    id: string;
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
    entityType: string;
    createdAt: string;
    actor: { name: string } | null;
  }[];
}
const route = useRoute();
const { request } = useApi();
const projectId = computed(() => String(route.params.projectId));
const project = ref<Project | null>(null);
const report = ref<Report | null>(null);
const loading = ref(true);
const errorMessage = ref("");

async function load() {
  loading.value = true;
  try {
    [project.value, report.value] = await Promise.all([
      request<Project>(`/projects/${projectId.value}`),
      request<Report>(`/projects/${projectId.value}/reports`)
    ]);
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(projectId, load);
</script>

<template>
  <div class="page-shell">
    <el-skeleton v-if="loading" :rows="6" animated />
    <template v-else-if="project">
      <header class="page-header">
        <div>
          <p class="eyebrow">{{ project.organization.name }} · {{ project.key }}</p>
          <h1 class="page-title">{{ project.name }}</h1>
          <p class="muted mt-2 max-w-2xl text-sm">
            {{ project.description || "Your team's shared space for planning and delivery." }}
          </p>
        </div>
        <el-button type="primary" @click="navigateTo(`/projects/${project.id}/backlog`)"
          >Open product backlog →</el-button
        >
      </header>
      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-5" />
      <el-row :gutter="16" class="mb-7">
        <el-col :sm="8" :xs="24" class="mb-4">
          <el-card shadow="never">
            <el-statistic
              title="Open backlog"
              :value="
                (report?.backlogByStatus ?? [])
                  .filter((row) => row.status !== 'DONE')
                  .reduce((sum, row) => sum + row.count, 0)
              "
            />
            <p class="muted mt-1 text-xs">Items not yet done</p>
          </el-card>
        </el-col>
        <el-col :sm="8" :xs="24" class="mb-4">
          <el-card shadow="never">
            <el-statistic :title="'Active Sprint'"
              ><template #formatter
                ><span class="text-xl">{{
                  report?.activeSprint?.name ?? "No active Sprint"
                }}</span></template
              ></el-statistic
            >
            <p class="muted mt-1 text-xs">
              {{
                report?.activeSprint
                  ? `${report.activeSprint.completedItems} of ${report.activeSprint.totalItems} items complete`
                  : "Plan a Sprint when the team is ready"
              }}
            </p>
          </el-card>
        </el-col>
        <el-col :sm="8" :xs="24" class="mb-4">
          <el-card shadow="never">
            <el-statistic title="Tasks tracked" :value="report?.taskCount ?? 0" />
            <p class="muted mt-1 text-xs">Implementation work across the project</p>
          </el-card>
        </el-col>
      </el-row>
      <div class="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <el-card shadow="never">
          <div class="mb-5 flex items-start justify-between">
            <div>
              <h2 class="section-title">Work by status</h2>
              <p class="muted mt-1 text-sm">Live counts from the Product Backlog.</p>
            </div>
            <el-link
              type="primary"
              underline="never"
              @click="navigateTo(`/projects/${project.id}/board`)"
              >View board →</el-link
            >
          </div>
          <div v-if="report?.backlogByStatus.length" class="space-y-4">
            <div v-for="item in report.backlogByStatus" :key="item.status">
              <div class="mb-1.5 flex justify-between text-sm">
                <span class="muted">{{ item.status.replaceAll("_", " ").toLowerCase() }}</span>
                <span class="font-medium">{{ item.count }}</span>
              </div>
              <el-progress
                :percentage="
                  Math.min(
                    100,
                    (item.count / Math.max(1, ...report.backlogByStatus.map((row) => row.count))) *
                      100
                  )
                "
                :show-text="false"
              />
            </div>
          </div>
          <el-empty v-else description="Add backlog items to see project progress." />
        </el-card>
        <el-card shadow="never">
          <h2 class="section-title">Recent activity</h2>
          <el-timeline v-if="report?.recentActivity.length" class="mt-4 !pl-1">
            <el-timeline-item
              v-for="activity in report.recentActivity"
              :key="activity.id"
              :timestamp="new Date(activity.createdAt).toLocaleString()"
              placement="top"
            >
              <span class="font-medium">{{ activity.actor?.name ?? "A team member" }}</span>
              {{ activity.action.replaceAll(".", " ") }}
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="Project updates will appear here." />
        </el-card>
      </div>
    </template>
    <el-alert v-else :title="errorMessage || 'Project not found.'" type="error" show-icon />
  </div>
</template>

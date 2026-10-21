<script setup lang="ts">
import { OfficeBuilding, Right } from "@element-plus/icons-vue";

interface ProjectSummary {
  id: string;
  name: string;
  key: string;
  methodology: string;
  organization: { name: string };
  _count: { backlogItems: number; sprints: number; tasks: number };
}

const { request } = useApi();
const projects = ref<ProjectSummary[]>([]);
const loading = ref(true);
const errorMessage = ref("");

onMounted(async () => {
  try {
    projects.value = await request<ProjectSummary[]>("/projects");
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Your workspace</p>
        <h1 class="page-title">Good work starts with focus.</h1>
        <p class="muted mt-2 text-sm">A clear view of the projects moving your team forward.</p>
      </div>
      <el-button type="primary" :icon="Right" tag="router-link" to="/projects">
        View projects
      </el-button>
    </header>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-5" />
    <el-row :gutter="16" class="mb-7">
      <el-col :sm="8" :xs="24" class="mb-4">
        <el-card shadow="never">
          <template #header><span class="text-sm font-medium">Active projects</span></template>
          <el-statistic :value="projects.length" />
          <p class="muted mt-1 text-xs">Across your organizations</p>
        </el-card>
      </el-col>
      <el-col :sm="8" :xs="24" class="mb-4">
        <el-card shadow="never">
          <template #header><span class="text-sm font-medium">Backlog items</span></template>
          <el-statistic
            :value="projects.reduce((sum, project) => sum + project._count.backlogItems, 0)"
          />
          <p class="muted mt-1 text-xs">Priorities ready to refine</p>
        </el-card>
      </el-col>
      <el-col :sm="8" :xs="24" class="mb-4">
        <el-card shadow="never">
          <template #header><span class="text-sm font-medium">Tasks tracked</span></template>
          <el-statistic
            :value="projects.reduce((sum, project) => sum + project._count.tasks, 0)"
          />
          <p class="muted mt-1 text-xs">Delivery work in the system</p>
        </el-card>
      </el-col>
    </el-row>
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="section-title">Your projects</h2>
            <p class="muted mt-1 text-sm">Jump back into a team's work.</p>
          </div>
          <el-link type="primary" underline="never" @click="navigateTo('/projects')"
            >All projects →</el-link
          >
        </div>
      </template>
      <el-skeleton v-if="loading" :rows="3" animated />
      <el-empty v-else-if="!projects.length" description="Your first project is waiting">
        <p class="muted mb-3 text-sm">
          Create an organization, then start a project with your team.
        </p>
        <el-button type="primary" :icon="OfficeBuilding" @click="navigateTo('/organizations')"
          >Create an organization</el-button
        >
      </el-empty>
      <div v-else class="grid gap-3 lg:grid-cols-2">
        <NuxtLink
          v-for="project in projects"
          :key="project.id"
          :to="`/projects/${project.id}`"
          class="project-row"
        >
          <div class="project-mark">{{ project.key.slice(0, 2) }}</div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h3 class="truncate font-semibold">{{ project.name }}</h3>
              <el-tag size="small" type="info">{{ project.key }}</el-tag>
            </div>
            <p class="muted mt-1 text-xs">
              {{ project.organization.name }} · {{ project.methodology }}
            </p>
            <p class="mt-3 text-xs">
              {{ project._count.backlogItems }} backlog items · {{ project._count.tasks }} tasks
            </p>
          </div>
          <span class="muted" aria-hidden="true">↗</span>
        </NuxtLink>
      </div>
    </el-card>
  </div>
</template>

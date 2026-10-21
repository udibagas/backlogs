<script setup lang="ts">
import { Plus } from "@element-plus/icons-vue";
import { z } from "zod";

interface Organization {
  id: string;
  name: string;
}
interface Project {
  id: string;
  name: string;
  key: string;
  methodology: string;
  organization: { name: string };
  _count: { backlogItems: number; tasks: number };
}
const { request } = useApi();
const organizations = ref<Organization[]>([]);
const projects = ref<Project[]>([]);
const name = ref("");
const key = ref("");
const organizationId = ref("");
const methodology = ref("SCRUM");
const description = ref("");
const errorMessage = ref("");
const loading = ref(true);
const pending = ref(false);
const projectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  key: z
    .string()
    .trim()
    .min(2)
    .max(8)
    .regex(/^[a-zA-Z0-9]+$/, "Use letters and numbers for the project key."),
  organizationId: z.string().uuid()
});

async function load() {
  loading.value = true;
  try {
    [organizations.value, projects.value] = await Promise.all([
      request<Organization[]>("/organizations"),
      request<Project[]>("/projects")
    ]);
    organizationId.value ||= organizations.value[0]?.id ?? "";
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    loading.value = false;
  }
}
async function createProject() {
  errorMessage.value = "";
  const parsed = projectSchema.safeParse({
    name: name.value,
    key: key.value,
    organizationId: organizationId.value
  });
  if (!parsed.success) {
    errorMessage.value = parsed.error.issues[0]?.message ?? "Check the project details.";
    return;
  }
  pending.value = true;
  try {
    const project = await request<Project>(`/organizations/${organizationId.value}/projects`, {
      method: "POST",
      body: {
        name: name.value.trim(),
        key: key.value.trim().toUpperCase(),
        description: description.value,
        methodology: methodology.value
      }
    });
    await navigateTo(`/projects/${project.id}`);
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    pending.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Workspace</p>
        <h1 class="page-title">Projects</h1>
        <p class="muted mt-2 text-sm">A shared home for your product work and delivery.</p>
      </div>
    </header>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-5" />
    <el-card shadow="never" class="mb-6">
      <h2 class="section-title">Start a project</h2>
      <p class="muted mt-1 text-sm">Projects keep backlog, delivery, and reporting connected.</p>
      <el-form class="form-stack mt-5" label-position="top" @submit.prevent="createProject">
        <el-row :gutter="16">
          <el-col :sm="12" :xs="24">
            <el-form-item label="Project name">
              <el-input v-model="name" maxlength="120" placeholder="e.g. Customer Portal" />
            </el-form-item>
          </el-col>
          <el-col :sm="12" :xs="24">
            <el-form-item label="Project key">
              <el-input v-model="key" maxlength="8" placeholder="PORTAL" />
            </el-form-item>
          </el-col>
          <el-col :sm="12" :xs="24">
            <el-form-item label="Organization">
              <el-select v-model="organizationId" placeholder="Choose an organization">
                <el-option
                  v-for="organization in organizations"
                  :key="organization.id"
                  :label="organization.name"
                  :value="organization.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :sm="12" :xs="24">
            <el-form-item label="Methodology">
              <el-select v-model="methodology">
                <el-option label="Scrum" value="SCRUM" />
                <el-option label="Kanban" value="KANBAN" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="Description">
              <el-input
                v-model="description"
                type="textarea"
                :rows="3"
                maxlength="2000"
                placeholder="What is this project working toward?"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-button
          type="primary"
          :icon="Plus"
          native-type="submit"
          :loading="pending"
          :disabled="!organizations.length"
        >
          Create project
        </el-button>
        <el-link
          v-if="!organizations.length"
          type="primary"
          underline="never"
          class="ml-3"
          @click="navigateTo('/organizations')"
          >Create an organization first</el-link
        >
      </el-form>
    </el-card>
    <el-card shadow="never">
      <h2 class="section-title mb-4">Your projects</h2>
      <el-skeleton v-if="loading" :rows="3" animated />
      <el-empty
        v-else-if="!projects.length"
        description="No projects yet. Create one above to begin."
      />
      <div v-else class="grid gap-3 lg:grid-cols-2">
        <NuxtLink
          v-for="project in projects"
          :key="project.id"
          :to="`/projects/${project.id}`"
          class="project-row"
        >
          <div class="project-mark">{{ project.key.slice(0, 2) }}</div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">{{ project.name }}</h3>
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

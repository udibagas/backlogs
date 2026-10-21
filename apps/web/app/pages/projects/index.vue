<script setup lang="ts">
import { Delete, Edit, Plus } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { z } from "zod";

interface Organization {
  id: string;
  name: string;
}
interface Project {
  id: string;
  name: string;
  key: string;
  description: string;
  methodology: string;
  organization: { name: string };
  _count: { backlogItems: number; tasks: number };
  canManage: boolean;
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
const projectDialogOpen = ref(false);
const editingProject = ref<Project | null>(null);
const deletingProjectId = ref<string | null>(null);
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
async function saveProject() {
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
    const body = {
      name: name.value.trim(),
      key: key.value.trim().toUpperCase(),
      description: description.value,
      methodology: methodology.value
    };
    if (editingProject.value) {
      await request(`/projects/${editingProject.value.id}`, { method: "PATCH", body });
      projectDialogOpen.value = false;
      await load();
    } else {
      const project = await request<Project>(`/organizations/${organizationId.value}/projects`, {
        method: "POST",
        body
      });
      await navigateTo(`/projects/${project.id}`);
    }
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    pending.value = false;
  }
}
function openProjectDialog() {
  errorMessage.value = "";
  editingProject.value = null;
  name.value = "";
  key.value = "";
  organizationId.value = organizations.value[0]?.id ?? "";
  methodology.value = "SCRUM";
  description.value = "";
  projectDialogOpen.value = true;
}
function editProject(project: Project) {
  errorMessage.value = "";
  editingProject.value = project;
  name.value = project.name;
  key.value = project.key;
  description.value = project.description;
  methodology.value = project.methodology;
  projectDialogOpen.value = true;
}
async function archiveProject(project: Project) {
  errorMessage.value = "";
  try {
    await ElMessageBox.confirm(
      `"${project.name}" will be archived. Its project data will be preserved and it will no longer appear in your active projects.`,
      "Archive project",
      { type: "warning", confirmButtonText: "Archive project", cancelButtonText: "Cancel" }
    );
  } catch {
    return;
  }
  deletingProjectId.value = project.id;
  try {
    await request(`/projects/${project.id}`, { method: "DELETE" });
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    deletingProjectId.value = null;
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
      <el-button type="primary" :icon="Plus" @click="openProjectDialog">
        Start a project
      </el-button>
    </header>
    <el-alert
      v-if="errorMessage && !projectDialogOpen"
      :title="errorMessage"
      type="error"
      show-icon
      class="mb-5"
    />
    <el-dialog
      v-model="projectDialogOpen"
      :title="editingProject ? 'Edit project' : 'Start a project'"
      width="600px"
      append-to-body
    >
      <p v-if="!editingProject" class="muted mb-5 text-sm">
        Projects keep backlog, delivery, and reporting connected.
      </p>
      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-4" />
      <el-form
        id="project-form"
        class="form-stack"
        label-position="top"
        @submit.prevent="saveProject"
      >
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
          <el-col v-if="!editingProject" :sm="12" :xs="24">
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
        <el-link
          v-if="!editingProject && !organizations.length"
          type="primary"
          underline="never"
          class="ml-3"
          @click="navigateTo('/organizations')"
          >Create an organization first</el-link
        >
      </el-form>
      <template #footer>
        <el-button :disabled="pending" @click="projectDialogOpen = false">Cancel</el-button>
        <el-button
          type="primary"
          :icon="Plus"
          native-type="submit"
          form="project-form"
          :loading="pending"
          :disabled="!editingProject && !organizations.length"
        >
          {{ editingProject ? "Save changes" : "Create project" }}
        </el-button>
      </template>
    </el-dialog>
    <el-card shadow="never">
      <template #header>
        <h2 class="section-title">Your projects</h2>
      </template>
      <el-skeleton v-if="loading" :rows="3" animated />
      <el-empty
        v-else-if="!projects.length"
        description="No projects yet. Start one to begin."
      />
      <div v-else class="grid gap-3 lg:grid-cols-2">
        <div
          v-for="project in projects"
          :key="project.id"
          class="project-row"
        >
          <NuxtLink
            :to="`/projects/${project.id}`"
            class="flex min-w-0 flex-1 items-center gap-3 no-underline"
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
          <el-dropdown v-if="project.canManage" trigger="click">
            <el-button
              text
              :loading="deletingProjectId === project.id"
              :aria-label="`Actions for ${project.name}`"
              @click.prevent
            >
              Actions
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :icon="Edit" @click="editProject(project)">
                  Edit project
                </el-dropdown-item>
                <el-dropdown-item
                  :icon="Delete"
                  divided
                  @click="archiveProject(project)"
                >
                  Archive project
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </el-card>
  </div>
</template>

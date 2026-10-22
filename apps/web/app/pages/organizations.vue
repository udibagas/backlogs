<script setup lang="ts">
import { Delete, Edit, Folder, Plus } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { z } from "zod";

interface Organization {
  id: string;
  name: string;
  slug: string;
  memberships: { role: string }[];
  _count: { projects: number };
}
const { request } = useApi();
const organizations = ref<Organization[]>([]);
const name = ref("");
const errorMessage = ref("");
const loading = ref(true);
const pending = ref(false);
const organizationDialogOpen = ref(false);
const editingOrganization = ref<Organization | null>(null);
const deletingOrganizationId = ref<string | null>(null);
const organizationSchema = z.object({ name: z.string().trim().min(2).max(100) });

async function load() {
  loading.value = true;
  try {
    organizations.value = await request<Organization[]>("/organizations");
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    loading.value = false;
  }
}
async function saveOrganization() {
  errorMessage.value = "";
  const parsed = organizationSchema.safeParse({ name: name.value });
  if (!parsed.success) {
    errorMessage.value = parsed.error.issues[0]?.message ?? "Check the organization name.";
    return;
  }
  pending.value = true;
  try {
    if (editingOrganization.value) {
      await request(`/organizations/${editingOrganization.value.id}`, {
        method: "PATCH",
        body: { name: parsed.data.name }
      });
    } else {
      await request("/organizations", { method: "POST", body: { name: parsed.data.name } });
    }
    organizationDialogOpen.value = false;
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    pending.value = false;
  }
}
function openCreateDialog() {
  errorMessage.value = "";
  editingOrganization.value = null;
  name.value = "";
  organizationDialogOpen.value = true;
}
function editOrganization(organization: Organization) {
  errorMessage.value = "";
  editingOrganization.value = organization;
  name.value = organization.name;
  organizationDialogOpen.value = true;
}
async function deleteOrganization(organization: Organization) {
  errorMessage.value = "";
  try {
    await ElMessageBox.confirm(
      `Delete "${organization.name}"? This action cannot be undone.`,
      "Delete organization",
      {
        type: "warning",
        confirmButtonText: "Delete organization",
        cancelButtonText: "Cancel"
      }
    );
  } catch {
    return;
  }
  deletingOrganizationId.value = organization.id;
  try {
    await request(`/organizations/${organization.id}`, { method: "DELETE" });
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    deletingOrganizationId.value = null;
  }
}
onMounted(load);
</script>

<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Workspace</p>
        <h1 class="page-title">Organizations</h1>
        <p class="muted mt-2 text-sm">Keep teams and projects in one well-organized space.</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreateDialog">
        Create organization
      </el-button>
    </header>
    <el-alert
      v-if="errorMessage && !organizationDialogOpen"
      :title="errorMessage"
      type="error"
      show-icon
      class="mb-5!"
    />
    <el-dialog
      v-model="organizationDialogOpen"
      :title="editingOrganization ? 'Edit organization' : 'Create an organization'"
      width="480px"
      append-to-body
    >
      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-4" />
      <el-form id="organization-form" label-position="top" @submit.prevent="saveOrganization">
        <el-form-item label="Organization name">
          <el-input
            v-model="name"
            aria-label="Organization name"
            placeholder="e.g. Northstar Studio"
            maxlength="100"
            autofocus
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="pending" @click="organizationDialogOpen = false">Cancel</el-button>
        <el-button
          type="primary"
          :icon="editingOrganization ? Edit : Plus"
          native-type="submit"
          form="organization-form"
          :loading="pending"
        >
          {{ editingOrganization ? "Save changes" : "Create organization" }}
        </el-button>
      </template>
    </el-dialog>
    <el-card shadow="never">
      <template #header>
        <h2 class="section-title">Your organizations</h2>
      </template>
      <el-skeleton v-if="loading" :rows="3" animated />
      <el-empty
        v-else-if="!organizations.length"
        description="No organizations yet. Create one to get started."
      />
      <ul v-else class="m-0 list-none p-0">
        <li
          v-for="organization in organizations"
          :key="organization.id"
          class="flex flex-wrap items-center gap-3 py-4"
          style="border-top: 1px solid var(--el-border-color-extra-light)"
        >
          <div class="project-mark">{{ organization.name.slice(0, 1).toUpperCase() }}</div>
          <div class="min-w-0 flex-1">
            <h3 class="font-semibold">{{ organization.name }}</h3>
            <p class="muted text-xs">
              {{ organization._count.projects }} projects ·
              {{ organization.memberships[0]?.role.toLowerCase() }}
            </p>
          </div>
          <el-button :icon="Folder" @click="navigateTo('/projects')">View projects</el-button>
          <el-button
            v-if="['OWNER', 'ADMIN'].includes(organization.memberships[0]?.role ?? '')"
            :icon="Edit"
            @click="editOrganization(organization)"
          >
            Edit
          </el-button>
          <el-tooltip
            v-if="organization.memberships[0]?.role === 'OWNER'"
            :content="
              organization._count.projects
                ? 'Organizations with projects cannot be deleted.'
                : 'Delete organization'
            "
          >
            <span>
              <el-button
                type="danger"
                :icon="Delete"
                :loading="deletingOrganizationId === organization.id"
                :disabled="organization._count.projects > 0"
                @click="deleteOrganization(organization)"
              >
                Delete
              </el-button>
            </span>
          </el-tooltip>
        </li>
      </ul>
    </el-card>
  </div>
</template>

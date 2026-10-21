<script setup lang="ts">
import { Folder, Plus } from "@element-plus/icons-vue";

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
async function createOrganization() {
  errorMessage.value = "";
  if (name.value.trim().length < 2) {
    errorMessage.value = "Organization name must be at least 2 characters.";
    return;
  }
  pending.value = true;
  try {
    await request("/organizations", { method: "POST", body: { name: name.value.trim() } });
    name.value = "";
    await load();
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
        <h1 class="page-title">Organizations</h1>
        <p class="muted mt-2 text-sm">Keep teams and projects in one well-organized space.</p>
      </div>
    </header>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-5" />
    <el-card shadow="never" class="mb-6">
      <h2 class="section-title">Create an organization</h2>
      <form class="mt-4 flex flex-col gap-3 sm:flex-row" @submit.prevent="createOrganization">
        <el-input
          v-model="name"
          class="flex-1"
          aria-label="Organization name"
          placeholder="e.g. Northstar Studio"
          maxlength="100"
        />
        <el-button type="primary" :icon="Plus" native-type="submit" :loading="pending">
          Create organization
        </el-button>
      </form>
      <p class="muted mt-2 text-xs">
        You will be the owner and can create projects for this organization.
      </p>
    </el-card>
    <el-card shadow="never">
      <h2 class="section-title mb-4">Your organizations</h2>
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
        </li>
      </ul>
    </el-card>
  </div>
</template>

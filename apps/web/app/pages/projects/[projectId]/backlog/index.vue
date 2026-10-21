<script setup lang="ts">
import { Plus, Search } from "@element-plus/icons-vue";

interface BacklogItem {
  id: string;
  identifier: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  estimate: number | null;
  storyRole: string | null;
  storyCapability: string | null;
  storyBenefit: string | null;
  criteria: { id: string; description: string; completed: boolean }[];
  dependencies: { dependsOn: { id: string; title: string; status: string } }[];
  assignee: { id: string; name: string } | null;
}
interface ProjectMember {
  userId: string;
  user: { id: string; name: string; email: string };
}
interface BacklogResponse {
  data: BacklogItem[];
  pagination: { total: number; pages: number };
}
const route = useRoute();
const { request } = useApi();
const projectId = computed(() => String(route.params.projectId));
const items = ref<BacklogItem[]>([]);
const members = ref<ProjectMember[]>([]);
const search = ref("");
const errorMessage = ref("");
const loading = ref(true);
const editorOpen = ref(false);

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [response, projectMembers] = await Promise.all([
      request<BacklogResponse>(`/projects/${projectId.value}/backlog`, {
        query: { search: search.value || undefined }
      }),
      request<ProjectMember[]>(`/projects/${projectId.value}/members`)
    ]);
    items.value = response.data;
    members.value = projectMembers;
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    loading.value = false;
  }
}
function openCreate() {
  editorOpen.value = true;
}
async function changeAssignee(item: BacklogItem, assigneeId: string | null) {
  errorMessage.value = "";
  try {
    await request(`/backlog-items/${item.id}`, {
      method: "PATCH",
      body: { assigneeId: assigneeId || null }
    });
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}
async function changeStatus(item: BacklogItem, status: string) {
  try {
    await request(`/backlog-items/${item.id}/status`, { method: "PATCH", body: { status } });
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}
onMounted(load);
watch(projectId, load);
</script>

<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Project workspace</p>
        <h1 class="page-title">Product backlog</h1>
        <p class="muted mt-2 text-sm">A prioritized view of the outcomes your team may deliver.</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">New item</el-button>
    </header>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-5" />
    <el-card shadow="never">
      <template #header>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="section-title">
              Backlog items
              <el-badge :value="items.length" type="info" :show-zero="true" class="ml-2" />
            </h2>
            <p class="muted mt-1 text-sm">Search, refine, and prepare work for planning.</p>
          </div>
          <el-input
            v-model="search"
            class="sm:w-72!"
            placeholder="Search backlog"
            aria-label="Search backlog"
            clearable
            @keyup.enter="load"
            @clear="load"
          >
            <template #append>
              <el-button :icon="Search" @click="load">Search</el-button>
            </template>
          </el-input>
        </div>
      </template>
      <el-table v-loading="loading" :data="items">
        <template #empty>
          <el-empty description="Nothing in the backlog yet">
            <p class="muted mb-3 text-sm">Capture an Epic, User Story, Bug, Task, or Spike.</p>
            <el-button type="primary" :icon="Plus" @click="openCreate">
              Create the first item
            </el-button>
          </el-empty>
        </template>
        <el-table-column label="Item" min-width="280">
          <template #default="{ row }">
            <NuxtLink
              :to="`/projects/${projectId}/backlog/${row.id}`"
              class="text-(--el-color-primary) no-underline"
            >
              {{ row.identifier }}
            </NuxtLink>
            <p class="mt-1 max-w-md font-medium">{{ row.title }}</p>
            <p v-if="row.description" class="muted mt-1 line-clamp-1 max-w-md text-xs">
              {{ row.description }}
            </p>
          </template>
        </el-table-column>
        <el-table-column label="Type" width="140">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{
              row.type.replaceAll("_", " ").toLowerCase()
            }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Priority" width="110">
          <template #default="{ row }">
            <el-text
              :type="row.priority === 'CRITICAL' ? 'danger' : undefined"
              :tag="row.priority === 'CRITICAL' ? 'b' : 'span'"
              >{{ row.priority.toLowerCase() }}</el-text
            >
          </template>
        </el-table-column>
        <el-table-column label="Estimate" width="100">
          <template #default="{ row }">{{ row.estimate ?? "—" }}</template>
        </el-table-column>
        <el-table-column label="Assignee" min-width="170">
          <template #default="{ row }">
            <el-select
              :model-value="row.assignee?.id ?? ''"
              size="small"
              clearable
              filterable
              placeholder="Unassigned"
              :aria-label="`Assign ${row.identifier}`"
              @change="changeAssignee(row as BacklogItem, $event as string | null)"
            >
              <el-option
                v-for="member in members"
                :key="member.userId"
                :label="member.user.name"
                :value="member.userId"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="Status" width="170">
          <template #default="{ row }">
            <el-select
              :model-value="row.status"
              size="small"
              :aria-label="`Change ${row.identifier} status`"
              @change="changeStatus(row as BacklogItem, $event as string)"
            >
              <el-option
                v-for="status in [
                  'BACKLOG',
                  'READY',
                  'IN_PROGRESS',
                  'IN_REVIEW',
                  'TESTING',
                  'DONE'
                ]"
                :key="status"
                :label="status.replaceAll('_', ' ').toLowerCase()"
                :value="status"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="Criteria" width="110">
          <template #default="{ row }">{{ row.criteria.length }} criteria</template>
        </el-table-column>
      </el-table>
    </el-card>

    <BacklogItemForm
      v-model="editorOpen"
      :project-id="projectId"
      :members="members"
      :item="null"
      @saved="load"
      @error="errorMessage = $event"
    />
  </div>
</template>

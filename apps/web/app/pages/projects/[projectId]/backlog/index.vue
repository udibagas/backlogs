<script setup lang="ts">
import { Bottom, Filter, Plus, Search, Top } from "@element-plus/icons-vue";

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
const estimateSizes: Record<number, string> = {
  1: "XS",
  2: "S",
  4: "M",
  8: "L",
  16: "XL",
  32: "XXL",
  64: "XXXL"
};

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
const statuses = ["BACKLOG", "READY", "IN_PROGRESS", "IN_REVIEW", "TESTING", "DONE"];
const priorityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const statusFilter = ref("");
const sortDesc = ref(false);
const displayItems = computed(() => {
  const filtered = statusFilter.value
    ? items.value.filter((item) => item.status === statusFilter.value)
    : [...items.value];
  if (!sortDesc.value) return filtered;
  return filtered.sort(
    (a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority)
  );
});
const typeClasses: Record<string, string> = {
  EPIC: "bg-indigo-100 text-indigo-700",
  USER_STORY: "bg-gray-100 text-gray-600",
  BUG: "bg-red-100 text-red-700",
  TASK: "bg-sky-100 text-sky-700",
  SPIKE: "bg-amber-100 text-amber-700"
};
const priorityClasses: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-purple-100 text-purple-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  LOW: "bg-gray-100 text-gray-600"
};
const statusDots: Record<string, string> = {
  BACKLOG: "bg-gray-400",
  READY: "bg-cyan-500",
  IN_PROGRESS: "bg-blue-500",
  IN_REVIEW: "bg-purple-500",
  TESTING: "bg-amber-500",
  DONE: "bg-green-500"
};
function statusLabel(status: string) {
  const text = status.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
function estimateLabel(estimate: number | null) {
  if (estimate === null) return "—";
  const size = estimateSizes[estimate];
  return size ? `${estimate} (${size})` : String(estimate);
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
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-5!" />
    <el-card shadow="never" body-class="p-0!">
      <template #header>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="sm:mr-auto">
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
            :prefix-icon="Search"
          />
          <el-select
            v-model="statusFilter"
            class="w-36!"
            clearable
            placeholder="Filter status"
            aria-label="Filter by status"
          >
            <template #prefix><el-icon><Filter /></el-icon></template>
            <el-option
              v-for="status in statuses"
              :key="status"
              :label="statusLabel(status)"
              :value="status"
            />
          </el-select>
          <el-button :icon="sortDesc ? Bottom : Top" @click="sortDesc = !sortDesc">
            Priority
          </el-button>
        </div>
      </template>
      <el-table v-loading="loading" :data="displayItems" class="backlog-table" height="calc(100vh - 360px)">
        <template #empty>
          <el-empty description="Nothing in the backlog yet">
            <p class="muted mb-3 text-sm">Capture an Epic, User Story, Bug, Task, or Spike.</p>
            <el-button type="primary" :icon="Plus" @click="openCreate">
              Create the first item
            </el-button>
          </el-empty>
        </template>
        <el-table-column label="Item" min-width="300">
          <template #default="{ row }">
            <div class="py-1">
              <div class="flex items-baseline gap-2">
                <NuxtLink
                  :to="`/projects/${projectId}/backlog/${row.id}`"
                  class="font-mono text-xs text-(--el-text-color-secondary) no-underline"
                >
                  {{ row.identifier }}
                </NuxtLink>
                <span class="font-semibold">{{ row.title }}</span>
              </div>
              <p v-if="row.description" class="muted mt-1 line-clamp-1 max-w-md text-xs">
                {{ row.description }}
              </p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Type" width="110">
          <template #default="{ row }">
            <span class="pill" :class="typeClasses[row.type] ?? 'bg-gray-100 text-gray-600'">
              {{ row.type.replaceAll("_", " ") }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="Priority" width="120">
          <template #default="{ row }">
            <span class="pill" :class="priorityClasses[row.priority] ?? 'bg-gray-100 text-gray-600'">
              {{ row.priority }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="Estimate" width="110" align="center">
          <template #default="{ row }">{{ estimateLabel(row.estimate) }}</template>
        </el-table-column>
        <el-table-column label="Assignee" min-width="190">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <span v-if="row.assignee" class="avatar">{{ initials(row.assignee.name) }}</span>
              <el-select
                :model-value="row.assignee?.id ?? ''"
                class="ghost-select"
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
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Status" width="170">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 shrink-0 rounded-full" :class="statusDots[row.status]" />
              <el-select
                :model-value="row.status"
                class="ghost-select"
                size="small"
                :aria-label="`Change ${row.identifier} status`"
                @change="changeStatus(row as BacklogItem, $event as string)"
              >
                <el-option
                  v-for="status in statuses"
                  :key="status"
                  :label="statusLabel(status)"
                  :value="status"
                />
              </el-select>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Criteria" width="110">
          <template #default="{ row }">
            <span class="muted text-xs">{{ row.criteria.length }} criteria</span>
          </template>
        </el-table-column>
      </el-table>
      <button type="button" class="add-row" @click="openCreate">+ Add another backlog item</button>
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

<style scoped>
.pill {
  display: inline-block;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.3;
}
.avatar {
  display: inline-flex;
  height: 24px;
  width: 24px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: #e0e7ff;
  color: #3730a3;
  font-size: 10px;
  font-weight: 700;
}
.add-row {
  display: block;
  width: 100%;
  border: 0;
  border-top: 1px dashed var(--el-border-color);
  background: transparent;
  padding: 14px 24px;
  text-align: left;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}
.add-row:hover {
  color: var(--el-color-primary);
}
.backlog-table :deep(th.el-table__cell) {
  background: var(--el-fill-color-lighter);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ghost-select :deep(.el-select__wrapper) {
  box-shadow: none;
  background: transparent;
}
.ghost-select :deep(.el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--el-border-color) inset;
}
</style>

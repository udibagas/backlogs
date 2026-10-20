<script setup lang="ts">
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
interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string };
}
const route = useRoute();
const { request } = useApi();
const projectId = computed(() => String(route.params.projectId));
const items = ref<BacklogItem[]>([]);
const members = ref<ProjectMember[]>([]);
const search = ref("");
const errorMessage = ref("");
const loading = ref(true);
const comments = ref<Comment[]>([]);
const newComment = ref("");
const dependencyTarget = ref("");
const editorOpen = ref(false);
const editing = ref<BacklogItem | null>(null);

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
  editing.value = null;
  editorOpen.value = true;
}
async function openEdit(item: BacklogItem) {
  editing.value = item;
  dependencyTarget.value = "";
  newComment.value = "";
  try {
    comments.value = await request<Comment[]>(
      `/projects/${projectId.value}/items/${item.id}/comments`
    );
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
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
async function addDependency() {
  if (!editing.value || !dependencyTarget.value) return;
  try {
    await request(`/backlog-items/${editing.value.id}/dependencies`, {
      method: "POST",
      body: { dependsOnId: dependencyTarget.value }
    });
    await load();
    const refreshed = items.value.find((item) => item.id === editing.value?.id);
    if (refreshed) editing.value = refreshed;
    dependencyTarget.value = "";
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}
async function removeDependency(dependsOnId: string) {
  if (!editing.value) return;
  try {
    await request(`/backlog-items/${editing.value.id}/dependencies/${dependsOnId}`, {
      method: "DELETE"
    });
    await load();
    const refreshed = items.value.find((item) => item.id === editing.value?.id);
    if (refreshed) editing.value = refreshed;
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}
async function addComment() {
  if (!editing.value || !newComment.value.trim()) return;
  try {
    await request(`/projects/${projectId.value}/comments`, {
      method: "POST",
      body: { backlogItemId: editing.value.id, body: newComment.value.trim() }
    });
    comments.value = await request<Comment[]>(
      `/projects/${projectId.value}/items/${editing.value.id}/comments`
    );
    newComment.value = "";
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
      <el-button type="primary" @click="openCreate">+ New item</el-button>
    </header>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-5" />
    <el-card shadow="never">
      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            <el-button @click="load">Search</el-button>
          </template>
        </el-input>
      </div>
      <el-table v-loading="loading" :data="items">
        <template #empty>
          <el-empty description="Nothing in the backlog yet">
            <p class="muted mb-3 text-sm">Capture an Epic, User Story, Bug, Task, or Spike.</p>
            <el-button type="primary" @click="openCreate">Create the first item</el-button>
          </el-empty>
        </template>
        <el-table-column label="Item" min-width="280">
          <template #default="{ row }">
            <el-link type="primary" underline="never" @click="openEdit(row as BacklogItem)">
              {{ row.identifier }}
            </el-link>
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
      :item="editing"
      @saved="load"
      @error="errorMessage = $event"
    >
      <template #details>
        <div v-if="editing" class="mb-4">
          <h3 class="mb-2 text-sm font-semibold">Dependencies</h3>
          <ul v-if="editing.dependencies.length" class="m-0 mb-3 list-none space-y-2 p-0">
            <li
              v-for="dependency in editing.dependencies"
              :key="dependency.dependsOn.id"
              class="flex items-center gap-3 rounded-md px-3 py-2 text-sm"
              style="background: var(--el-fill-color-light)"
            >
              <span class="min-w-0 flex-1 truncate">{{ dependency.dependsOn.title }}</span>
              <el-tag size="small" type="info">{{
                dependency.dependsOn.status.replaceAll("_", " ").toLowerCase()
              }}</el-tag>
              <el-button
                link
                type="danger"
                size="small"
                @click="removeDependency(dependency.dependsOn.id)"
              >
                Remove
              </el-button>
            </li>
          </ul>
          <div class="flex flex-col gap-2 sm:flex-row">
            <el-select
              v-model="dependencyTarget"
              class="flex-1"
              placeholder="Select an item this work depends on"
              aria-label="Add dependency"
              filterable
            >
              <el-option
                v-for="item in items.filter(
                  (candidate) =>
                    candidate.id !== editing?.id &&
                    !editing?.dependencies.some(
                      (dependency) => dependency.dependsOn.id === candidate.id
                    )
                )"
                :key="item.id"
                :label="`${item.identifier} · ${item.title}`"
                :value="item.id"
              />
            </el-select>
            <el-button :disabled="!dependencyTarget" @click="addDependency">
              Add dependency
            </el-button>
          </div>
        </div>

        <div v-if="editing" class="mb-2">
          <h3 class="mb-2 text-sm font-semibold">Discussion</h3>
          <ul
            v-if="comments.length"
            class="m-0 mb-3 max-h-48 list-none space-y-3 overflow-y-auto rounded-lg p-3"
            style="background: var(--el-fill-color-light)"
          >
            <li v-for="comment in comments" :key="comment.id">
              <p class="whitespace-pre-wrap text-sm">{{ comment.body }}</p>
              <p class="muted mt-1 text-xs">
                {{ comment.author.name }} · {{ new Date(comment.createdAt).toLocaleString() }}
              </p>
            </li>
          </ul>
          <p v-else class="muted mb-3 text-sm">No comments yet.</p>
          <el-input
            v-model="newComment"
            type="textarea"
            :rows="2"
            maxlength="5000"
            aria-label="Add comment"
            placeholder="Share a clarification or update"
          />
          <el-button class="mt-2" :disabled="!newComment.trim()" @click="addComment">
            Add comment
          </el-button>
        </div>
      </template>
    </BacklogItemForm>
  </div>
</template>

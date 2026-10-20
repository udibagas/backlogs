<script setup lang="ts">
import { z } from "zod";
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
const saving = ref(false);
const comments = ref<Comment[]>([]);
const newComment = ref("");
const dependencyTarget = ref("");
const editorOpen = ref(false);
const editing = ref<BacklogItem | null>(null);
const form = reactive({
  title: "",
  description: "",
  type: "USER_STORY",
  priority: "MEDIUM",
  estimate: "",
  storyRole: "",
  storyCapability: "",
  storyBenefit: "",
  assigneeId: "",
  acceptanceCriteria: ""
});
const backlogSchema = z.object({
  title: z.string().trim().min(2).max(240),
  description: z.string().max(10000),
  estimate: z
    .string()
    .refine(
      (value) => !value || (Number(value) >= 0 && Number(value) <= 1000),
      "Estimate must be between 0 and 1000."
    )
});

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
  Object.assign(form, {
    title: "",
    description: "",
    type: "USER_STORY",
    priority: "MEDIUM",
    estimate: "",
    storyRole: "",
    storyCapability: "",
    storyBenefit: "",
    assigneeId: "",
    acceptanceCriteria: ""
  });
  editorOpen.value = true;
}
async function openEdit(item: BacklogItem) {
  editing.value = item;
  Object.assign(form, {
    title: item.title,
    description: item.description,
    type: item.type,
    priority: item.priority,
    estimate: item.estimate?.toString() ?? "",
    storyRole: item.storyRole ?? "",
    storyCapability: item.storyCapability ?? "",
    storyBenefit: item.storyBenefit ?? "",
    assigneeId: item.assignee?.id ?? "",
    acceptanceCriteria: item.criteria.map((criterion) => criterion.description).join("\n")
  });
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
async function saveItem() {
  errorMessage.value = "";
  const parsed = backlogSchema.safeParse(form);
  if (!parsed.success) {
    errorMessage.value = parsed.error.issues[0]?.message ?? "Check the backlog item.";
    return;
  }
  saving.value = true;
  try {
    const body = {
      title: form.title.trim(),
      description: form.description,
      type: form.type,
      priority: form.priority,
      estimate: form.estimate ? Number(form.estimate) : undefined,
      storyRole: form.storyRole || undefined,
      storyCapability: form.storyCapability || undefined,
      storyBenefit: form.storyBenefit || undefined,
      assigneeId: form.assigneeId || (editing.value ? null : undefined),
      acceptanceCriteria: form.acceptanceCriteria
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    };
    if (editing.value) {
      await request(`/backlog-items/${editing.value.id}`, { method: "PATCH", body });
    } else {
      await request(`/projects/${projectId.value}/backlog`, { method: "POST", body });
    }
    editorOpen.value = false;
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    saving.value = false;
  }
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
          class="sm:!w-72"
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

    <el-dialog
      v-model="editorOpen"
      :title="editing ? 'Refine backlog item' : 'Create backlog item'"
      width="680px"
      top="5vh"
      append-to-body
    >
      <p class="eyebrow">{{ editing?.identifier ?? "Product backlog" }}</p>
      <el-form class="form-stack" label-position="top" @submit.prevent="saveItem">
        <el-form-item label="Title">
          <el-input v-model="form.title" maxlength="240" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :sm="12" :xs="24">
            <el-form-item label="Type">
              <el-select v-model="form.type">
                <el-option
                  v-for="type in ['EPIC', 'USER_STORY', 'BUG', 'TECHNICAL_TASK', 'SPIKE']"
                  :key="type"
                  :label="type.replaceAll('_', ' ')"
                  :value="type"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :sm="12" :xs="24">
            <el-form-item label="Priority">
              <el-select v-model="form.priority">
                <el-option
                  v-for="priority in ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']"
                  :key="priority"
                  :label="priority"
                  :value="priority"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="Description">
          <el-input v-model="form.description" type="textarea" :rows="4" maxlength="10000" />
        </el-form-item>
        <template v-if="form.type === 'USER_STORY'">
          <el-row :gutter="16">
            <el-col :sm="12" :xs="24">
              <el-form-item label="As a…">
                <el-input v-model="form.storyRole" placeholder="team member" />
              </el-form-item>
            </el-col>
            <el-col :sm="12" :xs="24">
              <el-form-item label="I want…">
                <el-input v-model="form.storyCapability" placeholder="to organize my work" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="So that…">
            <el-input v-model="form.storyBenefit" placeholder="I can focus on the next step" />
          </el-form-item>
        </template>
        <el-form-item label="Estimate (points)">
          <el-input v-model="form.estimate" type="number" min="0" max="1000" step="0.5" />
        </el-form-item>
        <el-form-item label="Assignee">
          <el-select
            v-model="form.assigneeId"
            clearable
            filterable
            placeholder="Unassigned"
            aria-label="Backlog item assignee"
          >
            <el-option
              v-for="member in members"
              :key="member.userId"
              :label="member.user.name"
              :value="member.userId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Acceptance criteria (one criterion per line)">
          <el-input
            v-model="form.acceptanceCriteria"
            type="textarea"
            :rows="4"
            placeholder="Given… When… Then…"
          />
        </el-form-item>

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
      </el-form>
      <template #footer>
        <el-button @click="editorOpen = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="saveItem">
          {{ editing ? "Save changes" : "Add to backlog" }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

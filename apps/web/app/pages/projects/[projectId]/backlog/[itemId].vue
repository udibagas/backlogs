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
  dueDate: string | null;
  labels: string[];
  storyRole: string | null;
  storyCapability: string | null;
  storyBenefit: string | null;
  createdAt: string;
  updatedAt: string;
  criteria: { id: string; description: string; completed: boolean }[];
  dependencies: { dependsOn: { id: string; itemNumber: number; title: string; status: string } }[];
  dependedOnBy: { item: { id: string; itemNumber: number; title: string; status: string } }[];
  parent: { id: string; itemNumber: number; title: string; status: string } | null;
  children: { id: string; itemNumber: number; title: string; status: string; type: string }[];
  tasks: {
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    estimate: number | null;
    assignee: { id: string; name: string } | null;
  }[];
  assignee: { id: string; name: string } | null;
}
interface BacklogListItem {
  id: string;
  identifier: string;
  title: string;
}
interface BacklogResponse {
  data: BacklogListItem[];
}
interface ProjectMember {
  userId: string;
  user: { id: string; name: string; email: string };
}
interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string };
  attachments: CommentAttachment[];
}
interface CommentAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

const route = useRoute();
const { request } = useApi();
const projectId = computed(() => String(route.params.projectId));
const itemId = computed(() => String(route.params.itemId));
const item = ref<BacklogItem | null>(null);
const backlogItems = ref<BacklogListItem[]>([]);
const members = ref<ProjectMember[]>([]);
const comments = ref<Comment[]>([]);
const dependencyTarget = ref("");
const newComment = ref("");
const pendingFiles = ref<File[]>([]);
const taskForm = reactive({
  title: "",
  description: "",
  status: "TODO",
  priority: "MEDIUM",
  estimate: "",
  assigneeId: ""
});
const attachmentInput = ref<HTMLInputElement | null>(null);
const commentSaving = ref(false);
const taskSaving = ref(false);
const downloadingAttachmentId = ref("");
const errorMessage = ref("");
const loading = ref(true);
const editorOpen = ref(false);
const taskDialogOpen = ref(false);
const editingTaskId = ref<string | null>(null);

const statuses = ["BACKLOG", "READY", "IN_PROGRESS", "IN_REVIEW", "TESTING", "DONE"];
const availableDependencies = computed(() =>
  backlogItems.value.filter(
    (candidate) =>
      candidate.id !== item.value?.id &&
      !item.value?.dependencies.some((dependency) => dependency.dependsOn.id === candidate.id)
  )
);

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [detail, projectMembers, backlog, discussion] = await Promise.all([
      request<BacklogItem>(`/backlog-items/${itemId.value}`),
      request<ProjectMember[]>(`/projects/${projectId.value}/members`),
      request<BacklogResponse>(`/projects/${projectId.value}/backlog`, {
        query: { limit: 100 }
      }),
      request<Comment[]>(`/projects/${projectId.value}/items/${itemId.value}/comments`)
    ]);
    item.value = detail;
    members.value = projectMembers;
    backlogItems.value = backlog.data;
    comments.value = discussion;
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
    item.value = null;
  } finally {
    loading.value = false;
  }
}

async function changeStatus(status: string) {
  errorMessage.value = "";
  try {
    await request(`/backlog-items/${itemId.value}/status`, { method: "PATCH", body: { status } });
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}

async function changeAssignee(assigneeId: string | null) {
  errorMessage.value = "";
  try {
    await request(`/backlog-items/${itemId.value}`, {
      method: "PATCH",
      body: { assigneeId: assigneeId || null }
    });
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}

async function addDependency() {
  if (!dependencyTarget.value) return;
  errorMessage.value = "";
  try {
    await request(`/backlog-items/${itemId.value}/dependencies`, {
      method: "POST",
      body: { dependsOnId: dependencyTarget.value }
    });
    dependencyTarget.value = "";
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}

async function removeDependency(dependsOnId: string) {
  errorMessage.value = "";
  try {
    await request(`/backlog-items/${itemId.value}/dependencies/${dependsOnId}`, {
      method: "DELETE"
    });
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}

function openTaskDialog(task?: BacklogItem["tasks"][number]) {
  editingTaskId.value = task?.id ?? null;
  Object.assign(taskForm, {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "TODO",
    priority: task?.priority ?? "MEDIUM",
    estimate: task?.estimate == null ? "" : String(task.estimate),
    assigneeId: task?.assignee?.id ?? ""
  });
  errorMessage.value = "";
  taskDialogOpen.value = true;
}

async function saveTask() {
  errorMessage.value = "";
  const title = taskForm.title.trim();
  const estimate = taskForm.estimate ? Number(taskForm.estimate) : null;
  if (
    title.length < 2 ||
    (estimate !== null && (!Number.isFinite(estimate) || estimate < 0 || estimate > 1000))
  ) {
    errorMessage.value = "Enter a task title and a non-negative estimate up to 1000.";
    return;
  }
  taskSaving.value = true;
  try {
    const body = {
      title,
      description: taskForm.description,
      status: taskForm.status,
      priority: taskForm.priority,
      estimate,
      assigneeId: taskForm.assigneeId || null,
      ...(!editingTaskId.value && { backlogItemId: itemId.value })
    };
    if (editingTaskId.value) {
      await request(`/tasks/${editingTaskId.value}`, { method: "PATCH", body });
    } else {
      await request(`/projects/${projectId.value}/tasks`, { method: "POST", body });
    }
    taskDialogOpen.value = false;
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    taskSaving.value = false;
  }
}

async function addComment() {
  const body = newComment.value.trim();
  if (!body && pendingFiles.value.length === 0) return;
  errorMessage.value = "";
  commentSaving.value = true;
  try {
    const formData = new FormData();
    formData.append("backlogItemId", itemId.value);
    formData.append("body", body);
    for (const file of pendingFiles.value) formData.append("attachments", file);
    await request(`/projects/${projectId.value}/comments/with-attachments`, {
      method: "POST",
      body: formData
    });
    comments.value = await request<Comment[]>(
      `/projects/${projectId.value}/items/${itemId.value}/comments`
    );
    newComment.value = "";
    pendingFiles.value = [];
    if (attachmentInput.value) attachmentInput.value.value = "";
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    commentSaving.value = false;
  }
}

function selectFiles(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const selected = Array.from(input.files ?? []);
  const oversized = selected.find((file) => file.size > 10 * 1024 * 1024);
  if (oversized) {
    errorMessage.value = `${oversized.name} exceeds the 10 MB per-file limit.`;
    input.value = "";
    return;
  }
  if (pendingFiles.value.length + selected.length > 5) {
    errorMessage.value = "Attach up to 5 files per comment.";
    input.value = "";
    return;
  }
  errorMessage.value = "";
  pendingFiles.value.push(...selected);
  input.value = "";
}

function removePendingFile(index: number) {
  pendingFiles.value.splice(index, 1);
}

async function downloadAttachment(comment: Comment, attachment: CommentAttachment) {
  downloadingAttachmentId.value = attachment.id;
  errorMessage.value = "";
  try {
    const blob = await request<Blob>(
      `/projects/${projectId.value}/comments/${comment.id}/attachments/${attachment.id}`,
      { responseType: "blob" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.originalName;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    downloadingAttachmentId.value = "";
  }
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ").toLowerCase();
}

onMounted(load);
watch([projectId, itemId], load);
</script>

<template>
  <div class="page-shell">
    <el-skeleton v-if="loading" :rows="8" animated />
    <template v-else-if="item">
      <header class="page-header">
        <div class="min-w-0">
          <p class="eyebrow">
            <NuxtLink
              :to="`/projects/${projectId}/backlog`"
              class="text-(--el-color-primary) no-underline"
              >Product backlog</NuxtLink
            >
            · {{ item.identifier }}
          </p>
          <h1 class="page-title wrap-break-word">{{ item.title }}</h1>
          <p class="muted mt-2 text-sm">
            {{ item.type.replaceAll("_", " ").toLowerCase() }} ·
            {{ item.priority.toLowerCase() }} priority
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <el-button @click="navigateTo(`/projects/${projectId}/backlog`)"
            >Back to backlog</el-button
          >
          <el-button type="primary" @click="editorOpen = true">Edit item</el-button>
        </div>
      </header>
      <el-alert
        v-if="errorMessage && !taskDialogOpen"
        :title="errorMessage"
        type="error"
        show-icon
        class="mb-5"
      />

      <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div class="space-y-5">
          <el-card shadow="never">
            <h2 class="section-title">Description</h2>
            <p v-if="item.description" class="mt-3 whitespace-pre-wrap text-sm leading-6">
              {{ item.description }}
            </p>
            <p v-else class="muted mt-3 text-sm">No description has been added.</p>
            <div
              v-if="item.storyRole || item.storyCapability || item.storyBenefit"
              class="mt-5 rounded-lg p-4 text-sm leading-6"
              style="background: var(--el-fill-color-light)"
            >
              <span v-if="item.storyRole">As a {{ item.storyRole }}</span>
              <span v-if="item.storyCapability">
                <span v-if="item.storyRole">, </span>I want {{ item.storyCapability }}</span
              >
              <span v-if="item.storyBenefit">
                <span v-if="item.storyRole || item.storyCapability">, so that </span
                ><span v-else>So that </span>{{ item.storyBenefit }}</span
              >
            </div>
          </el-card>

          <el-card shadow="never">
            <div class="flex items-center justify-between gap-3">
              <h2 class="section-title">Acceptance criteria</h2>
              <el-tag size="small" type="info">{{ item.criteria.length }}</el-tag>
            </div>
            <ul v-if="item.criteria.length" class="m-0 mt-4 list-none space-y-3 p-0">
              <li
                v-for="criterion in item.criteria"
                :key="criterion.id"
                class="flex items-start gap-3 text-sm"
              >
                <el-icon
                  class="mt-0.5"
                  :class="criterion.completed ? 'text-(--el-color-success)' : 'muted'"
                >
                  <el-icon-circle-check v-if="criterion.completed" />
                  <el-icon-circle-close v-else />
                </el-icon>
                <span>{{ criterion.description }}</span>
              </li>
            </ul>
            <p v-else class="muted mt-3 text-sm">No acceptance criteria have been added.</p>
          </el-card>

          <el-card shadow="never">
            <div class="flex items-center justify-between gap-3">
              <h2 class="section-title">Tasks</h2>
              <el-button type="primary" @click="openTaskDialog()">Add task</el-button>
            </div>
            <ul v-if="item.tasks.length" class="m-0 mt-2 list-none divide-y p-0">
              <li
                v-for="task in item.tasks"
                :key="task.id"
                class="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div class="min-w-0">
                  <p class="text-sm font-medium">{{ task.title }}</p>
                  <p v-if="task.description" class="muted mt-1 text-xs">
                    {{ task.description }}
                  </p>
                  <div class="mt-2 flex flex-wrap items-center gap-2">
                    <el-tag size="small" type="info">{{ formatStatus(task.status) }}</el-tag>
                    <el-tag size="small">{{ task.priority.toLowerCase() }}</el-tag>
                    <span class="muted text-xs">{{ task.assignee?.name ?? "Unassigned" }}</span>
                    <span v-if="task.estimate !== null" class="muted text-xs">
                      {{ task.estimate }} points
                    </span>
                  </div>
                </div>
                <el-button size="small" @click="openTaskDialog(task)">Edit</el-button>
              </li>
            </ul>
            <p v-else class="muted mt-3 text-sm">No tasks are linked to this item yet.</p>
          </el-card>

          <el-card shadow="never">
            <h2 class="section-title">Discussion</h2>
            <ul
              v-if="comments.length"
              class="m-0 mt-4 list-none space-y-4 p-0"
              aria-label="Comments"
            >
              <li
                v-for="comment in comments"
                :key="comment.id"
                class="rounded-lg p-4"
                style="background: var(--el-fill-color-light)"
              >
                <p class="whitespace-pre-wrap text-sm">{{ comment.body }}</p>
                <ul
                  v-if="comment.attachments.length"
                  class="m-0 mt-3 list-none space-y-2 p-0"
                  aria-label="Comment attachments"
                >
                  <li
                    v-for="attachment in comment.attachments"
                    :key="attachment.id"
                    class="flex flex-wrap items-center gap-2"
                  >
                    <el-button
                      link
                      type="primary"
                      :loading="downloadingAttachmentId === attachment.id"
                      @click="downloadAttachment(comment, attachment)"
                    >
                      {{ attachment.originalName }}
                    </el-button>
                    <span class="muted text-xs">{{ formatFileSize(attachment.size) }}</span>
                  </li>
                </ul>
                <p class="muted mt-2 text-xs">
                  {{ comment.author.name }} · {{ new Date(comment.createdAt).toLocaleString() }}
                </p>
              </li>
            </ul>
            <p v-if="!comments.length" class="muted mt-3 text-sm">No comments yet.</p>
            <el-input
              v-model="newComment"
              class="mt-4"
              type="textarea"
              :rows="3"
              maxlength="5000"
              aria-label="Add comment"
              placeholder="Share a clarification or update"
            />
            <div v-if="pendingFiles.length" class="mt-3 flex flex-wrap gap-2">
              <el-tag
                v-for="(file, index) in pendingFiles"
                :key="`${file.name}-${file.lastModified}-${index}`"
                closable
                @close="removePendingFile(index)"
              >
                {{ file.name }} · {{ formatFileSize(file.size) }}
              </el-tag>
            </div>
            <input
              ref="attachmentInput"
              type="file"
              multiple
              class="hidden"
              aria-label="Choose discussion attachments"
              @change="selectFiles"
            />
            <div class="mt-3 flex flex-wrap gap-2">
              <el-button @click="attachmentInput?.click()">Attach files</el-button>
              <el-button
                type="primary"
                :loading="commentSaving"
                :disabled="!newComment.trim() && pendingFiles.length === 0"
                @click="addComment"
              >
                Add comment
              </el-button>
            </div>
            <p class="muted mt-2 text-xs">Up to 5 files, 10 MB each.</p>
          </el-card>
        </div>

        <aside class="space-y-5">
          <el-card shadow="never">
            <h2 class="section-title mb-4">Details</h2>
            <div class="space-y-4">
              <div>
                <p class="muted mb-1 text-xs">Status</p>
                <el-select
                  :model-value="item.status"
                  class="w-full"
                  aria-label="Backlog item status"
                  @change="changeStatus($event as string)"
                >
                  <el-option
                    v-for="status in statuses"
                    :key="status"
                    :label="formatStatus(status)"
                    :value="status"
                  />
                </el-select>
              </div>
              <div>
                <p class="muted mb-1 text-xs">Assignee</p>
                <el-select
                  :model-value="item.assignee?.id ?? ''"
                  class="w-full"
                  clearable
                  filterable
                  placeholder="Unassigned"
                  aria-label="Backlog item assignee"
                  @change="changeAssignee($event as string | null)"
                >
                  <el-option
                    v-for="member in members"
                    :key="member.userId"
                    :label="member.user.name"
                    :value="member.userId"
                  />
                </el-select>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="muted">Estimate</span>
                <span>{{ item.estimate ?? "—" }}{{ item.estimate === null ? "" : " points" }}</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="muted">Due date</span>
                <span>{{ item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—" }}</span>
              </div>
              <div v-if="item.labels.length">
                <p class="muted mb-2 text-xs">Labels</p>
                <div class="flex flex-wrap gap-2">
                  <el-tag v-for="label in item.labels" :key="label" size="small" type="info">
                    {{ label }}
                  </el-tag>
                </div>
              </div>
              <div class="muted border-t pt-3 text-xs">
                Updated {{ new Date(item.updatedAt).toLocaleDateString() }}
              </div>
            </div>
          </el-card>

          <el-card shadow="never">
            <h2 class="section-title">Dependencies</h2>
            <ul
              v-if="item.dependencies.length"
              class="m-0 mt-3 list-none space-y-2 p-0"
              aria-label="Dependencies"
            >
              <li
                v-for="dependency in item.dependencies"
                :key="dependency.dependsOn.id"
                class="flex items-center gap-2 text-sm"
              >
                <NuxtLink
                  :to="`/projects/${projectId}/backlog/${dependency.dependsOn.id}`"
                  class="min-w-0 flex-1 truncate text-(--el-color-primary) no-underline"
                >
                  {{ dependency.dependsOn.title }}
                </NuxtLink>
                <el-button
                  link
                  type="danger"
                  size="small"
                  :aria-label="`Remove dependency ${dependency.dependsOn.title}`"
                  @click="removeDependency(dependency.dependsOn.id)"
                  >Remove</el-button
                >
              </li>
            </ul>
            <p v-else class="muted mt-2 text-sm">No dependencies.</p>
            <div class="mt-4 flex gap-2">
              <el-select
                v-model="dependencyTarget"
                class="min-w-0 flex-1"
                placeholder="Add dependency"
                aria-label="Add dependency"
                filterable
              >
                <el-option
                  v-for="candidate in availableDependencies"
                  :key="candidate.id"
                  :label="`${candidate.identifier} · ${candidate.title}`"
                  :value="candidate.id"
                />
              </el-select>
              <el-button
                :disabled="!dependencyTarget"
                aria-label="Add selected dependency"
                @click="addDependency"
                >Add</el-button
              >
            </div>
            <div v-if="item.dependedOnBy.length" class="mt-5 border-t pt-4">
              <p class="muted mb-2 text-xs">Items blocked by this work</p>
              <ul class="m-0 list-none space-y-2 p-0">
                <li v-for="dependent in item.dependedOnBy" :key="dependent.item.id">
                  <NuxtLink
                    :to="`/projects/${projectId}/backlog/${dependent.item.id}`"
                    class="text-sm text-(--el-color-primary) no-underline"
                  >
                    {{ dependent.item.title }}
                  </NuxtLink>
                </li>
              </ul>
            </div>
          </el-card>

          <el-card v-if="item.parent || item.children.length" shadow="never">
            <h2 class="section-title">Hierarchy</h2>
            <p v-if="item.parent" class="muted mb-2 mt-3 text-xs">Parent item</p>
            <NuxtLink
              v-if="item.parent"
              :to="`/projects/${projectId}/backlog/${item.parent.id}`"
              class="text-sm text-(--el-color-primary) no-underline"
            >
              {{ item.parent.title }}
            </NuxtLink>
            <template v-if="item.children.length">
              <p class="muted mb-2 mt-4 text-xs">Child items</p>
              <ul class="m-0 list-none space-y-2 p-0">
                <li v-for="child in item.children" :key="child.id">
                  <NuxtLink
                    :to="`/projects/${projectId}/backlog/${child.id}`"
                    class="text-sm text-(--el-color-primary) no-underline"
                  >
                    {{ child.title }}
                  </NuxtLink>
                </li>
              </ul>
            </template>
          </el-card>
        </aside>
      </div>
    </template>

    <el-empty v-else-if="errorMessage" description="Unable to load backlog item">
      <el-button type="primary" @click="load">Try again</el-button>
      <el-button @click="navigateTo(`/projects/${projectId}/backlog`)">Back to backlog</el-button>
    </el-empty>
    <el-empty v-else description="Backlog item not found">
      <el-button type="primary" @click="navigateTo(`/projects/${projectId}/backlog`)">
        Back to backlog
      </el-button>
    </el-empty>

    <BacklogItemForm
      v-if="item"
      v-model="editorOpen"
      :project-id="projectId"
      :members="members"
      :item="item"
      @saved="load"
      @error="errorMessage = $event"
    />
    <el-dialog
      v-model="taskDialogOpen"
      :title="editingTaskId ? 'Edit task' : 'Add task'"
      width="600px"
      append-to-body
    >
      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-4" />
      <el-form
        id="backlog-item-task-form"
        class="form-stack"
        label-position="top"
        @submit.prevent="saveTask"
      >
        <el-form-item label="Task title">
          <el-input v-model="taskForm.title" maxlength="240" placeholder="Add automated tests" />
        </el-form-item>
        <el-form-item label="Description">
          <el-input v-model="taskForm.description" type="textarea" :rows="3" maxlength="10000" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :sm="12" :xs="24">
            <el-form-item label="Status">
              <el-select v-model="taskForm.status" class="w-full">
                <el-option
                  v-for="status in [
                    'TODO',
                    'IN_PROGRESS',
                    'IN_REVIEW',
                    'TESTING',
                    'BLOCKED',
                    'DONE'
                  ]"
                  :key="status"
                  :label="formatStatus(status)"
                  :value="status"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :sm="12" :xs="24">
            <el-form-item label="Priority">
              <el-select v-model="taskForm.priority" class="w-full">
                <el-option
                  v-for="priority in ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']"
                  :key="priority"
                  :label="priority"
                  :value="priority"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :sm="12" :xs="24">
            <el-form-item label="Estimate">
              <el-input v-model="taskForm.estimate" type="number" min="0" max="1000" step="0.5" />
            </el-form-item>
          </el-col>
          <el-col :sm="12" :xs="24">
            <el-form-item label="Assignee">
              <el-select v-model="taskForm.assigneeId" class="w-full" clearable filterable>
                <el-option
                  v-for="member in members"
                  :key="member.userId"
                  :label="member.user.name"
                  :value="member.userId"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="taskDialogOpen = false">Cancel</el-button>
        <el-button
          type="primary"
          native-type="submit"
          form="backlog-item-task-form"
          :loading="taskSaving"
        >
          {{ editingTaskId ? "Save task" : "Add task" }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

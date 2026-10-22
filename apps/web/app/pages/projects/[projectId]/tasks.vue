<script setup lang="ts">
import { Check, Close, Delete, Edit, Grid, List, Plus, View } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  estimate: number | null;
  actualEffort: number | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: { id: string; name: string } | null;
  backlogItem: { title: string; itemNumber: number } | null;
}
interface ProjectMember {
  userId: string;
  user: { name: string };
}
const route = useRoute();
const { request } = useApi();
const projectId = computed(() => String(route.params.projectId));
const tasks = ref<Task[]>([]);
const members = ref<ProjectMember[]>([]);
const displayMode = ref<"list" | "board">("list");
const form = reactive({
  title: "",
  description: "",
  priority: "MEDIUM",
  estimate: "",
  assigneeId: ""
});
const taskDialogOpen = ref(false);
const taskDetailsDialogOpen = ref(false);
const selectedTask = ref<Task | null>(null);
const editingTaskId = ref<string | null>(null);
const errorMessage = ref("");
const loading = ref(true);
const saving = ref(false);
const deletingTaskId = ref<string | null>(null);
const taskStatuses = ["TODO", "IN_PROGRESS", "IN_REVIEW", "TESTING", "BLOCKED", "DONE"];
const taskStatusColors: Record<string, string> = {
  TODO: "#909399",
  IN_PROGRESS: "#e6a23c",
  IN_REVIEW: "#9254de",
  TESTING: "#13c2c2",
  BLOCKED: "#f56c6c",
  DONE: "#67c23a"
};
const estimateOptions = [
  { size: "XS", points: 1 },
  { size: "S", points: 2 },
  { size: "M", points: 4 },
  { size: "L", points: 8 },
  { size: "XL", points: 16 },
  { size: "XXL", points: 32 },
  { size: "XXXL", points: 64 }
];
const taskColumns = computed(() =>
  taskStatuses.map((status) => ({
    status,
    tasks: tasks.value.filter((task) => task.status === status)
  }))
);

function taskColumnStyle(status: string) {
  const accent = taskStatusColors[status];
  return {
    background: `color-mix(in srgb, ${accent} 8%, var(--el-bg-color))`,
    border: `1px solid color-mix(in srgb, ${accent} 35%, var(--el-border-color-lighter))`
  };
}

function priorityTagType(priority: string) {
  switch (priority) {
    case "CRITICAL":
      return "danger";
    case "HIGH":
      return "warning";
    case "MEDIUM":
      return "primary";
    default:
      return "info";
  }
}

function openTaskDetails(task: Task) {
  selectedTask.value = task;
  taskDetailsDialogOpen.value = true;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function openCreateTask() {
  errorMessage.value = "";
  editingTaskId.value = null;
  Object.assign(form, {
    title: "",
    description: "",
    priority: "MEDIUM",
    estimate: "",
    assigneeId: ""
  });
  taskDialogOpen.value = true;
}

function openEditTask(task: Task) {
  errorMessage.value = "";
  editingTaskId.value = task.id;
  Object.assign(form, {
    title: task.title,
    description: task.description,
    priority: task.priority,
    estimate: task.estimate == null ? "" : String(task.estimate),
    assigneeId: task.assignee?.id ?? ""
  });
  taskDialogOpen.value = true;
}

async function load() {
  loading.value = true;
  try {
    const [projectTasks, projectMembers] = await Promise.all([
      request<Task[]>(`/projects/${projectId.value}/tasks`),
      request<ProjectMember[]>(`/projects/${projectId.value}/members`)
    ]);
    tasks.value = projectTasks;
    members.value = projectMembers;
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    loading.value = false;
  }
}
async function saveTask() {
  errorMessage.value = "";
  const estimate = form.estimate ? Number(form.estimate) : null;
  if (
    form.title.trim().length < 2 ||
    (estimate !== null && (!Number.isFinite(estimate) || estimate < 0 || estimate > 1000))
  ) {
    errorMessage.value = "Enter a task title and a non-negative estimate up to 1000.";
    return;
  }
  saving.value = true;
  try {
    await request(
      editingTaskId.value ? `/tasks/${editingTaskId.value}` : `/projects/${projectId.value}/tasks`,
      {
        method: editingTaskId.value ? "PATCH" : "POST",
        body: {
          title: form.title.trim(),
          description: form.description,
          priority: form.priority,
          estimate: estimate ?? (editingTaskId.value ? null : undefined),
          assigneeId: form.assigneeId || null
        }
      }
    );
    if (!editingTaskId.value) {
      Object.assign(form, {
        title: "",
        description: "",
        priority: "MEDIUM",
        estimate: "",
        assigneeId: ""
      });
    }
    editingTaskId.value = null;
    taskDialogOpen.value = false;
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    saving.value = false;
  }
}
async function updateStatus(task: Task, status: string) {
  errorMessage.value = "";
  try {
    await request(`/tasks/${task.id}`, { method: "PATCH", body: { status } });
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}
async function deleteTask(task: Task) {
  errorMessage.value = "";
  try {
    await ElMessageBox.confirm(
      `"${task.title}" and its comments and dependencies will be permanently deleted.`,
      "Delete task",
      { type: "warning", confirmButtonText: "Delete", cancelButtonText: "Cancel" }
    );
  } catch {
    return;
  }
  deletingTaskId.value = task.id;
  try {
    await request(`/tasks/${task.id}`, { method: "DELETE" });
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    deletingTaskId.value = null;
  }
}
function dragStart(event: DragEvent, taskId: string) {
  event.dataTransfer?.setData("text/plain", taskId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}
function dropTask(event: DragEvent, status: string) {
  event.preventDefault();
  const taskId = event.dataTransfer?.getData("text/plain");
  const task = tasks.value.find((candidate) => candidate.id === taskId);
  if (task && task.status !== status) void updateStatus(task, status);
}
onMounted(load);
watch(projectId, load);
</script>

<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Project workspace</p>
        <h1 class="page-title">Tasks</h1>
        <p class="muted mt-2 text-sm">
          Implementation work connected to the product outcomes it supports.
        </p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreateTask">New task</el-button>
    </header>
    <el-alert
      v-if="errorMessage && !taskDialogOpen"
      :title="errorMessage"
      type="error"
      show-icon
      class="mb-5!"
    />
    <el-dialog
      v-model="taskDetailsDialogOpen"
      :title="selectedTask?.title ?? 'Task details'"
      width="600px"
      append-to-body
    >
      <template v-if="selectedTask">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="Status">
            <el-tag :color="taskStatusColors[selectedTask.status]" effect="dark" class="border-0!">
              {{ selectedTask.status.replaceAll("_", " ").toLowerCase() }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Priority">
            <el-tag size="small" :type="priorityTagType(selectedTask.priority)">
              {{ selectedTask.priority.toLowerCase() }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Estimate">
            {{ selectedTask.estimate == null ? "—" : `${selectedTask.estimate} points` }}
          </el-descriptions-item>
          <el-descriptions-item label="Actual effort">
            {{ selectedTask.actualEffort == null ? "—" : `${selectedTask.actualEffort} points` }}
          </el-descriptions-item>
          <el-descriptions-item label="Assignee">
            {{ selectedTask.assignee?.name ?? "Unassigned" }}
          </el-descriptions-item>
          <el-descriptions-item label="Parent item">
            {{ selectedTask.backlogItem?.title ?? "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="Due date">
            {{ formatDate(selectedTask.dueDate) }}
          </el-descriptions-item>
          <el-descriptions-item label="Created">
            {{ formatDate(selectedTask.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="Last updated" :span="2">
            {{ formatDate(selectedTask.updatedAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="Description" :span="2">
            <p class="whitespace-pre-wrap">{{ selectedTask.description || "No description" }}</p>
          </el-descriptions-item>
        </el-descriptions>
      </template>
      <template #footer>
        <el-button :icon="Close" @click="taskDetailsDialogOpen = false">Close</el-button>
      </template>
    </el-dialog>
    <el-dialog
      v-model="taskDialogOpen"
      :title="editingTaskId ? 'Edit task' : 'Create a task'"
      width="600px"
      append-to-body
    >
      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-4!" />
      <el-form id="task-form" class="form-stack" label-position="top" @submit.prevent="saveTask">
        <el-row :gutter="12">
          <el-col :md="12" :xs="24">
            <el-form-item label="Task title">
              <el-input v-model="form.title" maxlength="240" placeholder="Add automated tests" />
            </el-form-item>
          </el-col>
          <el-col :md="12" :xs="12">
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
          <el-col :md="12" :xs="12">
            <el-form-item label="Estimate (T-shirt size)">
              <el-select v-model="form.estimate" placeholder="Select an estimate" clearable>
                <el-option
                  v-for="estimate in estimateOptions"
                  :key="estimate.size"
                  :label="`${estimate.size} (${estimate.points} ${estimate.points === 1 ? 'point' : 'points'})`"
                  :value="String(estimate.points)"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :md="12" :xs="24">
            <el-form-item label="Assignee">
              <el-select
                v-model="form.assigneeId"
                class="w-full"
                placeholder="Unassigned"
                clearable
                filterable
              >
                <el-option
                  v-for="member in members"
                  :key="member.userId"
                  :label="member.user.name"
                  :value="member.userId"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="Description">
              <el-input v-model="form.description" type="textarea" :rows="2" maxlength="10000" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button :icon="Close" @click="taskDialogOpen = false">Cancel</el-button>
        <el-button
          type="primary"
          :icon="Check"
          native-type="submit"
          form="task-form"
          :loading="saving"
        >
          {{ editingTaskId ? "Save changes" : "Add task" }}
        </el-button>
      </template>
    </el-dialog>
    <el-card shadow="never" body-class="p-0!">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="section-title">
              Project tasks
              <el-badge :value="tasks.length" type="info" :show-zero="true" class="ml-2" />
            </h2>
            <p class="muted mt-1 text-sm">
              Task completion does not automatically complete a User Story.
            </p>
          </div>
          <el-button-group aria-label="Task display mode">
            <el-button
              :type="displayMode === 'list' ? 'primary' : 'default'"
              :icon="List"
              :aria-pressed="displayMode === 'list'"
              @click="displayMode = 'list'"
            >
              List
            </el-button>
            <el-button
              :type="displayMode === 'board' ? 'primary' : 'default'"
              :icon="Grid"
              :aria-pressed="displayMode === 'board'"
              @click="displayMode = 'board'"
            >
              Board
            </el-button>
          </el-button-group>
        </div>
      </template>
      <el-table
        v-if="displayMode === 'list'"
        v-loading="loading"
        :data="tasks"
        empty-text="No tasks yet. Create the first implementation task."
        height="calc(100vh - 300px)"
      >
        <el-table-column label="Task" min-width="240">
          <template #default="{ row }">
            <p class="font-medium">{{ row.title }}</p>
            <p v-if="row.description" class="muted mt-1 max-w-md truncate text-xs">
              {{ row.description }}
            </p>
          </template>
        </el-table-column>
        <el-table-column label="Parent item" min-width="160">
          <template #default="{ row }">{{ row.backlogItem?.title ?? "—" }}</template>
        </el-table-column>
        <el-table-column label="Assignee" min-width="140">
          <template #default="{ row }">{{ row.assignee?.name ?? "Unassigned" }}</template>
        </el-table-column>
        <el-table-column label="Priority" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="priorityTagType(row.priority)">
              {{ row.priority.toLowerCase() }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Estimate" width="100">
          <template #default="{ row }">{{ row.estimate ?? "—" }}</template>
        </el-table-column>
        <el-table-column label="Status" width="170">
          <template #default="{ row }">
            <el-select
              :model-value="row.status"
              size="small"
              aria-label="Task status"
              @change="updateStatus(row as Task, $event as string)"
            >
              <el-option
                v-for="status in ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'TESTING', 'BLOCKED', 'DONE']"
                :key="status"
                :label="status.replaceAll('_', ' ').toLowerCase()"
                :value="status"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="" width="120" fixed="right" align="right">
          <template #default="{ row }">
            <el-dropdown trigger="click">
              <el-button
                :icon="ElIconMore"
                size="small"
                :loading="deletingTaskId === row.id"
                :aria-label="`Actions for ${row.title}`"
              >
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :icon="View" @click="openTaskDetails(row as Task)">
                    View details
                  </el-dropdown-item>
                  <el-dropdown-item :icon="Edit" @click="openEditTask(row as Task)">
                    Edit
                  </el-dropdown-item>
                  <el-dropdown-item :icon="Delete" divided @click="deleteTask(row as Task)">
                    Delete
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
      <div v-else v-loading="loading" class="flex gap-4 overflow-x-auto p-4">
        <section
          v-for="column in taskColumns"
          :key="column.status"
          class="min-w-64 rounded-lg border p-3"
          :style="taskColumnStyle(column.status)"
          @dragover.prevent
          @drop="dropTask($event, column.status)"
        >
          <header class="mb-3 flex items-center justify-between gap-2 px-1">
            <h3 class="text-sm font-semibold">{{ column.status.replaceAll("_", " ") }}</h3>
            <el-badge :value="column.tasks.length" type="info" :show-zero="true" class="mr-2" />
          </header>
          <div class="space-y-2">
            <el-card
              v-for="task in column.tasks"
              :key="task.id"
              shadow="hover"
              :body-style="{ padding: '12px' }"
              draggable="true"
              @dragstart="dragStart($event, task.id)"
            >
              <template #header>
                <p class="text-sm font-medium">{{ task.title }}</p>
              </template>
              <p v-if="task.description" class="muted mt-1 line-clamp-2 text-xs">
                {{ task.description }}
              </p>
              <p class="muted mt-2 truncate text-xs">
                Parent: {{ task.backlogItem?.title ?? "—" }}
              </p>
              <p class="muted mt-1 truncate text-xs">
                Assignee: {{ task.assignee?.name ?? "Unassigned" }}
              </p>
              <div class="muted mt-2 flex items-center justify-between text-xs">
                <span>{{ task.priority.toLowerCase() }}</span>
                <span>{{ task.estimate ?? "—" }} pts</span>
              </div>
              <div class="mt-3 flex items-center justify-between gap-2">
                <el-button
                  link
                  type="primary"
                  :icon="View"
                  :aria-label="`View details for ${task.title}`"
                  title="View details"
                  @click="openTaskDetails(task)"
                >
                </el-button>
                <el-select
                  :model-value="task.status"
                  size="small"
                  :aria-label="`Move ${task.title} to another status`"
                  @change="updateStatus(task, $event as string)"
                >
                  <el-option
                    v-for="status in taskStatuses"
                    :key="status"
                    :label="status.replaceAll('_', ' ').toLowerCase()"
                    :value="status"
                  />
                </el-select>
                <el-button link type="primary" :icon="Edit" @click="openEditTask(task)">
                  Edit
                </el-button>
              </div>
            </el-card>
            <p v-if="!column.tasks.length" class="muted py-8 text-center text-xs">
              Drop tasks here
            </p>
          </div>
        </section>
        <p v-if="!loading && !tasks.length" class="muted col-span-full py-8 text-center text-sm">
          No tasks yet. Create the first implementation task.
        </p>
      </div>
    </el-card>
  </div>
</template>

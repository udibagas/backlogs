<script setup lang="ts">
interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  estimate: number | null;
  dueDate: string | null;
  assignee: { name: string } | null;
  backlogItem: { title: string; itemNumber: number } | null;
}
const route = useRoute();
const { request } = useApi();
const projectId = computed(() => String(route.params.projectId));
const tasks = ref<Task[]>([]);
const form = reactive({ title: "", description: "", priority: "MEDIUM", estimate: "" });
const taskDialogOpen = ref(false);
const editingTaskId = ref<string | null>(null);
const errorMessage = ref("");
const loading = ref(true);
const saving = ref(false);

function openCreateTask() {
  errorMessage.value = "";
  editingTaskId.value = null;
  Object.assign(form, { title: "", description: "", priority: "MEDIUM", estimate: "" });
  taskDialogOpen.value = true;
}

function openEditTask(task: Task) {
  errorMessage.value = "";
  editingTaskId.value = task.id;
  Object.assign(form, {
    title: task.title,
    description: task.description,
    priority: task.priority,
    estimate: task.estimate == null ? "" : String(task.estimate)
  });
  taskDialogOpen.value = true;
}

async function load() {
  loading.value = true;
  try {
    tasks.value = await request<Task[]>(`/projects/${projectId.value}/tasks`);
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
      editingTaskId.value
        ? `/tasks/${editingTaskId.value}`
        : `/projects/${projectId.value}/tasks`,
      {
        method: editingTaskId.value ? "PATCH" : "POST",
        body: {
          title: form.title.trim(),
          description: form.description,
          priority: form.priority,
          estimate: estimate ?? (editingTaskId.value ? null : undefined)
        }
      }
    );
    if (!editingTaskId.value) {
      Object.assign(form, { title: "", description: "", priority: "MEDIUM", estimate: "" });
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
  try {
    await request(`/tasks/${task.id}`, { method: "PATCH", body: { status } });
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
        <h1 class="page-title">Tasks</h1>
        <p class="muted mt-2 text-sm">
          Implementation work connected to the product outcomes it supports.
        </p>
      </div>
      <el-button type="primary" @click="openCreateTask">+ New task</el-button>
    </header>
    <el-alert
      v-if="errorMessage && !taskDialogOpen"
      :title="errorMessage"
      type="error"
      show-icon
      class="mb-5"
    />
    <el-dialog
      v-model="taskDialogOpen"
      :title="editingTaskId ? 'Edit task' : 'Create a task'"
      width="600px"
      append-to-body
    >
      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-4" />
      <el-form
        id="task-form"
        class="form-stack"
        label-position="top"
        @submit.prevent="saveTask"
      >
        <el-row :gutter="12">
          <el-col :md="12" :xs="24">
            <el-form-item label="Task title">
              <el-input v-model="form.title" maxlength="240" placeholder="Add automated tests" />
            </el-form-item>
          </el-col>
          <el-col :md="6" :xs="12">
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
          <el-col :md="6" :xs="12">
            <el-form-item label="Estimate">
              <el-input v-model="form.estimate" type="number" min="0" max="1000" step="0.5" />
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
        <el-button @click="taskDialogOpen = false">Cancel</el-button>
        <el-button type="primary" native-type="submit" form="task-form" :loading="saving">
          {{ editingTaskId ? "Save changes" : "Add task" }}
        </el-button>
      </template>
    </el-dialog>
    <el-card shadow="never">
      <div class="mb-4">
        <h2 class="section-title">
          Project tasks
          <el-badge :value="tasks.length" type="info" :show-zero="true" class="ml-2" />
        </h2>
        <p class="muted mt-1 text-sm">
          Task completion does not automatically complete a User Story.
        </p>
      </div>
      <el-table
        v-loading="loading"
        :data="tasks"
        empty-text="No tasks yet. Create the first implementation task."
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
        <el-table-column label="Priority" width="110">
          <template #default="{ row }">{{ row.priority.toLowerCase() }}</template>
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
        <el-table-column label="Actions" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEditTask(row as Task)">Edit</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

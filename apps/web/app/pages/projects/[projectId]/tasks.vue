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
const errorMessage = ref("");
const loading = ref(true);
const saving = ref(false);

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
async function createTask() {
  errorMessage.value = "";
  if (form.title.trim().length < 2 || (form.estimate && Number(form.estimate) < 0)) {
    errorMessage.value = "Enter a task title and a non-negative estimate.";
    return;
  }
  saving.value = true;
  try {
    await request(`/projects/${projectId.value}/tasks`, {
      method: "POST",
      body: {
        title: form.title.trim(),
        description: form.description,
        priority: form.priority,
        estimate: form.estimate ? Number(form.estimate) : undefined
      }
    });
    Object.assign(form, { title: "", description: "", priority: "MEDIUM", estimate: "" });
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
    </header>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-5" />
    <el-card shadow="never" class="mb-6">
      <h2 class="section-title">Create a task</h2>
      <el-form class="form-stack mt-4" label-position="top" @submit.prevent="createTask">
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
        <el-button type="primary" native-type="submit" :loading="saving">Add task</el-button>
      </el-form>
    </el-card>
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
        empty-text="No tasks yet. Create the first implementation task above."
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
      </el-table>
    </el-card>
  </div>
</template>

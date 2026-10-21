<script setup lang="ts">
import {
  Check,
  CircleCheck,
  Close,
  Delete,
  Edit,
  Plus,
  Right,
  VideoPlay
} from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";

interface Sprint {
  id: string;
  name: string;
  goal: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  items: { backlogItem: { estimate: number | null } }[];
}
const route = useRoute();
const { request } = useApi();
const projectId = computed(() => String(route.params.projectId));
const sprints = ref<Sprint[]>([]);
const form = reactive({ name: "", goal: "", startsAt: "", endsAt: "" });
const sprintDialogOpen = ref(false);
const editingSprintId = ref<string | null>(null);
const errorMessage = ref("");
const loading = ref(true);
const saving = ref(false);
const processingSprintId = ref<string | null>(null);

function openCreateSprint() {
  errorMessage.value = "";
  editingSprintId.value = null;
  Object.assign(form, { name: "", goal: "", startsAt: "", endsAt: "" });
  sprintDialogOpen.value = true;
}

function toDateInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function openEditSprint(sprint: Sprint) {
  errorMessage.value = "";
  editingSprintId.value = sprint.id;
  Object.assign(form, {
    name: sprint.name,
    goal: sprint.goal,
    startsAt: toDateInputValue(sprint.startsAt),
    endsAt: toDateInputValue(sprint.endsAt)
  });
  sprintDialogOpen.value = true;
}

async function load() {
  loading.value = true;
  try {
    sprints.value = await request<Sprint[]>(`/projects/${projectId.value}/sprints`);
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    loading.value = false;
  }
}
async function saveSprint() {
  errorMessage.value = "";
  if (
    !form.name.trim() ||
    !form.goal.trim() ||
    !form.startsAt ||
    !form.endsAt ||
    form.endsAt <= form.startsAt
  ) {
    errorMessage.value = "Add a name, Sprint Goal, and valid start/end dates.";
    return;
  }
  saving.value = true;
  try {
    await request(
      editingSprintId.value
        ? `/sprints/${editingSprintId.value}`
        : `/projects/${projectId.value}/sprints`,
      {
        method: editingSprintId.value ? "PATCH" : "POST",
        body: {
          ...form,
          startsAt: new Date(`${form.startsAt}T00:00:00`).toISOString(),
          endsAt: new Date(`${form.endsAt}T00:00:00`).toISOString()
        }
      }
    );
    Object.assign(form, { name: "", goal: "", startsAt: "", endsAt: "" });
    editingSprintId.value = null;
    sprintDialogOpen.value = false;
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    saving.value = false;
  }
}
async function deleteSprint(sprint: Sprint) {
  errorMessage.value = "";
  try {
    await ElMessageBox.confirm(
      `"${sprint.name}" will be permanently deleted. Its backlog items return to the backlog.`,
      "Delete Sprint",
      { type: "warning", confirmButtonText: "Delete", cancelButtonText: "Cancel" }
    );
  } catch {
    return;
  }
  try {
    await request(`/sprints/${sprint.id}`, { method: "DELETE" });
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}
async function transition(sprint: Sprint, action: "start" | "complete") {
  errorMessage.value = "";
  let outcome = "";
  if (action === "start") {
    try {
      await ElMessageBox.confirm(
        `Start "${sprint.name}" now? The team will begin working toward its Sprint Goal.`,
        "Start Sprint",
        { type: "info", confirmButtonText: "Start Sprint", cancelButtonText: "Cancel" }
      );
    } catch {
      return;
    }
  } else {
    try {
      const result = await ElMessageBox.prompt(
        "Add an optional summary of the Sprint outcome.",
        "Complete Sprint",
        {
          confirmButtonText: "Complete Sprint",
          cancelButtonText: "Cancel",
          inputPlaceholder: "Outcome summary",
          inputType: "textarea",
          inputValidator: (value) =>
            value.length <= 5000 || "Outcome must be 5000 characters or less."
        }
      );
      outcome = result.value;
    } catch {
      return;
    }
  }
  processingSprintId.value = sprint.id;
  try {
    await request(`/sprints/${sprint.id}/${action}`, {
      method: "POST",
      body: action === "complete" ? { outcome } : {}
    });
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    processingSprintId.value = null;
  }
}
function handleSprintAction(sprint: Sprint, action: string) {
  if (action === "view") return navigateTo(`/projects/${projectId.value}/sprints/${sprint.id}`);
  if (action === "edit") return openEditSprint(sprint);
  if (action === "delete") return deleteSprint(sprint);
  if (action === "start") return transition(sprint, "start");
  if (action === "complete") return transition(sprint, "complete");
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function plannedPoints(sprint: Sprint) {
  return sprint.items.reduce((sum, item) => sum + (item.backlogItem.estimate ?? 0), 0);
}

onMounted(load);
watch(projectId, load);
</script>

<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Project workspace</p>
        <h1 class="page-title">Sprints</h1>
        <p class="muted mt-2 text-sm">
          Plan a goal together, then select a realistic amount of work.
        </p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreateSprint">Plan a Sprint</el-button>
    </header>
    <el-alert
      v-if="errorMessage && !sprintDialogOpen"
      :title="errorMessage"
      type="error"
      show-icon
      class="mb-5"
    />
    <el-dialog
      v-model="sprintDialogOpen"
      :title="editingSprintId ? 'Edit Sprint' : 'Plan a Sprint'"
      width="600px"
      append-to-body
    >
      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-4" />
      <el-form
        id="sprint-form"
        class="form-stack"
        label-position="top"
        @submit.prevent="saveSprint"
      >
        <el-row :gutter="16">
          <el-col :span="24">
            <el-form-item label="Sprint name">
              <el-input v-model="form.name" maxlength="120" placeholder="Sprint 1" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="Sprint Goal">
              <el-input
                v-model="form.goal"
                maxlength="2000"
                placeholder="What outcome should this Sprint achieve?"
              />
            </el-form-item>
          </el-col>
          <el-col :sm="12" :xs="24">
            <el-form-item label="Start date">
              <el-date-picker
                v-model="form.startsAt"
                type="date"
                value-format="YYYY-MM-DD"
                class="w-full!"
              />
            </el-form-item>
          </el-col>
          <el-col :sm="12" :xs="24">
            <el-form-item label="End date">
              <el-date-picker
                v-model="form.endsAt"
                type="date"
                value-format="YYYY-MM-DD"
                class="w-full!"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button :icon="Close" @click="sprintDialogOpen = false">Cancel</el-button>
        <el-button
          type="primary"
          :icon="Check"
          native-type="submit"
          form="sprint-form"
          :loading="saving"
        >
          {{ editingSprintId ? "Save changes" : "Create planned Sprint" }}
        </el-button>
      </template>
    </el-dialog>
    <el-card shadow="never" body-style="padding: 0">
      <el-table
        v-loading="loading"
        :data="sprints"
        row-key="id"
        empty-text="No Sprints yet. Plan one with a clear goal and short planning horizon."
      >
        <el-table-column label="Sprint" min-width="240">
          <template #default="{ row }">
            <NuxtLink
              :to="`/projects/${projectId}/sprints/${row.id}`"
              class="font-semibold text-(--el-color-primary) no-underline hover:underline"
            >
              {{ row.name }}
            </NuxtLink>
            <p class="muted mt-1 line-clamp-2 text-xs">{{ row.goal || "Sprint Goal not set" }}</p>
          </template>
        </el-table-column>
        <el-table-column label="Status" width="130">
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="
                row.status === 'ACTIVE'
                  ? 'success'
                  : row.status === 'COMPLETED'
                    ? 'info'
                    : 'primary'
              "
            >
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Dates" min-width="190">
          <template #default="{ row }">
            {{ formatDate(row.startsAt) }} – {{ formatDate(row.endsAt) }}
          </template>
        </el-table-column>
        <el-table-column label="Backlog" width="100" align="right">
          <template #default="{ row }">{{ row.items.length }} items</template>
        </el-table-column>
        <el-table-column label="Points" width="100" align="right">
          <template #default="{ row }">
            {{ plannedPoints(row as Sprint) }}
          </template>
        </el-table-column>
        <el-table-column label="" width="110" fixed="right" align="right">
          <template #default="{ row }">
            <el-dropdown trigger="click" @command="handleSprintAction(row as Sprint, $event)">
              <el-button
                :icon="ElIconMore"
                size="small"
                :loading="processingSprintId === row.id"
                :aria-label="`Actions for ${row.name}`"
              >
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :icon="Right" command="view">View details</el-dropdown-item>
                  <template v-if="row.status === 'PLANNING'">
                    <el-dropdown-item :icon="Edit" command="edit">Edit</el-dropdown-item>
                    <el-dropdown-item :icon="VideoPlay" command="start">
                      Start Sprint
                    </el-dropdown-item>
                    <el-dropdown-item :icon="Delete" command="delete" divided>
                      Delete
                    </el-dropdown-item>
                  </template>
                  <el-dropdown-item
                    v-else-if="row.status === 'ACTIVE'"
                    :icon="CircleCheck"
                    command="complete"
                  >
                    Complete Sprint
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { Check, CircleCheck, Close, Delete, Edit, Plus, VideoPlay } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";

interface BacklogItem {
  id: string;
  identifier: string;
  title: string;
  estimate: number | null;
  status: string;
}
interface SprintItem {
  backlogItem: BacklogItem;
}
interface Sprint {
  id: string;
  name: string;
  goal: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  completedAt: string | null;
  outcome: string | null;
  items: SprintItem[];
  events: { id: string; type: string; startsAt: string; notes: string; feedback: string }[];
  actions: { id: string; description: string; completedAt: string | null }[];
}
interface BacklogResponse {
  data: BacklogItem[];
}
const route = useRoute();
const { request } = useApi();
const projectId = computed(() => String(route.params.projectId));
const sprints = ref<Sprint[]>([]);
const backlog = ref<BacklogItem[]>([]);
const selected = ref<Record<string, string>>({});
const form = reactive({ name: "", goal: "", startsAt: "", endsAt: "" });
const sprintDialogOpen = ref(false);
const editingSprintId = ref<string | null>(null);
const outcome = ref("");
const eventType = ref<Record<string, string>>({});
const eventNotes = ref<Record<string, string>>({});
const eventFeedback = ref<Record<string, string>>({});
const actionDescription = ref<Record<string, string>>({});
const errorMessage = ref("");
const loading = ref(true);
const saving = ref(false);

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
    const [sprintData, backlogData] = await Promise.all([
      request<Sprint[]>(`/projects/${projectId.value}/sprints`),
      request<BacklogResponse>(`/projects/${projectId.value}/backlog`, { query: { limit: 100 } })
    ]);
    sprints.value = sprintData;
    backlog.value = backlogData.data;
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
async function addItem(sprint: Sprint) {
  const backlogItemId = selected.value[sprint.id];
  if (!backlogItemId) return;
  errorMessage.value = "";
  try {
    await request(`/sprints/${sprint.id}/items`, { method: "POST", body: { backlogItemId } });
    selected.value[sprint.id] = "";
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}
async function removeItem(sprint: Sprint, item: SprintItem) {
  try {
    await request(`/sprints/${sprint.id}/items/${item.backlogItem.id}`, { method: "DELETE" });
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}
async function transition(sprint: Sprint, action: "start" | "complete") {
  errorMessage.value = "";
  try {
    await request(`/sprints/${sprint.id}/${action}`, {
      method: "POST",
      body: action === "complete" ? { outcome: outcome.value } : {}
    });
    outcome.value = "";
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}
async function recordEvent(sprint: Sprint) {
  const type = eventType.value[sprint.id] || "PLANNING";
  try {
    await request(`/sprints/${sprint.id}/events`, {
      method: "POST",
      body: {
        type,
        notes: eventNotes.value[sprint.id] ?? "",
        feedback: eventFeedback.value[sprint.id] ?? ""
      }
    });
    eventNotes.value[sprint.id] = "";
    eventFeedback.value[sprint.id] = "";
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}
async function addAction(sprint: Sprint) {
  const description = actionDescription.value[sprint.id]?.trim();
  if (!description) return;
  try {
    await request(`/sprints/${sprint.id}/retrospective-actions`, {
      method: "POST",
      body: { description }
    });
    actionDescription.value[sprint.id] = "";
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}
async function toggleAction(action: Sprint["actions"][number], completed: boolean) {
  try {
    await request(`/retrospective-actions/${action.id}`, { method: "PATCH", body: { completed } });
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}
const openBacklogItems = computed(() => backlog.value.filter((item) => item.status !== "DONE"));
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
    <el-skeleton v-if="loading" :rows="5" animated />
    <div v-else class="space-y-4">
      <el-card v-for="sprint in sprints" :key="sprint.id" shadow="never">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="section-title">
                <NuxtLink
                  :to="`/projects/${projectId}/sprints/${sprint.id}`"
                  class="text-inherit no-underline hover:text-(--el-color-primary)"
                >
                  {{ sprint.name }}
                </NuxtLink>
              </h2>
              <el-tag
                size="small"
                :type="
                  sprint.status === 'ACTIVE'
                    ? 'success'
                    : sprint.status === 'COMPLETED'
                      ? 'info'
                      : 'primary'
                "
                >{{ sprint.status }}</el-tag
              >
            </div>
            <p class="mt-2 max-w-3xl text-sm">{{ sprint.goal || "Sprint Goal not set" }}</p>
            <p v-if="sprint.startsAt && sprint.endsAt" class="muted mt-2 text-xs">
              {{ new Date(sprint.startsAt).toLocaleDateString() }} –
              {{ new Date(sprint.endsAt).toLocaleDateString() }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <el-button
              v-if="sprint.status === 'PLANNING'"
              :icon="Edit"
              @click="openEditSprint(sprint)"
              >Edit</el-button
            >
            <el-button
              v-if="sprint.status === 'PLANNING'"
              type="danger"
              plain
              :icon="Delete"
              @click="deleteSprint(sprint)"
            >
              Delete
            </el-button>
            <el-button
              v-if="sprint.status === 'PLANNING'"
              type="primary"
              :icon="VideoPlay"
              @click="transition(sprint, 'start')"
            >
              Start Sprint
            </el-button>
            <el-button
              v-if="sprint.status === 'ACTIVE'"
              :icon="CircleCheck"
              @click="transition(sprint, 'complete')"
            >
              Complete Sprint
            </el-button>
          </div>
        </div>
        <el-divider />
        <div>
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-sm font-semibold">
              Sprint backlog
              <span class="muted ml-1 font-normal">{{ sprint.items.length }} items</span>
            </h3>
            <span class="muted text-xs"
              >{{
                sprint.items.reduce((sum, item) => sum + (item.backlogItem.estimate ?? 0), 0)
              }}
              points planned</span
            >
          </div>
          <ul v-if="sprint.items.length" class="m-0 list-none p-0">
            <li
              v-for="item in sprint.items"
              :key="item.backlogItem.id"
              class="flex items-center gap-3 py-3"
              style="border-top: 1px solid var(--el-border-color-extra-light)"
            >
              <span class="text-xs font-semibold" style="color: var(--el-color-primary)">{{
                item.backlogItem.identifier
              }}</span>
              <span class="min-w-0 flex-1 truncate text-sm">{{ item.backlogItem.title }}</span>
              <span class="muted text-xs">{{ item.backlogItem.estimate ?? "—" }} pts</span>
              <el-button
                v-if="['PLANNING', 'ACTIVE'].includes(sprint.status)"
                link
                type="danger"
                size="small"
                :icon="Close"
                @click="removeItem(sprint, item)"
              >
                Remove
              </el-button>
            </li>
          </ul>
          <p v-else class="muted py-3 text-sm">
            No work selected. The team chooses what is feasible for the Sprint.
          </p>
          <div
            v-if="['PLANNING', 'ACTIVE'].includes(sprint.status)"
            class="mt-4 flex flex-col gap-2 sm:flex-row"
          >
            <el-select
              v-model="selected[sprint.id]"
              class="flex-1"
              placeholder="Select an available backlog item"
              aria-label="Add backlog item"
              filterable
            >
              <el-option
                v-for="item in openBacklogItems.filter(
                  (candidate) =>
                    !sprint.items.some((entry) => entry.backlogItem.id === candidate.id)
                )"
                :key="item.id"
                :label="`${item.identifier} · ${item.title}`"
                :value="item.id"
              />
            </el-select>
            <el-button :icon="Plus" :disabled="!selected[sprint.id]" @click="addItem(sprint)">
              Add item
            </el-button>
          </div>
        </div>
        <el-alert
          v-if="sprint.status === 'ACTIVE'"
          class="mt-5!"
          title="Sprint Goal"
          :description="sprint.goal"
          type="success"
          :closable="false"
        />
        <div v-if="sprint.status === 'ACTIVE'" class="mt-4">
          <el-input
            v-model="outcome"
            aria-label="Sprint outcome"
            placeholder="Outcome summary (optional)"
          />
        </div>
        <el-alert
          v-if="sprint.status === 'COMPLETED' && sprint.outcome"
          class="mt-4"
          :title="`Outcome: ${sprint.outcome}`"
          type="info"
          :closable="false"
        />
        <el-collapse class="mt-5">
          <el-collapse-item title="Sprint events and retrospective" :name="sprint.id">
            <div class="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 class="text-sm font-semibold">Event notes</h3>
                <el-form
                  class="form-stack mt-3"
                  label-position="top"
                  @submit.prevent="recordEvent(sprint)"
                >
                  <el-form-item label="Event">
                    <el-select v-model="eventType[sprint.id]" placeholder="Sprint Planning">
                      <el-option label="Sprint Planning" value="PLANNING" />
                      <el-option label="Daily Scrum" value="DAILY_SCRUM" />
                      <el-option label="Sprint Review" value="REVIEW" />
                      <el-option label="Retrospective" value="RETROSPECTIVE" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="Notes">
                    <el-input
                      v-model="eventNotes[sprint.id]"
                      type="textarea"
                      :rows="2"
                      maxlength="10000"
                      placeholder="Planning decisions, observations, or outcomes"
                    />
                  </el-form-item>
                  <el-form-item
                    v-if="eventType[sprint.id] === 'REVIEW'"
                    label="Stakeholder feedback"
                  >
                    <el-input
                      v-model="eventFeedback[sprint.id]"
                      type="textarea"
                      :rows="2"
                      maxlength="10000"
                      placeholder="Capture feedback without treating it as an approved requirement"
                    />
                  </el-form-item>
                  <el-button :icon="Plus" native-type="submit">Record event</el-button>
                </el-form>
                <ul v-if="sprint.events.length" class="m-0 mt-4 list-none space-y-3 p-0">
                  <li
                    v-for="event in sprint.events"
                    :key="event.id"
                    class="rounded-lg p-3"
                    style="background: var(--el-fill-color-light)"
                  >
                    <div class="flex justify-between gap-3">
                      <span class="text-xs font-semibold">{{
                        event.type.replaceAll("_", " ")
                      }}</span>
                      <time class="muted text-xs">{{
                        new Date(event.startsAt).toLocaleDateString()
                      }}</time>
                    </div>
                    <p v-if="event.notes" class="mt-2 whitespace-pre-wrap text-sm">
                      {{ event.notes }}
                    </p>
                    <p
                      v-if="event.feedback"
                      class="mt-2 whitespace-pre-wrap pl-3 text-sm"
                      style="border-left: 2px solid var(--el-color-primary-light-5)"
                    >
                      {{ event.feedback }}
                    </p>
                  </li>
                </ul>
              </div>
              <div>
                <h3 class="text-sm font-semibold">Retrospective actions</h3>
                <div class="mt-3 flex flex-col gap-2 sm:flex-row">
                  <el-input
                    v-model="actionDescription[sprint.id]"
                    class="flex-1"
                    maxlength="2000"
                    aria-label="Action item description"
                    placeholder="What will we try next?"
                    @keyup.enter="addAction(sprint)"
                  />
                  <el-button :icon="Plus" @click="addAction(sprint)">Add action</el-button>
                </div>
                <ul v-if="sprint.actions.length" class="m-0 mt-4 list-none space-y-2 p-0">
                  <li
                    v-for="action in sprint.actions"
                    :key="action.id"
                    class="rounded-lg p-2"
                    style="border: 1px solid var(--el-border-color-lighter)"
                  >
                    <el-checkbox
                      :model-value="Boolean(action.completedAt)"
                      @change="toggleAction(action, Boolean($event))"
                    >
                      <span
                        :class="{ muted: action.completedAt, 'line-through': action.completedAt }"
                        >{{ action.description }}</span
                      >
                    </el-checkbox>
                  </li>
                </ul>
                <p v-else class="muted mt-4 text-sm">
                  Capture one small improvement to carry forward.
                </p>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-card>
      <el-empty
        v-if="!sprints.length"
        description="No Sprints yet. Start with a clear goal and a short planning horizon."
      />
    </div>
  </div>
</template>

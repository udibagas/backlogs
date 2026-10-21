<script setup lang="ts">
import { ArrowLeft } from "@element-plus/icons-vue";

interface Sprint {
  id: string;
  name: string;
  goal: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  completedAt: string | null;
  outcome: string | null;
  items: {
    backlogItem: {
      id: string;
      title: string;
      status: string;
      estimate: number | null;
    };
  }[];
  events: {
    id: string;
    type: string;
    startsAt: string;
    notes: string;
    feedback: string;
  }[];
  actions: { id: string; description: string; completedAt: string | null }[];
}

const route = useRoute();
const { request } = useApi();
const projectId = computed(() => String(route.params.projectId));
const sprintId = computed(() => String(route.params.sprintId));
const sprint = ref<Sprint | null>(null);
const errorMessage = ref("");
const loading = ref(true);

const completedItems = computed(
  () => sprint.value?.items.filter((item) => item.backlogItem.status === "DONE").length ?? 0
);
const plannedPoints = computed(
  () => sprint.value?.items.reduce((sum, item) => sum + (item.backlogItem.estimate ?? 0), 0) ?? 0
);
const completedPoints = computed(
  () =>
    sprint.value?.items.reduce(
      (sum, item) =>
        sum +
        (item.backlogItem.status === "DONE" ? (item.backlogItem.estimate ?? 0) : 0),
      0
    ) ?? 0
);
const completionPercentage = computed(() =>
  sprint.value?.items.length
    ? Math.round((completedItems.value / sprint.value.items.length) * 100)
    : 0
);

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "Not set";
}

function statusTagType(status: string) {
  if (status === "DONE" || status === "ACTIVE") return "success";
  if (status === "COMPLETED") return "info";
  if (status === "BLOCKED") return "danger";
  return "primary";
}

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const sprints = await request<Sprint[]>(`/projects/${projectId.value}/sprints`);
    sprint.value = sprints.find((entry) => entry.id === sprintId.value) ?? null;
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
    sprint.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch([projectId, sprintId], load);
</script>

<template>
  <div class="page-shell">
    <el-skeleton v-if="loading" :rows="7" animated />
    <template v-else>
      <header class="page-header">
        <div>
          <p class="eyebrow">Sprint details</p>
          <div class="flex flex-wrap items-center gap-3">
            <h1 v-if="sprint" class="page-title">{{ sprint.name }}</h1>
            <h1 v-else class="page-title">Sprint not found</h1>
            <el-tag v-if="sprint" :type="statusTagType(sprint.status)">{{
              sprint.status
            }}</el-tag>
          </div>
          <p v-if="sprint" class="muted mt-2 text-sm">
            {{ formatDate(sprint.startsAt) }} – {{ formatDate(sprint.endsAt) }}
          </p>
        </div>
        <el-button
          :icon="ArrowLeft"
          @click="navigateTo(`/projects/${projectId}/sprints`)"
        >
          All Sprints
        </el-button>
      </header>

      <el-alert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        show-icon
        class="mb-5"
      />
      <el-empty v-if="!sprint && !errorMessage" description="This Sprint could not be found." />

      <template v-if="sprint">
        <el-row :gutter="16" class="mb-5">
          <el-col :sm="8" :xs="24" class="mb-4">
            <el-card shadow="never">
              <template #header><span class="text-sm font-medium">Backlog items</span></template>
              <el-statistic :value="sprint.items.length">
                <template #suffix>
                  <span class="muted text-sm"> · {{ completedItems }} done</span>
                </template>
              </el-statistic>
            </el-card>
          </el-col>
          <el-col :sm="8" :xs="24" class="mb-4">
            <el-card shadow="never">
              <template #header><span class="text-sm font-medium">Planned points</span></template>
              <el-statistic :value="plannedPoints" />
              <p class="muted mt-1 text-xs">{{ completedPoints }} points completed</p>
            </el-card>
          </el-col>
          <el-col :sm="8" :xs="24" class="mb-4">
            <el-card shadow="never">
              <template #header><span class="text-sm font-medium">Completion</span></template>
              <el-statistic :value="completionPercentage">
                <template #suffix><span class="muted text-sm">%</span></template>
              </el-statistic>
              <el-progress
                class="mt-2"
                :percentage="completionPercentage"
                :show-text="false"
                :status="completionPercentage === 100 ? 'success' : undefined"
              />
            </el-card>
          </el-col>
        </el-row>

        <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div class="space-y-5">
            <el-card shadow="never">
              <template #header><h2 class="section-title">Sprint Goal</h2></template>
              <p class="mt-3 whitespace-pre-wrap text-sm">
                {{ sprint.goal || "No Sprint Goal was set." }}
              </p>
              <el-alert
                v-if="sprint.status === 'COMPLETED' && sprint.outcome"
                class="mt-4"
                title="Sprint outcome"
                :description="sprint.outcome"
                type="info"
                :closable="false"
              />
            </el-card>

            <el-card shadow="never">
              <template #header>
                <div class="flex items-center justify-between gap-3">
                <h2 class="section-title">Sprint backlog</h2>
                <span class="muted text-xs">{{ sprint.items.length }} items</span>
                </div>
              </template>
              <ul v-if="sprint.items.length" class="m-0 list-none p-0">
                <li
                  v-for="item in sprint.items"
                  :key="item.backlogItem.id"
                  class="flex flex-wrap items-center gap-3 py-3"
                  style="border-top: 1px solid var(--el-border-color-extra-light)"
                >
                  <NuxtLink
                    :to="`/projects/${projectId}/backlog/${item.backlogItem.id}`"
                    class="min-w-0 flex-1 truncate text-sm text-(--el-color-primary) no-underline hover:underline"
                  >
                    {{ item.backlogItem.title }}
                  </NuxtLink>
                  <el-tag size="small" effect="plain" :type="statusTagType(item.backlogItem.status)">
                    {{ item.backlogItem.status.replaceAll("_", " ") }}
                  </el-tag>
                  <span class="muted text-xs">
                    {{ item.backlogItem.estimate ?? "—" }} pts
                  </span>
                </li>
              </ul>
              <el-empty
                v-else
                description="No backlog items have been added to this Sprint."
                :image-size="80"
              />
            </el-card>

            <el-card shadow="never">
              <template #header>
                <div class="flex items-center justify-between gap-3">
                <h2 class="section-title">Events and notes</h2>
                <span class="muted text-xs">{{ sprint.events.length }} events</span>
                </div>
              </template>
              <ul v-if="sprint.events.length" class="m-0 list-none space-y-3 p-0">
                <li
                  v-for="event in sprint.events"
                  :key="event.id"
                  class="rounded-lg p-4"
                  style="background: var(--el-fill-color-light)"
                >
                  <div class="flex flex-wrap justify-between gap-2">
                    <span class="text-sm font-semibold">{{ event.type.replaceAll("_", " ") }}</span>
                    <time class="muted text-xs">{{ formatDate(event.startsAt) }}</time>
                  </div>
                  <p v-if="event.notes" class="mt-2 whitespace-pre-wrap text-sm">
                    {{ event.notes }}
                  </p>
                  <p
                    v-if="event.feedback"
                    class="mt-3 whitespace-pre-wrap pl-3 text-sm"
                    style="border-left: 2px solid var(--el-color-primary-light-5)"
                  >
                    {{ event.feedback }}
                  </p>
                </li>
              </ul>
              <el-empty v-else description="No Sprint events recorded." :image-size="80" />
            </el-card>
          </div>

          <aside class="space-y-5">
            <el-card shadow="never">
              <template #header><h2 class="section-title">Timeline</h2></template>
              <dl class="m-0 space-y-4">
                <div>
                  <dt class="muted text-xs">Start date</dt>
                  <dd class="mt-1 text-sm">{{ formatDate(sprint.startsAt) }}</dd>
                </div>
                <div>
                  <dt class="muted text-xs">End date</dt>
                  <dd class="mt-1 text-sm">{{ formatDate(sprint.endsAt) }}</dd>
                </div>
                <div v-if="sprint.completedAt">
                  <dt class="muted text-xs">Completed</dt>
                  <dd class="mt-1 text-sm">{{ formatDate(sprint.completedAt) }}</dd>
                </div>
              </dl>
            </el-card>

            <el-card shadow="never">
              <template #header>
                <div class="flex items-center justify-between gap-3">
                <h2 class="section-title">Retrospective actions</h2>
                <el-tag size="small" effect="plain">
                  {{ sprint.actions.filter((action) => action.completedAt).length }}/{{
                    sprint.actions.length
                  }}
                  done
                </el-tag>
                </div>
              </template>
              <ul v-if="sprint.actions.length" class="m-0 list-none space-y-3 p-0">
                <li
                  v-for="action in sprint.actions"
                  :key="action.id"
                  class="flex items-start gap-2 text-sm"
                >
                  <el-icon
                    class="mt-0.5"
                    :color="action.completedAt ? 'var(--el-color-success)' : 'var(--el-text-color-placeholder)'"
                  >
                    <el-icon-circle-check-filled v-if="action.completedAt" />
                    <el-icon-clock v-else />
                  </el-icon>
                  <span
                    :class="{ 'muted line-through': action.completedAt }"
                    class="min-w-0"
                  >
                    {{ action.description }}
                  </span>
                </li>
              </ul>
              <p v-else class="muted text-sm">No retrospective actions recorded.</p>
            </el-card>
          </aside>
        </div>
      </template>
    </template>
  </div>
</template>

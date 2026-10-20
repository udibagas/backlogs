<script setup lang="ts">
interface Card {
  id: string;
  identifier: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  estimate: number | null;
  assignee: { name: string } | null;
  dependencies: { dependsOn: { title: string; status: string } }[];
}
interface Column {
  id: string;
  name: string;
  status: string;
  position: number;
  wipLimit: number | null;
  hardLimit: boolean;
  count: number;
  overLimit: boolean;
  cards: Card[];
}
interface ProjectMember {
  userId: string;
  user: { id: string; name: string; email: string };
}
const route = useRoute();
const { request } = useApi();
const projectId = computed(() => String(route.params.projectId));
const columns = ref<Column[]>([]);
const members = ref<ProjectMember[]>([]);
const createDialogOpen = ref(false);
const loading = ref(true);
const errorMessage = ref("");
const columnColors: Record<string, string> = {
  BACKLOG: "#909399",
  READY: "#409eff",
  IN_PROGRESS: "#e6a23c",
  IN_REVIEW: "#9254de",
  TESTING: "#13c2c2",
  DONE: "#67c23a"
};

function columnStyle(status: string) {
  const accent = columnColors[status];
  if (!accent) {
    return {
      background: "var(--el-fill-color-light)",
      border: "1px solid var(--el-border-color-lighter)"
    };
  }
  return {
    background: `color-mix(in srgb, ${accent} 8%, var(--el-bg-color))`,
    border: `1px solid color-mix(in srgb, ${accent} 35%, var(--el-border-color-lighter))`
  };
}

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    [columns.value, members.value] = await Promise.all([
      request<Column[]>(`/projects/${projectId.value}/board`),
      request<ProjectMember[]>(`/projects/${projectId.value}/members`)
    ]);
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    loading.value = false;
  }
}
function dragStart(event: DragEvent, itemId: string) {
  event.dataTransfer?.setData("text/plain", itemId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}
async function move(itemId: string, status: string) {
  errorMessage.value = "";
  try {
    await request(`/backlog-items/${itemId}/status`, { method: "PATCH", body: { status } });
    await load();
  } catch (error) {
    errorMessage.value = useErrorMessage(
      error,
      "The card could not be moved. The board has been refreshed."
    );
    await load();
  }
}
function drop(event: DragEvent, status: string) {
  event.preventDefault();
  const itemId = event.dataTransfer?.getData("text/plain");
  if (itemId) void move(itemId, status);
}
onMounted(load);
watch(projectId, load);
</script>

<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Project workspace</p>
        <h1 class="page-title">Kanban board</h1>
        <p class="muted mt-2 text-sm">
          Keep work visible and flow moving. Use the status selector if drag-and-drop is
          inconvenient.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <el-button @click="navigateTo(`/projects/${projectId}/backlog`)">Product backlog</el-button>
        <el-button type="primary" @click="createDialogOpen = true">+ New item</el-button>
      </div>
    </header>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-5" />
    <el-skeleton v-if="loading" :rows="6" animated />
    <div
      v-else
      class="grid gap-4 overflow-x-auto pb-4 xl:grid-cols-6 lg:grid-cols-3 sm:grid-cols-2"
    >
      <section
        v-for="column in columns"
        :key="column.id"
        class="min-w-64 rounded-lg p-3"
        :style="columnStyle(column.status)"
        @dragover.prevent
        @drop="drop($event, column.status)"
      >
        <header class="mb-3 flex items-center justify-between gap-2 px-1">
          <h2 class="text-sm font-semibold">{{ column.name }}</h2>
          <el-badge :value="column.count" type="info" :show-zero="true" class="mr-2" />
        </header>
        <el-alert
          v-if="column.overLimit"
          :title="`WIP limit ${column.wipLimit} exceeded (${column.count} items).`"
          type="warning"
          :closable="false"
          show-icon
          class="mb-2"
        />
        <div class="space-y-2">
          <el-card
            v-for="card in column.cards"
            :key="card.id"
            shadow="hover"
            :body-style="{ padding: '12px' }"
            draggable="true"
            @dragstart="dragStart($event, card.id)"
          >
            <div class="flex items-start justify-between gap-2">
              <span class="text-[11px] font-semibold" style="color: var(--el-color-primary)">{{
                card.identifier
              }}</span>
              <el-tag size="small" type="info">{{
                card.type.replaceAll("_", " ").toLowerCase()
              }}</el-tag>
            </div>
            <NuxtLink
              :to="`/projects/${projectId}/backlog`"
              class="mt-2 block text-sm font-medium leading-snug"
              >{{ card.title }}</NuxtLink
            >
            <el-text
              v-if="card.dependencies.some((dependency) => dependency.dependsOn.status !== 'DONE')"
              type="warning"
              size="small"
              class="mt-2 block"
            >
              Blocked by unresolved dependency
            </el-text>
            <div class="muted mt-3 flex items-center justify-between text-xs">
              <span>{{ card.assignee?.name ?? "Unassigned" }}</span>
              <span>{{ card.estimate ?? "—" }} pts</span>
            </div>
            <el-select
              :model-value="card.status"
              size="small"
              class="mt-3"
              :aria-label="`Move ${card.identifier} to another status`"
              @change="move(card.id, $event as string)"
            >
              <el-option
                v-for="option in columns"
                :key="option.status"
                :label="option.name"
                :value="option.status"
              />
            </el-select>
          </el-card>
          <p v-if="!column.cards.length" class="muted py-8 text-center text-xs">Drop work here</p>
        </div>
      </section>
    </div>
    <BacklogItemForm
      v-model="createDialogOpen"
      :project-id="projectId"
      :members="members"
      :item="null"
      @saved="load"
      @error="errorMessage = $event"
    />
  </div>
</template>

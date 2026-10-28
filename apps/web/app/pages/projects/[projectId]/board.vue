<script setup lang="ts">
import { List, Plus } from "@element-plus/icons-vue";

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
const draggingCard = ref<Card | null>(null);
const dragSourceStatus = ref<string | null>(null);
const overStatus = ref<string | null>(null);

function dragStart(event: DragEvent, card: Card, status: string) {
  event.dataTransfer?.setData("text/plain", card.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  // Defer so the browser snapshots the drag image before the card is dimmed.
  requestAnimationFrame(() => {
    draggingCard.value = card;
    dragSourceStatus.value = status;
  });
}
function dragEnd() {
  draggingCard.value = null;
  dragSourceStatus.value = null;
  overStatus.value = null;
}
function dragOver(event: DragEvent, status: string) {
  if (!draggingCard.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  overStatus.value = status;
}
function dragLeave(event: DragEvent, status: string) {
  const next = event.relatedTarget as Node | null;
  if (next && (event.currentTarget as Node).contains(next)) return;
  if (overStatus.value === status) overStatus.value = null;
}
function showPlaceholder(status: string) {
  return !!draggingCard.value && overStatus.value === status && dragSourceStatus.value !== status;
}
async function move(card: Card, status: string) {
  errorMessage.value = "";
  const from = columns.value.find((c) => c.cards.some((x) => x.id === card.id));
  const to = columns.value.find((c) => c.status === status);
  if (!from || !to || from === to) return;
  // Optimistic update so the card lands instantly.
  from.cards = from.cards.filter((x) => x.id !== card.id);
  from.count = Math.max(0, from.count - 1);
  to.cards = [...to.cards, { ...card, status }];
  to.count += 1;
  try {
    await request(`/backlog-items/${card.id}/status`, { method: "PATCH", body: { status } });
    await refresh();
  } catch (error) {
    errorMessage.value = useErrorMessage(
      error,
      "The card could not be moved. The board has been refreshed."
    );
    await refresh();
  }
}
async function refresh() {
  try {
    columns.value = await request<Column[]>(`/projects/${projectId.value}/board`);
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  }
}
function drop(event: DragEvent, status: string) {
  event.preventDefault();
  const card = draggingCard.value;
  dragEnd();
  if (card) void move(card, status);
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
        <el-button :icon="List" @click="navigateTo(`/projects/${projectId}/backlog`)">
          Product backlog
        </el-button>
        <el-button type="primary" :icon="Plus" @click="createDialogOpen = true">New item</el-button>
      </div>
    </header>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-5!" />
    <el-skeleton v-if="loading" :rows="6" animated />
    <div v-else class="flex gap-4 overflow-x-auto pb-4">
      <section
        v-for="column in columns"
        :key="column.id"
        class="min-w-64 rounded-lg p-3 transition-colors duration-150"
        :style="columnStyle(column.status)"
        @dragover="dragOver($event, column.status)"
        @dragleave="dragLeave($event, column.status)"
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
          class="mb-2!"
        />
        <div class="space-y-2">
          <el-card
            v-for="card in column.cards"
            :key="card.id"
            shadow="hover"
            :body-style="{ padding: '12px' }"
            draggable="true"
            class="cursor-grab transition-opacity duration-150 active:cursor-grabbing"
            :class="{ 'opacity-40': draggingCard?.id === card.id }"
            @dragstart="dragStart($event, card, column.status)"
            @dragend="dragEnd"
          >
            <div class="flex items-start justify-between gap-2">
              <span class="text-[11px] font-semibold" style="color: var(--el-color-primary)">{{
                card.identifier
              }}</span>
              <el-tag size="small" type="warning" effect="plain">
                {{ card.type.replaceAll("_", " ").toLowerCase() }}
              </el-tag>
            </div>
            <NuxtLink
              :to="`/projects/${projectId}/backlog/${card.id}`"
              class="mt-2 block text-sm font-medium leading-snug"
            >
              {{ card.title }}
            </NuxtLink>
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
              @change="move(card, $event as string)"
            >
              <el-option
                v-for="option in columns"
                :key="option.status"
                :label="option.name"
                :value="option.status"
              />
            </el-select>
          </el-card>
          <div
            v-if="showPlaceholder(column.status)"
            class="flex h-20 items-center justify-center rounded-lg border-2 border-dashed text-xs"
            style="
              border-color: var(--el-color-primary);
              color: var(--el-color-primary);
              background: var(--el-color-primary-light-9);
            "
          >
            Drop here
          </div>
          <p
            v-if="!column.cards.length && !showPlaceholder(column.status)"
            class="muted py-8 text-center text-xs"
          >
            Drop work here
          </p>
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

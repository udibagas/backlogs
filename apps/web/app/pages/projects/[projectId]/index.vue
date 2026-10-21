<script setup lang="ts">
import { Close, Plus, Right } from "@element-plus/icons-vue";

interface Project {
  id: string;
  name: string;
  key: string;
  description: string;
  methodology: string;
  currentRole: string;
  organization: { name: string };
}
interface ProjectMember {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string };
}
interface Report {
  backlogByStatus: { status: string; count: number }[];
  activeSprint: null | {
    id: string;
    name: string;
    goal: string;
    totalItems: number;
    completedItems: number;
    plannedEstimate: number;
    completedEstimate: number;
  };
  taskCount: number;
  recentActivity: {
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
    actor: { name: string } | null;
  }[];
}
const route = useRoute();
const { request, currentUser } = useApi();
const projectId = computed(() => String(route.params.projectId));
const project = ref<Project | null>(null);
const report = ref<Report | null>(null);
const members = ref<ProjectMember[]>([]);
const memberEmail = ref("");
const memberRole = ref("DEVELOPER");
const loading = ref(true);
const memberPending = ref(false);
const memberError = ref("");
const errorMessage = ref("");
const canManageMembers = computed(() =>
  ["MANAGER", "PRODUCT_OWNER", "SCRUM_MASTER"].includes(project.value?.currentRole ?? "")
);

async function load() {
  loading.value = true;
  try {
    [project.value, report.value, members.value] = await Promise.all([
      request<Project>(`/projects/${projectId.value}`),
      request<Report>(`/projects/${projectId.value}/reports`),
      request<ProjectMember[]>(`/projects/${projectId.value}/members`)
    ]);
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    loading.value = false;
  }
}
async function addMember() {
  memberError.value = "";
  const email = memberEmail.value.trim();
  if (!email) {
    memberError.value = "Enter the email address of an existing account.";
    return;
  }
  memberPending.value = true;
  try {
    await request<ProjectMember>(`/projects/${projectId.value}/members`, {
      method: "POST",
      body: { email, role: memberRole.value }
    });
    memberEmail.value = "";
    members.value = await request<ProjectMember[]>(`/projects/${projectId.value}/members`);
  } catch (error) {
    memberError.value = useErrorMessage(error);
  } finally {
    memberPending.value = false;
  }
}
async function removeMember(member: ProjectMember) {
  memberError.value = "";
  if (!window.confirm(`Remove ${member.user.name} from this project?`)) return;
  memberPending.value = true;
  try {
    await request(`/projects/${projectId.value}/members/${member.userId}`, { method: "DELETE" });
    members.value = members.value.filter((current) => current.id !== member.id);
  } catch (error) {
    memberError.value = useErrorMessage(error);
  } finally {
    memberPending.value = false;
  }
}
onMounted(load);
watch(projectId, load);
</script>

<template>
  <div class="page-shell">
    <el-skeleton v-if="loading" :rows="6" animated />
    <template v-else-if="project">
      <header class="page-header">
        <div>
          <p class="eyebrow">{{ project.organization.name }} · {{ project.key }}</p>
          <h1 class="page-title">{{ project.name }}</h1>
          <p class="muted mt-2 max-w-2xl text-sm">
            {{ project.description || "Your team's shared space for planning and delivery." }}
          </p>
        </div>
        <el-button
          type="primary"
          :icon="Right"
          @click="navigateTo(`/projects/${project.id}/backlog`)"
          >Open product backlog</el-button
        >
      </header>
      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-5" />
      <el-row :gutter="16" class="mb-7">
        <el-col :sm="8" :xs="24" class="mb-4">
          <el-card shadow="never">
            <el-statistic
              title="Open backlog"
              :value="
                (report?.backlogByStatus ?? [])
                  .filter((row) => row.status !== 'DONE')
                  .reduce((sum, row) => sum + row.count, 0)
              "
            />
            <p class="muted mt-1 text-xs">Items not yet done</p>
          </el-card>
        </el-col>
        <el-col :sm="8" :xs="24" class="mb-4">
          <el-card shadow="never">
            <el-statistic :title="'Active Sprint'"
              ><template #formatter
                ><span class="text-xl">{{
                  report?.activeSprint?.name ?? "No active Sprint"
                }}</span></template
              ></el-statistic
            >
            <p class="muted mt-1 text-xs">
              {{
                report?.activeSprint
                  ? `${report.activeSprint.completedItems} of ${report.activeSprint.totalItems} items complete`
                  : "Plan a Sprint when the team is ready"
              }}
            </p>
          </el-card>
        </el-col>
        <el-col :sm="8" :xs="24" class="mb-4">
          <el-card shadow="never">
            <el-statistic title="Tasks tracked" :value="report?.taskCount ?? 0" />
            <p class="muted mt-1 text-xs">Implementation work across the project</p>
          </el-card>
        </el-col>
      </el-row>
      <el-card shadow="never" class="mb-7">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="section-title">Project team</h2>
            <p class="muted mt-1 text-sm">Collaborate with people on this project.</p>
          </div>
          <el-tag type="info">{{ members.length }} members</el-tag>
        </div>
        <el-alert v-if="memberError" :title="memberError" type="error" show-icon class="mb-4" />
        <form
          v-if="canManageMembers"
          class="mb-5 flex flex-col gap-3 sm:flex-row"
          @submit.prevent="addMember"
        >
          <el-input
            v-model="memberEmail"
            type="email"
            autocomplete="email"
            placeholder="Add an existing user by email"
            aria-label="Collaborator email"
            class="flex-1"
          />
          <el-select v-model="memberRole" aria-label="Project role" class="sm:!w-48">
            <el-option label="Manager" value="MANAGER" />
            <el-option label="Product owner" value="PRODUCT_OWNER" />
            <el-option label="Scrum master" value="SCRUM_MASTER" />
            <el-option label="Developer" value="DEVELOPER" />
            <el-option label="Viewer" value="VIEWER" />
          </el-select>
          <el-button type="primary" :icon="Plus" native-type="submit" :loading="memberPending">
            Add member
          </el-button>
        </form>
        <div
          v-if="members.length"
          class="divide-y"
          style="border-color: var(--el-border-color-lighter)"
        >
          <div
            v-for="member in members"
            :key="member.id"
            class="flex flex-wrap items-center gap-3 py-3"
          >
            <el-avatar :size="36">{{ member.user.name.slice(0, 1).toUpperCase() }}</el-avatar>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ member.user.name }}</p>
              <p class="muted truncate text-xs">{{ member.user.email }}</p>
            </div>
            <el-tag size="small" effect="plain">{{ member.role.replaceAll("_", " ") }}</el-tag>
            <el-button
              v-if="canManageMembers && member.userId !== currentUser?.id"
              text
              type="danger"
              :icon="Close"
              :disabled="memberPending"
              @click="removeMember(member)"
            >
              Remove
            </el-button>
          </div>
        </div>
        <el-empty v-else description="No project members yet." :image-size="72" />
      </el-card>
      <div class="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <el-card shadow="never">
          <div class="mb-5 flex items-start justify-between">
            <div>
              <h2 class="section-title">Work by status</h2>
              <p class="muted mt-1 text-sm">Live counts from the Product Backlog.</p>
            </div>
            <el-link
              type="primary"
              underline="never"
              @click="navigateTo(`/projects/${project.id}/board`)"
              >View board →</el-link
            >
          </div>
          <div v-if="report?.backlogByStatus.length" class="space-y-4">
            <div v-for="item in report.backlogByStatus" :key="item.status">
              <div class="mb-1.5 flex justify-between text-sm">
                <span class="muted">{{ item.status.replaceAll("_", " ").toLowerCase() }}</span>
                <span class="font-medium">{{ item.count }}</span>
              </div>
              <el-progress
                :percentage="
                  Math.min(
                    100,
                    (item.count / Math.max(1, ...report.backlogByStatus.map((row) => row.count))) *
                      100
                  )
                "
                :show-text="false"
              />
            </div>
          </div>
          <el-empty v-else description="Add backlog items to see project progress." />
        </el-card>
        <el-card shadow="never">
          <h2 class="section-title">Recent activity</h2>
          <el-timeline v-if="report?.recentActivity.length" class="mt-4 !pl-1">
            <el-timeline-item
              v-for="activity in report.recentActivity"
              :key="activity.id"
              :timestamp="new Date(activity.createdAt).toLocaleString()"
              placement="top"
            >
              <span class="font-medium">{{ activity.actor?.name ?? "A team member" }}</span>
              {{ activity.action.replaceAll(".", " ") }}
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="Project updates will appear here." />
        </el-card>
      </div>
    </template>
    <el-alert v-else :title="errorMessage || 'Project not found.'" type="error" show-icon />
  </div>
</template>

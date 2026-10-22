<script setup lang="ts">
const route = useRoute();
const { currentUser, signOut } = useApi();
const projectId = computed(() => String(route.params.projectId ?? ""));
const projectLinks = computed(() =>
  projectId.value
    ? [
        { label: "Overview", to: `/projects/${projectId.value}` },
        { label: "Product backlog", to: `/projects/${projectId.value}/backlog` },
        { label: "Kanban board", to: `/projects/${projectId.value}/board` },
        { label: "Sprints", to: `/projects/${projectId.value}/sprints` },
        { label: "Tasks", to: `/projects/${projectId.value}/tasks` },
        { label: "Reports", to: `/projects/${projectId.value}/reports` }
      ]
    : []
);

const activePath = computed(() => {
  const path = route.path;
  if (projectId.value) {
    const backlogPath = `/projects/${projectId.value}/backlog`;
    return path.startsWith(`${backlogPath}/`) ? backlogPath : path;
  }
  return path === "/" ? "/" : "/" + path.split("/")[1];
});

async function logout() {
  await signOut();
  await navigateTo("/login");
}
</script>

<template>
  <el-container class="min-h-screen flex-col md:flex-row">
    <el-aside width="100%" class="app-aside relative shrink-0 md:min-h-screen md:w-64!">
      <div class="flex items-center justify-between px-5 py-5">
        <NuxtLink to="/" class="text-lg font-bold tracking-tight"
          >sprintline<span class="text-(--el-color-primary)">.</span></NuxtLink
        >
        <el-tag type="primary" effect="light" round>Workspace</el-tag>
      </div>
      <el-menu :default-active="activePath" router class="app-menu" aria-label="Main navigation">
        <el-menu-item index="/">
          <el-icon><el-icon-house /></el-icon>
          Dashboard
        </el-menu-item>
        <el-menu-item index="/projects">
          <el-icon><el-icon-folder /></el-icon>
          Projects
        </el-menu-item>
        <el-menu-item index="/organizations">
          <el-icon><el-icon-office-building /></el-icon>
          Organizations
        </el-menu-item>
        <el-menu-item v-if="currentUser?.systemRole === 'ADMIN'" index="/manage-users">
          <el-icon><el-icon-user /></el-icon>
          Manage users
        </el-menu-item>
        <el-menu-item-group v-if="projectLinks.length" title="Current project">
          <el-menu-item v-for="link in projectLinks" :key="link.to" :index="link.to">
            <el-icon>
              <el-icon-house v-if="link.label === 'Overview'" />
              <el-icon-tickets v-else-if="link.label === 'Product backlog'" />
              <el-icon-grid v-else-if="link.label === 'Kanban board'" />
              <el-icon-calendar v-else-if="link.label === 'Sprints'" />
              <el-icon-checked v-else-if="link.label === 'Tasks'" />
              <el-icon-trend-charts v-else-if="link.label === 'Reports'" />
            </el-icon>
            {{ link.label }}
          </el-menu-item>
        </el-menu-item-group>
      </el-menu>
      <div class="app-user p-4 md:absolute md:bottom-0 md:w-full">
        <div class="flex items-center gap-3">
          <el-avatar :size="36">{{
            currentUser?.name?.slice(0, 1).toUpperCase() || "U"
          }}</el-avatar>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ currentUser?.name || "Your account" }}</p>
            <el-link type="info" underline="never" @click="logout">Sign out</el-link>
          </div>
        </div>
      </div>
    </el-aside>
    <el-main class="min-w-0 flex-1 p-0!">
      <slot />
    </el-main>
  </el-container>
</template>

<style scoped>
.app-aside {
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
  overflow: visible;
}
.app-menu {
  border-right: none;
  padding: 0 0.5rem 5rem;
}
.app-user {
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>

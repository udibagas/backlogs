<script setup lang="ts">
const highlights = [
  { title: "Plan with clarity", text: "Prioritize your product backlog and shape every sprint." },
  { title: "Ship with focus", text: "Track work on a Kanban board your whole team can trust." },
  {
    title: "Learn from every sprint",
    text: "Burndown and velocity reports that show real progress."
  }
];
</script>

<template>
  <div class="grid min-h-screen w-full lg:grid-cols-2">
    <aside
      class="auth-brand relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex"
    >
      <div class="auth-glow" aria-hidden="true" />
      <NuxtLink to="/" class="relative text-2xl font-bold tracking-tight">
        sprintline<span class="text-sky-300">.</span>
      </NuxtLink>
      <div class="relative max-w-md">
        <h2 class="text-4xl leading-tight font-semibold">
          A calm workspace for your team's next increment.
        </h2>
        <ul class="mt-10 space-y-6">
          <li v-for="item in highlights" :key="item.title" class="flex gap-4">
            <span
              class="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15"
            >
              <el-icon :size="14"><el-icon-check /></el-icon>
            </span>
            <div>
              <p class="font-medium">{{ item.title }}</p>
              <p class="mt-1 text-sm text-white/70">{{ item.text }}</p>
            </div>
          </li>
        </ul>
      </div>
      <p class="relative text-sm text-white/60">
        &copy; {{ new Date().getFullYear() }} Sprintline. All rights reserved.
      </p>
    </aside>
    <main class="flex flex-col items-center justify-center px-6 py-10 sm:px-12">
      <div class="w-full max-w-sm">
        <NuxtLink to="/" class="mb-10 block text-2xl font-bold tracking-tight lg:hidden">
          sprintline<span class="text-(--el-color-primary)">.</span>
        </NuxtLink>
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth-brand {
  background: linear-gradient(145deg, #1e102a 0%, #4c1d95 60%, #6b21a8 100%);
}
.auth-glow {
  position: absolute;
  top: -10rem;
  right: -10rem;
  width: 28rem;
  height: 28rem;
  border-radius: 9999px;
  background: radial-gradient(circle, rgb(125 211 252 / 0.35), transparent 70%);
}
</style>

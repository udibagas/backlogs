<script setup lang="ts">
definePageMeta({ layout: "default" });
import { Right, UserFilled } from "@element-plus/icons-vue";
import { z } from "zod";

const { signIn } = useApi();
const mode = ref<"login" | "register">("login");
const name = ref("");
const email = ref("");
const password = ref("");
const errorMessage = ref("");
const pending = ref(false);
const schema = computed(() =>
  mode.value === "login"
    ? z.object({ email: z.email(), password: z.string().min(1) })
    : z.object({
        name: z.string().trim().min(2).max(100),
        email: z.email(),
        password: z.string().min(12)
      })
);

async function submit() {
  errorMessage.value = "";
  const parsed = schema.value.safeParse({
    name: name.value,
    email: email.value,
    password: password.value
  });
  if (!parsed.success) {
    errorMessage.value = parsed.error.issues[0]?.message ?? "Check the form and try again.";
    return;
  }
  pending.value = true;
  try {
    const path = mode.value === "login" ? "/auth/login" : "/auth/register";

    const payload: { name?: string; email: string; password: string } = {
      email: email.value,
      password: password.value
    };

    if (mode.value === "register") {
      payload.name = name.value;
    }

    await signIn(path, payload);
    await navigateTo("/");
  } catch (error) {
    errorMessage.value = useErrorMessage(error, "Could not authenticate.");
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen w-full items-center justify-center px-4 py-10">
    <div class="w-full max-w-md">
      <NuxtLink to="/" class="mb-8 block text-center text-2xl font-bold tracking-tight"
        >sprintline<span class="text-[var(--el-color-primary)]">.</span></NuxtLink
      >
      <el-card shadow="never">
        <template #header>
          <div>
            <h1 class="text-2xl font-semibold">
              {{ mode === "login" ? "Welcome back" : "Create your account" }}
            </h1>
            <p class="muted mt-2 text-sm">A calm workspace for your team's next increment.</p>
          </div>
        </template>
        <el-form class="mt-7" label-position="top" @submit.prevent="submit">
          <el-form-item v-if="mode === 'register'" label="Full name">
            <el-input v-model="name" autocomplete="name" maxlength="100" />
          </el-form-item>
          <el-form-item label="Email">
            <el-input v-model="email" type="email" autocomplete="email" />
          </el-form-item>
          <el-form-item label="Password">
            <el-input
              v-model="password"
              type="password"
              show-password
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            />
            <div v-if="mode === 'register'" class="muted text-xs">Use at least 12 characters.</div>
          </el-form-item>
          <el-alert
            v-if="errorMessage"
            :title="errorMessage"
            type="error"
            :closable="false"
            show-icon
            class="mb-4"
          />
          <el-button
            type="primary"
            :icon="mode === 'login' ? Right : UserFilled"
            native-type="submit"
            class="w-full"
            :loading="pending"
          >
            {{ mode === "login" ? "Sign in" : "Create account" }}
          </el-button>
        </el-form>
        <p class="muted mt-6 text-center text-sm">
          {{ mode === "login" ? "New to Sprintline?" : "Already have an account?" }}
          <el-link
            type="primary"
            underline="never"
            @click="
              mode = mode === 'login' ? 'register' : 'login';
              errorMessage = '';
            "
          >
            {{ mode === "login" ? "Create an account" : "Sign in" }}
          </el-link>
        </p>
      </el-card>
    </div>
  </div>
</template>

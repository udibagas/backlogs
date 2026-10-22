<script setup lang="ts">
definePageMeta({ layout: "auth" });
import { z } from "zod";

const route = useRoute();
const { resetPassword } = useApi();
const password = ref("");
const confirmPassword = ref("");
const errorMessage = ref("");
const success = ref(false);
const pending = ref(false);
const token = computed(() => (typeof route.query.token === "string" ? route.query.token : ""));

async function submit() {
  errorMessage.value = "";
  const parsed = z.string().min(12).max(200).safeParse(password.value);
  if (!parsed.success) {
    errorMessage.value = "Use a password between 12 and 200 characters.";
    return;
  }
  if (password.value !== confirmPassword.value) {
    errorMessage.value = "The passwords do not match.";
    return;
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(token.value)) {
    errorMessage.value = "This reset link is invalid or expired. Request a new one.";
    return;
  }

  pending.value = true;
  try {
    await resetPassword(token.value, parsed.data);
    success.value = true;
  } catch (error) {
    errorMessage.value = useErrorMessage(error, "Could not reset your password.");
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-3xl font-semibold tracking-tight">Set a new password</h1>
      <p class="muted mt-2">Choose a password you haven't used before.</p>
    </div>
    <template v-if="success">
      <el-alert
        title="Your password has been reset. You can now sign in."
        type="success"
        :closable="false"
        show-icon
      />
      <NuxtLink to="/login" class="mt-6 block text-center text-sm text-(--el-color-primary)">
        Sign in
      </NuxtLink>
    </template>
    <el-form v-else label-position="top" @submit.prevent="submit">
      <el-form-item label="New password">
        <el-input v-model="password" type="password" show-password autocomplete="new-password" />
        <div class="muted text-xs">Use at least 12 characters.</div>
      </el-form-item>
      <el-form-item label="Confirm new password">
        <el-input
          v-model="confirmPassword"
          type="password"
          show-password
          autocomplete="new-password"
        />
      </el-form-item>
      <el-alert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        :closable="false"
        show-icon
        class="mb-4!"
      />
      <el-button size="large" type="primary" native-type="submit" class="w-full" :loading="pending">
        Reset password
      </el-button>
    </el-form>
  </div>
</template>

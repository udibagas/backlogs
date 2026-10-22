<script setup lang="ts">
definePageMeta({ layout: "auth" });
import { z } from "zod";

const { requestPasswordReset } = useApi();
const email = ref("");
const errorMessage = ref("");
const success = ref(false);
const pending = ref(false);

async function submit() {
  errorMessage.value = "";
  const parsed = z.email().safeParse(email.value.trim());
  if (!parsed.success) {
    errorMessage.value = "Enter a valid email address.";
    return;
  }

  pending.value = true;
  try {
    await requestPasswordReset(parsed.data);
    success.value = true;
  } catch (error) {
    errorMessage.value = useErrorMessage(error, "Could not request a password reset.");
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-3xl font-semibold tracking-tight">Forgot your password?</h1>
      <p class="muted mt-2">We'll send a reset link if an account matches your email.</p>
    </div>
    <template v-if="success">
      <el-alert
        title="If an active account exists for that email, a reset link will be sent."
        type="success"
        :closable="false"
        show-icon
      />
      <NuxtLink to="/login" class="mt-6 block text-center text-sm text-(--el-color-primary)">
        Back to sign in
      </NuxtLink>
    </template>
    <el-form v-else label-position="top" @submit.prevent="submit">
      <el-form-item label="Email">
        <el-input v-model="email" type="email" autocomplete="email" />
      </el-form-item>
      <el-alert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        :closable="false"
        show-icon
        class="mb-4"
      />
      <el-button size="large" type="primary" native-type="submit" class="w-full" :loading="pending">
        Send reset link
      </el-button>
      <NuxtLink to="/login" class="mt-6 block text-center text-sm text-(--el-color-primary)">
        Back to sign in
      </NuxtLink>
    </el-form>
  </div>
</template>

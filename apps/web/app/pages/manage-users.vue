<script setup lang="ts">
import { Edit, Refresh, User } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { z } from "zod";

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  systemRole: "USER" | "ADMIN";
  active: boolean;
  createdAt: string;
}

const { request, currentUser } = useApi();
const users = ref<ManagedUser[]>([]);
const loading = ref(true);
const pending = ref(false);
const errorMessage = ref("");
const userDialogOpen = ref(false);
const editingUser = ref<ManagedUser | null>(null);
const form = reactive({ name: "", email: "", systemRole: "USER" as "USER" | "ADMIN" });
const userSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email(),
  systemRole: z.enum(["USER", "ADMIN"])
});

async function loadUsers() {
  loading.value = true;
  try {
    users.value = await request<ManagedUser[]>("/users");
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

function editUser(user: ManagedUser) {
  errorMessage.value = "";
  editingUser.value = user;
  Object.assign(form, { name: user.name, email: user.email, systemRole: user.systemRole });
  userDialogOpen.value = true;
}

function isManagedUser(
  value: Record<string, unknown>
): value is ManagedUser & Record<string, unknown> {
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.email === "string" &&
    (value.systemRole === "USER" || value.systemRole === "ADMIN") &&
    typeof value.active === "boolean" &&
    typeof value.createdAt === "string"
  );
}

function editUserRow(row: Record<string, unknown>) {
  if (!isManagedUser(row)) {
    errorMessage.value = "Could not load this user record.";
    return;
  }
  editUser(row);
}

async function saveUser() {
  errorMessage.value = "";
  const parsed = userSchema.safeParse(form);
  if (!parsed.success) {
    errorMessage.value = parsed.error.issues[0]?.message ?? "Check the user details.";
    return;
  }
  if (!editingUser.value) return;

  pending.value = true;
  try {
    await request<ManagedUser>(`/users/${editingUser.value.id}`, {
      method: "PATCH",
      body: {
        ...parsed.data,
        email: parsed.data.email.trim().toLowerCase(),
        ...(editingUser.value.id === currentUser.value?.id
          ? {}
          : { systemRole: parsed.data.systemRole })
      }
    });
    if (editingUser.value.id === currentUser.value?.id && currentUser.value) {
      currentUser.value = {
        ...currentUser.value,
        name: parsed.data.name,
        email: parsed.data.email.trim().toLowerCase()
      };
    }
    userDialogOpen.value = false;
    await loadUsers();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    pending.value = false;
  }
}

async function setUserActiveRow(row: Record<string, unknown>, active: boolean) {
  if (!isManagedUser(row)) {
    errorMessage.value = "Could not load this user record.";
    return;
  }
  const user = row;
  errorMessage.value = "";
  if (!active) {
    try {
      await ElMessageBox.confirm(
        `Deactivate ${user.name} (${user.email})? They will no longer be able to sign in.`,
        "Deactivate user",
        {
          type: "warning",
          confirmButtonText: "Deactivate user",
          cancelButtonText: "Cancel"
        }
      );
    } catch {
      return;
    }
  }
  pending.value = true;
  try {
    await request(`/users/${user.id}`, { method: "PATCH", body: { active } });
    await loadUsers();
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
  } finally {
    pending.value = false;
  }
}

onMounted(loadUsers);
</script>

<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Administration</p>
        <h1 class="page-title">Manage users</h1>
        <p class="muted mt-2 text-sm">
          Review registered accounts, change administrator access, or deactivate accounts.
        </p>
      </div>
    </header>
    <el-alert
      v-if="errorMessage && !userDialogOpen"
      :title="errorMessage"
      type="error"
      show-icon
      class="mb-5!"
    />
    <el-dialog v-model="userDialogOpen" title="Edit user" width="480px" append-to-body>
      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-4" />
      <el-form id="manage-user-form" label-position="top" @submit.prevent="saveUser">
        <el-form-item label="Name">
          <el-input v-model="form.name" maxlength="100" autocomplete="name" />
        </el-form-item>
        <el-form-item label="Email">
          <el-input v-model="form.email" type="email" autocomplete="email" />
        </el-form-item>
        <el-form-item label="System role">
          <el-select
            v-model="form.systemRole"
            class="w-full"
            :disabled="editingUser?.id === currentUser?.id"
          >
            <el-option label="User" value="USER" />
            <el-option label="Administrator" value="ADMIN" />
          </el-select>
          <p v-if="editingUser?.id === currentUser?.id" class="muted mt-1 text-xs">
            You cannot change your own system role.
          </p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="pending" @click="userDialogOpen = false">Cancel</el-button>
        <el-button
          type="primary"
          :icon="Edit"
          native-type="submit"
          form="manage-user-form"
          :loading="pending"
        >
          Save changes
        </el-button>
      </template>
    </el-dialog>
    <el-card shadow="never">
      <template #header>
        <h2 class="section-title">Registered users</h2>
      </template>
      <el-skeleton v-if="loading" :rows="4" animated />
      <el-empty v-else-if="users.length === 0" description="No user accounts found." />
      <el-table v-else :data="users" row-key="id">
        <el-table-column label="User" min-width="220">
          <template #default="{ row }">
            <div class="flex items-center gap-3">
              <el-avatar :size="32">{{ row.name.slice(0, 1).toUpperCase() }}</el-avatar>
              <div class="min-w-0">
                <p class="truncate font-medium">
                  {{ row.name }}
                  <span v-if="row.id === currentUser?.id" class="muted text-xs">(you)</span>
                </p>
                <p class="muted truncate text-xs">{{ row.email }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Role" width="150">
          <template #default="{ row }">
            <el-tag :type="row.systemRole === 'ADMIN' ? 'warning' : 'info'" effect="light">
              {{ row.systemRole === "ADMIN" ? "Administrator" : "User" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Status" width="120">
          <template #default="{ row }">
            <el-tag :type="row.active ? 'success' : 'danger'" effect="light">
              {{ row.active ? "Active" : "Inactive" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Joined" min-width="150">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleDateString() }}</template>
        </el-table-column>
        <el-table-column label="Actions" width="220" fixed="right">
          <template #default="{ row }">
            <div class="flex gap-2">
              <el-button :icon="Edit" @click="editUserRow(row)">Edit</el-button>
              <el-button
                v-if="row.active"
                type="danger"
                :icon="User"
                :disabled="row.id === currentUser?.id"
                :loading="pending"
                @click="setUserActiveRow(row, false)"
              >
                Deactivate
              </el-button>
              <el-button
                v-else
                type="success"
                :icon="Refresh"
                :loading="pending"
                @click="setUserActiveRow(row, true)"
              >
                Reactivate
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

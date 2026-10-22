<script setup lang="ts">
import { Check, Close } from "@element-plus/icons-vue";
import { z } from "zod";

interface BacklogItem {
  id: string;
  identifier: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  estimate: number | null;
  dueDate?: string | null;
  storyRole: string | null;
  storyCapability: string | null;
  storyBenefit: string | null;
  criteria: { id: string; description: string; completed: boolean }[];
  dependencies: { dependsOn: { id: string; title: string; status: string } }[];
  assignee: { id: string; name: string } | null;
}
interface ProjectMember {
  userId: string;
  user: { id: string; name: string; email: string };
}

const props = defineProps<{
  modelValue: boolean;
  projectId: string;
  members: ProjectMember[];
  item: BacklogItem | null;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [];
  error: [message: string];
}>();
const { request } = useApi();
const saving = ref(false);
const errorMessage = ref("");
const estimateOptions = [
  { size: "XS", points: 1 },
  { size: "S", points: 2 },
  { size: "M", points: 4 },
  { size: "L", points: 8 },
  { size: "XL", points: 16 },
  { size: "XXL", points: 32 },
  { size: "XXXL", points: 64 }
];
const form = reactive({
  title: "",
  description: "",
  type: "USER_STORY",
  priority: "MEDIUM",
  estimate: "",
  dueDate: "",
  storyRole: "",
  storyCapability: "",
  storyBenefit: "",
  assigneeId: "",
  acceptanceCriteria: ""
});
const backlogSchema = z.object({
  title: z.string().trim().min(2).max(240),
  description: z.string().max(10000),
  estimate: z
    .string()
    .refine(
      (value) => !value || (Number(value) >= 0 && Number(value) <= 1000),
      "Estimate must be between 0 and 1000."
    )
});

function resetForm(item: BacklogItem | null) {
  Object.assign(form, {
    title: item?.title ?? "",
    description: item?.description ?? "",
    type: item?.type ?? "USER_STORY",
    priority: item?.priority ?? "MEDIUM",
    estimate: item?.estimate?.toString() ?? "",
    dueDate: item?.dueDate?.slice(0, 10) ?? "",
    storyRole: item?.storyRole ?? "",
    storyCapability: item?.storyCapability ?? "",
    storyBenefit: item?.storyBenefit ?? "",
    assigneeId: item?.assignee?.id ?? "",
    acceptanceCriteria: item?.criteria.map((criterion) => criterion.description).join("\n") ?? ""
  });
  errorMessage.value = "";
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm(props.item);
  }
);

async function saveItem() {
  errorMessage.value = "";
  const parsed = backlogSchema.safeParse(form);
  if (!parsed.success) {
    errorMessage.value = parsed.error.issues[0]?.message ?? "Check the backlog item.";
    return;
  }
  saving.value = true;
  try {
    const body = {
      title: form.title.trim(),
      description: form.description,
      type: form.type,
      priority: form.priority,
      estimate: form.estimate ? Number(form.estimate) : undefined,
      dueDate: form.dueDate || (props.item ? null : undefined),
      storyRole: form.storyRole || undefined,
      storyCapability: form.storyCapability || undefined,
      storyBenefit: form.storyBenefit || undefined,
      assigneeId: form.assigneeId || (props.item ? null : undefined),
      acceptanceCriteria: form.acceptanceCriteria
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    };
    if (props.item) {
      await request(`/backlog-items/${props.item.id}`, { method: "PATCH", body });
    } else {
      await request(`/projects/${props.projectId}/backlog`, { method: "POST", body });
    }
    emit("update:modelValue", false);
    emit("saved");
  } catch (error) {
    errorMessage.value = useErrorMessage(error);
    emit("error", errorMessage.value);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="item ? 'Refine backlog item' : 'Create backlog item'"
    width="680px"
    top="5vh"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p class="eyebrow">{{ item?.identifier ?? "Product backlog" }}</p>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon class="mb-4!" />
    <el-form class="form-stack" label-position="top" @submit.prevent="saveItem">
      <el-form-item label="Title">
        <el-input v-model="form.title" maxlength="240" />
      </el-form-item>
      <el-row :gutter="16">
        <el-col :sm="12" :xs="24">
          <el-form-item label="Type">
            <el-select v-model="form.type">
              <el-option
                v-for="type in ['EPIC', 'USER_STORY', 'BUG', 'TECHNICAL_TASK', 'SPIKE']"
                :key="type"
                :label="type.replaceAll('_', ' ')"
                :value="type"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :sm="12" :xs="24">
          <el-form-item label="Priority">
            <el-select v-model="form.priority">
              <el-option
                v-for="priority in ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']"
                :key="priority"
                :label="priority"
                :value="priority"
              />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="Description">
        <el-input v-model="form.description" type="textarea" :rows="4" maxlength="10000" />
      </el-form-item>
      <template v-if="form.type === 'USER_STORY'">
        <el-row :gutter="16">
          <el-col :sm="12" :xs="24">
            <el-form-item label="As a…">
              <el-input v-model="form.storyRole" placeholder="team member" />
            </el-form-item>
          </el-col>
          <el-col :sm="12" :xs="24">
            <el-form-item label="I want…">
              <el-input v-model="form.storyCapability" placeholder="to organize my work" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="So that…">
          <el-input v-model="form.storyBenefit" placeholder="I can focus on the next step" />
        </el-form-item>
      </template>
      <el-form-item label="Estimate (T-shirt size)">
        <el-select v-model="form.estimate" placeholder="Select an estimate" clearable>
          <el-option
            v-for="estimate in estimateOptions"
            :key="estimate.size"
            :label="`${estimate.size} (${estimate.points} ${estimate.points === 1 ? 'point' : 'points'})`"
            :value="String(estimate.points)"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="Due date">
        <el-date-picker
          v-model="form.dueDate"
          type="date"
          value-format="YYYY-MM-DD"
          format="MMM D, YYYY"
          placeholder="Select a due date"
          clearable
          class="w-full"
        />
      </el-form-item>
      <el-form-item label="Assignee">
        <el-select
          v-model="form.assigneeId"
          clearable
          filterable
          placeholder="Unassigned"
          aria-label="Backlog item assignee"
        >
          <el-option
            v-for="member in members"
            :key="member.userId"
            :label="member.user.name"
            :value="member.userId"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="Acceptance criteria (one criterion per line)">
        <el-input
          v-model="form.acceptanceCriteria"
          type="textarea"
          :rows="4"
          placeholder="Given… When… Then…"
        />
      </el-form-item>
      <slot name="details" :item="item" />
    </el-form>
    <template #footer>
      <el-button :icon="Close" @click="emit('update:modelValue', false)">Cancel</el-button>
      <el-button type="primary" :icon="Check" :loading="saving" @click="saveItem">
        {{ item ? "Save changes" : "Add to backlog" }}
      </el-button>
    </template>
  </el-dialog>
</template>

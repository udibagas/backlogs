import {
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Max,
  Matches,
  Min
} from "class-validator";
import {
  BacklogStatus,
  BacklogType,
  Methodology,
  Priority,
  ProjectStatus,
  ProjectRole,
  SprintEventType,
  TaskStatus
} from "../generated/prisma/client";

export class CreateOrganizationDto {
  @IsString()
  @Length(2, 100)
  name!: string;
}

export class CreateProjectDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(2, 8)
  @Matches(/^[a-zA-Z0-9]+$/)
  key!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsEnum(Methodology)
  methodology?: Methodology;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  defaultSprintDuration?: number;
}

export class CreateBacklogDto {
  @IsString()
  @Length(2, 240)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  description?: string;

  @IsEnum(BacklogType)
  type!: BacklogType;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsEnum(BacklogStatus)
  status?: BacklogStatus;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  storyRole?: string;

  @IsOptional()
  @IsString()
  @Length(1, 240)
  storyCapability?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  storyBenefit?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  businessValue?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(1000)
  estimate?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  acceptanceCriteria?: string[];
}

export class UpdateBacklogDto {
  @IsOptional()
  @IsString()
  @Length(2, 240)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  description?: string;

  @IsOptional()
  @IsEnum(BacklogType)
  type?: BacklogType;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsEnum(BacklogStatus)
  status?: BacklogStatus;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  storyRole?: string;

  @IsOptional()
  @IsString()
  @Length(1, 240)
  storyCapability?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  storyBenefit?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  businessValue?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(1000)
  estimate?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  acceptanceCriteria?: string[];
}

export class CreateSprintDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  goal?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class AddSprintItemDto {
  @IsUUID()
  backlogItemId!: string;
}

export class CompleteSprintDto {
  @IsOptional()
  @IsString()
  @Length(0, 5000)
  outcome?: string;
}

export class CreateTaskDto {
  @IsString()
  @Length(2, 240)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  description?: string;

  @IsOptional()
  @IsUUID()
  backlogItemId?: string;

  @IsOptional()
  @IsUUID()
  sprintId?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(1000)
  estimate?: number;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @Length(2, 240)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(1000)
  estimate?: number;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class CreateCommentDto {
  @IsOptional()
  @IsUUID()
  backlogItemId?: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsString()
  @Length(1, 5000)
  body!: string;
}

export class CreateDependencyDto {
  @IsUUID()
  dependsOnId!: string;
}

export class ListBacklogQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(BacklogStatus)
  status?: BacklogStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsEnum(BacklogType)
  type?: BacklogType;

  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class BacklogStatusDto {
  @IsEnum(BacklogStatus)
  status!: BacklogStatus;
}

export class AddProjectMemberDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsEnum(ProjectRole)
  role!: ProjectRole;
}

export class UpdateWorkflowColumnDto {
  @IsOptional()
  @IsString()
  @Length(2, 60)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  wipLimit?: number;

  @IsOptional()
  @IsBoolean()
  hardLimit?: boolean;
}

export class CreateSprintEventDto {
  @IsEnum(SprintEventType)
  type!: SprintEventType;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  notes?: string;

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  feedback?: string;
}

export class CreateRetrospectiveActionDto {
  @IsString()
  @Length(2, 2000)
  description!: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateRetrospectiveActionDto {
  @IsBoolean()
  completed!: boolean;
}

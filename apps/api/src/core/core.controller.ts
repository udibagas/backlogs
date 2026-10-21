import {
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  Param,
  ParseIntPipe,
  Patch,
  ParseEnumPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
  UseGuards
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  AddProjectMemberDto,
  AddSprintItemDto,
  BacklogStatusDto,
  CompleteSprintDto,
  CreateBacklogDto,
  CreateCommentDto,
  CreateDependencyDto,
  CreateOrganizationDto,
  CreateProjectDto,
  CreateRetrospectiveActionDto,
  CreateSprintEventDto,
  CreateSprintDto,
  CreateTaskDto,
  ListBacklogQuery,
  UpdateBacklogDto,
  UpdateOrganizationDto,
  UpdateProjectDto,
  UpdateRetrospectiveActionDto,
  UpdateSprintDto,
  UpdateTaskDto,
  UpdateWorkflowColumnDto
} from "./core.dto";
import { CoreService } from "./core.service";
import { BacklogStatus } from "../generated/prisma/client";

@ApiTags("Agile workspace")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CoreController {
  constructor(private readonly core: CoreService) {}

  @Get("organizations")
  organizations(@CurrentUser() user: AuthUser) {
    return this.core.organizations(user.sub);
  }

  @Post("organizations")
  createOrganization(@CurrentUser() user: AuthUser, @Body() dto: CreateOrganizationDto) {
    return this.core.createOrganization(user.sub, dto);
  }

  @Patch("organizations/:organizationId")
  updateOrganization(
    @CurrentUser() user: AuthUser,
    @Param("organizationId") organizationId: string,
    @Body() dto: UpdateOrganizationDto
  ) {
    return this.core.updateOrganization(user.sub, organizationId, dto);
  }

  @Delete("organizations/:organizationId")
  deleteOrganization(@CurrentUser() user: AuthUser, @Param("organizationId") organizationId: string) {
    return this.core.deleteOrganization(user.sub, organizationId);
  }

  @Get("projects")
  projects(@CurrentUser() user: AuthUser) {
    return this.core.projects(user.sub);
  }

  @Post("organizations/:organizationId/projects")
  createProject(
    @CurrentUser() user: AuthUser,
    @Param("organizationId") organizationId: string,
    @Body() dto: CreateProjectDto
  ) {
    return this.core.createProject(user.sub, organizationId, dto);
  }

  @Get("projects/:projectId")
  project(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.core.project(user.sub, projectId);
  }

  @Patch("projects/:projectId")
  updateProject(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Body() dto: UpdateProjectDto
  ) {
    return this.core.updateProject(user.sub, projectId, dto);
  }

  @Delete("projects/:projectId")
  archiveProject(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.core.archiveProject(user.sub, projectId);
  }

  @Patch("projects/:projectId/workflow/:status")
  updateWorkflowColumn(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("status", new ParseEnumPipe(BacklogStatus)) status: BacklogStatus,
    @Body() dto: UpdateWorkflowColumnDto
  ) {
    return this.core.updateWorkflowColumn(user.sub, projectId, status, dto);
  }

  @Get("projects/:projectId/members")
  projectMembers(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.core.projectMembers(user.sub, projectId);
  }

  @Post("projects/:projectId/members")
  addProjectMember(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Body() dto: AddProjectMemberDto
  ) {
    return this.core.addProjectMember(user.sub, projectId, dto);
  }

  @Delete("projects/:projectId/members/:memberUserId")
  removeProjectMember(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("memberUserId") memberUserId: string
  ) {
    return this.core.removeProjectMember(user.sub, projectId, memberUserId);
  }

  @Get("projects/:projectId/backlog")
  backlog(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Query() query: ListBacklogQuery
  ) {
    return this.core.backlog(user.sub, projectId, query);
  }

  @Get("backlog-items/:itemId")
  backlogItem(@CurrentUser() user: AuthUser, @Param("itemId") itemId: string) {
    return this.core.backlogItem(user.sub, itemId);
  }

  @Post("projects/:projectId/backlog")
  createBacklogItem(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Body() dto: CreateBacklogDto
  ) {
    return this.core.createBacklogItem(user.sub, projectId, dto);
  }

  @Patch("backlog-items/:itemId")
  updateBacklogItem(
    @CurrentUser() user: AuthUser,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateBacklogDto
  ) {
    return this.core.updateBacklogItem(user.sub, itemId, dto);
  }

  @Delete("backlog-items/:itemId")
  archiveBacklogItem(@CurrentUser() user: AuthUser, @Param("itemId") itemId: string) {
    return this.core.archiveBacklogItem(user.sub, itemId);
  }

  @Post("backlog-items/:itemId/dependencies")
  addDependency(
    @CurrentUser() user: AuthUser,
    @Param("itemId") itemId: string,
    @Body() dto: CreateDependencyDto
  ) {
    return this.core.addDependency(user.sub, itemId, dto);
  }

  @Delete("backlog-items/:itemId/dependencies/:dependsOnId")
  removeDependency(
    @CurrentUser() user: AuthUser,
    @Param("itemId") itemId: string,
    @Param("dependsOnId") dependsOnId: string
  ) {
    return this.core.removeDependency(user.sub, itemId, dependsOnId);
  }

  @Get("projects/:projectId/sprints")
  sprints(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.core.sprints(user.sub, projectId);
  }

  @Post("projects/:projectId/sprints")
  createSprint(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Body() dto: CreateSprintDto
  ) {
    return this.core.createSprint(user.sub, projectId, dto);
  }

  @Patch("sprints/:sprintId")
  updateSprint(
    @CurrentUser() user: AuthUser,
    @Param("sprintId") sprintId: string,
    @Body() dto: UpdateSprintDto
  ) {
    return this.core.updateSprint(user.sub, sprintId, dto);
  }

  @Delete("sprints/:sprintId")
  deleteSprint(@CurrentUser() user: AuthUser, @Param("sprintId") sprintId: string) {
    return this.core.deleteSprint(user.sub, sprintId);
  }

  @Post("sprints/:sprintId/events")
  createSprintEvent(
    @CurrentUser() user: AuthUser,
    @Param("sprintId") sprintId: string,
    @Body() dto: CreateSprintEventDto
  ) {
    return this.core.createSprintEvent(user.sub, sprintId, dto);
  }

  @Post("sprints/:sprintId/retrospective-actions")
  createRetrospectiveAction(
    @CurrentUser() user: AuthUser,
    @Param("sprintId") sprintId: string,
    @Body() dto: CreateRetrospectiveActionDto
  ) {
    return this.core.createRetrospectiveAction(user.sub, sprintId, dto);
  }

  @Patch("retrospective-actions/:actionId")
  updateRetrospectiveAction(
    @CurrentUser() user: AuthUser,
    @Param("actionId") actionId: string,
    @Body() dto: UpdateRetrospectiveActionDto
  ) {
    return this.core.updateRetrospectiveAction(user.sub, actionId, dto);
  }

  @Post("sprints/:sprintId/items")
  addSprintItem(
    @CurrentUser() user: AuthUser,
    @Param("sprintId") sprintId: string,
    @Body() dto: AddSprintItemDto
  ) {
    return this.core.addSprintItem(user.sub, sprintId, dto);
  }

  @Delete("sprints/:sprintId/items/:itemId")
  removeSprintItem(
    @CurrentUser() user: AuthUser,
    @Param("sprintId") sprintId: string,
    @Param("itemId") itemId: string
  ) {
    return this.core.removeSprintItem(user.sub, sprintId, itemId);
  }

  @Post("sprints/:sprintId/start")
  startSprint(@CurrentUser() user: AuthUser, @Param("sprintId") sprintId: string) {
    return this.core.startSprint(user.sub, sprintId);
  }

  @Post("sprints/:sprintId/complete")
  completeSprint(
    @CurrentUser() user: AuthUser,
    @Param("sprintId") sprintId: string,
    @Body() dto: CompleteSprintDto
  ) {
    return this.core.completeSprint(user.sub, sprintId, dto);
  }

  @Get("projects/:projectId/board")
  board(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.core.kanbanBoard(user.sub, projectId);
  }

  @Patch("backlog-items/:itemId/status")
  moveBacklogItem(
    @CurrentUser() user: AuthUser,
    @Param("itemId") itemId: string,
    @Body() dto: BacklogStatusDto
  ) {
    return this.core.moveBacklogItem(user.sub, itemId, dto.status);
  }

  @Get("projects/:projectId/tasks")
  tasks(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.core.tasks(user.sub, projectId);
  }

  @Post("projects/:projectId/tasks")
  createTask(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Body() dto: CreateTaskDto
  ) {
    return this.core.createTask(user.sub, projectId, dto);
  }

  @Patch("tasks/:taskId")
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param("taskId") taskId: string,
    @Body() dto: UpdateTaskDto
  ) {
    return this.core.updateTask(user.sub, taskId, dto);
  }

  @Delete("tasks/:taskId")
  deleteTask(@CurrentUser() user: AuthUser, @Param("taskId") taskId: string) {
    return this.core.deleteTask(user.sub, taskId);
  }

  @Get("projects/:projectId/reports")
  reports(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.core.reports(user.sub, projectId);
  }

  @Get("projects/:projectId/activity")
  activities(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number
  ) {
    return this.core.activities(user.sub, projectId, page);
  }

  @Get("projects/:projectId/items/:entityId/comments")
  comments(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("entityId") entityId: string
  ) {
    return this.core.comments(user.sub, projectId, entityId);
  }

  @Post("projects/:projectId/comments")
  addComment(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Body() dto: CreateCommentDto
  ) {
    return this.core.addComment(user.sub, projectId, dto);
  }

  @Post("projects/:projectId/comments/with-attachments")
  @UseInterceptors(
    FilesInterceptor("attachments", 5, {
      limits: { fileSize: 10 * 1024 * 1024, files: 5 }
    })
  )
  addCommentWithAttachments(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Body() dto: CreateCommentDto,
    @UploadedFiles() files: UploadedAttachment[]
  ) {
    return this.core.addCommentWithAttachments(user.sub, projectId, dto, files ?? []);
  }

  @Get("projects/:projectId/comments/:commentId/attachments/:attachmentId")
  async downloadCommentAttachment(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("commentId") commentId: string,
    @Param("attachmentId") attachmentId: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const attachment = await this.core.commentAttachment(
      user.sub,
      projectId,
      commentId,
      attachmentId
    );
    try {
      await stat(attachment.filePath);
    } catch {
      throw new InternalServerErrorException("Attachment file is unavailable");
    }
    const safeName = basename(attachment.originalName).replace(/[\r\n"]/g, "_");
    const encodedName = encodeURIComponent(safeName).replace(/'/g, "%27");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodedName}`
    );
    response.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    response.setHeader("Content-Length", attachment.size);
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(createReadStream(attachment.filePath));
  }
}

interface UploadedAttachment {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

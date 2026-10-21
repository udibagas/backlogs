import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  BacklogStatus,
  Methodology,
  OrganizationRole,
  Priority,
  ProjectRole,
  ProjectStatus,
  SprintStatus,
  TaskStatus
} from "../generated/prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaService } from "../prisma/prisma.service";
import type {
  AddProjectMemberDto,
  AddSprintItemDto,
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
  UpdateOrganizationDto,
  UpdateRetrospectiveActionDto,
  UpdateBacklogDto,
  UpdateProjectDto,
  UpdateSprintDto,
  UpdateTaskDto,
  UpdateWorkflowColumnDto
} from "./core.dto";
import { createsDependencyCycle, isValidDateRange } from "./core.rules";

const managerRoles: ProjectRole[] = [
  ProjectRole.MANAGER,
  ProjectRole.PRODUCT_OWNER,
  ProjectRole.SCRUM_MASTER
];
const defaultColumns = [
  { name: "Backlog", status: BacklogStatus.BACKLOG, position: 0 },
  { name: "Ready", status: BacklogStatus.READY, position: 1 },
  { name: "In Progress", status: BacklogStatus.IN_PROGRESS, position: 2, wipLimit: 3 },
  { name: "In Review", status: BacklogStatus.IN_REVIEW, position: 3 },
  { name: "Testing", status: BacklogStatus.TESTING, position: 4 },
  { name: "Done", status: BacklogStatus.DONE, position: 5 }
];

interface UploadedAttachment {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class CoreService {
  constructor(private readonly prisma: PrismaService) {}

  async organizations(userId: string) {
    return this.prisma.organization.findMany({
      where: { memberships: { some: { userId } } },
      orderBy: { name: "asc" },
      include: {
        memberships: {
          where: { userId },
          select: { role: true }
        },
        _count: { select: { projects: true } }
      }
    });
  }

  async createOrganization(userId: string, dto: CreateOrganizationDto) {
    const slug = `${dto.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48)}-${randomUUID().slice(0, 8)}`;
    return this.prisma.organization.create({
      data: {
        name: dto.name.trim(),
        slug,
        memberships: { create: { userId, role: OrganizationRole.OWNER } }
      },
      include: { memberships: { where: { userId }, select: { role: true } } }
    });
  }

  async updateOrganization(
    userId: string,
    organizationId: string,
    dto: UpdateOrganizationDto
  ) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } }
    });
    if (!membership) throw new NotFoundException("Organization not found");
    if (membership.role !== OrganizationRole.OWNER && membership.role !== OrganizationRole.ADMIN) {
      throw new ForbiddenException("Only organization owners and admins can update the organization");
    }
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { name: dto.name.trim() },
      include: {
        memberships: { where: { userId }, select: { role: true } },
        _count: { select: { projects: true } }
      }
    });
  }

  async deleteOrganization(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } }
    });
    if (!membership) throw new NotFoundException("Organization not found");
    if (membership.role !== OrganizationRole.OWNER) {
      throw new ForbiddenException("Only organization owners can delete the organization");
    }
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { _count: { select: { projects: true } } }
    });
    if (organization._count.projects > 0) {
      throw new ConflictException("Organizations with projects cannot be deleted");
    }
    await this.prisma.organization.delete({ where: { id: organizationId } });
    return { success: true };
  }

  async projects(userId: string) {
    const projects = await this.prisma.project.findMany({
      where: {
        status: ProjectStatus.ACTIVE,
        OR: [
          { memberships: { some: { userId } } },
          {
            organization: {
              memberships: {
                some: { userId, role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] } }
              }
            }
          }
        ]
      },
      orderBy: { updatedAt: "desc" },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            memberships: { where: { userId }, select: { role: true } }
          }
        },
        memberships: { where: { userId }, select: { role: true } },
        _count: { select: { backlogItems: true, sprints: true, tasks: true } }
      }
    });
    return projects.map(({ memberships, organization, ...project }) => {
      const organizationRole = organization.memberships[0]?.role;
      const canManage =
        managerRoles.includes(memberships[0]?.role ?? ProjectRole.VIEWER) ||
        organizationRole === OrganizationRole.OWNER ||
        organizationRole === OrganizationRole.ADMIN;
      return {
        ...project,
        organization: { id: organization.id, name: organization.name },
        canManage
      };
    });
  }

  async createProject(userId: string, organizationId: string, dto: CreateProjectDto) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } }
    });
    if (
      !membership ||
      (membership.role !== OrganizationRole.OWNER && membership.role !== OrganizationRole.ADMIN)
    ) {
      throw new ForbiddenException("Only organization owners and admins can create projects");
    }
    const key = dto.key.trim().toUpperCase();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            organizationId,
            name: dto.name.trim(),
            key,
            description: dto.description?.trim() ?? "",
            methodology: dto.methodology ?? Methodology.SCRUM,
            memberships: { create: { userId, role: ProjectRole.MANAGER } },
            workflowColumns: { create: defaultColumns }
          }
        });
        await tx.activity.create({
          data: {
            projectId: project.id,
            actorId: userId,
            action: "project.created",
            entityType: "Project",
            entityId: project.id,
            details: { name: project.name }
          }
        });
        return project;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error))
        throw new ConflictException("Project key already exists in this organization");
      throw error;
    }
  }

  async project(userId: string, projectId: string) {
    const { role } = await this.projectAccess(userId, projectId);
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: {
        organization: { select: { id: true, name: true } },
        workflowColumns: { orderBy: { position: "asc" } },
        _count: { select: { backlogItems: true, sprints: true, tasks: true } }
      }
    });
    return { ...project, currentRole: role };
  }

  async updateProject(userId: string, projectId: string, dto: UpdateProjectDto) {
    const { role } = await this.projectAccess(userId, projectId);
    this.requireManager(role);
    const before = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.project.update({
          where: { id: projectId },
          data: {
            ...dto,
            name: dto.name?.trim(),
            key: dto.key?.trim().toUpperCase(),
            description: dto.description?.trim()
          }
        });
        await tx.activity.create({
          data: {
            projectId,
            actorId: userId,
            action: "project.updated",
            entityType: "Project",
            entityId: projectId,
            details: { changed: Object.keys(dto), previousName: before.name }
          }
        });
        return updated;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error))
        throw new ConflictException("Project key already exists in this organization");
      throw error;
    }
  }

  async archiveProject(userId: string, projectId: string) {
    const { role } = await this.projectAccess(userId, projectId);
    this.requireManager(role);
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id: projectId },
        data: { status: ProjectStatus.ARCHIVED }
      });
      await tx.activity.create({
        data: {
          projectId,
          actorId: userId,
          action: "project.archived",
          entityType: "Project",
          entityId: projectId,
          details: { name: project.name }
        }
      });
      return project;
    });
  }

  async updateWorkflowColumn(
    userId: string,
    projectId: string,
    status: BacklogStatus,
    dto: UpdateWorkflowColumnDto
  ) {
    const { role } = await this.projectAccess(userId, projectId);
    this.requireManager(role);
    if (dto.hardLimit && dto.wipLimit === undefined) {
      const existing = await this.prisma.workflowColumn.findUnique({
        where: { projectId_status: { projectId, status } }
      });
      if (dto.wipLimit === undefined && existing?.wipLimit == null) {
        throw new BadRequestException("Set a WIP limit before enabling a hard limit");
      }
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: { concurrencyVersion: { increment: 1 } }
      });
      return tx.workflowColumn.update({
        where: { projectId_status: { projectId, status } },
        data: { ...dto, name: dto.name?.trim() }
      });
    });
  }

  async projectMembers(userId: string, projectId: string) {
    await this.projectAccess(userId, projectId);
    return this.prisma.projectMembership.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } }
    });
  }

  async addProjectMember(userId: string, projectId: string, dto: AddProjectMemberDto) {
    const { role: actorRole, project } = await this.projectAccess(userId, projectId);
    this.requireManager(actorRole);
    if (Boolean(dto.userId) === Boolean(dto.email)) {
      throw new BadRequestException("Provide exactly one of userId or email");
    }
    const account = dto.email
      ? await this.prisma.user.findUnique({
          where: { email: dto.email.trim().toLowerCase() },
          select: { id: true, active: true }
        })
      : null;
    const memberUserId = account?.id ?? dto.userId;
    if (!memberUserId) throw new NotFoundException("No account found with this email");
    if (dto.email && !account?.active)
      throw new NotFoundException("No active account found with this email");
    return this.prisma.$transaction(async (tx) => {
      await tx.organizationMembership.upsert({
        where: {
          organizationId_userId: {
            organizationId: project.organizationId,
            userId: memberUserId
          }
        },
        create: {
          organizationId: project.organizationId,
          userId: memberUserId,
          role: OrganizationRole.MEMBER
        },
        update: {}
      });
      const member = await tx.projectMembership.upsert({
        where: { projectId_userId: { projectId, userId: memberUserId } },
        create: { projectId, userId: memberUserId, role: dto.role },
        update: { role: dto.role },
        include: { user: { select: { id: true, name: true, email: true } } }
      });
      await tx.activity.create({
        data: {
          projectId,
          actorId: userId,
          action: "project.member_added",
          entityType: "ProjectMembership",
          entityId: member.id,
          details: { memberId: member.userId, role: member.role }
        }
      });
      return member;
    });
  }

  async removeProjectMember(userId: string, projectId: string, memberUserId: string) {
    const { role } = await this.projectAccess(userId, projectId);
    this.requireManager(role);
    if (userId === memberUserId)
      throw new BadRequestException("You cannot remove yourself from the project");
    const member = await this.prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId, userId: memberUserId } }
    });
    if (!member) throw new NotFoundException("Project member not found");
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: { concurrencyVersion: { increment: 1 } }
      });
      await tx.backlogItem.updateMany({
        where: { projectId, assigneeId: memberUserId },
        data: { assigneeId: null }
      });
      await tx.task.updateMany({
        where: { projectId, assigneeId: memberUserId },
        data: { assigneeId: null }
      });
      await tx.projectMembership.delete({ where: { id: member.id } });
      await tx.activity.create({
        data: {
          projectId,
          actorId: userId,
          action: "project.member_removed",
          entityType: "ProjectMembership",
          entityId: member.id,
          details: { memberId: memberUserId }
        }
      });
    });
    return { removed: true };
  }

  async backlog(userId: string, projectId: string, query: ListBacklogQuery) {
    await this.projectAccess(userId, projectId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const where = {
      projectId,
      archivedAt: null,
      ...(query.status && { status: query.status }),
      ...(query.priority && { priority: query.priority }),
      ...(query.type && { type: query.type }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: "insensitive" as const } },
          { description: { contains: query.search, mode: "insensitive" as const } }
        ]
      })
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.backlogItem.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ priority: "asc" }, { itemNumber: "asc" }],
        include: {
          project: { select: { key: true } },
          assignee: { select: { id: true, name: true } },
          criteria: { orderBy: { order: "asc" } },
          dependencies: {
            include: {
              dependsOn: { select: { id: true, itemNumber: true, title: true, status: true } }
            }
          },
          _count: { select: { tasks: true, comments: true } }
        }
      }),
      this.prisma.backlogItem.count({ where })
    ]);
    return {
      data: items.map((item) => ({
        ...item,
        identifier: `${item.project.key}-${item.itemNumber}`
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    };
  }

  async backlogItem(userId: string, itemId: string) {
    const item = await this.prisma.backlogItem.findFirst({
      where: { id: itemId, archivedAt: null },
      include: {
        project: { select: { key: true } },
        assignee: { select: { id: true, name: true } },
        criteria: { orderBy: { order: "asc" } },
        parent: { select: { id: true, itemNumber: true, title: true, status: true } },
        children: {
          where: { archivedAt: null },
          orderBy: { itemNumber: "asc" },
          select: { id: true, itemNumber: true, title: true, status: true, type: true }
        },
        dependencies: {
          include: {
            dependsOn: { select: { id: true, itemNumber: true, title: true, status: true } }
          }
        },
        dependedOnBy: {
          include: {
            item: { select: { id: true, itemNumber: true, title: true, status: true } }
          }
        },
        tasks: {
          orderBy: { createdAt: "asc" },
          include: { assignee: { select: { id: true, name: true } } }
        },
        _count: { select: { comments: true } }
      }
    });
    if (!item) throw new NotFoundException("Backlog item not found");
    await this.projectAccess(userId, item.projectId);
    return { ...item, identifier: `${item.project.key}-${item.itemNumber}` };
  }

  async createBacklogItem(userId: string, projectId: string, dto: CreateBacklogDto) {
    const { role } = await this.projectAccess(userId, projectId);
    this.requireEditor(role);
    if (
      dto.priority &&
      dto.priority !== Priority.MEDIUM &&
      role !== ProjectRole.PRODUCT_OWNER &&
      role !== ProjectRole.MANAGER
    ) {
      throw new ForbiddenException("Only the Product Owner or Project Manager can set priority");
    }
    await this.validateParent(projectId, dto.parentId);
    await this.validateProjectUser(projectId, dto.assigneeId);
    const item = await this.prisma.$transaction(
      async (tx) => {
        const sequence = await tx.project.update({
          where: { id: projectId },
          data: { nextItemNumber: { increment: 1 } },
          select: { nextItemNumber: true }
        });
        const created = await tx.backlogItem.create({
          data: {
            projectId,
            itemNumber: sequence.nextItemNumber,
            title: dto.title.trim(),
            description: dto.description?.trim() ?? "",
            type: dto.type,
            priority: dto.priority ?? Priority.MEDIUM,
            status: dto.status ?? BacklogStatus.BACKLOG,
            storyRole: dto.storyRole,
            storyCapability: dto.storyCapability,
            storyBenefit: dto.storyBenefit,
            businessValue: dto.businessValue,
            estimate: dto.estimate,
            labels: dto.labels?.map((label) => label.trim()).filter(Boolean) ?? [],
            parentId: dto.parentId,
            reporterId: userId,
            assigneeId: dto.assigneeId,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
            criteria: dto.acceptanceCriteria
              ? {
                  create: dto.acceptanceCriteria.map((description, order) => ({
                    description,
                    order
                  }))
                }
              : undefined
          },
          include: { project: { select: { key: true } }, criteria: { orderBy: { order: "asc" } } }
        });
        await tx.activity.create({
          data: {
            projectId,
            actorId: userId,
            action: "backlog.created",
            entityType: "BacklogItem",
            entityId: created.id,
            details: { itemNumber: created.itemNumber, title: created.title }
          }
        });
        return created;
      },
      { isolationLevel: "Serializable" }
    );
    return { ...item, identifier: `${item.project.key}-${item.itemNumber}` };
  }

  async updateBacklogItem(userId: string, itemId: string, dto: UpdateBacklogDto) {
    const item = await this.prisma.backlogItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException("Backlog item not found");
    const { role } = await this.projectAccess(userId, item.projectId);
    this.requireEditor(role);
    if (
      dto.priority &&
      dto.priority !== item.priority &&
      role !== ProjectRole.PRODUCT_OWNER &&
      role !== ProjectRole.MANAGER
    ) {
      throw new ForbiddenException("Only the Product Owner or Project Manager can set priority");
    }
    await this.validateProjectUser(item.projectId, dto.assigneeId);
    const changed = Object.keys(dto);
    const { acceptanceCriteria, ...fields } = dto;
    return this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: item.projectId },
        data: { concurrencyVersion: { increment: 1 } }
      });
      const current = await tx.backlogItem.findUnique({ where: { id: itemId } });
      if (!current) throw new NotFoundException("Backlog item not found");
      await this.validateParent(item.projectId, dto.parentId, current.id);
      if (dto.status && dto.status !== current.status) {
        const column = await tx.workflowColumn.findUnique({
          where: { projectId_status: { projectId: item.projectId, status: dto.status } }
        });
        if (column?.hardLimit && column.wipLimit !== null) {
          const count = await tx.backlogItem.count({
            where: {
              projectId: item.projectId,
              status: dto.status,
              archivedAt: null,
              id: { not: item.id }
            }
          });
          if (count >= column.wipLimit) {
            throw new ConflictException(
              `The ${column.name} column is at its WIP limit of ${column.wipLimit}`
            );
          }
        }
      }
      const updated = await tx.backlogItem.update({
        where: { id: itemId },
        data: {
          ...fields,
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          labels: dto.labels?.map((label) => label.trim()).filter(Boolean),
          dueDate: dto.dueDate === null ? null : dto.dueDate ? new Date(dto.dueDate) : undefined
        },
        include: { project: { select: { key: true } }, criteria: { orderBy: { order: "asc" } } }
      });
      if (acceptanceCriteria) {
        await tx.acceptanceCriterion.deleteMany({ where: { backlogItemId: itemId } });
        await tx.acceptanceCriterion.createMany({
          data: acceptanceCriteria
            .map((description) => description.trim())
            .filter(Boolean)
            .map((description, order) => ({ backlogItemId: itemId, description, order }))
        });
      }
      await tx.activity.create({
        data: {
          projectId: item.projectId,
          actorId: userId,
          action: "backlog.updated",
          entityType: "BacklogItem",
          entityId: item.id,
          details: { changed, previousStatus: current.status, status: updated.status }
        }
      });
      const criteria = acceptanceCriteria
        ? await tx.acceptanceCriterion.findMany({
            where: { backlogItemId: itemId },
            orderBy: { order: "asc" }
          })
        : updated.criteria;
      return { ...updated, criteria, identifier: `${updated.project.key}-${updated.itemNumber}` };
    });
  }

  async archiveBacklogItem(userId: string, itemId: string) {
    const item = await this.prisma.backlogItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException("Backlog item not found");
    const { role } = await this.projectAccess(userId, item.projectId);
    this.requireManager(role);
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: item.projectId },
        data: { concurrencyVersion: { increment: 1 } }
      });
      await tx.backlogItem.update({ where: { id: item.id }, data: { archivedAt: new Date() } });
      await tx.activity.create({
        data: {
          projectId: item.projectId,
          actorId: userId,
          action: "backlog.archived",
          entityType: "BacklogItem",
          entityId: item.id
        }
      });
    });
    return { archived: true };
  }

  async addDependency(userId: string, itemId: string, dto: CreateDependencyDto) {
    const item = await this.prisma.backlogItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException("Backlog item not found");
    const { role } = await this.projectAccess(userId, item.projectId);
    this.requireEditor(role);
    return this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: item.projectId },
        data: { concurrencyVersion: { increment: 1 } }
      });
      const target = await tx.backlogItem.findFirst({
        where: { id: dto.dependsOnId, projectId: item.projectId, archivedAt: null }
      });
      if (!target)
        throw new BadRequestException("Dependency must be an active item in the same project");
      const edges = await tx.backlogDependency.findMany({
        where: { item: { projectId: item.projectId } },
        select: { itemId: true, dependsOnId: true }
      });
      if (createsDependencyCycle(itemId, dto.dependsOnId, edges)) {
        throw new BadRequestException("This dependency would create a cycle");
      }
      const dependency = await tx.backlogDependency.create({
        data: { itemId, dependsOnId: dto.dependsOnId }
      });
      await tx.activity.create({
        data: {
          projectId: item.projectId,
          actorId: userId,
          action: "backlog.dependency_added",
          entityType: "BacklogItem",
          entityId: itemId,
          details: { dependsOnId: dto.dependsOnId }
        }
      });
      return dependency;
    });
  }

  async removeDependency(userId: string, itemId: string, dependsOnId: string) {
    const item = await this.prisma.backlogItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException("Backlog item not found");
    const { role } = await this.projectAccess(userId, item.projectId);
    this.requireEditor(role);
    await this.prisma.backlogDependency.deleteMany({ where: { itemId, dependsOnId } });
    return { removed: true };
  }

  async sprints(userId: string, projectId: string) {
    await this.projectAccess(userId, projectId);
    return this.prisma.sprint.findMany({
      where: { projectId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { items: true } },
        items: {
          include: {
            backlogItem: { select: { id: true, title: true, status: true, estimate: true } }
          }
        },
        events: { orderBy: { startsAt: "asc" } },
        actions: { orderBy: { createdAt: "asc" } }
      }
    });
  }

  async createSprintEvent(userId: string, sprintId: string, dto: CreateSprintEventDto) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException("Sprint not found");
    const { role } = await this.projectAccess(userId, sprint.projectId);
    this.requireEditor(role);
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.sprintEvent.create({
        data: {
          sprintId,
          type: dto.type,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
          notes: dto.notes?.trim() ?? "",
          feedback: dto.feedback?.trim() ?? ""
        }
      });
      await tx.activity.create({
        data: {
          projectId: sprint.projectId,
          actorId: userId,
          action: `sprint_event.${dto.type.toLowerCase()}`,
          entityType: "SprintEvent",
          entityId: event.id
        }
      });
      return event;
    });
  }

  async createRetrospectiveAction(
    userId: string,
    sprintId: string,
    dto: CreateRetrospectiveActionDto
  ) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException("Sprint not found");
    const { role } = await this.projectAccess(userId, sprint.projectId);
    this.requireEditor(role);
    await this.validateProjectUser(sprint.projectId, dto.assigneeId);
    return this.prisma.$transaction(async (tx) => {
      const action = await tx.retrospectiveAction.create({
        data: {
          sprintId,
          description: dto.description.trim(),
          assigneeId: dto.assigneeId,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined
        }
      });
      await tx.activity.create({
        data: {
          projectId: sprint.projectId,
          actorId: userId,
          action: "retrospective.action_created",
          entityType: "RetrospectiveAction",
          entityId: action.id
        }
      });
      return action;
    });
  }

  async updateRetrospectiveAction(
    userId: string,
    actionId: string,
    dto: UpdateRetrospectiveActionDto
  ) {
    const action = await this.prisma.retrospectiveAction.findUnique({
      where: { id: actionId },
      include: { sprint: { select: { projectId: true } } }
    });
    if (!action) throw new NotFoundException("Retrospective action not found");
    const { role } = await this.projectAccess(userId, action.sprint.projectId);
    this.requireEditor(role);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.retrospectiveAction.update({
        where: { id: actionId },
        data: { completedAt: dto.completed ? new Date() : null }
      });
      await tx.activity.create({
        data: {
          projectId: action.sprint.projectId,
          actorId: userId,
          action: dto.completed
            ? "retrospective.action_completed"
            : "retrospective.action_reopened",
          entityType: "RetrospectiveAction",
          entityId: actionId
        }
      });
      return updated;
    });
  }

  async createSprint(userId: string, projectId: string, dto: CreateSprintDto) {
    const { role, project } = await this.projectAccess(userId, projectId);
    this.requireManager(role);
    if (project.methodology !== Methodology.SCRUM)
      throw new BadRequestException("Sprints are available only for Scrum projects");
    const dates = this.parseSprintDates(dto.startsAt, dto.endsAt);
    return this.prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.create({
        data: {
          projectId,
          name: dto.name.trim(),
          goal: dto.goal?.trim() ?? "",
          ...dates
        }
      });
      await tx.activity.create({
        data: {
          projectId,
          actorId: userId,
          action: "sprint.created",
          entityType: "Sprint",
          entityId: sprint.id,
          details: { name: sprint.name }
        }
      });
      return sprint;
    });
  }

  async updateSprint(userId: string, sprintId: string, dto: UpdateSprintDto) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException("Sprint not found");
    const { role } = await this.projectAccess(userId, sprint.projectId);
    this.requireManager(role);
    if (sprint.status !== SprintStatus.PLANNING) {
      throw new BadRequestException("Only a planned Sprint can be edited");
    }
    const dates = this.parseSprintDates(
      dto.startsAt ?? sprint.startsAt?.toISOString(),
      dto.endsAt ?? sprint.endsAt?.toISOString()
    );
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.sprint.findUnique({ where: { id: sprintId } });
      if (!current || current.status !== SprintStatus.PLANNING) {
        throw new BadRequestException("Only a planned Sprint can be edited");
      }
      const updated = await tx.sprint.update({
        where: { id: sprintId },
        data: {
          name: dto.name?.trim(),
          goal: dto.goal?.trim(),
          ...dates
        }
      });
      await tx.activity.create({
        data: {
          projectId: sprint.projectId,
          actorId: userId,
          action: "sprint.updated",
          entityType: "Sprint",
          entityId: sprintId,
          details: { name: updated.name }
        }
      });
      return updated;
    });
  }

  async deleteSprint(userId: string, sprintId: string) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException("Sprint not found");
    const { role } = await this.projectAccess(userId, sprint.projectId);
    this.requireManager(role);
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.sprint.deleteMany({
        where: { id: sprintId, status: SprintStatus.PLANNING }
      });
      if (!deleted.count) {
        throw new BadRequestException("Only a planned Sprint can be deleted");
      }
      await tx.activity.create({
        data: {
          projectId: sprint.projectId,
          actorId: userId,
          action: "sprint.deleted",
          entityType: "Sprint",
          entityId: sprintId,
          details: { name: sprint.name }
        }
      });
    });
    return { deleted: true };
  }

  async addSprintItem(userId: string, sprintId: string, dto: AddSprintItemDto) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException("Sprint not found");
    const { role } = await this.projectAccess(userId, sprint.projectId);
    this.requireManager(role);
    if (sprint.status !== SprintStatus.PLANNING && sprint.status !== SprintStatus.ACTIVE) {
      throw new BadRequestException("Items can only be added to a planned or active Sprint");
    }
    const item = await this.prisma.backlogItem.findFirst({
      where: { id: dto.backlogItemId, projectId: sprint.projectId, archivedAt: null }
    });
    if (!item)
      throw new BadRequestException("Backlog item must belong to this project and be active");
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.project.update({
          where: { id: sprint.projectId },
          data: { concurrencyVersion: { increment: 1 } }
        });
        const currentSprint = await tx.sprint.findUnique({ where: { id: sprintId } });
        if (
          !currentSprint ||
          (currentSprint.status !== SprintStatus.PLANNING &&
            currentSprint.status !== SprintStatus.ACTIVE)
        ) {
          throw new BadRequestException("Items can only be added to a planned or active Sprint");
        }
        const currentItem = await tx.backlogItem.findFirst({
          where: { id: dto.backlogItemId, projectId: sprint.projectId, archivedAt: null }
        });
        if (!currentItem) {
          throw new BadRequestException("Backlog item must belong to this project and be active");
        }
        const existing = await tx.sprintItem.findFirst({
          where: {
            backlogItemId: currentItem.id,
            sprintId: { not: sprintId },
            sprint: { status: { in: [SprintStatus.PLANNING, SprintStatus.ACTIVE] } }
          }
        });
        if (existing)
          throw new ConflictException("Backlog item is already assigned to another open Sprint");
        return tx.sprintItem.create({ data: { sprintId, backlogItemId: currentItem.id } });
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error))
        throw new ConflictException("Item is already in this Sprint");
      throw error;
    }
  }

  async removeSprintItem(userId: string, sprintId: string, itemId: string) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException("Sprint not found");
    const { role } = await this.projectAccess(userId, sprint.projectId);
    this.requireManager(role);
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: sprint.projectId },
        data: { concurrencyVersion: { increment: 1 } }
      });
      const currentSprint = await tx.sprint.findUnique({ where: { id: sprintId } });
      if (
        !currentSprint ||
        currentSprint.status === SprintStatus.COMPLETED ||
        currentSprint.status === SprintStatus.CANCELLED
      ) {
        throw new BadRequestException("Items cannot be removed from a closed Sprint");
      }
      const removed = await tx.sprintItem.deleteMany({
        where: { sprintId, backlogItemId: itemId }
      });
      if (removed.count) {
        await tx.activity.create({
          data: {
            projectId: sprint.projectId,
            actorId: userId,
            action: "sprint.item_removed",
            entityType: "Sprint",
            entityId: sprintId,
            details: { backlogItemId: itemId }
          }
        });
      }
    });
    return { removed: true };
  }

  async startSprint(userId: string, sprintId: string) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException("Sprint not found");
    const { role } = await this.projectAccess(userId, sprint.projectId);
    this.requireManager(role);
    if (sprint.status !== SprintStatus.PLANNING)
      throw new BadRequestException("Only a planned Sprint can be started");
    if (!sprint.goal.trim()) throw new BadRequestException("Define a Sprint Goal before starting");
    if (!sprint.startsAt || !sprint.endsAt || sprint.startsAt >= sprint.endsAt) {
      throw new BadRequestException("Set valid Sprint start and end dates before starting");
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: sprint.projectId },
        data: { concurrencyVersion: { increment: 1 } }
      });
      const current = await tx.sprint.findUnique({ where: { id: sprint.id } });
      if (!current || current.status !== SprintStatus.PLANNING) {
        throw new BadRequestException("Only a planned Sprint can be started");
      }
      const active = await tx.sprint.findFirst({
        where: { projectId: sprint.projectId, status: SprintStatus.ACTIVE, id: { not: sprint.id } }
      });
      if (active) throw new ConflictException("This project already has an active Sprint");
      const started = await tx.sprint.update({
        where: { id: sprint.id },
        data: { status: SprintStatus.ACTIVE }
      });
      await tx.activity.create({
        data: {
          projectId: sprint.projectId,
          actorId: userId,
          action: "sprint.started",
          entityType: "Sprint",
          entityId: sprint.id
        }
      });
      return started;
    });
  }

  async completeSprint(userId: string, sprintId: string, dto: CompleteSprintDto) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException("Sprint not found");
    const { role } = await this.projectAccess(userId, sprint.projectId);
    this.requireManager(role);
    return this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: sprint.projectId },
        data: { concurrencyVersion: { increment: 1 } }
      });
      const current = await tx.sprint.findUnique({ where: { id: sprint.id } });
      if (!current || current.status !== SprintStatus.ACTIVE) {
        throw new BadRequestException("Only an active Sprint can be completed");
      }
      const completed = await tx.sprint.update({
        where: { id: sprint.id },
        data: {
          status: SprintStatus.COMPLETED,
          completedAt: new Date(),
          outcome: dto.outcome?.trim() ?? ""
        }
      });
      await tx.activity.create({
        data: {
          projectId: sprint.projectId,
          actorId: userId,
          action: "sprint.completed",
          entityType: "Sprint",
          entityId: sprint.id,
          details: { outcome: completed.outcome }
        }
      });
      return completed;
    });
  }

  async kanbanBoard(userId: string, projectId: string) {
    await this.projectAccess(userId, projectId);
    const [columns, items] = await Promise.all([
      this.prisma.workflowColumn.findMany({ where: { projectId }, orderBy: { position: "asc" } }),
      this.prisma.backlogItem.findMany({
        where: { projectId, archivedAt: null },
        orderBy: [{ status: "asc" }, { itemNumber: "asc" }],
        include: {
          project: { select: { key: true } },
          assignee: { select: { id: true, name: true } },
          parent: { select: { id: true, title: true } },
          dependencies: {
            include: { dependsOn: { select: { id: true, title: true, status: true } } }
          }
        }
      })
    ]);
    return columns.map((column) => {
      const cards = items.filter((item) => item.status === column.status);
      return {
        ...column,
        count: cards.length,
        overLimit: column.wipLimit !== null && cards.length > column.wipLimit,
        cards: cards.map((item) => ({
          ...item,
          identifier: `${item.project.key}-${item.itemNumber}`
        }))
      };
    });
  }

  async moveBacklogItem(userId: string, itemId: string, status: BacklogStatus) {
    return this.updateBacklogItem(userId, itemId, { status });
  }

  async tasks(userId: string, projectId: string) {
    await this.projectAccess(userId, projectId);
    return this.prisma.task.findMany({
      where: { projectId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        assignee: { select: { id: true, name: true } },
        backlogItem: { select: { id: true, title: true, itemNumber: true } }
      },
      take: 200
    });
  }

  async createTask(userId: string, projectId: string, dto: CreateTaskDto) {
    const { role } = await this.projectAccess(userId, projectId);
    this.requireEditor(role);
    if (dto.backlogItemId) {
      const item = await this.prisma.backlogItem.findFirst({
        where: { id: dto.backlogItemId, projectId, archivedAt: null },
        select: { id: true }
      });
      if (!item) throw new BadRequestException("Parent backlog item must belong to this project");
    }
    if (dto.sprintId) {
      const sprint = await this.prisma.sprint.findFirst({
        where: {
          id: dto.sprintId,
          projectId,
          status: { in: [SprintStatus.PLANNING, SprintStatus.ACTIVE] }
        },
        select: { id: true }
      });
      if (!sprint)
        throw new BadRequestException("Task Sprint must be open and belong to this project");
    }
    await this.validateProjectUser(projectId, dto.assigneeId);
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          projectId,
          reporterId: userId,
          title: dto.title.trim(),
          description: dto.description?.trim() ?? "",
          backlogItemId: dto.backlogItemId,
          sprintId: dto.sprintId,
          status: dto.status ?? TaskStatus.TODO,
          priority: dto.priority ?? Priority.MEDIUM,
          estimate: dto.estimate,
          assigneeId: dto.assigneeId,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined
        }
      });
      await tx.activity.create({
        data: {
          projectId,
          actorId: userId,
          action: "task.created",
          entityType: "Task",
          entityId: created.id,
          details: { title: created.title }
        }
      });
      return created;
    });
    return task;
  }

  async updateTask(userId: string, taskId: string, dto: UpdateTaskDto) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("Task not found");
    const { role } = await this.projectAccess(userId, task.projectId);
    this.requireEditor(role);
    await this.validateProjectUser(task.projectId, dto.assigneeId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          ...dto,
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          completedAt: dto.status === TaskStatus.DONE ? new Date() : dto.status ? null : undefined
        }
      });
      await tx.activity.create({
        data: {
          projectId: task.projectId,
          actorId: userId,
          action: "task.updated",
          entityType: "Task",
          entityId: task.id,
          details: {
            changed: Object.keys(dto),
            previousStatus: task.status,
            status: updated.status
          }
        }
      });
      return updated;
    });
  }

  async deleteTask(userId: string, taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("Task not found");
    const { role } = await this.projectAccess(userId, task.projectId);
    this.requireEditor(role);
    await this.prisma.$transaction(async (tx) => {
      await tx.task.delete({ where: { id: taskId } });
      await tx.activity.create({
        data: {
          projectId: task.projectId,
          actorId: userId,
          action: "task.deleted",
          entityType: "Task",
          entityId: task.id,
          details: { title: task.title }
        }
      });
    });
    return { deleted: true };
  }

  async reports(userId: string, projectId: string) {
    await this.projectAccess(userId, projectId);
    const [statusCounts, priorityCounts, typeCounts, activeSprint, recentActivity, totalTasks] =
      await Promise.all([
        this.prisma.backlogItem.groupBy({
          by: ["status"],
          where: { projectId, archivedAt: null },
          _count: { _all: true }
        }),
        this.prisma.backlogItem.groupBy({
          by: ["priority"],
          where: { projectId, archivedAt: null },
          _count: { _all: true }
        }),
        this.prisma.backlogItem.groupBy({
          by: ["type"],
          where: { projectId, archivedAt: null },
          _count: { _all: true }
        }),
        this.prisma.sprint.findFirst({
          where: { projectId, status: SprintStatus.ACTIVE },
          include: {
            items: { include: { backlogItem: { select: { status: true, estimate: true } } } }
          }
        }),
        this.prisma.activity.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          take: 12,
          include: { actor: { select: { name: true } } }
        }),
        this.prisma.task.count({ where: { projectId } })
      ]);
    const activeSprintItems = activeSprint?.items ?? [];
    const completeItems = activeSprintItems.filter(
      (entry) => entry.backlogItem.status === BacklogStatus.DONE
    );
    return {
      backlogByStatus: statusCounts.map(({ status, _count }) => ({ status, count: _count._all })),
      backlogByPriority: priorityCounts.map(({ priority, _count }) => ({
        priority,
        count: _count._all
      })),
      backlogByType: typeCounts.map(({ type, _count }) => ({ type, count: _count._all })),
      activeSprint: activeSprint
        ? {
            id: activeSprint.id,
            name: activeSprint.name,
            goal: activeSprint.goal,
            totalItems: activeSprintItems.length,
            completedItems: completeItems.length,
            plannedEstimate: activeSprintItems.reduce(
              (sum, entry) => sum + (entry.backlogItem.estimate ?? 0),
              0
            ),
            completedEstimate: completeItems.reduce(
              (sum, entry) => sum + (entry.backlogItem.estimate ?? 0),
              0
            )
          }
        : null,
      taskCount: totalTasks,
      recentActivity
    };
  }

  async addComment(userId: string, projectId: string, dto: CreateCommentDto) {
    const { role } = await this.projectAccess(userId, projectId);
    this.requireEditor(role);
    if (Boolean(dto.backlogItemId) === Boolean(dto.taskId)) {
      throw new BadRequestException("A comment must belong to exactly one backlog item or task");
    }
    const body = dto.body?.trim() ?? "";
    if (!body) throw new BadRequestException("Comment body is required");
    if (dto.backlogItemId) {
      const exists = await this.prisma.backlogItem.findFirst({
        where: { id: dto.backlogItemId, projectId },
        select: { id: true }
      });
      if (!exists) throw new NotFoundException("Backlog item not found in this project");
    } else if (dto.taskId) {
      const exists = await this.prisma.task.findFirst({
        where: { id: dto.taskId, projectId },
        select: { id: true }
      });
      if (!exists) throw new NotFoundException("Task not found in this project");
    }
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          projectId,
          authorId: userId,
          backlogItemId: dto.backlogItemId,
          taskId: dto.taskId,
          body
        },
        include: { author: { select: { id: true, name: true } } }
      });
      const entityId = dto.backlogItemId ?? dto.taskId!;
      await tx.activity.create({
        data: {
          projectId,
          actorId: userId,
          action: "comment.created",
          entityType: dto.backlogItemId ? "BacklogItem" : "Task",
          entityId
        }
      });
      return comment;
    });
  }

  async addCommentWithAttachments(
    userId: string,
    projectId: string,
    dto: CreateCommentDto,
    files: UploadedAttachment[]
  ) {
    const { role } = await this.projectAccess(userId, projectId);
    this.requireEditor(role);
    if (!dto.backlogItemId || dto.taskId) {
      throw new BadRequestException("Attachments must belong to a backlog item discussion");
    }
    if (!dto.body?.trim() && files.length === 0) {
      throw new BadRequestException("Add a comment or attach at least one file");
    }
    const item = await this.prisma.backlogItem.findFirst({
      where: { id: dto.backlogItemId, projectId, archivedAt: null },
      select: { id: true }
    });
    if (!item) throw new NotFoundException("Backlog item not found in this project");

    const storageDirectory = resolve(process.env.ATTACHMENT_STORAGE_PATH ?? "uploads");
    await mkdir(storageDirectory, { recursive: true, mode: 0o700 });
    const storedFiles = files.map((file) => ({
      id: randomUUID(),
      storedName: randomUUID(),
      originalName: file.originalname.replace(/[\\/\\r\\n\\0]/g, "_").slice(0, 255) || "attachment",
      mimeType: file.mimetype || "application/octet-stream",
      size: file.size,
      buffer: file.buffer
    }));
    const writtenPaths: string[] = [];
    try {
      for (const file of storedFiles) {
        const filePath = resolve(storageDirectory, file.storedName);
        await writeFile(filePath, file.buffer, { flag: "wx", mode: 0o600 });
        writtenPaths.push(filePath);
      }
      return await this.prisma.$transaction(async (tx) => {
        const comment = await tx.comment.create({
          data: {
            projectId,
            authorId: userId,
            backlogItemId: item.id,
            body: dto.body?.trim() ?? "",
            attachments: {
              create: storedFiles.map(({ id, storedName, originalName, mimeType, size }) => ({
                id,
                storedName,
                originalName,
                mimeType,
                size
              }))
            }
          },
          include: {
            author: { select: { id: true, name: true } },
            attachments: {
              select: {
                id: true,
                originalName: true,
                mimeType: true,
                size: true,
                createdAt: true
              }
            }
          }
        });
        await tx.activity.create({
          data: {
            projectId,
            actorId: userId,
            action: "comment.created",
            entityType: "BacklogItem",
            entityId: item.id,
            details: { attachmentCount: storedFiles.length }
          }
        });
        return comment;
      });
    } catch (error) {
      await Promise.allSettled(writtenPaths.map((filePath) => unlink(filePath)));
      throw error;
    }
  }

  async comments(userId: string, projectId: string, entityId: string) {
    await this.projectAccess(userId, projectId);
    return this.prisma.comment.findMany({
      where: {
        projectId,
        OR: [{ backlogItemId: entityId }, { taskId: entityId }]
      },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { id: true, name: true } },
        attachments: {
          select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true }
        }
      }
    });
  }

  async commentAttachment(
    userId: string,
    projectId: string,
    commentId: string,
    attachmentId: string
  ) {
    await this.projectAccess(userId, projectId);
    const attachment = await this.prisma.commentAttachment.findFirst({
      where: { id: attachmentId, commentId, comment: { projectId } }
    });
    if (!attachment) throw new NotFoundException("Attachment not found");
    const storedName = attachment.storedName;
    if (!/^[0-9a-f-]{36}$/i.test(storedName)) {
      throw new NotFoundException("Attachment not found");
    }
    return {
      ...attachment,
      filePath: resolve(process.env.ATTACHMENT_STORAGE_PATH ?? "uploads", storedName)
    };
  }

  async activities(userId: string, projectId: string, page = 1) {
    await this.projectAccess(userId, projectId);
    const limit = 30;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        skip: (Math.max(1, page) - 1) * limit,
        take: limit,
        include: { actor: { select: { id: true, name: true } } }
      }),
      this.prisma.activity.count({ where: { projectId } })
    ]);
    return { data, pagination: { page, limit, total } };
  }

  private async projectAccess(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organization: { memberships: { some: { userId } } } },
      include: {
        memberships: { where: { userId }, select: { role: true } },
        organization: { select: { memberships: { where: { userId }, select: { role: true } } } }
      }
    });
    if (!project) throw new NotFoundException("Project not found");
    const projectRole = project.memberships[0]?.role;
    const organizationRole = project.organization.memberships[0]?.role;
    const hasOrganizationAdminAccess =
      organizationRole === OrganizationRole.OWNER || organizationRole === OrganizationRole.ADMIN;
    if (!projectRole && !hasOrganizationAdminAccess) {
      throw new NotFoundException("Project not found");
    }
    return {
      project,
      role: projectRole ?? (hasOrganizationAdminAccess ? ProjectRole.MANAGER : ProjectRole.VIEWER)
    };
  }

  private requireManager(role: ProjectRole) {
    if (!managerRoles.includes(role))
      throw new ForbiddenException("Project management permission required");
  }

  private requireEditor(role: ProjectRole) {
    if (role === ProjectRole.VIEWER)
      throw new ForbiddenException("Project edit permission required");
  }

  private async validateParent(projectId: string, parentId: string | undefined, itemId?: string) {
    if (!parentId) return;
    if (parentId === itemId) throw new BadRequestException("An item cannot be its own parent");
    const parent = await this.prisma.backlogItem.findFirst({
      where: { id: parentId, projectId, archivedAt: null },
      select: { id: true }
    });
    if (!parent)
      throw new BadRequestException("Parent item must be active and in the same project");
    if (itemId) {
      let cursor = parentId;
      const visited = new Set<string>();
      while (cursor && !visited.has(cursor)) {
        if (cursor === itemId)
          throw new BadRequestException("Parent relationship would create a cycle");
        visited.add(cursor);
        const ancestor = await this.prisma.backlogItem.findUnique({
          where: { id: cursor },
          select: { parentId: true }
        });
        cursor = ancestor?.parentId ?? "";
      }
    }
  }

  private async validateProjectUser(projectId: string, userId: string | undefined) {
    if (!userId) return;
    const member = await this.prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { id: true }
    });
    if (!member) throw new BadRequestException("Assignee must be a member of this project");
  }

  private parseSprintDates(startsAt?: string, endsAt?: string) {
    const start = startsAt ? new Date(startsAt) : undefined;
    const end = endsAt ? new Date(endsAt) : undefined;
    if (!isValidDateRange(start, end))
      throw new BadRequestException("Sprint end date must be after its start date");
    return { startsAt: start, endsAt: end };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }
}

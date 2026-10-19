import "dotenv/config";
import * as argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  BacklogStatus,
  BacklogType,
  Methodology,
  OrganizationRole,
  Priority,
  ProjectRole,
  SprintStatus,
  TaskStatus
} from "../src/generated/prisma/client";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const email = process.env.DEMO_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.DEMO_USER_PASSWORD;
  if (!connectionString || !email || !password || password.length < 12) {
    throw new Error(
      "Set DATABASE_URL, DEMO_USER_EMAIL, and a DEMO_USER_PASSWORD of at least 12 characters"
    );
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: "Demo Owner",
        passwordHash: await argon2.hash(password, { type: argon2.argon2id })
      },
      update: {}
    });
    const organization = await prisma.organization.upsert({
      where: { slug: "sprintline-demo" },
      create: { name: "Sprintline Demo", slug: "sprintline-demo" },
      update: {}
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      create: { organizationId: organization.id, userId: user.id, role: OrganizationRole.OWNER },
      update: { role: OrganizationRole.OWNER }
    });
    let project = await prisma.project.findUnique({
      where: { organizationId_key: { organizationId: organization.id, key: "DEMO" } }
    });
    if (!project) {
      project = await prisma.project.create({
        data: {
          organizationId: organization.id,
          name: "Product Launch",
          key: "DEMO",
          description: "A sample Scrum project seeded into PostgreSQL for local development.",
          methodology: Methodology.SCRUM,
          memberships: { create: { userId: user.id, role: ProjectRole.MANAGER } },
          workflowColumns: {
            create: [
              { name: "Backlog", status: BacklogStatus.BACKLOG, position: 0 },
              { name: "Ready", status: BacklogStatus.READY, position: 1 },
              { name: "In Progress", status: BacklogStatus.IN_PROGRESS, position: 2, wipLimit: 3 },
              { name: "In Review", status: BacklogStatus.IN_REVIEW, position: 3 },
              { name: "Testing", status: BacklogStatus.TESTING, position: 4 },
              { name: "Done", status: BacklogStatus.DONE, position: 5 }
            ]
          }
        }
      });
    }
    const existingItems = await prisma.backlogItem.count({ where: { projectId: project.id } });
    if (existingItems === 0) {
      const epic = await prisma.backlogItem.create({
        data: {
          projectId: project.id,
          itemNumber: 1,
          title: "Launch a dependable customer workspace",
          description: "Epic to prepare the core customer experience.",
          type: BacklogType.EPIC,
          priority: Priority.HIGH,
          reporterId: user.id
        }
      });
      const story = await prisma.backlogItem.create({
        data: {
          projectId: project.id,
          itemNumber: 2,
          title: "Sign in securely",
          description: "Customers can access their workspace with a secure account.",
          type: BacklogType.USER_STORY,
          priority: Priority.CRITICAL,
          status: BacklogStatus.IN_PROGRESS,
          storyRole: "customer",
          storyCapability: "sign in securely",
          storyBenefit: "I can access my team's work",
          estimate: 5,
          parentId: epic.id,
          reporterId: user.id,
          criteria: {
            create: [
              { description: "A registered user can sign in with valid credentials.", order: 0 },
              {
                description: "Invalid credentials do not reveal whether an account exists.",
                order: 1
              }
            ]
          }
        }
      });
      const sprint = await prisma.sprint.create({
        data: {
          projectId: project.id,
          name: "Sprint 1",
          goal: "Establish a secure, welcoming customer entry point.",
          status: SprintStatus.ACTIVE,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          items: { create: { backlogItemId: story.id } }
        }
      });
      await prisma.task.create({
        data: {
          projectId: project.id,
          sprintId: sprint.id,
          backlogItemId: story.id,
          title: "Add authentication coverage",
          description: "Exercise successful and rejected login flows.",
          status: TaskStatus.TODO,
          priority: Priority.HIGH,
          estimate: 2,
          reporterId: user.id,
          assigneeId: user.id
        }
      });
      await prisma.activity.create({
        data: {
          projectId: project.id,
          actorId: user.id,
          action: "project.seeded",
          entityType: "Project",
          entityId: project.id,
          details: { name: project.name }
        }
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();

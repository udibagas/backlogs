# Sprintline

Sprintline is a Nuxt and NestJS workspace for organizing software delivery with Scrum and Kanban. It uses PostgreSQL through Prisma; organization, project, backlog, Sprint, task, activity, and report data is persisted in the database.

## Stack and versions

Versions were checked against npm metadata and official Node.js, Nuxt, Prisma, and PostgreSQL release documentation on 2026-10-19.

| Component    | Version                                                                | Notes                                                                                                                                                            |
| ------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js      | 24 LTS (Docker target); Node 22.22.3+ also satisfies framework engines | Production should use an LTS release.                                                                                                                            |
| NestJS       | 12.2.0                                                                 | REST API and Swagger                                                                                                                                             |
| Nuxt         | 4.6.2                                                                  | Vue 3, TypeScript, SSR shell                                                                                                                                     |
| Prisma ORM   | 7.10.1                                                                 | Prisma 8 `latest` was a release candidate at verification time; v7 is the newest stable major. Uses the `prisma-client` generator and PostgreSQL driver adapter. |
| PostgreSQL   | 18.6                                                                   | Latest stable PostgreSQL minor at verification time                                                                                                              |
| TypeScript   | 6.0.3                                                                  | Pinned in the workspace                                                                                                                                          |
| Tailwind CSS | 4.3.3                                                                  | Vite integration                                                                                                                                                 |
| Zod          | 4.6.7                                                                  | Frontend form validation                                                                                                                                         |

The app can also be run on Node 22.22.3 or newer. Keep Node, PostgreSQL, and dependency updates on supported stable releases.

## What is implemented

- JWT bearer access tokens kept in Nuxt memory, with opaque refresh tokens in `HttpOnly`, `SameSite=Strict` cookies and hashed, revocable, rotating refresh sessions in PostgreSQL.
- Registration, login, logout, authenticated profile lookup, request validation, throttling, explicit CORS, and origin validation for state-changing cookie requests.
- Organization creation and listing; project creation, listing, archiving, registered-user collaboration by email with project roles, Scrum/Kanban methodology, and project-scoped backend authorization.
- A persistent Product Backlog with project-scoped human-readable IDs, Epic/Story/Bug/Technical Task/Spike types, priorities, story fields, acceptance criteria, estimates, labels, parent links, dependency-cycle prevention, filtering, and soft archiving.
- Sprint planning, separate Sprint membership, goal/date checks, lifecycle operations, retained Sprint items, review-event and retrospective-action APIs.
- Persistent tasks, status/assignee/estimate fields, optional Sprint and backlog-item links, and audit activity.
- Kanban status changes, accessible status selectors, drag-and-drop, visible WIP warnings, and optional hard limits.
- Database-backed project reports and a dashboard, with pagination on backlog and activity queries.
- Swagger UI at `/api/docs`, PostgreSQL health endpoint at `/api/v1/health`, local seed data, Dockerfiles, Docker Compose, and CI workflow.

## Domain terms

- **Product Backlog:** the ordered, evolving set of product work. An item keeps its identity when planned into a Sprint.
- **Sprint Backlog:** the Sprint Goal plus the selected Product Backlog items and delivery tasks.
- **Epic:** a larger outcome that can organize related backlog items.
- **User Story:** a user-centered requirement, optionally expressed as “As a …, I want …, so that …”.
- **Acceptance Criteria:** testable conditions attached to a backlog item; checking them does not substitute for testing.
- **Task:** implementation work supporting an outcome; finishing tasks does not automatically complete their parent story.
- **Sprint Goal:** the shared outcome the team commits to pursuing during a Sprint.
- **Definition of Done:** the team's shared quality standard. It is not inferred from task status in this first implementation.

## Prerequisites

- Node.js 24 LTS (or 22.22.3+), npm 10+, and Docker Compose.
- Copy `.env.example` to `.env` and replace the JWT secret with a random value of at least 32 characters:

```sh
cp .env.example .env
```

The demo credentials in `.env.example` are for local development only. Use unique secrets and credentials outside local development.

## Local development

Start PostgreSQL:

```sh
docker compose up -d postgres
```

Install dependencies, generate the Prisma client, apply the migration, and load local seed records:

```sh
npm ci
npm run db:generate -w @agile/api
npm run db:deploy -w @agile/api
npm run db:seed -w @agile/api
```

Run the API and web application:

```sh
npm run dev
```

The frontend is at `http://localhost:3000`, the API is at `http://localhost:4000/api/v1`, Swagger is at `http://localhost:4000/api/docs`, and the database health check is at `http://localhost:4000/api/v1/health`. PostgreSQL is exposed locally on port `5433` by default to avoid conflicts with an existing local server; change `POSTGRES_PORT` in `.env` if needed.

Start the entire stack in containers (after creating `.env`):

```sh
docker compose up --build
```

The API container applies pending Prisma migrations before starting the server. For local development outside Compose, run `npm run db:deploy -w @agile/api` after generating the Prisma client.

The database volume is named `postgres_data`. To reset local development data, inspect the active Compose project and then run `docker compose down -v`; this removes the named database volume and is destructive.

## Useful commands

```sh
npm run db:generate -w @agile/api
npm run db:migrate -w @agile/api -- --name describe_change
npm run db:deploy -w @agile/api
npm run db:seed -w @agile/api
npm run test
npm run lint
npm run typecheck
npm run build
```

Prisma 7 reads the connection URL from `apps/api/prisma.config.ts`; the datasource provider and generated-client output are in `apps/api/prisma/schema.prisma`. Use migrations in deployed environments; do not replace them with `db push`.

## Architecture and security

`apps/api/src/auth` owns registration and session lifecycle. `apps/api/src/core` contains DTO validation, project/organization access checks, business rules, and REST controllers. `apps/api/src/prisma` creates the Prisma PostgreSQL adapter. The API uses `/api/v1`, Swagger, strict DTO whitelisting, short-lived access JWTs, Argon2id password hashes, stored refresh-token hashes, refresh rotation, CORS, and origin checks. Project membership and organization membership are checked server-side; UUIDs are not treated as authorization.

The browser keeps the access token in per-app Nuxt state (memory only). It is sent as a bearer token; a refresh token is never exposed to JavaScript. Refresh rotates the cookie-backed session. Logout revokes the current refresh session. Authenticated API responses are not cached by the app.

All metrics come from PostgreSQL queries. Dashboard counts are project-level totals. Sprint item progress counts items in `DONE`; estimate progress includes only items with estimates. Velocity and team comparisons are intentionally not presented.

## Repository structure

```text
apps/api/  NestJS, Prisma schema/migrations/seed, API tests
apps/web/  Nuxt pages, layout, API client, and styles
docker-compose.yml
```

## Production notes and known limitations

- Registration is open. Add an organization policy before deploying where account creation must be restricted.
- Organization email invitations, email delivery, password reset/change, account deactivation, and organization member administration are not implemented.
- Sprint event recording and retrospective action tracking are available in the API, but the current UI does not yet expose every event workflow.
- Backlog comments and dependency management are API-backed but have limited UI affordances. Acceptance criteria are editable as a set; checking criteria and notifications are not yet implemented.
- Workflow WIP limits are initialized for local project boards and configurable through the API. Workflow-column reordering and richer transition policies are not yet exposed in the UI.
- Integration and end-to-end tests against PostgreSQL are a remaining delivery task; the current automated tests focus on dependency-cycle and Sprint-date rules. CI applies migrations to an isolated PostgreSQL service and runs the checks.
- Configure TLS, a managed PostgreSQL backup/restore policy, secret management, suitable logging/monitoring, and production cookie settings (`COOKIE_SECURE=true`) before deployment.

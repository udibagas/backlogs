FROM node:24-alpine AS build
WORKDIR /app
ARG DATABASE_URL=postgresql://agile:agile@localhost:5432/agile?schema=public
ENV DATABASE_URL=$DATABASE_URL
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY . .
RUN npm run db:generate -w @agile/api && npm run build -w @agile/api

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
EXPOSE 4000
CMD ["sh", "-c", "cd apps/api && npm run db:deploy && npm start"]

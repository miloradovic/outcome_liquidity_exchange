FROM node:26.1-alpine AS base
WORKDIR /usr/src/app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@10.22.0 --no-audit --no-fund

FROM base AS development
ENV NODE_ENV=development

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter .

COPY nest-cli.json tsconfig*.json jest.config.js eslint.config.mjs ./
COPY src ./src
COPY test ./test

EXPOSE 3000
CMD ["pnpm", "run", "start:dev"]

FROM development AS builder
RUN pnpm run build

FROM base AS production
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --prod --frozen-lockfile --filter .

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM base AS web-development
ENV NODE_ENV=development

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter ./apps/web...

COPY apps/web ./apps/web

WORKDIR /usr/src/app/apps/web
EXPOSE 3000
CMD ["pnpm", "run", "dev", "--hostname", "0.0.0.0", "--port", "3000"]

FROM base AS web-builder
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter ./apps/web...

COPY apps/web ./apps/web
WORKDIR /usr/src/app/apps/web
RUN pnpm run build

FROM node:26.1-alpine AS web-production
WORKDIR /usr/src/app/apps/web
ENV NODE_ENV=production

COPY --from=web-builder /usr/src/app/apps/web/.next/standalone ./
COPY --from=web-builder /usr/src/app/apps/web/.next/static ./.next/static
COPY --from=web-builder /usr/src/app/apps/web/public ./public

EXPOSE 3000
CMD ["node", "server.js"]

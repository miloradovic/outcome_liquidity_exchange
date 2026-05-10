FROM node:26.1-alpine AS development
WORKDIR /usr/src/app
ENV NODE_ENV=development

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm@10 --no-audit --no-fund \
	&& pnpm install --frozen-lockfile

COPY nest-cli.json tsconfig*.json jest.config.js eslint.config.mjs ./
COPY src ./src
COPY test ./test

EXPOSE 3000
CMD ["pnpm", "run", "start:dev"]

FROM development AS builder
RUN pnpm run build

FROM node:26.1-alpine AS production
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm@10 --no-audit --no-fund \
	&& pnpm install --prod --frozen-lockfile

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM node:24.15.0-alpine3.23 AS development
WORKDIR /usr/src/app
ENV NODE_ENV=development

RUN corepack enable

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY nest-cli.json tsconfig*.json jest.config.js eslint.config.mjs ./
COPY src ./src
COPY test ./test

EXPOSE 3000
CMD ["npm", "run", "start:dev"]

FROM development AS builder
RUN npm run build

FROM node:24.15.0-alpine3.23 AS production
WORKDIR /usr/src/app
ENV NODE_ENV=production

RUN corepack enable

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]

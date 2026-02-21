FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
COPY apps/api/package*.json apps/api/
COPY apps/web/package*.json apps/web/
COPY apps/worker/package*.json apps/worker/
COPY packages/config/package*.json packages/config/
COPY packages/db/package*.json packages/db/
COPY packages/types/package*.json packages/types/

RUN npm ci

COPY . .

ARG WORKSPACE=@pharos/api
RUN npm run build --workspace ${WORKSPACE}

EXPOSE 4000

CMD ["sh", "-c", "npm run start --workspace ${WORKSPACE}"]

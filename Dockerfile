FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl jq

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
COPY rule-packs ./rule-packs
COPY schema ./schema

RUN npm ci --no-audit --no-fund \
  && npx tsc \
  && npm prune --omit=dev

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl jq

COPY package.json tsconfig.json ./
COPY src ./src
COPY rule-packs ./rule-packs
COPY schema ./schema

RUN npm install --omit=dev --no-audit --no-fund \
  && npm install --save-dev typescript@^5.6.0 @types/node@^22.9.0 \
  && npx tsc \
  && npm prune --omit=dev

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

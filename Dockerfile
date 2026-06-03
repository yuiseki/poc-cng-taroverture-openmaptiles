# tsx をランタイムに使うため devDependencies も含めてインストールする
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY docs ./docs

ENV NODE_ENV=production
# Knative は PORT を注入する (デフォルト 8080)。src/index.ts は PORT を読む
EXPOSE 8080

CMD ["npm", "start"]

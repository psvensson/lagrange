FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY src/ ./src/

EXPOSE 8080 8081 9080

ENTRYPOINT ["node", "src/index.js"]

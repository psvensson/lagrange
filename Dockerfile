FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN apt-get update && \
  apt-get install -y --no-install-recommends python3 make g++ && \
  rm -rf /var/lib/apt/lists/*

RUN npm ci --omit=dev

COPY src/ ./src/

EXPOSE 8080 8081 9080

ENTRYPOINT ["node", "src/index.js"]

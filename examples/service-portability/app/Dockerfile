FROM node@sha256:f598378b5240225e6beab68fa9f356db1fb8efe55173e6d4d8153113bb8f333c

WORKDIR /app
ENV NODE_ENV=production

COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY app/server.js ./server.js
COPY certs/server-cert.pem ./certs/lagrange-ca.pem
COPY certs/wrong-ca-cert.pem ./certs/wrong-ca.pem

USER node
EXPOSE 3000
ENTRYPOINT ["node"]
CMD ["server.js"]

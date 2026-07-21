FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]

FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies without running lifecycle scripts. The "postinstall"
# script runs "prisma generate", which needs prisma/schema.prisma — but that
# isn't copied in yet at this stage, so scripts are skipped here and Prisma is
# generated explicitly below once the schema is present.
COPY package*.json ./
RUN npm install --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]
